/**
 * live/main.js — the camera page: read the cube without a shutter, then
 * follow the player's turns and point at the next one.
 *
 * Phases: idle → reading → solving → checking → solved. A cube believed
 * solved is confirmed on several faces first, since a turn of a layer the
 * camera could not see goes unnoticed until then. While solving, losing the cube
 * for several views in a row drops back to reading (the tracker keeps trying
 * meanwhile, and picks the cube up again if it recognises it).
 */
'use strict';

(function () {
  const LOST_LIMIT = 8;              // views in a row nobody can explain before reading again
  // No cube in view this long: the player has left, so the next one starts
  // from the beginning rather than in the middle of someone else's solve.
  const IDLE_RESET_MS = 60000;
  const $ = id => document.getElementById(id);
  const ui = {
    video: $('video'), overlay: $('overlay'), start: $('start'), open: $('open'), err: $('err'),
    note: $('note'), say: $('say'), chips: $('chips'), left: $('left'), again: $('again'), force: $('force'),
    modes: [...document.querySelectorAll('[data-mode]')],
    learn: $('learn'), stages: $('stages'), stageDoes: $('stage-does'),
    jobTitle: $('job-title'), jobGoal: $('job-goal'), jobWhy: $('job-why'), jobName: $('job-name'),
    seq: $('seq'), nowMove: $('now-move'), mvNotation: $('mv-notation'),
    mvFace: $('mv-face'), mvTurn: $('mv-turn'), mvWords: $('mv-words'),
    trig: $('trig'), stage: $('stage'), bar: $('bar'), barFill: $('bar-fill'), sound: $('sound'), log: $('log'),
    recap: $('recap'), recapTurns: $('recap-turns'), recapStages: $('recap-stages'), recapMoves: $('recap-moves'),
  };
  $('rule').textContent = Learn.RULE;
  $('grip').textContent = `下の「言いかえ」は、${Learn.GRIP}カメラの矢印は持ち方に合わせて出ます。`;

  let phase = 'idle';
  let mirrored = false;
  let reader = Reader.create();
  let tracker = null;
  let policy = null;
  let mode = 'shortest';
  let lost = 0;
  let frame = null;                  // latest {box, inView, held, size}
  let seen = null;                   // latest face the tracker placed: {face, quarters}
  let wholeHint = null;              // reading: which way to turn the cube next
  let flash = -1;                    // reading: chip to highlight
  let doubted = null;                // reading: the last view taken for a repeat
  let checked = new Set();           // checking: faces seen in one colour
  let total = 0;                     // solving: length of the plan when it was made
  let lastStage = null;              // steps mode: the stage of the previous job
  let idleTimer = null;
  let againTimer = null;             // asks the view for one more look at a doubtful face
  let log = [];                      // turns seen this solve: {move, stage}
  let taught = new Set();            // CFOP mode: face letters and suffixes already explained

  // What the camera saw and what the page made of it (live/trace.js).
  const traceAdd = (kind, data) => LiveTrace.add(kind, Object.assign({ phase }, data));
  function showLog() {
    const st = LiveTrace.state();
    ui.log.textContent = st.kind === 'file' ? `ログ: ${st.name} に保存中`
      : st.kind === 'ask' ? `ログ: ${st.name} への保存を再開`
      : st.canPick ? 'ログの保存先を選ぶ' : 'ログを書き出す';
    ui.log.setAttribute('aria-pressed', String(st.kind === 'file'));
  }
  LiveTrace.onChange = showLog;
  ui.log.addEventListener('click', async () => {
    const st = LiveTrace.state();
    if (st.kind === 'file' || (st.kind === 'none' && !st.canPick)) { await LiveTrace.flush(); if (st.kind !== 'file') LiveTrace.download(); return; }
    const got = await LiveTrace.pick();
    showLog();
    if (typeof got === 'string') {
      ui.log.textContent = 'このフォルダには保存できません。ドキュメントの中の cube-log などを選んでください';
    }
  });
  showLog();
  LiveTrace.restore();

  const view = LiveView.create(ui.video, { onSteady, onGone, onFrame });
  traceAdd('load', { version: document.lastModified });

  function setNote(kind, text) {
    ui.note.dataset.kind = kind;
    ui.note.textContent = text;
  }

  // ── feedback: a flash round the picture and a short sound ─────────────────

  let audio = null;
  let soundOn = true;
  try { soundOn = localStorage.getItem('live-sound') !== 'off'; } catch (e) { /* storage blocked */ }

  function beep(freq, ms) {
    if (!soundOn) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.15, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + ms / 1000);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + ms / 1000);
    } catch (e) { /* no audio: the flash still shows */ }
  }

  const SOUND = { good: [880, 90], bad: [220, 220], read: [660, 120], done: [1320, 300] };

  function flashStage(kind) {
    ui.stage.classList.remove('good', 'bad');
    void ui.stage.offsetWidth;         // restart the animation
    if (kind === 'good' || kind === 'bad') ui.stage.classList.add(kind);
    if (SOUND[kind]) beep(...SOUND[kind]);
  }

  /** Which feedback a note deserves: a stray is bad, a planned turn good. */
  const FEEDBACK = { plan: 'good', back: 'good', adjust: 'bad', undo: 'bad', restart: 'bad', solved: 'done' };

  function updateSound() {
    ui.sound.textContent = soundOn ? '音: オン' : '音: オフ';
    ui.sound.setAttribute('aria-pressed', String(soundOn));
  }

  // ── reading ───────────────────────────────────────────────────────────────

  function chips() {
    const shots = reader.shots;
    ui.chips.replaceChildren(...Array.from({ length: 6 }, (_, k) => {
      const li = document.createElement('li');
      const shot = shots[k];
      if (shot) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip' + (k === flash ? ' flash' : '');
        b.dataset.c = shot.centre;
        b.title = 'タップで撮り直す';
        b.setAttribute('aria-label', `${k + 1} 面目（タップで撮り直す）`);
        b.addEventListener('click', () => { reader.drop(k); flash = -1; startReading(false); });
        li.append(b);
      } else {
        li.className = 'chip empty';
      }
      return li;
    }));
  }

  function startReading(fresh, text) {
    traceAdd('read', { fresh: !!fresh, text: text || '' });
    phase = 'reading';
    ui.chips.hidden = false;
    ui.recap.hidden = true;
    doubted = null;
    ui.force.hidden = true;
    if (fresh) reader.clear();
    const h = Reader.hint(reader.count);
    wholeHint = h.dir;
    setNote(fresh ? 'start' : 'plan', text || `面を読み取っています（${reader.count} / 6）`);
    ui.say.textContent = h.dir ? `${Overlay.wholeWords(h.dir, mirrored)}（水色の矢印）。${h.text}` : h.text;
    ui.left.textContent = '';
    chips();
    view.again();
  }

  function offer(colours, force) {
    const got = reader.offer(colours, force);
    traceAdd('shot', { kind: got.kind, index: got.index, force: !!force, count: reader.count, rgb: colours.map(c => c.map(Math.round)) });
    // The face just taken, still in view: the player has not turned the cube yet.
    if (got.kind === 'repeat' && got.index === reader.count - 1 && got.index === flash) return;
    doubted = got.kind === 'repeat' ? colours : null;
    ui.force.hidden = !doubted;
    if (got.kind === 'repeat') {
      flash = got.index;
      setNote('adjust', 'この面は読み取り済みです（光っているチップ）。まだの面を見せてください');
      chips();
      return;
    }
    if (got.kind !== 'new') return;
    beep(...SOUND.read);
    flash = got.index;
    if (reader.count < 6) { startReading(false); return; }
    setNote('plan', '6 面を照合しています…');
    ui.say.textContent = '';
    chips();
    setTimeout(finishReading, 30);     // let the note paint first: matching takes about a second
  }

  function finishReading() {
    if (reader.count !== 6) { startReading(false); return; }   // a chip was tapped while we waited
    let out;
    try {
      out = reader.finish();
    } catch (e) {
      out = { ok: false, retake: reader.count - 1, text: '色の読み取りが合いません。最後の面をもう一度見せてください' };
    }
    traceAdd('readDone', out.ok
      ? { ok: true, corrected: out.read.corrected.length, weakest: out.read.weakest, state: out.read.state }
      : { ok: false, retake: out.retake, corrected: out.corrected == null ? null : out.corrected });
    if (!out.ok) {
      reader.drop(out.retake);
      flash = -1;
      startReading(false, out.text);
      return;
    }
    const { state, palette } = out.read;
    if (tracker) tracker.reset(state, palette); else tracker = Track.create(state, palette);
    if (policy) policy.reset(state); else policy = Policy.create(state, { mode });
    lost = 0;
    seen = null;
    phase = 'solving';
    total = 0;
    lastStage = null;
    ui.chips.hidden = true;            // the faces are read; the chips would only distract
    follow();
  }

  // ── solving ───────────────────────────────────────────────────────────────

  /** In steps mode, "<stage> 完成！" when the job moved on to a later stage. */
  function stageDone() {
    const job = policy.mode === 'steps' ? policy.job : null;
    const now = job ? job.stage : null;
    const before = lastStage;
    lastStage = now;
    if (!before || !now || before === now) return null;
    const keys = Learn.STAGES.map(x => x.key);
    if (keys.indexOf(now) <= keys.indexOf(before)) return null;
    const a = Learn.stageInfo(before);
    const b = Learn.stageInfo(now);
    return a && b ? `${a.label} 完成！ 次は ${b.label} です` : null;
  }

  function follow() {
    tracker.setPlan(policy.plan);
    const note = policy.note;
    const finished = stageDone();
    if (note.kind !== 'solved') {
      checked = new Set();
      phase = 'solving';
      setNote(finished ? 'back' : note.kind, finished || note.text);
    } else {
      if (seen) checked.add(seen.face);
      const done = checked.size >= Policy.CHECK_FACES;
      phase = done ? 'solved' : 'checking';
      if (done) { setNote('solved', note.text); recap(); }
      else setNote('check', `そろったように見えます。確かめるので、ほかの面も見せてください（あと ${Policy.CHECK_FACES - checked.size} 面）`);
    }
    const n = policy.plan.length;
    if (['start', 'restart'].includes(note.kind) || n > total || finished) total = n;
    if (policy.mode === 'steps' && policy.at === 0) total = n;
    ui.left.textContent = phase !== 'solving' ? '' : `残り ${n} 手${policy.stage ? `（${policy.stage}）` : ''}`;
    ui.bar.hidden = phase !== 'solving' || !total;
    ui.barFill.style.width = total ? `${Math.round(100 * (1 - n / total))}%` : '0%';
    ui.say.textContent = instruction();
    lesson();
  }

  /** The card shown once solved: what the player did, for them to take away. */
  function recap() {
    ui.recap.hidden = false;
    ui.recapTurns.textContent = `回した手: ${log.length} 手`;
    const per = Learn.STAGES
      .map(s => ({ label: s.label, n: log.filter(x => x.stage === s.key).length }))
      .filter(x => x.n);
    ui.recapStages.hidden = !per.length;
    ui.recapStages.textContent = per.length ? `段階ごと: ${per.map(x => `${x.label} ${x.n} 手`).join(' / ')}` : '';
    const used = [...new Set(log.map(x => x.move))].sort();
    ui.recapMoves.textContent = mode === 'steps'
      ? `使った回転記号: ${used.join(' ')}`
      : '「CFOP で覚える」に切り替えると、回転記号と CFOP の段階を覚えながら解けます。';
  }

  const li = (cls, text) => {
    const e = document.createElement('li');
    if (cls) e.className = cls;
    e.textContent = text;
    return e;
  };

  /** CFOP mode: the stage, the job, its moves in notation, and the move to make now. */
  function lesson() {
    const job = policy && policy.mode === 'steps' && phase === 'solving' ? policy.job : null;
    ui.learn.hidden = !job;
    if (!job) return;
    const key = job.stage;
    ui.stages.replaceChildren(...Learn.track(job.stages, key).map(s => li(s.state, s.label)));
    const info = Learn.stageInfo(key);
    ui.stageDoes.textContent = info ? `${info.label}: ${info.does}` : '';
    ui.jobTitle.textContent = job.title || '';
    ui.jobGoal.textContent = job.goal ? `やること: ${job.goal}` : '';
    ui.jobWhy.textContent = job.why || '';
    ui.jobName.hidden = !job.name;
    ui.jobName.textContent = job.name ? `使う手順: ${job.name}${job.jp ? `（${job.jp}）` : ''}${job.does ? ` — ${job.does}` : ''}` : '';
    const at = policy.at;
    const shown = at >= 0 ? job.moves : policy.plan;
    const here = at >= 0 ? at : 0;
    const groups = at >= 0 ? Learn.groups(shown) : [];
    ui.seq.replaceChildren(...shown.map((m, i) => {
      const e = li(i < here ? 'done' : i === here ? 'now' : '', m);
      const g = groups.find(x => i >= x.from && i < x.to);
      if (g) {
        e.classList.add('trig');
        if (i === g.from) e.classList.add('trig-first');
        if (i === g.to - 1) e.classList.add('trig-last');
      }
      return e;
    }));
    const named = groups.filter(g => g.name);
    const cur = named.find(g => here >= g.from && here < g.to) || named[0];
    ui.trig.hidden = !cur;
    if (cur) ui.trig.textContent = `（${shown.slice(cur.from, cur.to).join(' ')}）は「${cur.name}」と呼ばれる ${cur.to - cur.from} 手のまとまりです。まとめて覚えると速くなります。`;
    const next = policy.plan[0];
    const mv = next && Learn.move(next);
    ui.nowMove.hidden = !mv;
    if (!mv) return;
    // The full explanation the first time a letter or a suffix comes up; after
    // the player has turned it once, only the short form.
    const suffix = 's' + next.slice(1);
    ui.mvNotation.textContent = mv.notation;
    ui.mvFace.textContent = taught.has(next[0]) ? `${next[0]} = ${Learn.FACE[next[0]].word}` : mv.face;
    ui.mvTurn.textContent = taught.has(suffix) ? mv.amount : mv.turn;
    ui.mvWords.textContent = mv.words ? `言いかえ: ${mv.words}` : '';
  }

  function instruction() {
    if (phase === 'solved') return 'おつかれさまでした。もう一度遊ぶときは「最初から読み直す」を押してください';
    if (phase === 'checking') {
      if (!seen) return 'キューブの面をカメラに向けてください';
      const nx = Policy.checkNext(seen.face, seen.quarters, checked);
      return nx ? `${Overlay.wholeWords(nx.dir, mirrored)}（水色の矢印）。ほかの面を見せてください` : 'ほかの面もカメラに見せてください';
    }
    const next = policy.plan[0];
    if (!next) return '';
    if (!seen) return 'キューブの面をカメラに向けてください';
    const a = Track.arrowFor(next, seen.face, seen.quarters, tracker.state);
    if (a.kind === 'show') return `回す列がカメラから見えません。${Overlay.wholeWords(Overlay.BACK[a.toward], mirrored)}（水色の矢印）`;
    return Overlay.turnWords(a, mirrored);
  }

  function onSteady(v) {
    clearTimeout(idleTimer);
    if (phase === 'reading' && !tracker) { offer(v.colours); return; }
    if (phase === 'idle' || !tracker) return;
    const r = tracker.observe(v.colours);
    traceAdd('view', { face: r.face, quarters: r.quarters, moves: r.moves.slice(), lost: r.lost, doubt: !!r.doubt, rgb: v.colours.map(c => c.map(Math.round)) });
    clearTimeout(againTimer);
    if (r.doubt) {
      // One view says the player turned something unplanned. Look once more
      // before believing it; until then the arrows stay as they are.
      againTimer = setTimeout(() => view.again(), 300);
      return;
    }
    if (r.lost) {
      lost += 1;
      if (phase === 'reading') { offer(v.colours); return; }
      if (lost >= LOST_LIMIT) {
        seen = null;
        startReading(true, '見失いました。もう一度、面を 1 つずつ見せてください');
      } else {
        setNote('adjust', 'うまく読めません。面をまっすぐカメラに向けてください');
      }
      return;
    }
    lost = 0;
    seen = { face: r.face, quarters: r.quarters };
    if (phase === 'reading') {
      // The tracker recognised the cube again: no need to finish reading.
      phase = 'solving';
      reader.clear();
      ui.chips.hidden = true;
    }
    const before = policy.plan.join(' ');
    const stageNow = policy.mode === 'steps' && policy.job ? policy.job.stage : null;
    for (const m of r.moves) {
      log.push({ move: m, stage: stageNow });
      if (policy.mode === 'steps') { taught.add(m[0]); taught.add('s' + m.slice(1)); }
    }
    policy.saw(r.moves, tracker.state);
    follow();
    traceAdd('plan', { left: policy.plan.length, next: policy.plan[0] || null, note: policy.note.kind, text: ui.note.textContent, say: ui.say.textContent });
    if (r.moves.length || policy.plan.join(' ') !== before) flashStage(FEEDBACK[policy.note.kind] || '');
  }

  function restart(text) {
    traceAdd('reset', { text: text || '' });
    clearTimeout(idleTimer); clearTimeout(againTimer);
    tracker = null;
    policy = null;
    seen = null;
    checked = new Set();
    log = [];
    taught = new Set();
    startReading(true, text);
  }

  function onGone() {
    clearTimeout(idleTimer); clearTimeout(againTimer);
    if (phase !== 'idle' && (tracker || reader.count)) {
      idleTimer = setTimeout(() => restart('次の方どうぞ。キューブの面をカメラに見せてください'), IDLE_RESET_MS);
    }
    if (tracker) tracker.release();
    seen = null;
    if (phase === 'solving' || phase === 'checking') ui.say.textContent = instruction();
  }

  function onFrame(f) {
    frame = f;
    if (f.inView) clearTimeout(idleTimer);   // someone is still at the cube, even if it never holds still
    draw();
  }

  function draw() {
    const c = ui.overlay;
    Overlay.clear(c);
    if (!frame) return;
    if (!frame.inView && !frame.held) {
      Overlay.grid(c, LiveView.guide, frame.size, 'idle');
      return;
    }
    const taking = phase === 'reading' ? frame.progress : 0;
    Overlay.grid(c, frame.box, frame.size, taking >= 1 ? 'steady' : 'seen', taking);
    if (phase === 'reading' && wholeHint) Overlay.whole(c, frame.box, frame.size, wholeHint, mirrored);
    if (phase === 'checking' && seen) {
      const nx = Policy.checkNext(seen.face, seen.quarters, checked);
      if (nx) Overlay.whole(c, frame.box, frame.size, nx.dir, mirrored);
      return;
    }
    if (phase !== 'solving' || !seen || !policy.plan.length) return;
    const a = Track.arrowFor(policy.plan[0], seen.face, seen.quarters, tracker.state);
    if (a.kind === 'show') Overlay.whole(c, frame.box, frame.size, Overlay.BACK[a.toward], mirrored);
    else Overlay.move(c, frame.box, frame.size, a, mirrored);
  }

  // ── controls ──────────────────────────────────────────────────────────────

  async function open() {
    ui.err.hidden = true;
    if (!Camera.canStream()) {
      ui.err.textContent = 'このブラウザではカメラを使えません（https か localhost で開いてください）';
      ui.err.hidden = false;
      return;
    }
    try {
      const stream = await Camera.openStream();
      stopCamera();
      ui.video.srcObject = stream;
      await ui.video.play();
      mirrored = Camera.isMirrored(stream);
      document.body.classList.toggle('mirrored', mirrored);
      ui.start.hidden = true;
      view.start();
      startReading(true);
    } catch (e) {
      ui.err.textContent = 'カメラを開けませんでした。ブラウザのカメラの許可を確かめてください';
      ui.err.hidden = false;
    }
  }

  /** Let the camera go (its light goes off) when the page is left. */
  function stopCamera() {
    const s = ui.video.srcObject;
    if (s) s.getTracks().forEach(t => t.stop());
    ui.video.srcObject = null;
  }

  window.addEventListener('pagehide', () => {
    LiveTrace.flush();
    clearTimeout(idleTimer); clearTimeout(againTimer);
    view.stop();
    stopCamera();
    tracker = null;
    policy = null;
    seen = null;
    phase = 'idle';
    ui.start.hidden = false;
  });

  ui.open.addEventListener('click', open);
  ui.force.addEventListener('click', () => { if (doubted && phase === 'reading') offer(doubted, true); });
  ui.again.addEventListener('click', () => {
    if (phase === 'idle') return;
    restart();
  });
  ui.sound.addEventListener('click', () => {
    soundOn = !soundOn;
    try { localStorage.setItem('live-sound', soundOn ? 'on' : 'off'); } catch (e) { /* storage blocked */ }
    updateSound();
    if (soundOn) beep(...SOUND.good);
  });
  updateSound();
  ui.modes.forEach(b => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    ui.modes.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    if (policy && phase !== 'reading') { policy.setMode(mode); follow(); }
  }));

  chips();
  setTimeout(() => TwoPhaseSolver.init(), 50);   // build the tables before they are needed
})();
