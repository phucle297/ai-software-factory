#!/usr/bin/env python3
"""Dispatch factory tasks to the runtime chosen during installation."""

import os
from pathlib import Path
import runpy
import sys


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "adapters"))
from runtimes import configured_runtime


if __name__ == "__main__":
    try:
        home = Path(os.environ.get("FACTORY_HOME", Path.home() / ".config" / "aisf")).resolve()
        runtime = configured_runtime(home)
    except (ValueError, OSError) as error:
        print(f"factory: {error}", file=sys.stderr)
        sys.exit(1)
    runpy.run_path(str(ROOT / "adapters" / runtime / "factory.py"), run_name="__main__")
