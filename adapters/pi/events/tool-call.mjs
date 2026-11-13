import { resolve } from 'node:path';
import { canonical, digest, redact, sensitivePath, snapshot, within } from '../guards/state.mjs';
import { classifyShell } from '../guards/shell.mjs';
import { contextBudget } from './session-compaction.mjs';

export default function toolCall(state) {
  state.on('tool_call', async (event, ctx) => {
    if (state.guardFailed) return { block: true, reason: 'AISF guard initialization or execution failed.', terminate: true };
    if (!state.active || event.toolName === 'aisf_checkpoint') return;
    if (state.denied.has('Agent Routing Guard')) return state.stop('Agent Routing Guard', 'Invalid role/model contract; worker cannot execute tools.');
    if (state.contract && ((['edit', 'write'].includes(event.toolName) && state.contract.role !== 'swe')
        || (event.toolName === 'bash' && !['swe', 'qa'].includes(state.contract.role)))) {
      return state.stop('Agent Routing Guard', 'This tool is not allowed for the assigned worker role.');
    }
    const input = event.input || {};
    const command = input.command || '';
    const existenceCheck = /^\s*test\s+-[ef]\s+[\w./'"-]+\s*$/.test(command);
    const expansions = command.replace(/\$\{\w*(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY):\+[\w -]*\}/gi, 'configured');
    const argumentsText = JSON.stringify({ ...input, command: expansions });
    if (sensitivePath(input.path ? canonical(resolve(state.project, input.path)) : '') || (!existenceCheck && sensitivePath(command))
        || redact(argumentsText) !== argumentsText || /\$(?:\{)?[\w]*(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY)|(?:^|[;&|\n])\s*(?:printenv|env)\s*(?:$|[|;>])/i.test(expansions)) {
      return state.stop('Secret Leak Guard', 'Tool input may expose credentials. Use a sanitized fixture or value-free check; secret values are not logged.');
    }
    if (input.path) {
      const path = canonical(resolve(state.project, input.path));
      const mutating = ['edit', 'write'].includes(event.toolName);
      if (mutating && !state.scope.some(root => within(root, path))) return state.stop('Scope Drift Detector', 'Write target is outside the approved project scope.');
      if (mutating && /(?:^|\/)(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|pyproject\.toml|poetry\.lock|uv\.lock|Pipfile(?:\.lock)?|requirements[^/]*\.txt|Cargo\.(?:toml|lock)|go\.(?:mod|sum)|Gemfile(?:\.lock)?|composer\.(?:json|lock))$/.test(path)) {
        const blocked = await state.approval(ctx, 'Dependency Change Guard', `Review dependency necessity, duplication, provenance, and license risks before this exact manifest edit: ${input.path}`);
        if (blocked) return blocked;
      }
    }
    if (state.contract && /(?:^|[;&|\n])\s*(?:pi\b|factory\b|\S*scripts\/run\.sh\b)/.test(command)) {
      return state.stop('Agent Routing Guard', 'Scripted workers cannot start recursive factory or Pi workers.');
    }
    if (/(?:^|[;&|\n])\s*(?:\S*\/)?(?:rm|rmdir|unlink|shred|mkfs|sudo)\b|\b(?:psql|mysql|sqlite3)\b[^\n]*\b(?:DROP|TRUNCATE)\s+(?:TABLE|DATABASE|SCHEMA)\b|(?:^|[;&|\n])\s*git\b[^\n;&|]*\b(?:push\b[^\n]*(?:--force\b|-f\b|\+\S)|reset\s+--hard|clean\s+[^\n]*-[^\s]*f)/i.test(command)) {
      const blocked = await state.approval(ctx, 'Destructive Command Guard', `Approve only this command and its resolved targets/environment:\n${command}`);
      if (blocked) return blocked;
    }
    const shell = classifyShell(command);
    if (event.toolName === 'bash' && shell.dependency) {
      const blocked = await state.approval(ctx, 'Dependency Change Guard', `Review existing dependencies, duplication, scripts, provenance, and license risks before this exact installation:\n${command}`);
      if (blocked) return blocked;
    }
    const budget = contextBudget(state, ctx);
    if (budget) return budget;
    state.current = snapshot(state.project);
    const key = digest(JSON.stringify([event.toolName, input, state.current]));
    if ((state.history.get(key)?.count || 0) >= 3) return state.stop('Loop Detector', 'Three equivalent calls without project progress: change strategy or gather different evidence.', 'retry');
    state.calls.set(event.toolCallId, { key, tool: event.toolName, before: digest(JSON.stringify(state.current)),
      verification: shell.verification });
  });
}
