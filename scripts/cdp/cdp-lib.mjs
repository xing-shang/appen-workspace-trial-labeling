// cdp-lib.mjs — annotate.html CDP 操作共享核心（零依赖，Node >= 22 内置 WebSocket）。
//
// 硬边界（与 skill 合同一致）：
// - Runtime.evaluate 只用于只读表达式和 scrollIntoView 视口定位，不写任何表单状态；
// - 页面状态写入只经 Input.dispatchMouseEvent / Input.dispatchKeyEvent / Input.insertText；
// - 下载行为只经 Browser.setDownloadBehavior；
// - PAGE_ID 必须由环境变量显式提供，不设默认值，防止误连其他任务的页面。

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function openSession() {
  const pageId = process.env.PAGE_ID;
  if (!pageId) {
    throw new Error("缺少 PAGE_ID 环境变量。先 curl http://127.0.0.1:<CDP_PORT>/json 找到目标 annotate.html 页的 id，再 export PAGE_ID=<id>。不设默认值，防止误连其他任务的页面。");
  }
  const port = process.env.CDP_PORT || "9333";
  const url = `ws://127.0.0.1:${port}/devtools/page/${pageId}`;

  const ws = new WebSocket(url);
  let seq = 0;
  const pending = new Map();

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("close", (ev) => reject(new Error(`无法连接 ${url}（close code ${ev.code}）。确认 Chrome 调试端口和 PAGE_ID。`)), { once: true });
    ws.addEventListener("error", () => {}, { once: true });
  });

  ws.addEventListener("message", (ev) => {
    let msg;
    try { msg = JSON.parse(String(ev.data)); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error).slice(0, 200)));
      else resolve(msg.result);
    }
  });

  async function send(method, params = {}) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function read(expr) {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result.value;
  }

  async function readJSON(expr) {
    return JSON.parse(await read(expr));
  }

  // 可信鼠标点击：Input 域事件序列，参数语义与既有任务脚本一致。
  async function clickXY(x, y, opts = {}) {
    const clicks = opts.clicks ?? 1;
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", pointerType: "mouse" });
    await sleep(opts.moveSleep ?? 130);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: clicks, pointerType: "mouse" });
    await sleep(opts.pressSleep ?? 90);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: clicks, pointerType: "mouse" });
    await sleep(opts.afterSleep ?? 400);
  }

  async function keyPress(key, { vk = 0, text = "", hold = 0 } = {}) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key, modifiers: hold, windowsVirtualKeyCode: vk, text });
    await sleep(60);
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, modifiers: hold, windowsVirtualKeyCode: vk });
    await sleep(90);
  }

  // 滚入视口（兼容容器内滚动）。只改视口位置，不改表单状态。
  async function scrollCenter(expr) {
    const r = await read(`(() => { const e = ${expr}; if (!e) return "nf"; e.scrollIntoView({block:"center"}); return 1; })()`);
    if (r !== 1) throw new Error("element not found: " + expr);
    await sleep(450);
  }

  // 只读探测：目标中心坐标、elementFromPoint 遮挡检查与视口边界。
  async function probe(expr) {
    return readJSON(`(() => { const e = ${expr}; if (!e) return null; const r = e.getBoundingClientRect(); if (r.width === 0 && r.height === 0) return null; const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2); const hit = document.elementFromPoint(cx, cy); return JSON.stringify({ cx, cy, vh: window.innerHeight, ok: hit === e || e.contains(hit), hitTag: hit ? hit.tagName : null }); })()`);
  }

  // 通用"滚入视口→遮挡校验→可信点击→读回验证"循环，带已满足短路。
  // locateExpr: 定位表达式；alreadyExpr: 点击前读回真值表示已满足；
  // verifyExpr: 点击后读回真值表示生效；label: 日志名。
  async function clickUntilVerified({ locateExpr, alreadyExpr, verifyExpr, label, attempts = 6, clickOpts = {} }) {
    for (let a = 1; a <= attempts; a++) {
      if (await read(alreadyExpr)) {
        console.log(`OK(已满足) ${label}`);
        return true;
      }
      await scrollCenter(locateExpr);
      let st;
      try { st = await probe(locateExpr); } catch { st = null; }
      if (!st) { console.log(`RETRY${a} 无元素/无矩形 ${label}`); await sleep(500); continue; }
      const { cx, cy, vh, ok, hitTag } = st;
      if (ok && cy > 60 && cy < vh - 20) {
        await clickXY(cx, cy, clickOpts);
        if (await read(verifyExpr)) { console.log(`OK ${label}`); return true; }
        console.log(`RETRY${a} 点击后未生效 ${label}`);
      } else {
        console.log(`RETRY${a} 遮挡/越界 ${label} hit=${hitTag} y=${cy}`);
      }
      await sleep(500);
    }
    return false;
  }

  async function close() {
    try { ws.close(); } catch { /* 已关闭 */ }
  }

  return { ws, send, read, readJSON, clickXY, keyPress, scrollCenter, probe, clickUntilVerified, close };
}
