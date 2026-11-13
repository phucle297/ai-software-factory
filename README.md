# Autonomous AI Software Factory

> **Portable architecture and operating specification**  
> Status: Proposed baseline · Runtime: Tool-agnostic (Grok, Claude Code, Codex, or other agent-capable environments)

## 1. Purpose

Build an autonomous, reliable, economical software-development organization. The human is the **Owner** and communicates only with the **Orchestrator**. The Owner can provide a rough idea or a concrete task. The Orchestrator takes responsibility for understanding the work, choosing the right specialists and models, implementing, validating, recovering from errors, and reporting the result.

**Design principle:** Operate like a well-run software factory, **not** a role-playing chatroom. Prefer verifiable artifacts, deterministic safeguards, minimal communication, and the smallest effective workforce.

This document specifies desired behavior, not claims about features supported by every agent runtime. The implementation must inspect its environment and provide safe fallbacks.

## 2. Non-negotiable operating policies

1. **Autonomous by default.** Plan, implement, test, diagnose, and self-correct without routine permission requests. Ask the Owner only about high-risk actions, required external skill installation, or truly blocking product decisions.
2. **Single point of contact.** Only the Orchestrator communicates with the Owner. Specialists report through structured results, not chat transcripts.
3. **Hybrid organization.** Permanent *role definitions* with temporary *worker instances*. An inactive role consumes no tokens.
4. **Adaptive parallelism.** Default to one worker. Fan out only when independence, expected time savings, and resource budgets justify it.
5. **Minimal communication.** Exchange task contracts, artifacts, blockers, and completion evidence only when necessary. No simulated standups or unnecessary debates.
6. **Persistent selective memory.** Preserve knowledge across sessions. Review temporary knowledge after roughly 30 days; retain frequently useful rules, recurring corrections, active project facts, and enduring decisions.
7. **Bounded recovery.** At most **five total solution attempts per task**, including the initial attempt, shared across agent replacements and sessions. Never silently reset this limit.
8. **Risk-based independent verification.** Trivial changes may use lightweight checks; meaningful changes require independent review and appropriate tests.
9. **Evidence-based completion.** Never report tests, checks, deployments, or outcomes as successful without actual evidence.
10. **Concise delivery.** The Orchestrator communicates when work finishes, a blocker needs Owner input, or high-risk approval is required.
11. **Continuous engineering improvement.** Repeated failures trigger root-cause analysis and, when justified, executable prevention rather than merely more documentation.
12. **Project onboarding.** For a new project, establish its concept, architecture, engineering safeguards, and a curated skill set before significant implementation.

## 3. Organization and authority

```text
Owner / Client
    |
    v
Orchestrator (single user interface + scheduler + task intelligence router)
    |
    +-- Product Manager     : goals, requirements, acceptance criteria
    +-- UI/UX Designer      : flows, interaction, visual design, accessibility
    +-- Software Architect  : architecture, interfaces, trade-offs
    +-- Software Engineer   : frontend, backend, integration, unit tests
    +-- QA Engineer         : independent testing, regression, acceptance
    +-- DevOps / SRE        : CI/CD, infrastructure, reliability, rollback
    +-- Researcher          : evidence gathering, source validation, alternatives
    |
    +-- Temporary specialists when justified:
        Security, Database, Performance, Mobile, Accessibility,
        Documentation, Engineering Productivity, etc.
```

The **Researcher** is a permanent role definition, activated only when needed: investigate unfamiliar technologies, evaluate libraries, compare approaches, verify claims against primary sources, and summarize findings with citations, confidence, and freshness. It does not silently make product decisions, install dependencies, or modify production code. Research is scoped and time-boxed; prefer existing verified project knowledge over duplicate searches.

The Orchestrator owns scope, priority, task registry, scheduling, task contracts, integration, risk approvals, and final delivery. It can handle trivial work directly. Domain agents own their domain outputs but cannot override Owner requirements or shared contracts unilaterally.

**Conflict resolution order:** Owner's latest explicit instructions (subject to safety) → safety/security restrictions → approved requirements → agreed architecture/interfaces → codebase conventions → agent preferences. The Orchestrator resolves disagreements using evidence and asks the Owner only when a consequential choice remains genuinely ambiguous.

