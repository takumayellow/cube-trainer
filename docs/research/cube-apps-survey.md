# ルービックキューブ支援アプリの UI/UX 調査

調査日: 2026-11-19。対象は、カメラで読み取るソルバー、スマートキューブのアプリ、CFOP の教材。
出典に書いてあることだけを事実として書き、出典の無い判断には **推測** と付ける。
アプリストアのレビューは 2020〜2022 年のものが多く、今の版では直っている可能性がある。

---

## 1. カメラ / AR ソルバー

### 1.1 読み取り方

| 製品 | シャッター | 向きの案内 | 色の誤読への対処 | 出典 |
|------|-----------|-----------|----------------|------|
| rubiks-cube-solver.com（Web） | 手動。「Capture Face」ボタンかスペースキー | 撮るたびに短いアニメで次の面への回し方を示す（1・3・5 面目のあとは傾け、2・4 面目のあとは左へ回す）。前面カメラでは傾ける向きが逆になり、「Mirror」で反転を直す | 「Tune Colors」で各色をカメラに見せて登録。展開図の面をクリックして手で直す。面を撮り直すより手で直すことを勧める。「Validate」で各色 9 枚を確認 | https://rubiks-cube-solver.com/scan/ |
| Grubiks（Web） | 「Scan」から各面を見せる | 面と面の間の回し方を説明する | 誤読した面をタップで直す。色が合わないと「Coloring issues..」を出す | https://www.grubiks.com/solvers/rubiks-cube-3x3x3/ |
| Ruwix online solver（Web） | カメラ入力あり。主は手入力（パレットで色を選んで塗る。クリックで色を巡回） | — | 「Each color must be added exactly 9 times」「Each color can be used once as a center field」「Impossible scramble」など、原因別のエラー文（どのエッジを反転すべきか等の偶奇エラーまで出す） | https://ruwix.com/online-rubiks-cube-solver-program/ |
| CubeUnstuck | **自動・連続**。「align, tap, confirm, rotate, repeat」を避け「a single uninterrupted motion」を目指す | 開始の向きを固定（白が上・緑が手前）。初回の前にデモ動画を見せる | 9 面が揃うと緑の枠が出る。暗いと枠を出さない（「no answer rather than a wrong one」）。読み取り後に全体の「digital twin」を見せてから解く。15〜25 cm、反射は 10〜15° 傾けて避ける | https://cubeunstuck.com/articles/how-to-scan-cube/ |
| Magic Cube Solver（iOS, id6740144260） | 自動。「eliminates the need for face-by-face confirmation」 | — | 評価 2.7/5。「gets the wrong colur」、広告が多い | https://apps.apple.com/us/app/magic-cube-solver-5x-3x-4x-2x/id6740144260 |
| Cubix AR（iOS, 2025） | 6 面をスキャン | 前面・背面カメラを切り替えられる | 明るい場所での使用を指示 | https://apps.apple.com/gb/app/cubix-ar-cube-puzzle-solver/id6749282511 |

Cube Explorer（kociemba.org）の Web カメラ入力は、公式ページの本文が取得できず確認できなかった。

### 1.2 解き方の見せ方

| 製品 | 表示 | 出典 |
|------|------|------|
| Cube AR（iOS, 2017 頃） | カメラ映像の上のキューブに直接矢印を描く。面を回すのか、キューブ全体を持ち替えるのかを矢印で区別する | https://arcritic.com/1246/augmented-reality-rubiks-cube-solver-app/ , https://tobyliu.app/CubeAR/ |
| Cubix AR | 手の中のキューブに矢印を重ね、「AR tracks your movements in real time」。回すとガイドが追従する。v1.4.3 で「detect user error and fail early」、v1.4.4 で矢印を 3D 表示に | https://apps.apple.com/gb/app/cubix-ar-cube-puzzle-solver/id6749282511 |
| Rubik's 公式アプリ（iOS） | 実物を追跡し、映像上のタイルに矢印を描く。簡単な方法と約 20 手の方法を選べる。音と画面の手がかりを出す | https://thetoyinsider.com/rubiks-official-cube-app/ |
| SpeedCube AR（iOS, 2026） | 解法を LBL / CFOP / Kociemba から選べる。LBL・CFOP の教材つき | https://apps.apple.com/gh/app/speedcube-ar-3x3-cube-solver/id6760368416 |
| Grubiks | 「Next」「Back」「Reset」で 1 手ずつ。各手を平易な言葉で説明し、記号を知らなくてよい | https://www.grubiks.com/solvers/rubiks-cube-3x3x3/ |
| rubiks-cube-solver.com | 20 手以内の手順を表示 | https://rubiks-cube-solver.com/scan/ |

