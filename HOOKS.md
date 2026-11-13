# AISF lifecycle guards

This is the tool-independent specification for lifecycle safeguards. [PHILOSOPHY.md](PHILOSOPHY.md) owns approval, retry, and verification policy; this document defines where to check it. Each tool adapter maps these guards to its native hooks, events, plugins, or explicit runner gates. Native event names and tool configuration belong in `adapters/<tool>/`, not here.

**Specification, not installed enforcement:** downloading this file does not activate hooks. Consult the selected adapter's coverage before claiming a guard is enforced. When native interception is unavailable, perform the check explicitly at the nearest workflow boundary and disclose the limitation. An after-action warning is not a pre-execution block, and prompts are not an OS sandbox.

## Adapter contract

- Map each guard below to a supported lifecycle boundary and document its status: enforced, partial, advisory, or unsupported. Name the actual boundary, checks, and fallback; verify against the supported tool version.
- Before an action, allow it, block it with a reason and safe alternative, or pause for the scoped Owner approval required by the philosophy. After an action, record findings and route repairs through the existing task budget. Never turn a guard failure into approval or successful completion.
- Keep checks bounded and avoid recursive guard-triggered repairs, repeated approval prompts, or unconditional continuation. Preserve task identity, consumed attempts, ownership, and approvals across compaction, retries, and handoffs.
- Store adapter configuration and guard evidence under the shared AISF directory, using the existing run folder when available. Evidence identifies the guard, task/stage, decision, reason, and relevant paths without exposing secret values. Do not invent evidence for checks that did not run.
- Activate AISF-specific native handlers in ordinary interactive sessions only for projects with the AISF opt-in in `AGENTS.md`. Removing that opt-in disables them for new sessions. Explicitly invoking an AISF runner deliberately opts that run in and retains its safety gates even without the pointer. Do not silently add project hooks, alter the user's global coding-tool configuration, or enable guards in unrelated projects merely because AISF files are installed.
- Test blocking before side effects, normal allowed actions, approval boundaries, and missing-host-capability behavior before marking an implementation enforced. Shell wrappers, subprocesses, network tools, and tool aliases can bypass simplistic command matching; document coverage limits.

## 1. Context Budget Guard

- **When:** before and after tool calls, and before another model request when the host exposes that boundary.
- **Check:** observed context usage, the active model's actual limit, expected next-operation output, and room to write a checkpoint. Adapter-specific thresholds must use available telemetry rather than invented percentages. Without telemetry, use the observable pressure signals in the philosophy.
- **Action:** checkpoint using the Handoff Integrity Guard before overflow, then compact or hand off through supported mechanisms. Confirm the checkpoint was saved and compaction succeeded; otherwise pause rather than discarding state or repeatedly attempting compaction.

## 2. Loop Detector

- **When:** after tool execution and failed approaches.
- **Check:** repeated commands or equivalent actions with the same inputs, errors, and unchanged project state, without new evidence or progress. Distinguish a stuck approach from intentional bounded polling or rerunning a check after a relevant change.
- **Action:** interrupt the repeated approach, summarize the failure evidence, and require a different strategy or new diagnostic before retrying. Escalate a blocker when no supported approach remains. Tool-loop detection does not replace or reset the task's five-attempt cap.

## 3. Secret Leak Guard

- **When:** before tool execution; also before tool output reaches model context, logs, or external destinations when the host supports output interception.
- **Check:** whether the operation could expose `.env` contents, tokens, credentials, authorization headers, or private keys through reads, command arguments, output, uploads, or network requests. Protect actual values; mentioning variable names or reading a sanitized `.env.example` is not itself a leak.
- **Action:** block exposure and propose a redacted or value-free check. Do not include the detected secret in the diagnostic or guard log. Legitimate authenticated access is not blanket permission to print or transmit credentials. If safe inspection or redaction cannot be guaranteed, stop that operation and disclose the missing protection.

## 4. Destructive Command Guard

