# 書靈

中外文學與文化知識的收服遊戲：收服詩人、作品、意象與流派，從雲山詩國一路走到諾貝爾星河。最高段位「通人」取自王充《論衡·超奇》「博覽古今者為通人」。字靈收服（文言字詞）的姊妹站。

- 網站：https://shuling.bdfz.net
- 技術：React + Vite + TypeScript；Cloudflare Worker + Workers Assets + D1。
- 題庫由 `node scripts/build-bank.mjs` 嚴格建置：每一題都由已登記來源的事實生成，來源快照在 `data/`。

## 內容來源與授權

程式碼以 MIT 授權（見 `LICENSE`）。資料各依原授權：

| 資料 | 來源 | 授權／說明 |
| --- | --- | --- |
| 諾貝爾文學獎得主、年份、授獎辭 | api.nobelprize.org | 依諾貝爾基金會網站條款引用；授獎辭只取短語並連回原文 |
| 作家、作品、寫作語言、體裁、流派、出生與出版時間 | Wikidata | CC0 |
| 《唐詩三百首》《宋詞三百首》 | chinese-poetry（b8594f8） | MIT，見 `data/raw/chinese-poetry/LICENSE` |
| 課本必背古詩詞正文 | 琅琅背誦站（統編語文教材） | 古典詩詞正文屬公有領域 |
| 指考國文試題與官方答案 | 大學入學考試中心 | 官方公告試題，供學習使用 |
| 中文譯名與授獎辭中文提要 | 本站 `data/curated/` | MIT |
| 美術 | 本專案以 Cloudflare Workers AI（Leonardo Lucid Origin）生成，提示詞與種子在 `art-pack/` | MIT |

本倉庫不含任何使用者或學生資料、帳號、憑證或內部營運紀錄。
