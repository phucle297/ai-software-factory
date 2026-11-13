export function contextBudget(state, ctx) {
  const usage = ctx.getContextUsage();
  const limit = usage?.contextWindow || ctx.model?.contextWindow;
  if (!usage || !Number.isFinite(usage.tokens) || !Number.isFinite(limit)) return;
  const reserve = Math.min(8192, Math.ceil(limit / 5));
  if (usage.tokens < limit - reserve) return;
  if (state.compacting || state.compactRequested) {
    return state.stop('Context Budget Guard', 'Context remains over budget after the bounded compaction request. Resume from the saved checkpoint.');
  }
  if (!state.checkpoint) return state.stop('Context Budget Guard', 'Save an aisf_checkpoint with decisions, progress, blockers, evidence paths, and next action before compaction.');
  state.saveCheckpoint();
  state.compacting = true;
  state.compactRequested = true;
  ctx.compact({
    customInstructions: `Preserve task identity, attempts, decisions, blockers, and evidence. Checkpoint: ${state.reportPath}`,
    onComplete: () => {
      state.compacting = false;
      state.denied.delete('Context Budget Guard');
      state.record('Context Budget Guard', 'compacted', 'Compaction completed after checkpoint persistence.');
    },
    onError: () => {
      state.compacting = false;
      state.stop('Context Budget Guard', 'Compaction failed; checkpoint retained. Resume without resetting the task budget.');
    },
  });
  state.record('Context Budget Guard', 'compacting', 'Context reserve reached; checkpoint persisted before requesting compaction.');
  return { block: true, reason: 'Context compaction requested; wait for completion before further tool calls.' };
}

export default function sessionCompaction(state) {
  state.on('session_before_compact', () => {
    if (!state.active) return;
    if (!state.checkpoint) {
      state.stop('Handoff Integrity Guard', 'Compaction cancelled: save a structured aisf_checkpoint first.');
      return { cancel: true };
    }
    state.saveCheckpoint();
  });
  state.on('session_compact', () => {
    if (state.active) {
      state.compacting = false;
      state.denied.delete('Handoff Integrity Guard');
      state.record('Handoff Integrity Guard', 'compacted', 'Checkpoint retained across compaction.');
    }
  });
  state.on('session_compact_failed', () => {
    if (state.active) state.stop('Context Budget Guard', 'Compaction failed; continue only from the retained checkpoint.');
  });
}
