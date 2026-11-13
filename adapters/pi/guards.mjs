import { createGuardState } from './guards/state.mjs';
import registerCheckpoint from './guards/checkpoint.mjs';
import beforeAgentStart from './events/before-agent-start.mjs';
import toolCall from './events/tool-call.mjs';
import toolResult from './events/tool-result.mjs';
import toolExecutionEnd from './events/tool-execution-end.mjs';
import sessionCompaction from './events/session-compaction.mjs';
import agentSettlement from './events/agent-settlement.mjs';

export default function guards(pi) {
  const state = createGuardState(pi);
  registerCheckpoint(pi, state);
  beforeAgentStart(state);
  toolCall(state);
  toolResult(state);
  toolExecutionEnd(state);
  sessionCompaction(state);
  agentSettlement(state);
}
