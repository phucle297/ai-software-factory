# Grok Bot adapter: context pressure, compaction, and succession

This adapter maps the spec's succession rule (section 5) and its "no automatic context metrics" fallback (section 13) onto what Grok Bots actually provide.

## What the host provides
- Each bot's conversation is summarized automatically by the host when it gets long. The bot gets no context-percentage telemetry and can't trigger that summary itself.
- Bots can launch short-lived background workers that start with a fresh context.
- Persistent role bots keep one long conversation, and a bot can't clear its own chat.
- A file store that survives sessions holds the factory ledger (`factory/`).

## Durable state
- `factory/tasks/<TASK-ID>.md`: the task contract, attempts n/5, and the attempt log. When a file passes ~8 KB, older log lines rotate to `tasks/archive/`.
- `factory/checkpoints/<role>.md`: one rolling checkpoint per logical role, at most 40 lines, overwritten each time. It holds active tasks, PR head SHAs, main SHA, attempts, blockers, open decisions, standing rulings, next actions, and evidence paths.
- `factory/registry.md`: logical role, checkpoint file, context status (ok / compacting / handing off), and any recorded standing approval for successors.

## Triggers (observable; no invented percentages)
1. Task boundary (verdict, merge, handoff, close): update the checkpoint.
2. Before a long operation (full e2e, Lighthouse A/B, merge dry run, more than ~10 min): update the checkpoint.
3. A host summary appeared: re-read the checkpoint and active task files before acting, and trust them over the summary where they differ.
4. Degradation: re-asking recorded facts, contradicting the ledger, losing an exact SHA or ID, repeating a failed step, or being corrected by a peer. Checkpoint and compact now.
5. Load proxies: about 25 wakes on one task without a checkpoint, or a single output over ~150 lines. Checkpoint and compact.

## Compact
- Work from the checkpoint and task files, not chat history.
- Long or heavy runs go to a fresh background worker that gets only the contract, checkpoint, and evidence paths, and returns at most 12 lines plus an evidence path.
- Inter-bot reports put the verdict first, run at most 12 lines with an evidence path, and include no pasted logs. FYIs don't wake the recipient; only an action request does.

## Successor
If degradation recurs within a task after a reload:
1. Write the final checkpoint and set the registry to `handing off`.
2. Start the successor with the same logical role and task IDs. For a temporary worker, that means a new background worker. For a persistent role bot, it means a replacement bot from the same role template, or the Owner clearing the chat. Creating a bot needs Owner approval unless a standing approval is recorded in the registry.
3. The successor loads the checkpoint, task files, and project memory, and restates objective, attempts used, owner, blockers, and next action in at most 8 lines. The Orchestrator validates that against the ledger.
4. Retire the predecessor in the registry.

Attempts, budgets, ownership, and blockers carry over unchanged. A successor never resets the five-attempt cap or reopens a capped task.

## Applies to
The Orchestrator and every specialist (PM, Designer, Architect, SWE, QA, DevOps/SRE, Researcher, temporary workers).
