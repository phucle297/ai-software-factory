# Project Onboarding — AI Software Factory

> Companion to [README.md](README.md) · Tool-agnostic

## Purpose and trigger

Run this workflow **once for each new project**, and run only affected stages when major architectural or tooling changes occur. Existing projects should be inspected before any modifications. The Orchestrator is responsible for execution; activate Researcher, Architect, Designer, SWE, QA, or DevOps only when justified.

## Universal entry point: `/project-onboarding`

The factory MUST expose **`/project-onboarding` as the preferred user-facing entry point** for this workflow. Treat it as a portable *command contract*, not a claim that every coding tool supports native slash commands. The runtime adapter should discover the host's command/skill mechanisms and register a thin entry point where possible. If native slash commands are unavailable, expose the same behavior through the closest supported skill, task, or plain-language invocation. **Do not duplicate this document inside the command**; the entry point delegates to this canonical workflow.

| Invocation | Behavior | Changes allowed? |
|---|---|---|
| `/project-onboarding` | Detect onboarding state. Run full setup for a new project; for an onboarded project, check relevant drift and only perform needed stages. | Yes, within approved permissions |
| `/project-onboarding --refresh` | Re-evaluate architecture, dependencies, hooks, skills, and project memory; propose and apply justified updates. Preserve existing choices unless evidence supports change. | Yes, within approved permissions |
| `/project-onboarding --audit` | Inspect readiness, gaps, risks, and recommended changes. Do not install, edit, or execute mutating setup. | **No** |

**Invocation rules**

1. Determine the repository/project root and whether onboarding has previously completed. If no repository is available, clarify the target only when it cannot be inferred safely.
2. Read this document and the factory's `README.md` policies; use existing onboarding records as the starting point.
3. Classify the request and invoke only necessary roles (Researcher, Architect, Designer, SWE, QA, DevOps). Prefer direct inspection over spawning agents for routine checks.
4. Run the onboarding stages below, skipping already-satisfied steps. Distinguish recommendations from executed changes.
5. Before any **external skill installation**, present one concise approval request listing proposed skills, purpose, source, permissions, and trade-offs. Do not install without approval, including in refresh mode.
6. Apply hooks and deterministic checks through host-supported mechanisms. If unsupported, describe a practical fallback rather than pretending it is active.
7. Persist a compact onboarding checkpoint: current architecture, verified controls, approved skills, outstanding risks, and last review date. Never claim cross-session persistence unless durable storage is available.
8. Return a concise readiness report: **ready / partially ready / blocked**, what changed, what was verified, and what requires Owner action.

**Idempotence:** Running the command repeatedly must not duplicate hooks, dependencies, skills, agent definitions, or rules. Prefer minimal updates and never overwrite intentional project customizations without justification. Audit mode must remain read-only, including when missing tools or skills are discovered.

## Research and discovery policy

- Activate the **Researcher** for unfamiliar domains, uncertain technology choices, external claims, or significant trade-offs. Research is not required for routine tasks with sufficient existing evidence.
- Inspect the repository and current project decisions first; then consult authoritative documentation or other suitable sources as needed.
- Return a short evidence packet: question, options, primary sources, dates/freshness, confidence, recommendation, and unresolved risks. Avoid long inter-agent discussions.
- Research findings inform the Architect and Orchestrator; they do not automatically authorize installation, architectural rewrites, or high-risk actions.

## Onboarding sequence

On first contact with a new project, or after a significant architectural change:

1. **Discover:** Determine whether the project is new or existing. Inspect goals, repository, stack, conventions, dependencies, environments, tests, and existing architecture.
2. **Define concept:** Establish intended users, core use cases, initial scope, non-goals, and measurable acceptance criteria. Infer safe defaults; ask only if a consequential unknown blocks progress.
3. **Establish architecture:** Choose the simplest appropriate system structure, interfaces, data flow, security posture, and operational assumptions. Respect existing architecture unless there is evidence to change it.
4. **Set up safeguards:** Identify suitable lint, typecheck, tests, formatting, import boundaries, secrets checks, pre-commit/CI gates, and available lifecycle hooks. Prefer deterministic enforcement.
5. **Discover skills:** Audit built-in capabilities and installed skills; propose a small curated set of project-specific additions, with purpose, source, permissions, maintenance, and benefit. Avoid redundant or untrusted skills.
6. **Request one consolidated approval** before installing new external skills, as explicitly required by the Owner. Ask separately only for unavoidable high-risk decisions. Do not install without approval.
7. **Initialize project memory:** Record architecture, constraints, approved skills, controls, decisions, and task conventions.
8. **Begin work:** Activate only necessary workers. For later sessions, load existing onboarding state rather than repeating setup.

**Skill policy:** Aim for a meaningful but minimal skill set (often around 3–6 project-specific skills when warranted, not a quota). Reuse built-in or existing capabilities before installation. An agent skill is not a substitute for executable tooling where deterministic enforcement is possible.

## Engineering safeguards and hooks

Distinguish **agent lifecycle controls** from **repository engineering controls**. Implement each with native hooks when supported, or with explicit workflow checks when not.

| Event | Expected check |
|---|---|
| Task intake | Scope, risk, category, ownership, budgets |
| Before delegation | Dependencies, contract, worktree/file ownership |
| Before edits | Relevant architecture, code conventions, permission scope |
| After edits | Appropriate lint, typecheck, tests, diff review |
| Before commit/merge | No secrets, conflicts, broken contracts, critical findings |
| Before deployment | Approval if high-risk, environment validation, rollback plan |
| Context pressure | Checkpoint, compact, successor handoff |
| Failed solution | Increment shared attempt counter; diagnose |
| Completion | Verify acceptance, capture reusable knowledge, retire worker |

Hooks themselves must be bounded and must not recursively trigger endless repairs. CI or an equivalent authoritative gate should enforce important rules even if local hooks are skipped.


## Readiness gate

Before feature implementation, confirm that the project concept and acceptance criteria are sufficiently clear, architecture and constraints are documented, baseline checks are runnable (or missing checks are explicitly acknowledged), approved skills are available, and task ownership and risk boundaries are established. Do not block minor safe changes on irrelevant setup. Any external skill installation requires consolidated Owner approval.

## Session reuse

On later sessions, load project memory and inspect relevant repository changes. Refresh stale assumptions only when needed. Store reusable findings in project memory, and follow the README's selective 30-day memory review, bounded five-attempt recovery, and continuous improvement rules.
