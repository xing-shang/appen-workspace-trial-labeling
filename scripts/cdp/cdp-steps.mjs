// cdp-steps.mjs — 轨迹步骤增删：点击“+ 添加步骤”N 次（首条勾选自动建步骤后可用 del 模式清理）。
// 用法: PAGE_ID=<id> CDP_PORT=<port> node cdp-steps.mjs add <N>
//       PAGE_ID=<id> CDP_PORT=<port> node cdp-steps.mjs del <target> [first|last]
//   add <N>         添加 N 条步骤，每条验证步骤计数递增，最后输出全部步骤 ID
//   del <target>    删到剩余 target 条；first=正序删首条（默认 last=倒序删末条）
import { openSession } from "./cdp-lib.mjs";

const s = await openSession();
try {
  const mode = process.argv[2];
  if (mode === "add") {
    const N = parseInt(process.argv[3] || "8", 10);
    for (let i = 0; i < N; i++) {
      const before = await s.read(`document.querySelectorAll('#traj-steps .traj-step').length`);
      const done = await s.clickUntilVerified({
        locateExpr: `document.querySelector('.add-step-btn')`,
        alreadyExpr: `false`,
        verifyExpr: `document.querySelectorAll('#traj-steps .traj-step').length > ${before}`,
        label: `step ${before + 1}`,
        attempts: 5,
        clickOpts: { afterSleep: 800 },
      });
      if (!done) { console.log("FAILED to add step"); process.exit(1); }
    }
    console.log("ids:", await s.read(`JSON.stringify(Array.from(document.querySelectorAll('#traj-steps .traj-step')).map(s => s.dataset.stepId))`));
  } else if (mode === "del") {
    const target = parseInt(process.argv[3] || "0", 10);
    const from = process.argv[4] === "first" ? "first" : "last";
    for (let round = 0; round < 30; round++) {
      const count = await s.read(`document.querySelectorAll('#traj-steps .traj-step').length`);
      if (count <= target) break;
      const idxExpr = from === "first" ? "steps[0]" : "steps[steps.length-1]";
      const info = await s.read(`(() => { const steps = document.querySelectorAll('#traj-steps .traj-step'); const st = ${idxExpr}; const btn = st.querySelector('.rm-traj'); btn.scrollIntoView({block:'center'}); return 1; })()`);
      await sleep(600);
      const st = await s.readJSON(`(() => { const steps = document.querySelectorAll('#traj-steps .traj-step'); const st = ${idxExpr}; const btn = st.querySelector('.rm-traj'); const r = btn.getBoundingClientRect(); const cx = Math.round(r.x+r.width/2), cy = Math.round(r.y+r.height/2); const hit = document.elementFromPoint(cx,cy); return JSON.stringify({cx, cy, vh: window.innerHeight, ok: hit===btn}); })()`);
      if (st.ok && st.cy > 60 && st.cy < st.vh - 20) {
        await s.clickXY(st.cx, st.cy, { afterSleep: 700 });
      } else {
        await sleep(400);
      }
    }
    console.log("remaining steps:", await s.read(`document.querySelectorAll('#traj-steps .traj-step').length`));
    console.log("checked files:", await s.read(`document.querySelectorAll('#file-tree input[type=checkbox]:checked').length`));
  } else {
    throw new Error("用法: cdp-steps.mjs add <N> | del <target> [first|last]");
  }
  process.exit(0);
} catch (e) {
  console.error("ERR", e.message || e);
  process.exit(1);
} finally {
  s.close();
}
