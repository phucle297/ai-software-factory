import { resolve } from 'node:path';
import { canonical, digest, snapshot, within } from '../guards/state.mjs';
import { contextBudget } from './session-compaction.mjs';

export default function toolExecutionEnd(state) {
  state.on('tool_execution_end', (event, ctx) => {
    if (!state.active) return;
    const call = state.calls.get(event.toolCallId);
    if (!call) return;
    state.calls.delete(event.toolCallId);
    state.current = snapshot(state.project);
    const outcome = digest(JSON.stringify([event.isError, event.result?.content]));
    const prior = state.history.get(call.key);
    state.history.set(call.key, { outcome, count: prior?.outcome === outcome ? prior.count + 1 : 1 });
    if (state.history.size > 128) state.history.delete(state.history.keys().next().value);
    const fingerprint = state.current && digest(JSON.stringify(state.current));
    if (!fingerprint || call.before !== fingerprint || (call.verification && event.isError)
        || state.verificationSnapshot !== fingerprint) {
      state.successfulChecks = 0;
      state.verificationSnapshot = null;
    }
    if (!event.isError && call.tool === 'bash' && call.verification && fingerprint) {
      state.successfulChecks += 1;
      state.verificationSnapshot = fingerprint;
    }
    const drift = state.changedPaths()?.some(path => !state.scope.some(root => within(root, canonical(resolve(state.project, path)))));
    if (drift) state.stop('Scope Drift Detector', 'Project changes escaped the approved scope; preserve unrelated edits and review before continuing.');
    if (!event.isError) state.denied.delete('Loop Detector');
    state.saveCheckpoint();
    if (!state.compacting) contextBudget(state, ctx);
  });
}
