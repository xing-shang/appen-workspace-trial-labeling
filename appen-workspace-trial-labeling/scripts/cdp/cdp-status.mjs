// cdp-status.mjs — 只读状态查询 + 可信按钮点击 + 下载目录设置。
// 用法:
//   PAGE_ID=<id> CDP_PORT=<port> node cdp-status.mjs                  全量状态
//   PAGE_ID=<id> CDP_PORT=<port> node cdp-status.mjs read <key>       单项只读（timer/pause/accum/running/readOnly/checked/steps/banner/btnPauseXY/btnStashXY/btnDoneXY）
//   PAGE_ID=<id> CDP_PORT=<port> node cdp-status.mjs click '<[x,y]>'  可信点击坐标
//   PAGE_ID=<id> CDP_PORT=<port> node cdp-status.mjs setdownloaddir <dir>
import { openSession } from "./cdp-lib.mjs";

const READS = {
  timer: `document.getElementById('timer-display').textContent`,
  pause: `document.getElementById('btn-pause').textContent.trim()`,
  accum: `currentState._timer.accum`,
  running: `currentState._timer.running`,
  readOnly: `document.getElementById('timer-bar').classList.contains('read-only')`,
  checked: `document.querySelectorAll('#file-tree input[type=checkbox]:checked').length`,
  locChecked: `document.querySelectorAll('#loc-tree input[type=checkbox]:checked').length`,
  steps: `document.querySelectorAll('#traj-steps .traj-step').length`,
  banner: `document.getElementById('success-banner').classList.contains('show')`,
  btnPauseXY: `(() => { const r = document.getElementById('btn-pause').getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`,
  btnStashXY: `(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('暂存')); const r = b.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`,
  btnDoneXY: `(() => { const b = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('任务完成')); const r = b.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`,
};

const s = await openSession();
try {
  const cmd = process.argv[2] || "status";
  if (cmd === "setdownloaddir") {
    if (!process.argv[3]) throw new Error("用法: cdp-status.mjs setdownloaddir <dir>");
    await s.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: process.argv[3], eventsEnabled: true });
    console.log("download dir set");
  } else if (cmd === "click") {
    const [x, y] = JSON.parse(process.argv[3]);
    await s.clickXY(x, y, { afterSleep: 500 });
    console.log("clicked", x, y);
  } else if (cmd === "read") {
    if (!READS[process.argv[3]]) throw new Error("未知只读项: " + process.argv[3] + "，可用: " + Object.keys(READS).join("/"));
    console.log(JSON.stringify(await s.read(READS[process.argv[3]])));
  } else if (cmd === "status") {
    const out = {};
    for (const k of Object.keys(READS)) out[k] = await s.read(READS[k]);
    console.log(JSON.stringify(out));
  } else {
    throw new Error("未知命令: " + cmd + "，可用: status/read/click/setdownloaddir");
  }
  process.exit(0);
} catch (e) {
  console.error("ERR", e.message || e);
  process.exit(1);
} finally {
  s.close();
}
