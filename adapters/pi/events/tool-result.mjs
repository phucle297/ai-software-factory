import { redact } from '../guards/state.mjs';

export default function toolResult(state) {
  state.on('tool_result', event => {
    if (!state.active) return;
    const original = (event.content || []).filter(part => part.type === 'text').map(part => part.text).join('\n');
    const cleaned = redact(original);
    const metadata = JSON.stringify({ details: event.details, structuredContent: event.structuredContent });
    if (original !== cleaned || redact(metadata) !== metadata) {
      state.stop('Secret Leak Guard', 'Sensitive tool output was redacted; review possible exposure outside this event boundary.');
      return { content: [{ type: 'text', text: cleaned }], details: {}, isError: true };
    }
  });
}
