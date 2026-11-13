import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const temporary = mkdtempSync(join(tmpdir(), 'aisf-events-'));
after(() => rmSync(temporary, { recursive: true, force: true }));
process.env.FACTORY_HOME = join(temporary, 'aisf');
const { default: guards } = await import('../adapters/pi/guards.mjs');

async function fixture({ optIn = true, contract, setup = () => {} } = {}) {
  const project = mkdtempSync(join(temporary, 'project-'));
  if (optIn) writeFileSync(join(project, 'AGENTS.md'), `Read ${process.env.FACTORY_HOME}/SESSION.md`);
  setup(project);
  delete process.env.AISF_CONTRACT;
  let reportPath;
  if (contract) {
    const artifacts = mkdtempSync(join(temporary, 'run-'));
    const input = join(artifacts, '01-work-swe.input.json');
    writeFileSync(input, JSON.stringify({ task_id: 'task-17', project, artifacts, objective: 'Implement the test contract',
      role: 'swe', attempt: 1, context: {}, ...contract }));
    process.env.AISF_CONTRACT = input;
    reportPath = input.replace('.input.json', '.guard.json');
  }
  const handlers = new Map();
  const tools = new Map();
  const commands = new Map();
  guards({ on: (name, handler) => handlers.set(name, handler),
    registerTool: tool => tools.set(tool.name, tool), registerCommand: (name, command) => commands.set(name, command) });
  const ctx = {
    cwd: project, hasUI: false, model: { provider: 'fixture', id: 'offline', contextWindow: 10000 },
    sessionManager: { getSessionId: () => session }, usage: { tokens: 120, contextWindow: 10000 },
    getContextUsage() { return this.usage; }, aborted: false,
    abort() { this.aborted = true; }, compactions: [],
    compact(options) { this.compactions.push(options); },
    ui: { confirm: async () => false, notify: () => {} },
  };
  const session = randomUUID();
  const emit = (name, args = {}) => handlers.get(name)({ type: name, ...args }, ctx);
  const start = () => emit('before_agent_start', { prompt: 'Fix the fixture', systemPrompt: 'Keep the assigned role.' });
  await start();
  const checkpoint = params => tools.get('aisf_checkpoint').execute('checkpoint', {
    decisions: ['Keep the existing design'], progress: ['Inspected the relevant file'], blockers: [],
    evidence_paths: [], verification: 'not_required', next_action: 'Continue the same task', ...params,
  });
  const report = () => {
    if (!reportPath) {
      // The tool returns the public checkpoint path; no knowledge of the session-key format is needed.
      throw new Error('Call locateReport before reading interactive evidence.');
    }
    return JSON.parse(readFileSync(reportPath, 'utf8'));
  };
  async function locateReport() {
    const result = await checkpoint();
    reportPath = result.content[0].text.replace('Checkpoint saved: ', '');
    return reportPath;
  }
  async function call(toolName, input) {
    const toolCallId = randomUUID();
    const blocked = await emit('tool_call', { toolName, input, toolCallId });
    if (blocked?.block) {
      await emit('tool_execution_end', { toolName, toolCallId, isError: true });
      return { blocked, isError: true };
    }
    let output = '';
    let isError = false;
    try {
      if (toolName === 'bash') output = execFileSync('bash', ['-c', input.command], { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      if (toolName === 'write') writeFileSync(join(project, input.path), input.content);
      if (toolName === 'read') output = readFileSync(join(project, input.path), 'utf8');
    } catch (error) {
      output = String(error.stderr || error.message);
      isError = true;
    }
    const result = await emit('tool_result', { toolName, toolCallId, content: [{ type: 'text', text: output }], isError });
    isError = result?.isError ?? isError;
    await emit('tool_execution_end', { toolName, toolCallId, result, isError });
    return { output: result?.content[0].text ?? output, isError };
  }
  return { project, ctx, emit, start, call, checkpoint, locateReport, report,
    scope: args => commands.get('aisf-scope').handler(JSON.stringify(args), ctx),
    settle: outcome => emit('agent_before_settle', { entries: [], outcome: outcome || 'completed' }) };
}

test('opt-out disables native checks, including on a subsequent session start', async () => {
  const f = await fixture();
  rmSync(join(f.project, 'AGENTS.md'));
  await f.start();
  assert.equal(await f.emit('tool_call', { toolName: 'bash', input: { command: 'rm -rf protected' } }), undefined);
  await assert.rejects(f.checkpoint(), /No healthy active/);
  const unrelated = await fixture({ optIn: false });
  assert.equal(await unrelated.emit('tool_call', { toolName: 'read', input: { path: '.env' } }), undefined);
});

test('secret inputs are blocked, while sanitized fixtures and value-free checks remain usable', async () => {
  const f = await fixture({ setup: project => {
    writeFileSync(join(project, '.env'), 'secret material');
    writeFileSync(join(project, '.env.example'), 'NAME=example');
    symlinkSync('.env', join(project, 'alias'));
  } });
  for (const path of ['.env', 'alias']) assert.ok((await f.call('read', { path })).blocked);
  assert.ok((await f.call('bash', { command: 'cat .env.example .env' })).blocked);
  assert.equal((await f.call('read', { path: '.env.example' })).output, 'NAME=example');
  assert.equal((await f.call('bash', { command: 'test -f .env' })).blocked, undefined);
  assert.equal((await f.call('bash', { command: 'printf "%s" "${API_KEY:+configured}"' })).blocked, undefined);
  assert.ok((await f.call('bash', { command: 'printf "%s" "$API_KEY"' })).blocked);
});

test('output and guard evidence redact known secrets without copying tool details', async () => {
  process.env.AISF_FIXTURE_API_KEY = 'fixture-sensitive-value-9381';
  try {
    const f = await fixture();
    const result = await f.emit('tool_result', { content: [{ type: 'text', text: 'result: fixture-sensitive-value-9381' }],
      details: { unsafe: 'fixture-sensitive-value-9381' } });
    assert.equal(result.content[0].text, 'result: [REDACTED]');
    assert.deepEqual(result.details, {});
    const metadataOnly = await f.emit('tool_result', { content: [{ type: 'text', text: 'safe output' }],
      details: { unsafe: process.env.AISF_FIXTURE_API_KEY } });
    assert.deepEqual(metadataOnly.details, {});
    assert.equal(metadataOnly.isError, true);
    const path = await f.locateReport();
    await f.checkpoint({ decisions: ['fixture-sensitive-value-9381'] });
    assert.ok(!readFileSync(path, 'utf8').includes('fixture-sensitive-value-9381'));
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(f.report().status, 'blocked');
  } finally { delete process.env.AISF_FIXTURE_API_KEY; }
});

test('destruction is blocked before effects and an interactive approval covers only one call', async () => {
  const f = await fixture({ setup: project => writeFileSync(join(project, 'keep.txt'), 'keep') });
  assert.ok((await f.call('bash', { command: 'rm -f keep.txt' })).blocked);
  assert.equal(readFileSync(join(f.project, 'keep.txt'), 'utf8'), 'keep');
  for (const command of ['git push origin main --force', 'psql -c "DROP TABLE records"']) {
    assert.ok((await f.call('bash', { command })).blocked);
  }
  assert.equal((await f.call('bash', { command: "printf '%s' 'rm -rf example'" })).output, 'rm -rf example');
  f.ctx.hasUI = true;
  const confirmations = [];
  f.ctx.ui.confirm = async (_title, body) => { confirmations.push(body); return confirmations.length === 1; };
  assert.equal((await f.call('bash', { command: 'rm -f keep.txt' })).blocked, undefined);
  assert.equal(existsSync(join(f.project, 'keep.txt')), false);
  assert.ok((await f.call('bash', { command: 'rm -f other.txt' })).blocked);
  assert.equal(confirmations.length, 2);
});

test('dependency operations pause without installation; ordinary tests and reads are allowed', async () => {
  const f = await fixture({ setup: project => writeFileSync(join(project, 'package.json'), '{"dependencies":{"existing":"1"}}') });
  for (const command of ['npm install existing; touch leaked', 'npm ci', 'npx unknown-package', 'pnpm add other', 'uv pip install other', 'pip3 install other', 'cargo add other',
    '"npm" "install" existing', 'npm --prefix . install existing', 'npm --loglevel silent install existing',
    'uv pip --offline install other', 'cargo +stable add other', 'true && npm install existing', 'bash -c "npm install existing"']) {
    // Never execute package managers, even when testing a broken guard.
    assert.equal((await f.emit('tool_call', { toolName: 'bash', input: { command }, toolCallId: randomUUID() }))?.block, true, command);
  }
  assert.equal(existsSync(join(f.project, 'leaked')), false);
  assert.ok((await f.call('write', { path: 'package.json', content: '{}' })).blocked);
  assert.equal((await f.call('read', { path: 'package.json' })).output, '{"dependencies":{"existing":"1"}}');
  assert.equal(await f.emit('tool_call', { toolName: 'bash', input: { command: 'npm test' }, toolCallId: 'normal-test' }), undefined);
});

test('dependency examples are data, not installation commands, including quoted shell operators', async () => {
  const f = await fixture();
  for (const example of ['npm install example', 'pnpm add other; npm ci', 'uv pip install other && cargo add other', 'npx unknown-package']) {
    assert.equal((await f.call('bash', { command: `printf '%s' '${example}'` })).output, example);
    assert.equal((await f.call('bash', { command: `printf '%s' "${example}"` })).output, example);
  }
  assert.equal((await f.call('bash', { command: 'printf npm\\ install\\ example' })).output, 'npm install example');
});

test('scripted contracts enforce role capabilities, recursion rules, and consumed attempt limits', async () => {
  const f = await fixture({ optIn: false, contract: { role: 'qa', attempt: 4 } });
  assert.ok((await f.call('write', { path: 'production.txt', content: 'wrong owner' })).blocked);
  assert.equal(existsSync(join(f.project, 'production.txt')), false);
  assert.equal(f.report().attempt, 4);
  const worker = await fixture({ contract: {} });
  assert.ok((await worker.call('bash', { command: 'pi --print "another worker"' })).blocked);
  const exhausted = await fixture({ contract: { attempt: 6 } });
  assert.equal(exhausted.ctx.aborted, true);
  assert.ok((await exhausted.call('bash', { command: 'touch never' })).blocked);
  assert.equal(existsSync(join(exhausted.project, 'never')), false);
});

test('scope keeps pre-existing edits, blocks path escapes, and detects shell drift without reverting', async () => {
  const f = await fixture({ setup: project => {
    mkdirSync(join(project, 'src'));
    writeFileSync(join(project, 'unrelated.txt'), 'Owner edit');
    symlinkSync(temporary, join(project, 'outside'));
  } });
  await f.locateReport();
  await f.scope(['src']);
  assert.equal((await f.call('write', { path: 'src/new.txt', content: 'scoped' })).blocked, undefined);
  assert.deepEqual(f.report().checkpoint.changed_paths, ['src/new.txt']);
  assert.ok((await f.call('write', { path: 'outside/escape.txt', content: 'no' })).blocked);
  assert.equal(existsSync(join(temporary, 'escape.txt')), false);
  await f.call('bash', { command: 'printf changed > unrelated.txt' });
  assert.match(f.report().summary, /escaped the approved scope/);
  assert.equal(readFileSync(join(f.project, 'unrelated.txt'), 'utf8'), 'changed');
});

test('loops stop the fourth equivalent failed command, but relevant file changes permit rerunning', async () => {
  const f = await fixture();
  const command = 'printf failure >&2; exit 4';
  for (let i = 0; i < 3; i++) assert.equal((await f.call('bash', { command })).blocked, undefined);
  assert.ok((await f.call('bash', { command })).blocked);
  await f.call('write', { path: 'repair.txt', content: 'changed approach' });
  assert.equal((await f.call('bash', { command })).blocked, undefined);
});

test('context threshold checkpoints before compaction, respects unknown telemetry, and compacts at most once', async () => {
  const f = await fixture();
  f.ctx.usage.tokens = 7999;
  assert.equal((await f.call('bash', { command: 'printf below' })).blocked, undefined);
  f.ctx.usage.tokens = 8000;
  assert.ok((await f.call('bash', { command: 'touch should-not-run' })).blocked);
  assert.equal(existsSync(join(f.project, 'should-not-run')), false);
  await f.locateReport();
  assert.ok((await f.call('bash', { command: 'printf over' })).blocked);
  assert.equal(f.ctx.compactions.length, 1);
  assert.equal(f.report().checkpoint.next_action, 'Continue the same task');
  f.ctx.compactions[0].onComplete();
  f.ctx.usage.tokens = 2000;
  assert.equal((await f.call('bash', { command: 'printf resumed' })).blocked, undefined);
  f.ctx.usage.tokens = 8000;
  assert.ok((await f.call('bash', { command: 'printf over-again' })).blocked);
  assert.equal(f.ctx.compactions.length, 1);
  const unknown = await fixture();
  unknown.ctx.usage = undefined;
  assert.equal((await unknown.call('bash', { command: 'printf unknown' })).output, 'unknown');
});

test('handoff rejects missing evidence and compaction without a checkpoint; failures retain the checkpoint', async () => {
  const f = await fixture();
  assert.deepEqual(await f.emit('session_before_compact'), { cancel: true });
  await assert.rejects(f.checkpoint({ evidence_paths: ['missing.txt'] }), /existing project or AISF artifact/);
  await f.locateReport();
  assert.equal(await f.emit('session_before_compact'), undefined);
  await f.emit('session_compact');
  await f.emit('session_compact_failed');
  assert.equal(f.report().status, 'blocked');
  assert.equal(f.report().checkpoint.next_action, 'Continue the same task');
});

test('completion gets one bounded repair and accepts evidence after a check, never cancellation', async () => {
  const f = await fixture();
  await f.call('write', { path: 'result.txt', content: 'verified' });
  assert.equal((await f.settle()).continue, true);
  await f.call('bash', { command: 'test "$(cat result.txt)" = verified' });
  await f.locateReport();
  await f.checkpoint({ verification: 'passed', evidence_paths: ['result.txt'] });
  assert.equal(await f.settle(), undefined);
  assert.equal(f.report().status, 'ok');
  await f.call('bash', { command: 'test failure = success' });
  assert.equal(await f.settle(), undefined);
  assert.equal(f.report().status, 'blocked');
  const blocked = await fixture();
  await blocked.call('write', { path: 'result.txt', content: 'unverified' });
  await blocked.locateReport();
  assert.equal((await blocked.settle()).continue, true);
  assert.equal(await blocked.settle(), undefined);
  assert.equal(blocked.report().status, 'blocked');
  const cancelled = await fixture();
  await cancelled.locateReport();
  assert.equal(await cancelled.settle('aborted'), undefined);
  assert.equal(cancelled.report().status, 'blocked');
});

test('completion revalidates evidence outside the project and allows bounded repair', async () => {
  for (const mutation of ['delete', 'escape', 'scripted-delete']) {
    const f = await fixture({ contract: mutation === 'scripted-delete' ? {} : undefined });
    const evidence = join(process.env.FACTORY_HOME, `${randomUUID()}.log`);
    mkdirSync(dirname(evidence), { recursive: true });
    writeFileSync(evidence, 'Verification evidence');
    await f.call('write', { path: 'result.txt', content: 'verified' });
    await f.call('bash', { command: 'test "$(cat result.txt)" = verified' });
    await f.locateReport();
    await f.checkpoint({ verification: 'passed', evidence_paths: [evidence] });
    await f.settle();
    assert.equal(f.report().status, 'ok');
    rmSync(evidence);
    if (mutation === 'escape') {
      const outside = join(temporary, `${randomUUID()}.log`);
      writeFileSync(outside, 'Outside the allowed evidence roots');
      symlinkSync(outside, evidence);
    }
    assert.equal((await f.settle())?.continue, true, mutation);
    // Restore valid evidence within the single repair continuation.
    rmSync(evidence, { force: true });
    writeFileSync(evidence, 'Restored verification evidence');
    await f.checkpoint({ verification: 'passed', evidence_paths: [evidence] });
    await f.settle();
    assert.equal(f.report().status, 'ok');
    rmSync(evidence);
    await f.settle();
    assert.equal(f.report().status, 'blocked');
  }
});

test('read-only completion respects explicit blockers without requiring unnecessary tests', async () => {
  const allowed = await fixture();
  await allowed.locateReport();
  await allowed.settle();
  assert.equal(allowed.report().status, 'ok');
  assert.equal(allowed.report().checkpoint.successful_checks, 0);
  for (const checkpoint of [
    { verification: 'blocked', blockers: [] },
    { verification: 'not_required', blockers: ['Owner decision required'] },
  ]) {
    const f = await fixture();
    await f.locateReport();
    await f.checkpoint(checkpoint);
    assert.equal((await f.settle())?.continue, true);
    await f.settle();
    assert.equal(f.report().status, 'blocked');
  }
});

test('executable mode changes invalidate verification and trigger scope drift', async () => {
  const setup = project => writeFileSync(join(project, 'run.sh'), '#!/bin/sh\nprintf verified\n', { mode: 0o755 });
  const f = await fixture({ setup });
  await f.call('bash', { command: 'test -x run.sh' });
  await f.locateReport();
  await f.checkpoint({ verification: 'passed', evidence_paths: ['run.sh'] });
  await f.settle();
  assert.equal(f.report().status, 'ok');
  chmodSync(join(f.project, 'run.sh'), 0o644);
  assert.equal((await f.settle())?.continue, true);
  assert.equal(f.report().checkpoint.successful_checks, 0);
  assert.deepEqual(f.report().checkpoint.changed_paths, ['run.sh']);
  await f.settle();
  assert.equal(f.report().status, 'blocked');

  const scoped = await fixture({ setup: project => { setup(project); mkdirSync(join(project, 'src')); } });
  await scoped.locateReport();
  await scoped.scope(['src']);
  await scoped.call('bash', { command: 'chmod -x run.sh' });
  assert.equal(scoped.report().status, 'blocked');
  assert.match(scoped.report().summary, /escaped the approved scope/);
});

test('completion rejects stale evidence even after an intervening read, then accepts reverified work', async () => {
  const f = await fixture();
  await f.call('write', { path: 'result.txt', content: 'verified' });
  await f.call('bash', { command: 'test "$(cat result.txt)" = verified' });
  await f.locateReport();
  await f.checkpoint({ verification: 'passed', evidence_paths: ['result.txt'] });
  writeFileSync(join(f.project, 'result.txt'), 'BROKEN after verification');
  await f.call('read', { path: 'result.txt' });
  assert.equal((await f.settle())?.continue, true);
  assert.equal(f.report().checkpoint.successful_checks, 0);
  await f.call('write', { path: 'result.txt', content: 'repaired' });
  await f.call('bash', { command: 'test "$(cat result.txt)" = repaired' });
  await f.checkpoint({ verification: 'passed', evidence_paths: ['result.txt'] });
  await f.settle();
  assert.equal(f.report().status, 'ok');

  // Also cover an external change immediately before settlement, without a tool event.
  writeFileSync(join(f.project, 'result.txt'), 'BROKEN again');
  await f.settle();
  assert.equal(f.report().status, 'blocked');
  assert.equal(f.report().checkpoint.successful_checks, 0);
});

test('completion cannot reuse verification when the project snapshot becomes unavailable', async () => {
  const f = await fixture();
  await f.call('write', { path: 'result.txt', content: 'verified' });
  await f.call('bash', { command: 'test "$(cat result.txt)" = verified' });
  await f.locateReport();
  await f.checkpoint({ verification: 'passed', evidence_paths: ['result.txt'] });
  rmSync(f.project, { recursive: true });
  assert.equal((await f.settle())?.continue, true);
  await f.settle();
  assert.equal(f.report().status, 'blocked');
  assert.equal(f.report().checkpoint.successful_checks, 0);
});

test('completion cannot use printed keywords or masked/skipped checks as verification', async () => {
  for (const command of ['echo "test has not run"', "printf '%s' 'pytest --check'", 'true --check',
    "printf '%s' 'npm test'", 'node --test --help', 'test failure = success || true', 'test failure = success; true',
    'false && test failure = success || true']) {
    const f = await fixture();
    await f.call('write', { path: 'result.txt', content: 'unchecked' });
    assert.equal((await f.call('bash', { command })).isError, false, command);
    await f.locateReport();
    await f.checkpoint({ verification: 'passed', evidence_paths: ['result.txt'] });
    assert.equal((await f.settle())?.continue, true, command);
    await f.settle();
    assert.equal(f.report().status, 'blocked', command);
    assert.equal(f.report().checkpoint.successful_checks, 0, command);
  }
});

test('completion accepts real Node tests and a final assertion in an AND chain', async () => {
  for (const command of ['node --test result.test.mjs', 'printf setup && "test" "$(cat result.txt)" = verified']) {
    const f = await fixture();
    await f.call('write', { path: 'result.txt', content: 'verified' });
    await f.call('write', { path: 'result.test.mjs', content: `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
assert.equal(readFileSync('result.txt', 'utf8'), 'verified');
` });
    assert.equal((await f.call('bash', { command })).isError, false);
    await f.locateReport();
    await f.checkpoint({ verification: 'passed', evidence_paths: ['result.test.mjs'] });
    assert.equal(await f.settle(), undefined);
    assert.equal(f.report().status, 'ok');
  }
});

test('real Pi verifies work and blocks destruction, stale evidence, blockers, and chmod, entirely offline', { skip: !process.env.AISF_PI_SDK }, async () => {
  const sdk = process.env.AISF_PI_SDK;
  const { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } = await import(pathToFileURL(join(sdk, 'dist/index.js')));
  const { AssistantMessageEventStream } = await import(pathToFileURL(join(dirname(sdk), 'pi-ai/dist/utils/event-stream.js')));
  const fetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Network forbidden in offline Pi tests'); };
  try {
    for (const scenario of ['verified', 'destructive', 'missing-evidence', 'readonly-blocker', 'mode-change']) {
      const destructive = scenario === 'destructive';
      const scripted = scenario === 'verified' || destructive;
      const f = await fixture({ contract: scripted ? {} : undefined, setup: project => {
        writeFileSync(join(project, 'keep.txt'), 'Owner content');
        writeFileSync(join(project, 'run.sh'), '#!/bin/sh\nprintf verified\n', { mode: 0o755 });
      } });
      const evidence = join(process.env.FACTORY_HOME, `${randomUUID()}.log`);
      mkdirSync(dirname(evidence), { recursive: true });
      writeFileSync(evidence, 'Actual fixture check evidence');
      const agentDir = mkdtempSync(join(temporary, 'pi-agent-'));
      const loader = new DefaultResourceLoader({ cwd: f.project, agentDir, noExtensions: true, noSkills: true, noPromptTemplates: true,
        additionalExtensionPaths: [fileURLToPath(new URL('../adapters/pi/guards.mjs', import.meta.url))] });
      await loader.reload();
      assert.deepEqual(loader.getExtensions().errors, []);
      const runtime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: null,
        modelsStorePath: join(agentDir, 'models-cache.json'), refreshOnCreate: false, allowModelNetwork: false });
      const steps = destructive ? [['bash', { command: 'rm -f keep.txt' }]] : scenario === 'readonly-blocker' ? [] : [
        ['write', { path: 'result.txt', content: 'verified' }],
        ['bash', { command: 'test -x run.sh && test "$(cat result.txt)" = verified' }],
      ];
      if (!destructive) steps.push(['aisf_checkpoint', {
        decisions: ['Use existing files'], progress: ['Inspected the fixture'],
        blockers: scenario === 'readonly-blocker' ? ['Owner decision required'] : [],
        evidence_paths: [evidence], verification: scenario === 'readonly-blocker' ? 'blocked' : 'passed', next_action: 'Return handoff',
      }]);
      runtime.registerProvider('aisf-offline', { api: 'openai-completions', apiKey: 'offline-fixture-only', baseUrl: 'http://127.0.0.1:1',
        models: [{ id: 'fixture', name: 'Offline fixture', reasoning: false, input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100000, maxTokens: 4096 }],
        streamSimple(model) {
          const step = steps.shift();
          if (!step && scenario === 'missing-evidence') rmSync(evidence, { force: true });
          if (!step && scenario === 'mode-change') chmodSync(join(f.project, 'run.sh'), 0o644);
          const message = { role: 'assistant', api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(),
            content: step ? [{ type: 'toolCall', id: randomUUID(), name: step[0], arguments: step[1] }] : [{ type: 'text', text: 'Fixture finished' }],
            stopReason: step ? 'toolUse' : 'stop', usage: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
          const stream = new AssistantMessageEventStream();
          stream.push({ type: 'done', reason: message.stopReason, message });
          stream.end(message);
          return stream;
        },
      });
      const { session } = await createAgentSession({ cwd: f.project, agentDir, modelRuntime: runtime,
        model: runtime.getModel('aisf-offline', 'fixture'), resourceLoader: loader, sessionManager: SessionManager.inMemory(f.project),
        settingsManager: SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } }),
        tools: ['read', 'write', 'bash', 'aisf_checkpoint'] });
      try {
        await session.prompt('Exercise the offline fixture');
        assert.equal(readFileSync(join(f.project, 'keep.txt'), 'utf8'), 'Owner content');
        if (destructive) assert.equal(f.report().status, 'awaiting_approval');
        else if (scripted) {
          assert.equal(readFileSync(join(f.project, 'result.txt'), 'utf8'), 'verified');
          assert.equal(f.report().checkpoint.verification, 'passed');
          assert.equal(f.report().status, 'ok');
        } else {
          const checkpoint = session.messages.find(message => message.role === 'toolResult' && message.toolName === 'aisf_checkpoint');
          const path = checkpoint.content[0].text.replace('Checkpoint saved: ', '');
          assert.equal(JSON.parse(readFileSync(path, 'utf8')).status, 'blocked', scenario);
        }
      } finally { session.dispose(); }
    }
  } finally { globalThis.fetch = fetch; }
});