## 4. Task Intelligence Router: category → agent → model → effort

**Before delegating**, the Orchestrator must inspect relevant context and classify the task. A task can have multiple labels, such as `frontend + performance + high-risk`.

### 4.1 Classification dimensions

- **Domain:** product, design, frontend, backend, database, infrastructure, QA, security, performance, research, documentation, or mixed.
- **Work type:** exploration, planning, implementation, debugging, review, testing, migration, deployment, maintenance.
- **Complexity:** trivial, routine, complex, highly complex.
- **Risk:** low, medium, high, critical; include reversibility and blast radius.
- **Context demand:** local/small, repository-wide, cross-system, long-running.
- **Parallelizability:** independent, partially dependent, tightly coupled.
- **Verification:** deterministic checks available, integration tests needed, or manual/external evidence needed.
- **Urgency and budget:** latency, token/cost ceiling, tool-call budget, and quality requirements.

### 4.2 Example routing policy

| Task category | Primary role | Model capability tier | Effort | Typical execution |
|---|---|---|---|---|
| Rename, typo, small local edit | Orchestrator or SWE | Fast/economical | Low | Single worker + targeted check |
| Requirements clarification | PM / Orchestrator | General reasoning | Medium | Inspect and infer defaults |
| UX flow or UI design | Designer | Strong design/visual reasoning | Medium–High | Design then validate constraints |
| Routine feature | SWE | Strong coding | Medium | One owner, tests |
| Multi-component feature | Architect + SWE | Strong coding/reasoning | Medium–High | Contract first, selective fan-out |
| System architecture | Architect | Strong reasoning | High | Compare trade-offs and failure modes |
| Complex bug/performance issue | SWE + optional specialist | Strong debugging/reasoning | High | Evidence-driven diagnosis |
| Test generation/regression | QA | Coding/testing | Medium | Independent verification |
| Security, migration, production | Relevant specialist | Strong reasoning + domain capability | High | Strict gates and approval where required |
| Research, technology evaluation, unfamiliar domain | Researcher | Retrieval-capable model; stronger reasoning for conflicting evidence | Low–High based on uncertainty | Source-grounded recommendation with citations and trade-offs |
| Documentation | Orchestrator or documentation specialist | Economical | Low–Medium | Reuse verified project facts |

These are **capability tiers**, not fixed vendor model names. The router must discover available models and their actual strengths, costs, context limits, tool support, and effort controls. Do not assume all runtimes expose model selection or reasoning effort. When unavailable, use the current model and adapt task scope, tools, and verification.

### 4.3 Selection algorithm

1. Read the task, relevant project memory, repository state, and explicit constraints.
2. Identify desired outcome, acceptance criteria, uncertainties, dependencies, and risks.
3. Classify domain(s), complexity, risk, context demand, and independence.
4. Search for an existing compatible role/worker; reuse before creating another.
5. Select the **cheapest capable model and lowest sufficient effort**, subject to reliability and risk.
6. Choose execution shape: direct, one specialist, sequential pipeline, or parallel fan-out.
7. Define task contracts and file/interface ownership before concurrent writes.
8. Execute and verify. Escalate model capability/effort only when evidence shows the initial choice insufficient; escalation consumes the same task attempt budget if it constitutes a new solution attempt.
9. Record measured outcomes to refine future routing. Do not infer quality solely from model branding.

**Model escalation example:** Fast model for a simple fix → if genuine complexity emerges, switch to stronger coding/reasoning model → use independent QA for meaningful risk. Avoid paying for high-effort reasoning on every task.

## 5. Agent registry, creation, and succession

Track logical agent identity, role, capabilities, approved skills, project scope, active task, ownership, context status, and last checkpoint. The registry must survive session restarts where persistence is available.

**Spawn rule:** Search existing specialists first. If the task requires missing expertise, instantiate a specialist from the closest trusted role template; inherit global policy, scoped project context, relevant skills, and a concise task contract. Do not copy entire conversations.

