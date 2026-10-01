// cdp-checkfiles.mjs — 文件树/定位树/dup 树勾选（可信 Input 点击 + 已勾短路 + 重试）。
// 用法: PAGE_ID=<id> CDP_PORT=<port> node cdp-checkfiles.mjs <mode> <files.json>
//   mode=file  → #file-tree input[data-fileid="<path>"]（任务实际阅读/使用的文件）
//   mode=loc   → #loc-tree input[data-path="<path>"]（题目级可定位文件勾选）
//   files.json → { "文件路径": true }，值为 true 表示勾选；false 预留取消（默认不启用）
// 末尾汇总输出对应树各自的已勾计数。
import { openSession } from "./cdp-lib.mjs";

const ATTR = { file: "data-fileid", loc: "data-path" };
const TREE = { file: "#file-tree", loc: "#loc-tree" };

const s = await openSession();
try {
  const mode = process.argv[2];
  if (!ATTR[mode]) throw new Error("未知 mode: " + mode + "，可用: file/loc");
  const files = Object.keys(JSON.parse(process.argv[3] || "{}"));
  if (!files.length) throw new Error("files.json 为空或未提供");

  let fail = 0;
  for (const f of files) {
    const cbExpr = `document.querySelector('${TREE[mode]} input[${ATTR[mode]}="${f}"]')`;
    const done = await s.clickUntilVerified({
      locateExpr: cbExpr,
      alreadyExpr: `(() => { const cb = ${cbExpr}; return cb && cb.checked; })()`,
      verifyExpr: `(() => { const cb = ${cbExpr}; return cb && cb.checked; })()`,
      label: f.split("/").pop(),
    });
    if (!done) { console.log(`FAILED ${f}`); fail++; }
  }
  const summary = await s.read(`document.querySelectorAll('${TREE[mode]} input[type=checkbox]:checked').length`);
  console.log(`${mode}-tree checked total:`, summary);
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error("ERR", e.message || e);
  process.exit(1);
} finally {
  s.close();
}
