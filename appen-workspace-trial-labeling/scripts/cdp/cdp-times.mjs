// cdp-times.mjs — 逐文件阅读耗时填写（可信点击 + 逐字符键盘输入 + Tab 提交 + 读回验证）。
// 用法: PAGE_ID=<id> CDP_PORT=<port> node cdp-times.mjs '<JSON: {"文件路径": 分钟数}>'
import { openSession } from "./cdp-lib.mjs";

const s = await openSession();
try {
  const TIMES = JSON.parse(process.argv[2]);
  if (!Object.keys(TIMES).length) throw new Error("未提供耗时映射");

  let fail = 0;
  for (const [fid, mins] of Object.entries(TIMES)) {
    const tiExpr = `document.querySelector('#file-tree input.time-input[data-timeid="${fid}"]')`;
    const valExpr = `(() => { const ti = ${tiExpr}; return ti && ti.value === '${mins}'; })()`;

    let done = false;
    for (let a = 1; a <= 6 && !done; a++) {
      if (await s.read(valExpr)) { console.log(`OK(已有) ${fid.split("/").pop()}=${mins}`); done = true; break; }
      await s.scrollCenter(tiExpr);
      const st = await s.probe(tiExpr);
      if (!st) { console.log(`retry(${a}) 无元素/无矩形`); await sleep(500); continue; }
      const { cx, cy, vh, ok } = st;
      if (ok && cy > 60 && cy < vh - 20) {
        await s.clickXY(cx, cy, { afterSleep: 400 });
        for (const ch of String(mins)) {
          await s.send("Input.dispatchKeyEvent", { type: "keyDown", key: ch, text: ch, windowsVirtualKeyCode: ch.charCodeAt(0) });
          await sleep(60);
          await s.send("Input.dispatchKeyEvent", { type: "keyUp", key: ch, windowsVirtualKeyCode: ch.charCodeAt(0) });
          await sleep(60);
        }
        await s.keyPress("Tab", { vk: 9 });
        await sleep(500);
        if (await s.read(valExpr)) { console.log(`OK ${fid.split("/").pop()}=${mins}`); done = true; }
        else console.log(`retry(${a}) 值未生效`);
      } else {
        console.log(`retry(${a}) 遮挡/越界`);
        await sleep(500);
      }
    }
    if (!done) { console.log(`FAILED ${fid}`); fail++; }
  }
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error("ERR", e.message || e);
  process.exit(1);
} finally {
  s.close();
}
