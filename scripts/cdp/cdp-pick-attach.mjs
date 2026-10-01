// cdp-pick-attach.mjs — 轨迹步骤文件挂载：打开 picker → 逐文件可信点击 → 计数验证 → 重试。
// 用法: PAGE_ID=<id> CDP_PORT=<port> node cdp-pick-attach.mjs <stepId> '<JSON: ["文件路径", ...]>'
import { openSession } from "./cdp-lib.mjs";

const s = await openSession();
try {
  const [sid, filesJson] = process.argv.slice(2);
  if (!sid || !filesJson) throw new Error('用法: cdp-pick-attach.mjs <stepId> \'<JSON: ["文件路径", ...]>\'');
  const files = JSON.parse(filesJson);
  const tagCount = `[...document.querySelectorAll('.traj-step[data-step-id="${sid}"] .traj-step-file')].length`;
  const openExpr = `document.getElementById('fpick_${sid}').classList.contains('open')`;

  const start = await s.read(tagCount);
  const target = start + files.length;
  let remaining = [...files];
  for (let round = 0; round < 4 && remaining.length; round++) {
    if (!(await s.read(openExpr))) {
      const btnExpr = `document.querySelector('.traj-step[data-step-id="${sid}"] .pick-file-btn')`;
      await s.scrollCenter(btnExpr);
      const pos = await s.readJSON(`(() => { const b = ${btnExpr}; const r = b.getBoundingClientRect(); return [Math.round(r.x+r.width/2), Math.round(r.y+r.height/2)]; })()`);
      await sleep(400);
      await s.clickXY(pos[0], pos[1], { afterSleep: 300 });
    }
    if (!(await s.read(openExpr))) { console.log("RETRY open"); continue; }
    const next = [];
    for (const p of remaining) {
      const before = await s.read(tagCount);
      const cbExpr = `document.querySelector('#fpick_${sid} input[data-file="${p}"]')`;
      const found = await s.read(`(() => { const e = ${cbExpr}; if (!e) return false; e.scrollIntoView({block:'center'}); return true; })()`);
      await sleep(350);
      if (!found) { next.push(p); continue; }
      const xy = await s.readJSON(`(() => { const e = ${cbExpr}; const r = e.getBoundingClientRect(); return [Math.round(r.x+Math.min(7,r.width/2)), Math.round(r.y+r.height/2)]; })()`);
      const vh = await s.read("window.innerHeight");
      if (!xy || xy[1] < 40 || xy[1] > vh - 30) { next.push(p); continue; }
      await s.clickXY(xy[0], xy[1]);
      const after = await s.read(tagCount);
      const openNow = await s.read(openExpr);
      if (after === before + 1) console.log("OK", p.split("/").pop());
      else { console.log("MISS", p.split("/").pop(), "open:", openNow); next.push(p); if (!openNow) break; }
    }
    remaining = next;
  }
  console.log(JSON.stringify({ done: remaining.length === 0, target, final: await s.read(tagCount) }));
  process.exit(remaining.length ? 1 : 0);
} catch (e) {
  console.error("ERR", e.message || e);
  process.exit(1);
} finally {
  s.close();
}
