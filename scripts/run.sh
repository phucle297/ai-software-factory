#!/usr/bin/env bash
set -euo pipefail
scripts=$(dirname "${BASH_SOURCE[0]}")
exec python3 "$scripts/factory.py" "$@"