- **When:** before shell commands or other tools that can perform destructive operations.
- **Check:** the resolved targets, environment, reversibility, and existing approval for operations such as `rm -rf`, `DROP TABLE`, or force push. Inspect effects, not just command spelling; quoted examples are not executed operations.
- **Action:** require scoped Owner approval for dangerous operations under the philosophy before execution. Approval identifies the operation and targets; it does not authorize unrelated destruction. Authorized disposable scratch cleanup is not equivalent to deleting source, user data, or shared resources. Without a reliable pre-execution gate, pause before the risky action rather than claiming it was blocked automatically.

## 5. Agent Routing Guard

- **When:** before task delegation or selection of a different model.
- **Check:** task category, complexity, risk, required capabilities, scope ownership, and available agent/model capabilities against the routing policy in README section 4. Include context, tool access, cost, and effort controls only when the host actually exposes them.
- **Action:** keep direct work when delegation adds no benefit, or select the smallest capable workforce and supported model. Reject unavailable agents or fabricated model settings. When selection controls are absent, use the active model and disclose that limitation rather than pretending routing occurred.

## 6. Scope Drift Detector

- **When:** after file changes and before integration or delivery.
- **Check:** changes made by the task against its objective, acceptance criteria, and permitted paths. Record the starting worktree state so existing Owner or other-worker edits are not mistaken for this task's drift. Include generated files and lockfiles where relevant.
- **Action:** flag unrelated modifications and bring further work back into scope. Preserve pre-existing changes; do not automatically revert, delete, or rewrite files. Ask the Owner before expanding scope when the extra work is not already required by the task.

## 7. Dependency Change Guard

- **When:** before package installation, dependency additions, or manifest/lockfile edits that will introduce packages.
- **Check:** whether existing dependencies or standard-library features meet the need, whether the addition duplicates functionality, and whether known provenance, version, or license constraints create a risk. Do not label an unexamined license as approved.
- **Action:** avoid unnecessary additions and prefer the existing stack. Resolve material license or trust uncertainty before proceeding; request approval when required by the philosophy. Inspect package scripts and transitive effects where possible, and report when an indirect installation cannot be intercepted. External skill installation retains its separate approval requirement.

## 8. Handoff Integrity Guard

- **When:** before delegation, role transitions, compaction, or successor handoff.
- **Check:** the receiving agent has the task identity, objective and acceptance criteria, assigned role and scope, decisions and constraints, completed and remaining work, verification evidence, blockers, approvals, consumed attempts, and relevant source/artifact paths. Transfer only relevant context, not entire conversations or secret values.
- **Action:** persist the handoff, validate required fields and accessible paths, and stop the transition if essential state is missing or contradictory. A successor inherits the same task budget and unresolved blockers. Tool adapters own serialization and transport; this document does not prescribe a vendor payload.

## 9. Task Completion Auditor

- **When:** before declaring the task complete or allowing its final delivery; use the host's actionable stop boundary when available.
- **Check:** requested deliverables and acceptance criteria, task-related unfinished TODOs, failed or missing checks, unverified claims, unresolved blockers, and the actual delivery state. Existing unrelated TODOs do not automatically block the task. Aborted or interrupted work is not completion.
- **Action:** permit completion only when the evidence supports it. Otherwise return bounded repair work, report partial/blocked status, or request the required approval. Preserve the task attempt cap and honor explicit cancellation; do not create endless stop-hook continuations. A notification received after the agent stops can record an audit but cannot retroactively prevent completion.

## Integration and ownership

[PROJECT_ONBOARDING.md](PROJECT_ONBOARDING.md) discovers host capabilities and records which guards are active or missing. Adapter documentation maps these shared guard names to native mechanisms and states their tested coverage. Repository lint, tests, CI, secrets scanners, and deployment gates remain separate engineering controls; lifecycle guards do not replace them.

The current native-event mapping and executable coverage for Pi are documented in [adapters/pi/README.md](adapters/pi/README.md#lifecycle-guard-mapping). Other tools must provide their own mapping when implemented, not copy another tool's event names or claim its coverage.