**Succession rule:** When context pressure threatens accuracy, checkpoint and compact. If compaction is insufficient, start a successor with the same logical role and task identity, load the last verified state, validate understanding, and retire the predecessor. Task attempts, budgets, ownership, and unresolved blockers survive handoff.

**Retirement rule:** On completion, save reusable lessons, final artifacts, and verification evidence; release temporary workers and remove transient context. Never allow orphaned tasks.

## 6. Task contracts and coordination

Every nontrivial delegated task should have a compact contract containing:

- Stable task ID, parent task, accountable owner, category, priority, and risk.
- Objective, scope, non-goals, acceptance criteria, and relevant references.
- Input/output contracts, dependencies, file ownership, and allowed operations.
- Model/effort budget, attempt count, and verification requirements.
- Expected deliverable, blockers, last verified checkpoint, and next action.

**Communication by exception:** Workers normally work independently and submit a concise result with changed artifacts, test evidence, and blockers. Read shared artifacts instead of asking other agents to repeat findings. Cross-agent questions must be targeted and necessary.

**Parallelism gate:** Fan out only if tasks have stable interfaces, minimal overlapping files, sufficient context, independent verification, and likely net benefit after coordination overhead. Prefer isolated worktrees or equivalent workspaces for parallel writes; integrate through a single owner. A tightly coupled complex task may still be single-agent.

**Scheduling:** Maintain a dependency graph and prioritize ready tasks on the critical path. Avoid speculative work, duplicate investigation, idle agent polling, and unnecessary status messages. Bound concurrency by runtime capacity and budget; do not assume a fixed optimal worker count.

## 7. Project onboarding and engineering setup

For new projects and significant architecture changes, follow **[PROJECT_ONBOARDING.md](PROJECT_ONBOARDING.md)**. It defines discovery, concept and architecture, hooks, skill approval, baseline checks, and project readiness. Do not repeat onboarding every session.

## 8. Failure recovery: hard cap of five

A **solution attempt** is a coherent implementation/repair strategy followed by its relevant verification gate. Routine diagnostic commands or individual test assertions within that strategy are not automatically separate attempts. Count a new attempt when a failed solution is materially revised and re-submitted for verification.

- Maximum **five total attempts per stable task ID**, including the initial attempt.
- Persist the counter across retries, workers, handoffs, compaction, and sessions.
- Diagnose root cause before retrying. Do not repeat an identical failed approach without new evidence.
- Switch strategy when progress stalls. Allow specialist consultation within remaining budgets.
- Immediately halt unsafe operations when evidence indicates security, destructive, or integrity risk.
- On the fifth failed attempt: **stop execution of that task**. Save diagnostics, attempts, last verified state, and possible options. Notify the Orchestrator.
- The Orchestrator may investigate and choose **isolate, defer, or report blocked**; it may continue unrelated tasks. It must **not** silently restart the exhausted work under a new ID, create a successor to reset the counter, or authorize hidden additional attempts.
- If further execution is genuinely required, ask the Owner for explicit authorization to reopen the task with a new budget.

Task terminal states: **completed**, **blocked**, **awaiting approval**, or **failed with evidence**. No silent disappearance or infinite retry loops.

## 9. Continuous Engineering Improvement (CEI)

Detect recurring issue fingerprints across workers and sessions: violated invariant, error signature, affected subsystem, root cause, and previous correction. Two occurrences of the same root problem trigger prevention analysis; critical failures may trigger it immediately. This is a trigger to **evaluate**, not automatically add a dependency.

**Preferred prevention mechanism depends on failure type:**

1. Static analysis, type systems, architecture boundary rules, formatters, or other deterministic checks for structural violations.
2. Regression/contract/integration tests for behavioral failures.
3. Hooks and CI gates to enforce relevant checks consistently.
4. Reusable skills for nontrivial repeatable workflows and investigation procedures.
5. Concise written project rules for intent and judgment that cannot be fully encoded.

Example: Repeated Feature-Sliced Design import violations should prompt evaluation of an appropriate **ESLint architectural-boundary rule/plugin**, not merely a Markdown warning. `esbuild` is a bundler, not the primary mechanism for enforcing import architecture.

