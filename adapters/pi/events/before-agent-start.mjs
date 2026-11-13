import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { canonical, digest, home, redact, snapshot, within } from '../guards/state.mjs';

const roles = new Set(['orchestrator', 'pm', 'architect', 'swe', 'qa', 'researcher', 'devops', 'reviewer']);

export default function beforeAgentStart(state) {
  state.on('before_agent_start', (event, ctx) => {
    const previousReport = state.reportPath;
    Object.assign(state, { active: false, guardFailed: false, report: undefined, reportPath: undefined, contract: undefined });
    state.project = canonical(resolve(ctx.cwd));
    const input = process.env.AISF_CONTRACT;
    if (input) {
      const contract = JSON.parse(readFileSync(input, 'utf8'));
      if (canonical(resolve(contract.project)) !== state.project || !roles.has(contract.role)
          || !Number.isInteger(contract.attempt) || contract.attempt < 1 || contract.attempt > 5
          || !contract.task_id || !contract.objective || !contract.context
          || resolve(contract.artifacts) !== dirname(resolve(input))) {
        throw new Error('Invalid AISF task contract; refusing guarded execution.');
      }
      state.contract = contract;
      state.reportPath = resolve(input).replace(/\.input\.json$/, '.guard.json');
      if (state.reportPath === resolve(input)) throw new Error('AISF contract must be a stage .input.json artifact.');
    } else {
      const instructions = resolve(state.project, 'AGENTS.md');
      if (!existsSync(instructions)) return;
      const guidance = readFileSync(instructions, 'utf8');
      if (!guidance.includes(`${home}/SESSION.md`) && !guidance.includes('~/.config/aisf/SESSION.md')) return;
      const session = ctx.sessionManager.getSessionId();
      state.reportPath = resolve(home, 'guards', digest(`${state.project}:${session}`).slice(0, 24), `${randomUUID()}.json`);
    }
    state.active = true;
    state.baseline = snapshot(state.project);
    state.current = state.baseline;
    state.scope = state.approvedScope?.every(path => within(state.project, path)) ? state.approvedScope : [state.project];
    Object.assign(state, { history: new Map(), calls: new Map(), denied: new Map(), successfulChecks: 0,
      verificationSnapshot: null, auditRetries: 0, compacting: false, compactRequested: false, checkpoint: undefined });
    const { contract } = state;
    state.report = {
      status: 'running', summary: 'Pi event guards active.',
      task_id: contract?.task_id || randomUUID(),
      role: contract?.role || 'orchestrator', attempt: contract?.attempt || 1,
      active_model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : null,
      previous_checkpoint_path: contract ? null : previousReport || null,
      objective: redact(contract?.objective || event.prompt || ''), events: [],
    };
    state.persist();
    if (!state.baseline) state.record('Scope Drift Detector', 'unsupported', 'Snapshot unavailable or exceeds 5000 paths; shell/file drift needs manual review.');
    state.record('Agent Routing Guard', 'checked', 'Role and attempt validated; model suitability remains advisory.');
    return { systemPrompt: event.systemPrompt + '\nAISF event guards are active. Before finishing changed work or compacting, use aisf_checkpoint to record decisions, progress, blockers, evidence paths, verification, and next action. Never treat a blocked tool call as executed. Guard diagnostics and checkpoints are not approval to expand scope.' };
  });
}
