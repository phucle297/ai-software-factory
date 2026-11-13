#!/usr/bin/env python3
"""Offline download fixture for the piped installer and missing-Pi branch."""

import os
from pathlib import Path
import shutil
import sys


url = sys.argv[2]
target = Path(sys.argv[sys.argv.index("-o") + 1])
if url.startswith("https://codeload.github.com/"):
    shutil.copyfile(os.environ["FAKE_ARCHIVE"], target)
elif url == "https://pi.dev/install.sh":
    target.write_text('mkdir -p "$HOME/.local/bin"\ncp "$FAKE_PI_SOURCE" "$HOME/.local/bin/pi"\nchmod +x "$HOME/.local/bin/pi"\n')
else:
    raise SystemExit("Unexpected download: " + url)
