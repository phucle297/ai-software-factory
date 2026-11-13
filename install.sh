#!/usr/bin/env bash
set -euo pipefail

case "$(uname -s)" in
  Linux|Darwin) ;;
  *) echo 'Factory supports macOS and Linux only.' >&2; exit 1 ;;
esac
command -v python3 >/dev/null || { echo 'Install Python 3.9+ first.' >&2; exit 1; }
python3 -c 'import sys; assert sys.version_info >= (3, 9), "Python 3.9+ required"'

FACTORY_HOME=${FACTORY_HOME:-"$HOME/.config/aisf"}
repository=${FACTORY_REPOSITORY:-phucle297/autonomous-ai-software-factory}
ref=${FACTORY_REF:-main}
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT

# A checked-out installer uses local files; a piped installer fetches a release tree.
source_dir=''
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  source_dir=$(python3 -c 'import pathlib,sys; print(pathlib.Path(sys.argv[1]).resolve().parent)' "${BASH_SOURCE[0]}")
fi
if [[ -z "$source_dir" || ! -f "$source_dir/scripts/factory.py" ]]; then
  command -v curl >/dev/null || { echo 'curl is required.' >&2; exit 1; }
  curl -fsSL "https://codeload.github.com/$repository/tar.gz/$ref" -o "$temporary/source.tar.gz"
  mkdir "$temporary/source"
  tar -xzf "$temporary/source.tar.gz" --strip-components=1 -C "$temporary/source"
  source_dir="$temporary/source"
fi

runtime=$(python3 "$source_dir/adapters/runtimes.py" "$@")
printf 'Selected coding tool: %s\n' "$runtime"
bash "$source_dir/adapters/$runtime/install.sh"

mkdir -p "$FACTORY_HOME"
FACTORY_HOME=$(python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$FACTORY_HOME")
# Refresh only shipped files. Preserve runs and other user-owned state.
python3 - "$source_dir" "$FACTORY_HOME" "$runtime" <<'PY'
import json, pathlib, shutil, sys
source, home = map(pathlib.Path, sys.argv[1:3])
for name in ('agents', 'scripts', 'adapters'):
    if (source / name).resolve() != (home / name).resolve():
        shutil.copytree(source / name, home / name, dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
config = home / 'config.json'
settings = json.loads(config.read_text()) if config.exists() else {}
settings['runtime'] = sys.argv[3]
config.write_text(json.dumps(settings, indent=2) + '\n')
PY
for name in SESSION.md README.md PHILOSOPHY.md PROJECT_ONBOARDING.md HOOKS.md; do
  [[ "$source_dir/$name" -ef "$FACTORY_HOME/$name" ]] || cp "$source_dir/$name" "$FACTORY_HOME/$name"
done
chmod +x "$FACTORY_HOME/scripts/run.sh" "$FACTORY_HOME/scripts/handoff.sh"
# The current directory is the project. Append without replacing its guidance.
python3 - "$FACTORY_HOME" <<'PY'
import pathlib, sys
home = pathlib.Path(sys.argv[1])
block = ('<!-- AISF -->\n## AISF\n\n'
         f'- Read and follow the shared AISF session instructions at `{home / "SESSION.md"}`.\n'
         '<!-- /AISF -->\n')
target = pathlib.Path.cwd() / 'AGENTS.md'
with target.open('a+', encoding='utf-8') as stream:
    stream.seek(0)
    existing = stream.read()
    if block not in existing:
        stream.write(('\n\n' if existing else '') + block)
        print(f'Added AISF instructions to {target}')
    else:
        print(f'AISF instructions already present in {target}; unchanged')
PY
printf '\nInstalled AISF files in %s\n' "$FACTORY_HOME"
echo 'To opt out, remove the AISF block from AGENTS.md (or delete the file if it contains only AISF).'
