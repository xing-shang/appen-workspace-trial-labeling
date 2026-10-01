// cdp-click.mjs — 通用可信点击/输入：滚入视口 → 遮挡校验 → Input 域点击 → 验证计数递增。
// 用法: PAGE_ID=<id> CDP_PORT=<port> node cdp-click.mjs <selectorExpr> [期望计数表达式]
//   selectorExpr        页面元素定位表达式（如 document.querySelector('#btn-pause')）
//   期望计数表达式(可选) 点击后应递增/变化的只读计数；不传则只校验遮挡与视口。
import { openSession } from "./cdp-lib.mjs";

const s = await openSession();
try {
  const expr = process.argv[2];
  if (!expr) throw new Error("用法: cdp-click.mjs <selectorExpr> [期望计数表达式]");
  const countExpr = process.argv[3] || null;

  const before = countExpr ? await s.read(countExpr) : null;
  const ok = await s.clickUntilVerified({
    locateExpr: expr,
    alreadyExpr: `false`,
    verifyExpr: countExpr ? `(${countExpr}) !== (${JSON.stringify(before)})` : `true`,
    label: expr.slice(0, 60),
  });
  if (!ok) throw new Error("点击未生效: " + expr.slice(0, 100));
  process.exit(0);
} catch (e) {
  console.error("ERR", e.message || e);
  process.exit(1);
} finally {
  s.close();
}