### 1.3 間違えたときの扱い

カメラ型で、間違えた手への反応（戻させる・解き直す）を具体的に書いた出典は見つからなかった。
Cubix AR の「fail early」が唯一の記述で、利用者に何が見えるかは書かれていない。

---

## 2. スマートキューブとアプリ

| 製品 | 追跡 | 教え方 | 間違えたとき | 出典 |
|------|------|--------|-------------|------|
| Rubik's Connected | Bluetooth で全手を即時に把握 | 小さな段階に分けた教材、動画・ヒント・即時フィードバック。組み込みソルバーあり | 間違えた瞬間に警告し、元に戻す手順をすぐ示す | https://gizmodo.com/this-smart-rubiks-cube-is-teaching-me-how-to-solve-one-1846301368 , https://appleinsider.com/articles/21/02/02/review-rubiks-connected-is-a-smart-cube-for-nostalgia-lovers |
| GoCube | 画面上の仮想キューブが実物と同時に動く | 初級〜中級向け。家族が約 1 時間で覚えたというレビュー | 「nudge you to take it back and try again」 | https://www.forbes.com/sites/ewanspence/2021/12/28/gocube-connected-rubiks-cube-android-iphone-review/ , https://eandt.theiet.org/content/articles/2020/06/hands-on-review-gocube-smart-rubik-s-cube/ , https://apps.apple.com/us/app/gocube/id1451476777 |
| GAN（CubeStation） | 手数・TPS・使った手順を記録。Camera Sync で状態を読み 30 手以内で解く | AI Tutorial、動画、7 段階の解説 | 具体的な記述は見つからず。同期がずれたら「Reset Cube」で合わせ直す（マニュアル） | https://play.google.com/store/apps/details?id=com.gan.cubestation&hl=en , https://manuals.plus/asin/B0CCXZHNFY |
| GiiKER SUPERCUBE | 6 軸センサーで全手を追跡 | Learn（物語形式の初心者教材、8 段階）、Solve（約 30 手）、Game、Training | — | https://apps.apple.com/au/app/supercube-by-giiker/id1317695009 , https://www.thecubicle.com/products/giiker-super-cube-i3s |
| MoYu AI（WCU アプリ） | 全手を追跡。廉価版はジャイロ無しで持ち替えを取れない | 「Learn to solve the cube」モード、タイマー、対戦 | — | https://cuboss.com/shop/moyu-weilong-v10-ai-3x3/ , https://www.speedsolving.com/threads/moyu-ai-cube-first-impressions.85122/ |
| Cubeast（他社キューブ対応） | 解いた過程を CFOP の段ごとに分解し、段ごとの認識時間と実行時間を出す | 分析とリプレイが中心 | — | https://www.speedsolving.com/threads/cubeast-a-speedcubing-timer-for-bluetooth-cubes-with-support-for-all-bluetooth-cubes-all-timers-and-all-major-solving-methods.77406/ , https://note.com/kirumi_shibu/n/nc9c6e2eadb84?hl=en |

要点: 「間違えた瞬間に知らせ、戻す手順を出す」のは Rubik's Connected と GoCube の両方が採っていて、
レビューでは初心者の独学に効いた点として挙がっている（E&T の 11 歳の試用者の例）。

---

## 3. CFOP の教材

| 教材 | 記号の導入 | 段の構成 | 段階的な開示 | 出典 |
|------|-----------|---------|-------------|------|
| J Perm（記号） | 6 面の時計回り（「as if you were facing that side」）→ プライム（反時計回り）→ 2（どちら向きでも可）→ 二層回し → 持ち替え x/y/z → スライス M/E/S の順。語呂合わせ（x は R に近い）。最後に早見表の画像 1 枚 | — | 基本から順に足す | https://jperm.net/3x3/moves |
| J Perm（CFOP） | — | Cross / F2L（2 層を同時に揃え、初心者法より約 20 手少ない）/ OLL（上面の色）/ PLL（上段の並び） | 2-look OLL（3+7=10 手順）と 2-look PLL（2+4=6 手順）から。OLL/PLL → F2L → クロスの改善の順を勧める。「Memorizing too much at once will make you forget them」 | https://jperm.net/3x3/cfop |
| CubeSkills（Feliks Zemdegs） | 手順を括弧で区切り、まとまり（トリガー）で覚えさせる | OLL を形の種類で分類し、各ケースの出現確率を付ける。並べた順に覚えることを勧める | — | https://notability.com/g/download/pdf/2JDT83gVd8af91voWwcq8U/CubeSkills%20CFOP%20Algorithms.pdf |
| 7 段階の初心者法（Ruwix ほか） | F/R/U/L/D、プライム、2。時計回りは「回す面の側から見て」 | 白クロス → 白コーナー → 中段 → 黄クロス → … の 7 段。各段に図・短い手順 1 つ・アニメの例 | 最初の白クロスは手順でなく直感で | https://ruwix.com/the-rubiks-cube/how-to-solve-the-rubiks-cube-beginners-method/ , https://www.cubelelo.com/blogs/cubing/how-to-solve-a-rubiks-cube-beginners-method |
| Joker House | — | 2-look OLL(10) → 2-look PLL(6) → クロス・直感 F2L → 全 PLL(21) → 全 OLL(57)。最小 16 手順で CFOP が回る | 段の順で増やす | https://thejokerhouse.com/en/content/106-cfop-method-rubiks-cube |

