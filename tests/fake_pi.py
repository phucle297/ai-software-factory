#!/usr/bin/env python3
"""Deterministic Pi protocol fixture; never calls a model or external service."""

import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


contract = json.load(sys.stdin)
role = contract["role"]
mode = os.environ.get("FAKE_MODE", "pass")
with open(os.environ["FAKE_CALLS"], "a") as log:
    log.write(json.dumps({"contract": contract, "argv": sys.argv[1:], "cwd": os.getcwd()}) + "\n")

if mode == "timeout":
    time.sleep(10)
if mode == "interrupt":
    os.kill(os.getppid(), signal.SIGINT)
    time.sleep(10)
if mode == "exit":
    print("provider unavailable", file=sys.stderr)
    sys.exit(3)

if mode != "guard_missing":
    guard = {"task_id": contract["task_id"], "role": role, "attempt": contract["attempt"],
             "status": "ok", "summary": "Fixture guard checks completed"}
    if role == "swe" and mode.startswith("guard_"):
        guard["status"] = mode.removeprefix("guard_")
        guard["summary"] = "Fixture guard stopped the stage"
    if mode == "guard_wrong_task":
        guard["task_id"] = "different task"
    Path(os.environ["AISF_CONTRACT"].replace(".input.json", ".guard.json")).write_text(json.dumps(guard))

if mode == "malformed":
    print("not json")
    sys.exit(0)

if mode.startswith("detached_") and role == "swe":
    marker = f"orphan-{contract['attempt']}"
    child = subprocess.Popen([sys.executable, "-c",
                              "import time; from pathlib import Path; time.sleep(1.5); Path(" + repr(marker) + ").touch()"],
                             start_new_session=True)

    def cleanup(signum, frame):
        os.killpg(child.pid, signal.SIGTERM)
        child.wait()
        Path(f"cleaned-{contract['attempt']}").touch()
        sys.exit(0)

    signal.signal(signal.SIGTERM, cleanup)
    if mode == "detached_term":
        os.kill(os.getppid(), signal.SIGTERM)
    if mode == "detached_hup":
        os.kill(os.getppid(), signal.SIGHUP)
    time.sleep(10)

status = "ok"
output = {}
summary = "Fixture completed"
if role == "orchestrator":
    output = {"routing": {key: mode == "optional" for key in ("researcher", "architect", "devops", "reviewer")}}
    if contract["phase"] == "delivery":
        output = {"report": "Delivered fixture change; verified its content."}
        if mode == "delivery_block":
            status = "blocked"
            summary = "Review delivery before continuing."
elif role == "pm":
    output = {"acceptance_criteria": ["The fixture file contains the requested content."]}
elif role == "swe":
    if mode in ("blocked", "approval", "resume") and not contract["owner_response"]:
        status = "blocked" if mode == "blocked" else "awaiting_approval"
        summary = "Confirm fixture scope before proceeding."
    elif mode != "no_repair":
        Path("result.txt").write_text("verified fixture\n")
        output = {"changed_files": ["result.txt"]}
elif role == "qa":
    command = 'test "$(cat result.txt)" = "verified fixture"'
    if mode == "qa_ls":
        command = "ls"
    if mode == "qa_failed_check":
        preliminary = subprocess.run(["ls"], capture_output=True, text=True)
        print(json.dumps({"type": "tool_execution_end", "toolName": "bash", "isError": False,
                          "result": {"content": [{"type": "text", "text": preliminary.stdout}]}}))
        command = "test failure = success"
    check = subprocess.run(["bash", "-c", command], capture_output=True, text=True)
    passed = check.returncode == 0 and mode not in ("qa_fail", "contradiction")
    if mode == "retry":
        passed = contract["attempt"] > 1
    if mode == "qa_failed_check":
        passed = True  # Deliberately false handoff: the runner must reject it.
    if mode != "guard_missing":
        guard["checkpoint"] = {"successful_checks": int(check.returncode == 0 and mode != "qa_ls")}
        if mode == "qa_missing_checks":
            del guard["checkpoint"]["successful_checks"]
        Path(os.environ["AISF_CONTRACT"].replace(".input.json", ".guard.json")).write_text(json.dumps(guard))
    if mode != "no_trace":
        print(json.dumps({"type": "tool_execution_end", "toolName": "bash", "isError": check.returncode != 0,
                          "result": {"content": [{"type": "text", "text": check.stdout + check.stderr}]}}))
    output = {"verdict": "pass" if passed else "fail", "uncovered_criteria": [],
              "checks": [{"command": command, "outcome": "pass" if passed else "fail",
                          "evidence": check.stdout or check.stderr or f"command exited {check.returncode}"}]}
    if mode == "contradiction":
        output["verdict"] = "pass"
    if mode == "no_evidence":
        output["checks"][0]["evidence"] = ""
    if mode == "uncovered":
        output["uncovered_criteria"] = ["Missing acceptance coverage"]
elif role == "reviewer":
    output = {"verdict": "pass", "findings": []}

result = {"status": status, "summary": summary, "output": output}
# Include an earlier assistant message so consumers must select the final one.
print(json.dumps({"type": "message_end", "message": {"role": "assistant", "content": [{"type": "text", "text": "Inspecting project"}]}}))
print(json.dumps({"type": "message_end", "message": {"role": "assistant", "stopReason": "stop",
                 "content": [{"type": "text", "text": json.dumps(result)}]}}))
