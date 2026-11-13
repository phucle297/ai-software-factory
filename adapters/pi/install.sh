#!/usr/bin/env bash
set -euo pipefail

if ! command -v pi >/dev/null; then
  command -v curl >/dev/null || { echo 'curl is required to install Pi.' >&2; exit 1; }
  temporary=$(mktemp -d)
  trap 'rm -rf "$temporary"' EXIT
  echo 'Installing Pi using the official pi.dev installer...'
  curl -fsSL https://pi.dev/install.sh -o "$temporary/install-pi.sh"
  export PATH="$HOME/.local/bin:${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/bin:$PATH"
  # A non-terminal stdout prevents the upstream installer from opening a Pi chat.
  sh "$temporary/install-pi.sh" | cat
  command -v pi >/dev/null || { echo 'Pi installed but is not on PATH. Add its bin directory, then rerun.' >&2; exit 1; }
fi

echo 'Authenticate Pi first (run pi and /login, or configure a provider API key).'
echo 'After AISF installation completes, start a new Pi session in this directory to load AGENTS.md.'
printf 'Enable native AISF event guards with: pi --extension %q\n' "${FACTORY_HOME:-$HOME/.config/aisf}/adapters/pi/guards.mjs"
echo 'Plain pi loads written instructions, not the event guards. No Pi settings or project hooks are changed.'
