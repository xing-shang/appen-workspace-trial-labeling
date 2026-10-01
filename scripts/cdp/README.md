# cdp/ — annotate.html 表单操作工具套件

从 v46 批次（013/004/005/006/007）任务脚本收敛而来，零第三方依赖（Node >= 22 内置 WebSocket）。优先使用 Chrome DevTools MCP 集成的 `take_snapshot`、`fill_form`、`click` 等页面工具；仅在集成不可用或无法可靠完成当前页面操作时使用本套件。

## 硬边界

- `Runtime.evaluate` 只用于只读表达式和 `scrollIntoView` 视口定位，**不写任何表单状态**；状态写入只经 `Input.dispatch*`/`Input.insertText`（等价于真实鼠标键盘事件）。
- `PAGE_ID` 必须显式提供，不设默认值——防止误连其他任务的 Chrome 页面。先 `curl http://127.0.0.1:<port>/json` 找到目标 annotate.html 页的 id。
- 候选 DOM 选择器（`#file-tree`、`data-fileid`、`.add-step-btn` 等）以当前任务 `annotate.html` 为准；模板变更时先只读探测再使用。

## 环境

```bash
# 每题一次性准备：独立 Chrome 实例 + 独立 profile + 调试端口
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --user-data-dir=<task>/build/chrome-profile --remote-debugging-port=<port> \
  <task>/source/annotate.html &
export CDP_PORT=<port>
export PAGE_ID=<id>   # curl http://127.0.0.1:<port>/json 查询
```

## 脚本

| 脚本 | 用途 |
|---|---|
| `cdp-status.mjs` | 只读状态查询（timer/accum/running/checked/steps/按钮坐标）、坐标点击、设置下载目录 |
| `cdp-click.mjs` | 通用元素点击（滚入视口+遮挡校验+计数验证） |
| `cdp-checkfiles.mjs` | file 树 / loc 树勾选（已勾短路+重试） |
| `cdp-times.mjs` | 逐文件阅读耗时（点击+逐字符键盘输入+Tab+读回验证） |
| `cdp-steps.mjs` | 轨迹步骤 `add N` / `del target [first\|last]`，输出原生 `ts_` ID |
| `cdp-fill.mjs` | 表单填写计划执行器（JSON plan：click/text/selectall/key/verify/scroll） |
| `cdp-pick-attach.mjs` | 轨迹步骤挂载文件（picker 打开+逐文件点击+计数验证） |
| `cdp-duptags.mjs` | dup 树打标（同名/多版本标记） |

## 典型顺序（与 skill 端到端流程对应）

1. `cdp-status.mjs status` — 开页后核对计时起点与空表单状态
2. `cdp-checkfiles.mjs file <files.json>` — 勾选实际阅读的文件
3. `cdp-times.mjs '<times.json>'` — 逐文件耗时
4. `cdp-steps.mjs del 0` — 清掉首条勾选自动建的步骤（如模板有此行为）
5. `cdp-steps.mjs add <N>` — 添加业务轨迹步骤，记录输出的原生 ID
6. `cdp-pick-attach.mjs <stepId> '<files>'` — 每步挂载涉及文件
7. `cdp-fill.mjs <stage_plan.json>` — 步骤正文、Rubric 六字段、题目级评分/判定
8. `cdp-duptags.mjs '<tags.json>'` — 同名/多版本打标
9. `cdp-checkfiles.mjs loc <locfiles.json>` — 题目级可定位文件勾选
10. 真实业务操作、Rubric 审核和复核完成后检查计时与文件耗时。仍有未完成工作就继续实际作业；暂时离开则按页面“暂停”。满足当前合同后通过页面按钮“暂停”→“暂存”→重新打开 draft 并回读→“任务完成”，下载最终一对文件
11. `node <本Skill目录>/scripts/validate_annotation_html_integrity.mjs --source ... --draft ... --shared ... --time-start-ms <本题真实开始毫秒> --time-end-ms <本题真实结束毫秒>` — 上传前只读完整性门禁

不要运行历史任务中的“等待计时达标”导出脚本，也不要通过空挂页面凑时长。上述脚本只负责页面可见控件操作；当前题的实际业务进展决定何时导出。日志保存在单题 `build/`，不入交付物。

## 维护

- 本套件只保存跨任务稳定的操作机制；任务特定的文件清单、耗时映射、填写计划、轨迹文本一律放在单题 `build/` 的 JSON 中，不修改本目录脚本。
- 新模板的 DOM 结构变化时，先在只读模式探测新选择器，确认后再改这里并在多题复用后合入。