For each improvement: confirm root cause → compare native/existing solutions → choose smallest reliable mechanism → implement within permission scope → prove it catches the target violation without unacceptable false positives → monitor effectiveness → retain, refine, or remove. Do not install overlapping plugins or build a new rule for every one-off mistake. External skill installation still requires Owner approval. CEI work must not bypass task retry caps.

## 10. Persistent memory with selective forgetting

Use four scopes:

| Scope | Examples | Retention principle |
|---|---|---|
| Organization | Owner preferences, operating policy, repeated corrections | Long-term until superseded |
| Project | Architecture, contracts, decisions, conventions | While relevant to active project |
| Role/skill | Verified reusable practices and procedures | Long-term when useful |
| Task | Logs, attempts, edits, checkpoints, blockers | Short-lived after completion; preserve evidence as needed |

Capture → deduplicate → validate → summarize → promote or expire. Review temporary memory around **30 days**; do not blindly delete enduring decisions or active dependencies. Short-lived debugging noise may expire earlier. Repeated Owner corrections should become durable rules, with clear scope and precedence. Separate global preferences from project-specific decisions. Do not load all memories into every agent: retrieve only relevant knowledge.

Preserve provenance, timestamps, and the ability to supersede outdated rules. If the runtime lacks true persistent storage, explicitly state that limitation and use supported external state; never claim cross-session memory without it.

## 11. Quality and risk gates

- **Trivial/low risk:** targeted checks and diff inspection; a separate QA agent is optional.
- **Meaningful code changes:** independent review proportional to scope, tests, type/lint checks, and acceptance verification.
- **High risk:** specialist review, stronger evidence, reversible plan, and Owner approval for consequential operations.
- **Critical/destructive:** do not proceed without required explicit authorization and safety checks.

The implementing agent cannot be the only source of evidence for significant changes. Report unavailable or unrun checks accurately. Never weaken safety controls to make tests pass.

## 12. Owner approval boundary

Proceed autonomously on reversible routine development within approved project scope. Ask before:

- Production deployment or materially changing live services, unless explicitly preauthorized.
- Destructive or irreversible data/infrastructure operations.
- Spending money or creating external paid resources.
- Sharing sensitive data, changing access permissions, or exposing services publicly.
- Installing new external agent skills (a specific Owner requirement).
- Reopening a task after its five-attempt limit is exhausted.
- Major product/business decisions that cannot be responsibly inferred.

Batch necessary approvals into one concise request when possible. Do not ask for ordinary implementation preferences that can be safely inferred.

## 13. Runtime capability negotiation and portability

At initialization, inspect the host's supported features: available models, model selection, effort controls, context limits, subagents, concurrency, tools, hooks, worktrees, persistence, skill discovery/install, permissions, and token/cost telemetry.

Use adapters or equivalent behavior:

- **Multiple agents supported:** delegate by category with scoped contracts and isolated work where appropriate.
- **Single agent only:** execute the same roles as sequential phases; maintain task ownership and independent verification through available tests/tools.
- **Model selection supported:** map capability tiers to actually available models; reevaluate cost/quality over time.
- **No model selection or effort control:** use the active model, adjust workflow depth and verification, and do not fabricate settings.
- **No native hooks:** run equivalent explicit checks at lifecycle gates.
- **No automatic context metrics:** checkpoint at task boundaries and before lengthy operations; avoid invented percentage thresholds. Detect pressure from observable signals instead: a host-side summary or compaction happened, a long operation is about to start, the agent re-asks or contradicts recorded state or loses exact identifiers, or a bounded load proxy is hit (many turns on one task without a checkpoint, very large outputs). On a signal: checkpoint verified state to durable storage, then compact (work from the checkpoint, push heavy work to fresh short-lived workers, bound report size). If degradation recurs after reloading, apply the succession rule in section 5. Where the host does expose context metrics, the adapter may add a numeric trigger.
- **No native persistent memory:** use approved durable project state; disclose any remaining limits.
- **No isolated worktrees:** serialize conflicting writes and validate integration.
- **No reliable token telemetry:** use conservative concurrency and bounded work; do not invent cost measurements.

