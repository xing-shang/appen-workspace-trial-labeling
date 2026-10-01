import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const validator = fileURLToPath(new URL('./validate_annotation_html_integrity.mjs', import.meta.url));

function check({ draftState = {}, sharedState = {}, sourceHtml = (value) => value, draftHtml = (value) => value, sharedHtml = (value) => value, omitTime = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'annotation-integrity-'));
  try {
    const now = Date.now();
    const ids = [`ts_${now - 120_000}`, `ts_${now - 118_500}`];
    const baseline = {
      _timer: { accum: 3_600_000, running: false },
      _traj_steps: ids.map((id) => ({ id, summary: '核对字段', desc: '检查来源文件' })),
      level_quality: '4',
    };
    const template = (state) => `<!DOCTYPE html><html><head><script src="https://example.com/renderer.js"></script></head><body>
<button id="btn-done" class="submit-btn" onclick="validate()">完成</button><div id="static-note">说明</div>
<script>const PRESET_STATE = ${JSON.stringify(state)};\nfunction validate() { return true; }</script></body></html>`;
    const source = path.join(dir, 'source.html');
    const draft = path.join(dir, 'draft.html');
    const shared = path.join(dir, 'shared.html');
    fs.writeFileSync(source, sourceHtml(template({})));
    fs.writeFileSync(draft, draftHtml(template({ ...baseline, ...draftState })));
    fs.writeFileSync(shared, sharedHtml(template({ ...baseline, _read_only: true, _timer: { accum: 3_605_000, running: false }, ...sharedState })));
    const args = [validator, '--source', source, '--draft', draft, '--shared', shared];
    if (!omitTime) args.push('--time-start-ms', String(now - 180_000), '--time-end-ms', String(now - 60_000));
    const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('accepts native export differences only', () => {
  const result = check();
  assert.equal(result.status, 0, result.output);
});

test('rejects a changed rubric or other form state', () => {
  const result = check({ sharedState: { level_quality: '2' } });
  assert.equal(result.status, 1);
  assert.match(result.output, /form state differs.*level_quality/);
});

test('rejects changed trajectory text even when IDs match', () => {
  const result = check({ sharedHtml: (html) => html.replace('核对字段', '跳过字段') });
  assert.equal(result.status, 1);
  assert.match(result.output, /form state differs.*_traj_steps/);
});

test('rejects a stale draft with a large timer gap', () => {
  const result = check({ sharedState: { _timer: { accum: 3_700_000, running: false } } });
  assert.equal(result.status, 1);
  assert.match(result.output, /timer gap/);
});

test('requires the actual task time bounds', () => {
  const result = check({ omitTime: true });
  assert.equal(result.status, 2);
  assert.match(result.output, /time-start-ms/);
});

test('rejects an ID from another task time window', () => {
  const result = check({ sharedState: { _traj_steps: [{ id: 'ts_1700000000000' }] } });
  assert.equal(result.status, 1);
  assert.match(result.output, /before --time-start-ms/);
});

test('rejects a changed external script source', () => {
  const result = check({ sharedHtml: (html) => html.replace('renderer.js', 'replacement.js') });
  assert.equal(result.status, 1);
  assert.match(result.output, /script tag attributes differ/);
});

test('rejects a changed script execution attribute', () => {
  const result = check({ sharedHtml: (html) => html.replace('<script>const PRESET_STATE', '<script type="text/plain">const PRESET_STATE') });
  assert.equal(result.status, 1);
  assert.match(result.output, /script tag attributes differ/);
});

test('rejects a changed static event handler', () => {
  const result = check({ draftHtml: (html) => html.replace('onclick="validate()"', 'onclick="skipValidation()"') });
  assert.equal(result.status, 1);
  assert.match(result.output, /static inline event handlers differ/);
});

test('rejects an added handler on a source element without one', () => {
  const result = check({ sharedHtml: (html) => html.replace('id="static-note"', 'id="static-note" onclick="skipValidation()"') });
  assert.equal(result.status, 1);
  assert.match(result.output, /static inline event handlers differ/);
});

test('requires manual review when a tool term is part of the original task', () => {
  const addOriginalText = (html) => html.replace('说明</div>', '说明</div><p>OpenAI原文</p>');
  const result = check({ sourceHtml: addOriginalText, draftHtml: addOriginalText, sharedHtml: addOriginalText });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /verify every occurrence against original task material/);
});

test('rejects an internal marker absent from the original task', () => {
  const result = check({ sharedHtml: (html) => html.replace('说明</div>', '说明</div><p>Codex</p>') });
  assert.equal(result.status, 1);
  assert.match(result.output, /direct internal\/tool marker/);
});