SpeedCubeDB は取得時に 403 で、中身を確認できなかった。Rubik's 公式の初心者ガイドの URL も 404 だった。

---

## 4. 共通する不満

| 不満 | 具体例 | 出典 |
|------|--------|------|
| 赤と橙、白と黄の誤読 | 「red and orange confuse me」「at least 3 minutes re-scanning」。暖色の照明や影で橙が負ける | https://play.google.com/store/apps/details?id=pbf.rubiks.cube.solver&hl=en_GB , https://riekapps.com/blog/why-a-cube-solver-says-unsolvable |
| 面ごとに照明が変わる | 回すたびにホワイトバランスが変わり、基準がやり直しになる | https://cubeunstuck.com/articles/how-to-scan-cube/ |
| 「解けない」と言われて理由が分からない | 原因はほぼ 1 枚の誤読。赤と橙は対面なので、赤橙のエッジは誤読の印 | https://riekapps.com/blog/why-a-cube-solver-says-unsolvable |
| 暗いと読めない | 明るい場所へ移ったら 10 回続けて成功、というレビュー | https://justuseapp.com/en/app/1537131696/3d-rubik-s-cube-solver/reviews |
| 解法のアニメ・動画が速すぎる | Rubik's Connected の実演が速い。Magic Cube Solver のアニメが追えない。GoCube の動画は途中に戻れない | https://apps.apple.com/us/app/rubiks-connected/id1523657401 , https://play.google.com/store/apps/details?id=ai.cubesolver3d.scanner.cubetimer.magic.cube.game&hl=en_ZA , https://gethacking.com/blogs/news/lets-go-gocube |
| 実物と画面がずれる | 同期ずれ、向きの検出エラー | https://gethacking.com/blogs/news/lets-go-gocube , https://manuals.plus/asin/B0CCXZHNFY |
| 段ごとに練習できない | 「learn one "stage" at a time」を求めるレビュー | https://play.google.com/store/apps/details?id=com.particula.rubiksconnected&hl=en_US&gl=US |
| 後をなぞるだけで覚えない | Solve モードは指示に従うだけで、アプリ無しで解けるようにならない | https://www.appysmarts.com/application/supercube-by-giiker-android-version,id_183704.php |
| 初心者の先が無い | OLL/PLL の練習が無い。CFOP に対応してほしい | https://apps.apple.com/us/app/gocube/id1451476777 , https://www.thecubicle.com/products/giiker-super-cube-i3s |
| 広告・課金 | 「too much adds every one second」、最後の段が課金（Cube AR） | https://apps.apple.com/us/app/magic-cube-solver-5x-3x-4x-2x/id6740144260 , https://arcritic.com/1246/augmented-reality-rubiks-cube-solver-app/ |
| 未翻訳の警告 | CubeStation の警告が中国語のまま | https://play.google.com/store/apps/details?id=com.gan.cubestation&hl=en |

---

## 5. このツールの差別化と取り入れるべき UI/UX

### 5.1 差別化できる点

- **スマートキューブ無しで、間違いを即時に知らせる。** 即時の警告と戻し方は、レビューで最も評価されている
  機能だが、調べた範囲ではスマートキューブ（Rubik's Connected / GoCube）でしか具体的に書かれていない。
  カメラ型で同じことを明記した製品は見つからなかった（Cubix AR の「fail early」のみ）。
- **広告・課金・インストールが無い。** 不満の上位を構造的に避けられる。
- **教える CFOP を「なぞるだけ」で終わらせない。** 段の名前と目的を出し、段ごとに区切る
  （GiiKER・Rubik's Connected の不満の裏返し）。

### 5.2 推奨（優先度順。P1 = 展示に必須）

#### 共通（展示ブースの前提）

