// cdp-duptags.mjs — dup 树打标：对指定文件点击 dup-tag-btn（可信 Input 点击 + 已激活短路 + 重试）。
// 用法: PAGE_ID=<id> CDP_PORT=<port> node cdp-duptags.mjs '<JSON: [{path, tag}, ...]>'
import { openSession } from "./cdp-lib.mjs";

const s = await openSession();
try {
  const TAGS = JSON.parse(process.argv[2]);
  let fail = 0;
  for (const { path, tag } of TAGS) {
    const btnExpr = `document.querySelector('.dup-tag-btn[data-path="${path}"][data-tag="${tag}"]')`;
    const activeExpr = `(() => { const b = ${btnExpr}; return b && b.classList.contains('active'); })()`;
    const done = await s.clickUntilVerified({
      locateExpr: btnExpr,
      alreadyExpr: activeExpr,
      verifyExpr: activeExpr,
      label: `${path.split("/").pop()}=${tag}`,
      attempts: 5,
    });
    if (!done) { console.log(`FAIL ${path}=${tag}`); fail++; }
  }
  console.log("dupTags total:", await s.read(`Object.values(dupTags).filter(Boolean).length`));
  process.exit(fail ? 2 : 0);
} catch (e) {
  console.error("ERR", e.message || e);
  process.exit(1);
} finally {
  s.close();
}
