# Pi runtime

`factory.py` implements the sequential factory with Pi's non-interactive CLI and JSON event stream. It owns role tool allowlists, Pi invocation, response extraction, QA event checks, and Pi-specific termination behavior. See the root [README](../../README.md) for shared installation, contracts, artifacts, and recovery limits.

## Installation and authentication

The shared installer delegates to this directory's `install.sh`. If `pi` is missing, it downloads and runs the official [Pi installer](https://pi.dev/docs/latest/quickstart). The upstream installer may offer dependency installation and PATH setup. Without an interactive terminal, install Node.js 22.19+ and npm first. The adapter checks Pi's managed bin locations and prevents the upstream installer from opening a chat during setup.

Authenticate Pi using its interactive `/login` or a supported provider environment variable. After AISF installation completes, start a fresh guarded session in the enabled project:

```bash copy Copy Guarded Pi Command
pi --extension ~/.config/aisf/adapters/pi/guards.mjs
```

For a custom `FACTORY_HOME`, replace `~/.config/aisf` in the command with that directory's absolute path, quoting the extension path if it contains spaces. Plain `pi` loads the project's written instructions but **does not activate native event guards**. No user-wide Pi settings or project `.pi/extensions/` files are installed. Removing the AISF pointer from `AGENTS.md` disables interactive guards on the next prompt/session; already-running tools are not cancelled.

For optional scripted runs, `FACTORY_PI` selects a compatible Pi executable. Pi's configured default model is used unless the runner receives `--model`. The runner automatically loads this adapter's extension explicitly alongside `--no-extensions`, leaving unrelated extensions disabled. Explicit runner invocation deliberately opts in even without project `AGENTS.md`.

## Runtime integration

Each invocation explicitly receives the factory's `SESSION.md` and `PHILOSOPHY.md`, the JSON protocol, and its assigned role definition from `~/.config/aisf/` (or a custom installation). The default Orchestrator entry role does not override assigned specialists. A project's `AGENTS.md` only points interactive sessions to that shared directory; deleting it opts future sessions out without removing shared configuration. Explicit factory commands still load shared instructions deliberately. Policies and agents are not copied into the target project.

Pi is currently the only selectable coding tool. The shared installer delegates to this directory's `install.sh`, which installs Pi when missing. This adapter does not install or invoke Claude Code, Codex, Amp, or OpenCode.

## Lifecycle guard mapping

[HOOKS.md](../../HOOKS.md) defines the shared behavior. This adapter implements native handlers through **Pi extension events**. The API and explicit-extension loading were checked against **Pi 1.5.2**, including offline SDK sessions with real built-in tools. Recheck compatibility when upgrading Pi.

### Event-focused source layout

```text
adapters/pi/
  guards.mjs                     # extension entry point; registration only
  events/
    before-agent-start.mjs        # activation, contract/role validation, baseline
    tool-call.mjs                # pre-execution blocking and approval
    tool-result.mjs              # output redaction
    tool-execution-end.mjs       # loop outcomes, scope diff, observed checks
    session-compaction.mjs       # context reserve and compaction lifecycle
    agent-settlement.mjs         # bounded completion audit and cancellation
  guards/
    state.mjs                    # shared evidence, paths, snapshots, fail-closed dispatch
    checkpoint.mjs               # aisf_checkpoint tool and /aisf-scope command
    shell.mjs                    # bounded command/argument classification
```

Handlers are grouped by the events that own them, not duplicated once per conceptual guard. Shared state contains no event registrations of its own.

### Executable coverage

| Shared guard | Pi boundary | Coverage and limit |
|---|---|---|
| Context Budget Guard | `tool_call`, `tool_execution_end`, compaction events | **Partial:** actual usage/limit telemetry reserves the smaller of 8192 tokens or 20% of context. Requires a checkpoint, requests compaction at most once per prompt/stage, and blocks continued over-budget calls. Unknown telemetry cannot enforce a threshold. Pi compaction aborts current activity; it is not automatic task completion or a reset of attempts. |
| Loop Detector | `tool_call`, `tool_execution_end`, correlated by call ID | **Enforced for exact repeated calls:** blocks a fourth call after three identical outcomes with identical inputs and project snapshot. Different output or file changes distinguish progress. Keeps at most 128 signatures. This is not semantic equivalence detection; intentional identical polling should use one bounded polling command. |
| Secret Leak Guard | `tool_call`, `tool_result` | **Partial:** blocks recognized secret paths (including direct symlink targets), credential expansions/dumps, and known secret values in tool arguments. Allows sanitized `.env.example` and simple existence checks. Redacts recognized values from text/metadata and guard evidence. Unknown formats, images, indirect reads, streaming output and external logs are not fully covered. |
| Destructive Command Guard | `tool_call` before `bash` | **Partial:** recognized deletion, hard reset/clean, force push, and destructive SQL commands require an exact-call interactive confirmation. Without UI they pause as `awaiting_approval`. Shell-pattern checks are not a shell parser, target/environment resolver, or sandbox. |
| Agent Routing Guard | `before_agent_start`, `tool_call`, runner `stage()` | **Partial:** validates scripted role, project, and attempt range; enforces role tool access and rejects recognized recursive workers. Records the actual model. Complexity, cost, workforce selection, and model suitability remain **advisory**; no fabricated model tiers or delegation API. |
| Scope Drift Detector | `before_agent_start`, `tool_call`, `tool_execution_end` | **Partial:** captures existing worktree contents; blocks direct writes outside approved paths and reports post-command drift without reverting it. Defaults to the project root; `/aisf-scope` narrows interactive paths. Semantic relevance, ignored files, out-of-project shell effects, and concurrent/background writes need review. |
| Dependency Change Guard | `tool_call` | **Partial:** recognized installs, transient package execution, and direct manifest/lockfile writes require review/approval. Simple commands distinguish executable/subcommand words from quoted example data. Complex syntax and nested interpreters retain conservative pattern matching. The confirmation requests necessity, duplication, scripts, provenance, and license checks; it does not automatically prove them. Indirect scripts and unrecognized managers can bypass matching. |
| Handoff Integrity Guard | `aisf_checkpoint`, `session_before_compact`, runner contracts | **Partial:** requires structured decisions/progress/blockers/evidence/verification/next action; checks evidence paths exist; persists identity, role, attempts, criteria and the full contract's path before compaction. Schema/path checks do not prove semantic completeness. |
| Task Completion Auditor | `agent_before_settle`, `agent_settled`, runner QA/delivery | **Partial:** changed interactive work requires a checkpoint and a recognized successful check bound to the current project snapshot. Explicit interactive checkpoint blockers or blocked verification prevent completion even without file changes; read-only work otherwise needs no test command. Evidence paths are revalidated at settlement for both interactive and scripted checkpoints. Rechecks the snapshot, invalidating stale evidence even for external edits or unavailable snapshots. Allows one repair continuation, never on cancellation/error. Scripted work retains separate QA/acceptance gates. Unrelated TODOs and arbitrary natural-language completion claims are not automatically adjudicated. |