1. **P1 開始画面は 1 文と 1 つの動き。** 「キューブをカメラに見せてください」だけを大きく出し、
   キューブを検出したら自動で始める。ボタンを押させない。説明を読まない来場者向け（推測）。
   開始の向きは固定せず任意にする（CubeUnstuck は白上・緑手前に固定しているが、本ツールは任意順を売りにする）。
2. **P1 一定時間キューブが映らなければ自動で最初に戻す**（例 30 秒、推測）。次の来場者が前の人の途中から始めない。
3. **P1 照明は会場側で固定する。** 赤橙・白黄の誤読は照明が主因（4 章）。卓上ライトを横から当て、
   直射の反射を避ける。開場前にブースの照明で 6 色を登録しておく（rubiks-cube-solver.com の Tune Colors と同じ考え）。
   来場者には色の登録をさせない。
4. **P2 音は短い効果音 2〜3 種だけ**（面を読めた・正しい手・間違えた）。会場は騒がしいので音だけに頼らず、
   必ず画面の色と形でも同じことを示す（推測）。ノート PC にはハプティクスが無いので使わない。
5. **P2 色だけで区別しない。** 状態は色に加えて記号（✓ / ✕ / ↺）と文字で示す。展開図の各面には色名の頭文字を重ねる
   オプションを置く（色覚多様性。Cube Solver 3D は配色の切替を持つ）。

#### 読み取り中に見せるもの

6. **P1 映像の横に 6 面の展開図を出し、読めた面から埋めていく。** 残りが何面かが一目で分かる。
   次に見せてほしい面がある場合は、展開図のその面を点滅させる（rubiks-cube-solver.com の「次の面への回し方アニメ」の代わり）。
7. **P1 面を認識している間は 9 マスの枠を出し、確定したら緑にする**（CubeUnstuck の緑枠）。
   自信が低いときは確定させず、枠を出さない（「no answer rather than a wrong one」）。
8. **P1 誤読は来場者に直させず、整合性で弾く。** 各色 9 枚・センター 6 色が一意・偶奇の検査を通らなければ、
   原因の面を展開図で赤く示し「この面をもう一度見せてください」と出す。Ruwix のような原因別エラー文は来場者には
   難しいので、面単位の再提示に変換する（推測）。赤橙の矛盾（同じエッジに赤と橙）は誤読として扱う（RiekApps）。
9. **P2 スタッフ用に、展開図の面をクリックで直せる隠しパネル**を用意する（Grubiks・rubiks-cube-solver.com の手修正）。

#### 解いている間（両モード共通）

10. **P1 矢印は映像上の実物の面に重ね、その面の幅いっぱいの大きさで出す。** 1 手に 1 本だけ。
    面を回す矢印と、キューブ全体を持ち替える矢印は形と色を分ける（Cube AR が区別している）。
    映像の外にも同じ手を 3D の小さなキューブで回して見せる（推測: 矢印だけでは奥の面が分かりにくい）。
11. **P1 次の手を 1 手ずつ出し、手が終わるまで待つ。** 自動で先へ進むアニメは「速すぎる」の不満を招く（4 章）。
    手が認識されたら矢印を消して小さな ✓ を出し、次の矢印を出す。
12. **P1 間違えた手には即座に、戻し方を 1 手で示す。** 画面の縁を赤くし、効果音を鳴らし、
    逆向きの矢印（例 R を回したら R' の矢印）を出す（Rubik's Connected / GoCube の方式）。
    戻せば元の手順に復帰し、2 手以上ずれたら黙って最短解を作り直し「新しい手順にしました」とだけ出す（推測: 叱らない）。
13. **P2 残り手数をバーで出す。** 「あと 14 手」。最短解モードでは手数が少ないことが見どころになる（推測）。
14. **P2 キューブが映らない・手が隠れて読めないときは、「キューブが見えません」を出して矢印を止める。**
    推測で進めない（同期ずれの不満、4 章）。

#### CFOP 学習モード

15. **P1 段を常に画面上部に出す。** 「Cross → F2L → OLL → PLL」の 4 つを並べ、今の段を強調し、
    その段の目的を 1 行で添える（例「OLL: 上の面を 1 色にそろえる」、J Perm の段の説明）。
    段が終わったら一呼吸置いて「クロス完成！」を出す。段ごとに区切ることで「全部を毎回」の不満に応える。
16. **P1 記号は矢印と同時に、今の 1 手を大きく、手順全体を小さく出す。**
    例: `R U R' U'` を並べ、今の `U` を拡大。初出の記号にだけ吹き出しで説明を出す
    （「R = 右の面を、右から見て時計回り」「' = 反対向き」「2 = 2 回」）。J Perm の順（面 → プライム → 2）で、
    2 回目以降は出さない（段階的な開示）。持ち替え x/y/z とスライスは使わない手順を選ぶ（推測）。
