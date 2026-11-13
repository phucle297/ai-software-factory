import { isAbsolute, resolve } from 'node:path';
import { canonical, within } from './state.mjs';

export default function registerCheckpoint(pi, state) {
  pi.registerCommand('aisf-scope', {
    description: 'Set approved project-relative paths as a JSON array for the current AISF task.',
    handler: async (args, ctx) => {
      if (!state.active || state.contract) throw new Error('Set scope in an active interactive AISF task, not a scripted worker.');
      const paths = JSON.parse(args);
      if (!Array.isArray(paths) || !paths.length || !paths.every(path => typeof path === 'string' && !isAbsolute(path)
        && within(state.project, canonical(resolve(state.project, path))))) throw new Error('Scope must contain project-relative paths.');
      state.scope = paths.map(path => canonical(resolve(state.project, path)));
      state.approvedScope = state.scope;
      state.saveCheckpoint();
      ctx.ui.notify('AISF file scope updated for this task.', 'info');
    },
  });

  pi.registerTool({
    name: 'aisf_checkpoint', label: 'AISF checkpoint',
    description: 'Persist the current AISF handoff before finishing or compaction. Record actual progress and verification; this grants no approvals.',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        decisions: { type: 'array', items: { type: 'string' } },
        progress: { type: 'array', items: { type: 'string' } },
        blockers: { type: 'array', items: { type: 'string' } },
        evidence_paths: { type: 'array', items: { type: 'string' } },
        verification: { type: 'string', enum: ['passed', 'not_required', 'blocked'] },
        next_action: { type: 'string', minLength: 1 },
      },
      required: ['decisions', 'progress', 'blockers', 'evidence_paths', 'verification', 'next_action'],
    },
    async execute(_id, params) {
      if (!state.active || state.guardFailed) throw new Error('No healthy active AISF task.');
      for (const path of params.evidence_paths) {
        if (!state.evidenceExists(path)) {
          throw new Error('Checkpoint evidence must reference an existing project or AISF artifact.');
        }
      }
      state.checkpoint = JSON.parse(JSON.stringify(params));
      state.denied.delete('Context Budget Guard');
      state.saveCheckpoint();
      state.record('Handoff Integrity Guard', 'checkpointed', 'Structured handoff saved with existing evidence paths.');
      return { content: [{ type: 'text', text: `Checkpoint saved: ${state.reportPath}` }], details: {} };
    },
  });
}
