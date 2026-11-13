# Factory operating rules

The human is the Owner. Only the Orchestrator reports to the Owner. Specialists receive JSON contracts and return JSON artifacts, not conversations.

- Default to one active worker. This runtime serializes all stages; it does not pretend to offer parallel workers or model-cost routing.
- Use the smallest effective workforce: PM → optional specialists → SWE → QA. The Orchestrator selects architecture, research, DevOps, and review only when needed.
- Keep changes small. Reuse the standard library and project patterns before adding dependencies or layers.
- Count at most five total solution attempts per run/task, including the initial attempt. Persist the counter before execution; resume never resets it. Inspect the failed evidence before another attempt.
- QA verifies acceptance independently in a fresh invocation. It does not implement fixes. Evidence must identify checks, outcomes, and observations; an unsupported success claim is not completion.
- Work independently on local, reversible changes. Block for Owner approval before deployment, destructive operations, paid resources, access changes, sharing sensitive data, external skill installation, or reopening an exhausted task. Permission to implement is not permission to publish.
- Preserve artifacts and reusable decisions. Resume uses the durable JSON state, not model conversation memory. This runtime does not implement automatic memory expiry or worker succession.

The full universal specification remains in [README.md](README.md); onboarding is defined in [PROJECT_ONBOARDING.md](PROJECT_ONBOARDING.md). Role prompts are policy, not an OS sandbox. Run only in a trusted project with suitable filesystem, network, and credential isolation.

## Context pressure, compaction, and succession

The following Grok Bot host example maps the specification's succession rule (README section 5) and its "no automatic context metrics" fallback (section 13) into an operating protocol. It records host assumptions and design guidance, not an executable adapter or functionality implemented by the current Pi runtime. Its `factory/` ledger layout is illustrative; Pi currently persists runs in `~/.config/aisf/runs/` (or `FACTORY_HOME/runs/`).

### Grok Bot host assumptions

- Each bot's conversation is summarized automatically by the host when it gets long. The bot gets no context-percentage telemetry and can't trigger that summary itself.
- Bots can launch short-lived background workers that start with a fresh context.
- Persistent role bots keep one long conversation, and a bot can't clear its own chat.
- A file store that survives sessions holds the factory ledger (`factory/`).

### Durable state

- `factory/tasks/<TASK-ID>.md`: the task contract, attempts n/5, and the attempt log. When a file passes ~8 KB, older log lines rotate to `tasks/archive/`.
- `factory/checkpoints/<role>.md`: one rolling checkpoint per logical role, at most 40 lines, overwritten each time. It holds active tasks, PR head SHAs, main SHA, attempts, blockers, open decisions, standing rulings, next actions, and evidence paths.
- `factory/registry.md`: logical role, checkpoint file, context status (ok / compacting / handing off), and any recorded standing approval for successors.

### Triggers (observable; no invented percentages)

1. Task boundary (verdict, merge, handoff, close): update the checkpoint.
2. Before a long operation (full e2e, Lighthouse A/B, merge dry run, more than ~10 min): update the checkpoint.
3. A host summary appeared: re-read the checkpoint and active task files before acting, and trust them over the summary where they differ.
4. Degradation: re-asking recorded facts, contradicting the ledger, losing an exact SHA or ID, repeating a failed step, or being corrected by a peer. Checkpoint and compact now.
5. Load proxies: about 25 wakes on one task without a checkpoint, or a single output over ~150 lines. Checkpoint and compact.

### Compact

- Work from the checkpoint and task files, not chat history.
- Long or heavy runs go to a fresh background worker that gets only the contract, checkpoint, and evidence paths, and returns at most 12 lines plus an evidence path.
- Inter-bot reports put the verdict first, run at most 12 lines with an evidence path, and include no pasted logs. FYIs don't wake the recipient; only an action request does.

### Successor

If degradation recurs within a task after a reload:

1. Write the final checkpoint and set the registry to `handing off`.
2. Start the successor with the same logical role and task IDs. For a temporary worker, that means a new background worker. For a persistent role bot, it means a replacement bot from the same role template, or the Owner clearing the chat. Creating a bot needs Owner approval unless a standing approval is recorded in the registry.
3. The successor loads the checkpoint, task files, and project memory, and restates objective, attempts used, owner, blockers, and next action in at most 8 lines. The Orchestrator validates that against the ledger.
4. Retire the predecessor in the registry.

Attempts, budgets, ownership, and blockers carry over unchanged. A successor never resets the five-attempt cap or reopens a capped task.

### Applies to

The Orchestrator and every specialist (PM, Designer, Architect, SWE, QA, DevOps/SRE, Researcher, temporary workers).