17. **P1 手順はトリガーの単位で括弧に区切る**（CubeSkills の `(R U R' U')`）。「セクシームーブ」のような名前を付けると覚えやすい（推測）。
18. **P2 OLL/PLL は 2-look（10+6 手順）を使い、どのケースかを図で示す。** J Perm と Joker House の初心者向けの選び方。
    ブースの短い滞在で全 57+21 手順は扱わない（推測）。
19. **P2 Cross と F2L は手順でなく目的を言葉で出す**（「白い辺を 4 本、横の色に合わせて下に」）。
    初心者法でもクロスは直感で教えている（Cubelelo）。矢印は出しつつ、「なぜこの手か」を 1 行添える。
20. **P3 最後に「今日やったこと」カードを出す。** 段ごとの手数と、覚えた記号を並べる。持ち帰り用の QR は
    個人データを含めない形で（推測）。

### 5.3 入れないもの

- アカウント・ログイン・広告・解析の外部送信（不満の上位。映像は端末内で処理する。Grubiks・rubiks-cube-solver.com も
  「no images are uploaded」を明記している）。
- 来場者向けの色の手修正 UI（スタッフ用に隠す）。
- 自動再生のアニメ（来場者のペースで 1 手ずつ進める）。

## 6. live.html での実装状況

5.2 の推奨のうち、`live.html`（カメラで追いかける版）に入れたものと入れていないもの。

| # | 推奨 | 状況 |
|---|------|------|
| 1 | 開始は 1 文、面が止まったら自動で読む | 入れた（撮影ボタン無し。どの面・どの向きからでもよい） |
| 2 | キューブが映らなければ最初に戻す | 入れた（60 秒。展示中に手元で考え込む時間を見て 30 秒より長くした） |
| 3 | 照明を会場で固定 | 運用（コード外） |
| 4 | 効果音 2〜3 種 | 入れた（読めた・正しい手・違う手・完成の 4 種。音のオン・オフ切替つき） |
| 5 | 色だけで区別しない | 一部（案内文の頭に ✓ / ↩ / ⟳ を付けた。展開図の頭文字は未実装） |
| 6 | 展開図を読めた面から埋める | 代替（読めた面を 6 つのチップで並べる。展開図は未実装） |
| 7 | 認識中は 9 マスの枠、確定で緑 | 入れた |
| 8 | 誤読は整合性で弾き、面単位で見せ直させる | 入れた（解けない色の並びなら、一番自信の低い面のチップを光らせる） |
| 9 | スタッフ用の手修正 | 未実装（チップのタップで撮り直しはできる） |
| 10 | 矢印を実物の面に重ねる、面と全体で形と色を分ける | 入れた（面は黄、全体は水色）。3D の小キューブは未実装 |
| 11 | 1 手ずつ待つ | 入れた |
| 12 | 間違えた手は即座に戻し方を示す、ずれたら作り直す | 入れた（縁が赤く光り、音が鳴る。戻させる / 最短に切り替える を案内文で示す） |
| 13 | 残り手数のバー | 入れた |
| 14 | 見えないときは止める | 入れた（見失ったら面を読み直す。推測で進めない） |
| 15 | CFOP の段を常に出す、段の完成を告げる | 入れた |
| 16 | 今の 1 手を大きく、手順全体を小さく、初出の記号だけ説明 | 入れた |
| 17 | トリガー単位で括弧 | 入れた（セクシームーブ・左のセクシームーブ・スレッジハンマー） |
| 18 | 2-look OLL/PLL を図で | 一部（手順は既存の Step のもの。ケースの図は未実装） |
| 19 | Cross と F2L は目的を言葉で | 入れた（Step の goal / why を出す） |
| 20 | 「今日やったこと」カード | 入れた（完成時に、回した手数・段ごとの手数・覚えた記号を出す） |

### シミュレーション（実キューブの色サンプルから合成した映像で、トラッカーと方針だけを回す）

- 最短モード、誤手 25%: 20 試行中 20 試行完成、偽の完成判定 0。
- CFOP モード、誤手 25%: 10 試行中 10 試行完成、偽の完成判定 0（1 試行あたり平均約 400 手。
  25% はかなり意地悪な設定で、戻す手と段ごとの手順が長いため）。
- 読み取り: 面の順番と向きを乱数で変えても 10 回中 10 回復元（`test/run.js` の 12 節）。