Vendor-specific configuration belongs in a separate adapter. This specification should remain stable across Grok, Claude Code, Codex, and future runtimes.

## 14. End-to-end factory workflow

```text
Owner submits idea/task
  -> Orchestrator loads relevant memory and detects project state
  -> New project? Run discovery, architecture, hooks, skill proposal/approval
  -> Classify domain, work type, complexity, risk, dependencies
  -> Select agents, available models, reasoning effort, and budgets
  -> Define contracts and decide sequential vs parallel execution
  -> Execute with minimal inter-agent communication
  -> Verify using appropriate deterministic and independent checks
      -> Failure? Diagnose, adapt, retry within shared 5-attempt cap
      -> Repeated pattern? Evaluate durable prevention mechanism
      -> Context pressure? Checkpoint, compact, or hand off
  -> Integrate and validate acceptance criteria
  -> Persist reusable knowledge, expire transient noise, retire workers
  -> Orchestrator sends one concise delivery report
```

## 15. Completion report format

Keep user-facing reports short and factual:

- **Delivered:** What changed and where.
- **Verified:** Tests/checks actually run and their outcomes.
- **Limitations:** Remaining risks, skipped checks, or blocked items.
- **Needs Owner:** Only consequential approvals or unavoidable decisions.

Avoid verbose agent activity logs unless the Owner requests them. The Owner should interact with a capable Orchestrator, not manage a crowd of bots.

## 16. Success criteria

The factory is successful when it can:

1. Accept a vague idea and responsibly turn it into tested software with minimal Owner interruption.
2. Choose specialized agents, models, and effort by task category rather than using expensive reasoning everywhere.
3. Reduce total time through selective parallelism **without** multiplying token waste.
4. Resume work reliably after context compaction, session changes, or worker failures.
5. Stop failed tasks after five total attempts and escalate transparently.
6. Improve project safeguards when mistakes recur, favoring executable enforcement over reminders.
7. Maintain useful cross-session knowledge while forgetting stale transient details.
8. Operate across different agent runtimes with graceful degradation and honest capability reporting.

---

## 17. Two-layer architecture and worker instantiation

The factory has **two layers**:

1. **Universal Factory Specification (this document):** defines roles, policies, task routing, memory retention, quality, retry limits, and approval boundaries. This layer is independent of any AI provider.
2. **Runtime Adapter:** discovers what the current host actually supports and translates the specification into native agents, prompts, skills, model settings, hooks, task state, and tool permissions. Adapters may differ between Grok Build, Claude Code, Codex, and other environments.

A worker is conceptually **model + role instructions + approved skills + relevant project context + scoped task contract + allowed tools/permissions**. An agent need not be a separate process or model; it may be a native subagent, isolated model invocation, or sequential role phase depending on the host.

**Delegation protocol:** The Orchestrator first classifies the task, estimates risk and dependencies, selects an appropriate available model and reasoning effort, and decides whether delegation will save time or improve quality. When delegating, it supplies the worker only its role, relevant skills, task scope, acceptance criteria, required context, and allowed tools. It does **not** copy the entire conversation. Workers return artifacts and concise verification evidence rather than chat transcripts. The Orchestrator integrates and reports.

**Example:** A simple text change may run directly in one SWE phase with low effort. A complex dashboard may require a Designer and API SWE working from an agreed contract, followed by risk-appropriate QA. If the runtime lacks native subagents, the same workflow executes sequentially without claiming independent agents exist.

**Durability boundary:** Prompts alone cannot guarantee cross-session memory, automatic 30-day expiry, shared retry counters, crash recovery, or enforcement hooks. The runtime must provide durable state and executable controls where possible; otherwise the adapter must implement them or clearly identify the limitation. Creating a successor must never reset the task's five-attempt cap.

---

**Implementation note:** This is a product/architecture specification, not an executable system prompt. A chosen runtime should translate it into its supported agent definitions, routing policy, permissions, hooks, memory, and orchestration behavior—without weakening the stated safety, retry, or approval boundaries.