### Checkpoints, scope, and approval

The model-facing `aisf_checkpoint` tool saves decisions, progress, blockers, evidence paths, verification state, and next action. Missing evidence paths are rejected. It cannot authorize a tool call or reset attempts. Successful checks are identified by executable/subcommand, not keywords in printed text: recognized commands include `test`, pytest/unittest, `node --test`/`--check`, `tsc`, ESLint, Ruff checks, Go/Cargo checks, and package-manager test/check/lint/typecheck scripts. Help/version requests do not count. Only a simple command or a final check in an `&&` chain contributes evidence; OR/pipeline/background/semicolon lists and unsupported syntax do not, because their overall success may mask or skip the check.

Each successful check is bound to the post-command project snapshot. A later failed recognized check, project mutation, or unavailable snapshot invalidates prior evidence; settlement compares snapshots again to catch external changes even without an intervening tool event. This remains observed evidence, not proof that a test covers the acceptance criteria. Keep using authoritative tests and review. Shell classification is deliberately limited and dependency approval can still be conservative for unsupported syntax; it is not a complete Bash parser or a sandbox.

In an active interactive task, the Owner can narrow paths with `/aisf-scope ["src", "tests"]`. Scope persists across later prompts in that Pi session. The default project-root boundary does **not** establish that every change inside the project is related to the task. Snapshots use tracked/untracked non-ignored Git files, or a bounded directory walk for non-Git projects. They exclude common generated/cache directories in the fallback, do not follow symlinks, include regular-file permission bits, hash small regular files, and use size/mtime for files over 2 MiB. Permission changes such as removing executable bits invalidate verification and participate in scope drift detection. Over-limit/unreadable snapshots disclose missing coverage; this is not a filesystem watcher.

Approvals come only from Pi's Owner-facing confirmation dialog and apply to that tool call. `--answer` and text such as “approved” in a worker response are not executable command authorization. Headless workers stop instead of prompting invisibly: review the operation, perform an approved change yourself or use a guarded interactive session, then resume the same run. Installation and destructive-command confirmations are conservative and can require human review of aliases or complex commands.

Scripted evidence lives alongside stage artifacts as `<stage>.guard.json`. The runner requires matching task/role/attempt and a final `ok`; missing, malformed, running, blocked, or approval-pending evidence cannot become successful output. QA pass additionally requires a positive current successful-check count in that final guard report and a successful shell event in the trace; an arbitrary successful command such as `ls` is insufficient, and failed recognized checks invalidate previous verification. A guard `retry` consumes the existing attempt budget. Interactive evidence lives under `~/.config/aisf/guards/<project-session-key>/<prompt-id>.json`; later prompts preserve previous reports rather than overwrite their checkpoints. Only scripted runs enforce the persisted five-attempt task counter across sessions; interactive prompts do not claim that pipeline guarantee.

`tool_execution_start` is observation-only; blocking uses `tool_call`. Rejected/aborted calls are not counted as executed. `agent_end` is not final idle; the auditor uses actionable `agent_before_settle`, with `agent_settled` for interruption recording. Guard exceptions block further tool execution; they are not silently treated as permission.

**Security boundary:** these are best-effort workflow guards for trusted projects. Opaque scripts, custom tools, aliases, nested shells, network calls, and streaming events can bypass or precede interception. Tool-result redaction cannot undo a subprocess leak, and raw Pi traces may still contain sensitive data. Evidence files use private permissions, but are not tamper-proof against a worker with the same OS access. Use isolated environments and least-privilege credentials for untrusted work.

### Offline verification

The root Python suite includes the Node event tests when Node.js is available. They exercise real temporary-file side effects without model calls. To additionally run the optional real Pi SDK fixture, point `AISF_PI_SDK` at an installed `@earendil-works/pi-coding-agent` package directory:

```bash
AISF_PI_SDK=/path/to/node_modules/@earendil-works/pi-coding-agent node --test tests/pi_guards.test.mjs
```

That fixture uses a deterministic in-memory provider, forbids fetch, loads the split extension with unrelated extensions disabled, and executes actual Pi tools. Live-provider compliance and real provider-backed compaction are not tested by these offline fixtures.
