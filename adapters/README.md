# Coding-tool runtime adapters

The factory's roles and policies are shared. Tool-specific invocation, event parsing, permissions, and process cleanup belong in an adapter directory rather than shared scripts.

| Tool | Status | Implementation |
|---|---|---|
| Pi | Available; selectable | [pi/factory.py](pi/factory.py) |
| Claude Code | Will be implemented later; not selectable | Not implemented |
| Codex | Will be implemented later; not selectable | Not implemented |
| Amp | Will be implemented later; not selectable | Not implemented |
| OpenCode | Will be implemented later; not selectable | Not implemented |

`tools.json` is the catalog used by the installer menu and command dispatcher. Its first `available` entry is the default when no choice is supplied or saved. Menu defaults and available-tool messages come from that catalog, not a hard-coded tool name. `runtimes.py` rejects planned tools, including when selected through `--tool`, `FACTORY_RUNTIME`, or a manually edited configuration. Showing a tool in the menu does not install it or claim integration exists.

Installation runs `adapters/<runtime>/install.sh` for tool-specific setup and saves the choice as `{"runtime":"pi"}` in `~/.config/aisf/config.json`. It appends an AISF pointer to the current directory's `AGENTS.md`, preserving existing content; shared role definitions live in `~/.config/aisf/agents/`, not in the project. No factory CLI is installed. Optional `scripts/run.sh` and `scripts/handoff.sh` invoke `scripts/factory.py`, which dispatches to `adapters/<runtime>/factory.py`. Source checkouts without a config default to Pi.

To add a runtime later, implement its `install.sh` and `factory.py` entry points in a new adapter directory, verify its handoff/recovery behavior, and then mark its catalog entry `available`. Do not enable a menu option before the implementation exists. Do not assume another CLI supports Pi flags, event shapes, permissions, or signal cleanup.

[HOOKS.md](../HOOKS.md) owns the shared lifecycle guard specification. Each adapter documents its own native hook/event mapping, activation scope, tested tool version, and enforced/partial/advisory/unsupported coverage. Keep event names and handler configuration inside that adapter; do not register user-wide guards or claim enforcement just because the shared file was installed. See [Pi's mapping](pi/README.md#lifecycle-guard-mapping) for the current example.

Context-pressure, compaction, and succession design guidance lives in [PHILOSOPHY.md](../PHILOSOPHY.md#context-pressure-compaction-and-succession), separate from executable runtime adapters.
