# テスト用のデータ

| ファイル | 中身 | 出典 |
|----------|------|------|
| `real-rgb.json` | 実物の 3x3 を撮った 54 マスの RGB（10 個）。面の順は URFDLB に並べ替えた | [dwalton76/rubiks-color-resolver](https://github.com/dwalton76/rubiks-color-resolver) の `tests/test-data`（MIT） |
| `photo/{U,R,F,D,L,B}.png` | 実写 1920x1080 の中央の正方形を 360x360 に縮めたもの | [dwalton76/rubiks-cube-tracker](https://github.com/dwalton76/rubiks-cube-tracker) の `test-data/3x3x3-random-01`（MIT） |

`photo/` の正解は、同じ作者の resolver が出す
`LBBUURDDRDDLBRFRBDLLFRFRBLURFFLDLDBLURFULFBUUUDFDBFBUR`。

両リポジトリとも同じ MIT ライセンス（Copyright (c) 2019 Daniel Walton）で、全文は同じフォルダの `LICENSE`。
