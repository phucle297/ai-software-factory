"""Runtime catalog, installer selection, and installed configuration."""

import argparse
import json
import os
from pathlib import Path
import sys


CATALOG = json.loads((Path(__file__).parent / "tools.json").read_text())
AVAILABLE = [tool for tool in CATALOG if tool["status"] == "available"]
DEFAULT = AVAILABLE[0]


def available_runtime(identifier):
    choices = ", ".join(tool["name"] for tool in AVAILABLE)
    for tool in CATALOG:
        if tool["id"] == identifier:
            if tool["status"] != "available":
                raise ValueError(f"{tool['name']} will be implemented later and cannot be selected yet. Available tools: {choices}.")
            return identifier
    raise ValueError(f"Unknown tool {identifier!r}. Available tools: {choices}.")


def configured_runtime(home):
    config = home / "config.json"
    # Without a saved choice, use the catalog's first available runtime.
    settings = json.loads(config.read_text()) if config.exists() else {}
    if not isinstance(settings, dict):
        raise ValueError("config.json must contain a JSON object")
    return available_runtime(settings.get("runtime", DEFAULT["id"]))


def select_runtime():
    parser = argparse.ArgumentParser(description="Choose an available factory coding tool from the catalog.")
    parser.add_argument("--tool", help="select an available tool without prompting")
    args = parser.parse_args()
    requested = args.tool or os.environ.get("FACTORY_RUNTIME")
    if requested:
        return available_runtime(requested)

    print("Choose your coding tool:", file=sys.stderr)
    for number, tool in enumerate(CATALOG, 1):
        label = "available" if tool["status"] == "available" else "will be implemented later; unavailable"
        print(f"  {number}) {tool['name']} — {label}", file=sys.stderr)
    try:
        terminal = open("/dev/tty", "r")
    except OSError:
        print(f"No interactive terminal; selecting {DEFAULT['name']}. Use --tool {DEFAULT['id']} for unattended installation.", file=sys.stderr)
        return DEFAULT["id"]
    with terminal:
        while True:
            print(f"Select a tool [{CATALOG.index(DEFAULT) + 1}: {DEFAULT['name']}]: ", end="", flush=True, file=sys.stderr)
            answer = terminal.readline()
            if not answer:
                raise ValueError("Tool selection cancelled; no tool was installed.")
            answer = answer.strip() or DEFAULT["id"]
            if answer.isdigit() and 1 <= int(answer) <= len(CATALOG):
                answer = CATALOG[int(answer) - 1]["id"]
            try:
                return available_runtime(answer.lower())
            except ValueError as error:
                print(error, file=sys.stderr)


if __name__ == "__main__":
    try:
        print(select_runtime())
    except (ValueError, OSError) as error:
        print(f"factory installer: {error}", file=sys.stderr)
        sys.exit(1)
