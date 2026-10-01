// cdp-fill.mjs — 通用表单填写计划执行器：只读定位 + 可信 Input 事件写入。
// 用法: PAGE_ID=<id> CDP_PORT=<port> node cdp-fill.mjs <plan.json>
// 计划条目（按顺序执行，strict:false 的条目失败不中断）：
//   {"sel": <expr>}                      点击元素中心（必要时先滚入视口）
//   {"sel": <expr>, "text": "..."}       点击聚焦后 insertText
//   {"sel": <expr>, "selectall": true, "text": "..."}  三击全选后 insertText（覆盖式改写）
//   {"sel": <expr>, "key": "Tab", "repeat": 2}         键盘按键
//   {"verify": <readExpr>, "label": "..."}             只读取值打印
//   {"scroll": <expr>}                   仅滚入视口
// 注：刻意不提供 js/代码执行条目——Runtime.evaluate 在本套件中只做只读。
import { openSession } from "./cdp-lib.mjs";
import fs from "node:fs";

const s = await openSession();
try {
  const plan = JSON.parse(fs.readFileSync(process.argv[2], "utf-8"));
  const results = [];
  for (const [i, item] of plan.entries()) {
    try {
      if (item.verify !== undefined) {
        const v = await s.read(item.verify);
        results.push(`[${i}] VERIFY ${item.label || ""}: ${JSON.stringify(v)}`);
      } else if (item.scroll !== undefined) {
        await s.scrollCenter(item.scroll);
        results.push(`[${i}] SCROLLED`);
      } else if (item.key !== undefined) {
        const n = item.repeat || 1;
        for (let k = 0; k < n; k++) await s.keyPress(item.key, { vk: item.vk || 0 });
        results.push(`[${i}] KEY ${item.key} x${n}`);
      } else if (item.selectall) {
        // 三击原生全选
        const st = await (async () => { await s.scrollCenter(item.sel); return s.probe(item.sel); })();
        if (!st || !st.ok) throw new Error("无法定位/被遮挡: " + item.sel.slice(0, 80));
        await s.clickXY(st.cx, st.cy, { clicks: 3, pressSleep: 80, afterSleep: 300 });
        await s.send("Input.insertText", { text: item.text });
        await sleep(180);
        results.push(`[${i}] REPLACED`);
      } else if (item.sel !== undefined) {
        const st = await (async () => { await s.scrollCenter(item.sel); return s.probe(item.sel); })();
        if (!st) throw new Error("element not found: " + item.sel.slice(0, 80));
        if (!st.ok || st.cy <= 60 || st.cy >= st.vh - 20) throw new Error("遮挡/越界: " + item.sel.slice(0, 80));
        await s.clickXY(st.cx, st.cy);
        if (item.text !== undefined) {
          await s.send("Input.insertText", { text: item.text });
          await sleep(180);
          results.push(`[${i}] TYPED ${item.text.length} chars`);
        } else {
          results.push(`[${i}] CLICKED`);
        }
      } else if (item.text !== undefined) {
        await s.send("Input.insertText", { text: item.text });
        await sleep(180);
        results.push(`[${i}] TYPED ${item.text.length} chars`);
      } else {
        throw new Error("无法识别的计划条目: " + JSON.stringify(item).slice(0, 100));
      }
    } catch (e) {
      results.push(`[${i}] FAIL ${String(e.message || e).slice(0, 160)}`);
      if (item.strict !== false) {
        console.log(results.join("\n"));
        throw e;
      }
    }
  }
  console.log(results.join("\n"));
  process.exit(0);
} catch (e) {
  console.error("ERR", e.message || e);
  process.exit(1);
} finally {
  s.close();
}
