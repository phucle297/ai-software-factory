import { digest, snapshot } from '../guards/state.mjs';

export default function agentSettlement(state) {
  state.on('agent_before_settle', (event, ctx) => {
    if (!state.active) return;
    if (event.outcome !== 'completed') {
      state.stop('Task Completion Auditor', 'Agent cancelled or failed; no audit continuation will be requested.');
      state.saveCheckpoint();
      return;
    }
    state.current = snapshot(state.project);
    if (!state.current || state.verificationSnapshot !== digest(JSON.stringify(state.current))) {
      state.successfulChecks = 0;
      state.verificationSnapshot = null;
    }
    const changed = state.changedPaths();
    const issues = [];
    const checkpoint = state.checkpoint;
    if (checkpoint?.evidence_paths.some(path => !state.evidenceExists(path))) {
      issues.push('Checkpoint evidence is missing or outside the allowed project/AISF roots; restore valid evidence before completion.');
    }
    if (!state.contract) {
      if (checkpoint?.verification === 'blocked' || checkpoint?.blockers.length) {
        issues.push('Checkpoint declares unfinished work or unresolved blockers; resolve them or report blocked status.');
      }
      if ((changed === null || changed.length) && (!checkpoint || checkpoint.verification !== 'passed'
          || !checkpoint.evidence_paths.length || !state.successfulChecks)) {
        issues.push('Changed work needs a complete checkpoint, existing evidence paths, a successful check command, and no unresolved blockers.');
      }
    }
    if (issues.length && state.auditRetries < 1 && !state.denied.size) {
      state.auditRetries += 1;
      state.saveCheckpoint();
      state.record('Task Completion Auditor', 'retry', 'One bounded audit continuation requested.');
      return { entries: [...event.entries, { type: 'custom_message', customType: 'aisf-audit',
        content: issues.join(' ') + ' Verify the work and save aisf_checkpoint, or report a blocker. Do not claim completion without evidence.', display: true }], continue: true };
    }
    if (issues.length) state.stop('Task Completion Auditor', issues.join(' '));
    if (state.denied.size) {
      const failure = [...state.denied.values()][0];
      state.report.status = failure.status;
      state.report.summary = failure.reason;
      state.persist();
      ctx.ui.notify(`AISF ${failure.status}: ${failure.reason}`, 'warning');
    } else {
      state.report.status = 'ok';
      state.report.summary = 'Event checks complete; scripted QA and semantic acceptance remain separate gates.';
      state.record('Task Completion Auditor', 'checked', 'No outstanding deterministic guard findings.');
    }
    state.saveCheckpoint();
  });

  state.on('agent_settled', event => {
    if (!state.active) return;
    if (event.aborted && !state.denied.size) {
      state.report.status = 'blocked';
      state.report.summary = 'Agent interrupted; task is not complete.';
    }
    state.saveCheckpoint();
  });
}
