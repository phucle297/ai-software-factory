import fcntl
import hashlib
import json
import os
from pathlib import Path
import pty
import select
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest


ROOT = Path(__file__).resolve().parent.parent


class FactoryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.project = self.base / "project with spaces"
        self.project.mkdir()
        self.home = self.base / "factory's home"
        self.calls = self.base / "calls.jsonl"
        self.pi = self.base / "pi"
        shutil.copyfile(ROOT / "tests/fake_pi.py", self.pi)
        self.pi.chmod(0o755)
        self.env = dict(os.environ, FACTORY_HOME=str(self.home), FACTORY_PI=str(self.pi),
                        FAKE_CALLS=str(self.calls), FAKE_MODE="pass")
        self.env.pop("FACTORY_RUNTIME", None)

    def run_factory(self, *arguments, mode="pass"):
        return subprocess.run(["bash", str(ROOT / "scripts/run.sh"), *map(str, arguments)],
                              cwd=self.project, env=dict(self.env, FAKE_MODE=mode),
                              capture_output=True, text=True, timeout=20)

    def run_folder(self):
        return next((self.home / "runs").iterdir())

    def state(self):
        return json.loads((self.run_folder() / "state.json").read_text())

    def invocations(self):
        return [json.loads(line) for line in self.calls.read_text().splitlines()]

    def test_default_pipeline_and_contracts(self):
        task_file = self.base / "task.txt"
        task_file.write_text("--literal @filename\nUnicode: café")
        result = self.run_factory("--file", task_file, "--model", "provider/model")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.invocations()
        self.assertEqual([c["contract"]["role"] for c in calls], ["orchestrator", "pm", "swe", "qa", "orchestrator"])
        self.assertTrue(all(c["contract"]["objective"] == task_file.read_text() for c in calls))
        self.assertTrue(all(c["cwd"] == str(self.project) for c in calls))
        self.assertEqual(calls[2]["contract"]["context"]["pm"]["output"]["acceptance_criteria"],
                         ["The fixture file contains the requested content."])
        for call in calls:
            argv = call["argv"]
            self.assertIn("--no-session", argv)
            self.assertIn("--no-extensions", argv)
            self.assertEqual(argv[argv.index("--extension") + 1], str(ROOT / "adapters/pi/guards.mjs"))
            self.assertEqual(argv[argv.index("--model") + 1], "provider/model")
            tools = argv[argv.index("--tools") + 1].split(",")
            self.assertEqual("write" in tools, call["contract"]["role"] == "swe")
        self.assertEqual(self.state()["status"], "completed")
        self.assertEqual(self.state()["attempts"], 1)
        self.assertEqual((self.project / "result.txt").read_text(), "verified fixture\n")
        self.assertEqual(len(list(self.run_folder().glob("*.input.json"))), 5)
        calls_before = self.calls.read_text()
        resumed = self.run_factory("--resume", self.run_folder())
        self.assertEqual(resumed.stdout, result.stdout)
        self.assertEqual(self.calls.read_text(), calls_before)

    def test_optional_roles_are_routed_in_order(self):
        result = self.run_factory("A task", mode="optional")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([c["contract"]["role"] for c in self.invocations()],
                         ["orchestrator", "pm", "researcher", "architect", "devops", "swe", "reviewer", "qa", "orchestrator"])
        for call in self.invocations():
            role = call["contract"]["role"]
            prompt = call["argv"][call["argv"].index("--system-prompt") + 1]
            self.assertTrue(prompt.startswith(f"Assigned factory role: {role}."))
            self.assertIn((ROOT / "SESSION.md").read_text(), prompt)
            self.assertIn((ROOT / "PHILOSOPHY.md").read_text(), prompt)
            self.assertIn((ROOT / "agents" / f"{role}.md").read_text(), prompt)
            for other in (ROOT / "agents").glob("*.md"):
                if other.stem != role:
                    self.assertNotIn(other.read_text(), prompt)

    def test_repair_gets_failure_evidence_and_preserves_task_id(self):
        result = self.run_factory("A task", mode="retry")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.invocations()
        repairs = [c["contract"] for c in calls if c["contract"]["role"] == "swe"]
        self.assertEqual([c["attempt"] for c in repairs], [1, 2])
        self.assertEqual(repairs[1]["context"]["qa"]["output"]["verdict"], "fail")
        self.assertIn("QA failed", repairs[1]["last_failure"])
        self.assertEqual(len({c["contract"]["task_id"] for c in calls}), 1)
        self.assertEqual(self.state()["attempts"], 2)

    def test_failure_cap_and_no_resume_reset(self):
        result = self.run_factory("A task", mode="qa_fail")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.state()["status"], "failed")
        self.assertEqual(self.state()["attempts"], 5)
        self.assertEqual(sum(c["contract"]["role"] == "swe" for c in self.invocations()), 5)
        calls_before = self.calls.read_text()
        result = self.run_factory("--resume", self.run_folder(), "--answer", "Try again")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("exhausted", result.stderr)
        self.assertEqual(self.calls.read_text(), calls_before)

    def test_bad_protocol_and_unsupported_success_never_complete(self):
        for mode in ("malformed", "exit", "no_evidence", "no_trace", "contradiction", "uncovered",
                     "qa_ls", "qa_failed_check", "qa_missing_checks"):
            with self.subTest(mode=mode):
                self.home = self.base / mode
                self.env["FACTORY_HOME"] = str(self.home)
                result = self.run_factory("A task", mode=mode)
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertEqual(self.state()["status"], "failed")
                self.assertEqual(self.state()["attempts"], 5)
                self.assertEqual(result.stdout, "")

    def test_guard_findings_override_success_and_missing_evidence_fails_closed(self):
        for mode in ("guard_missing", "guard_wrong_task", "guard_blocked", "guard_awaiting_approval", "guard_retry"):
            with self.subTest(mode=mode):
                self.home = self.base / mode
                self.env["FACTORY_HOME"] = str(self.home)
                result = self.run_factory("A task", mode=mode)
                retry = mode == "guard_retry"
                self.assertEqual(result.returncode, 1 if retry else 2, result.stderr)
                self.assertEqual(self.state()["attempts"], 5 if retry else 1)
                self.assertNotEqual(self.state()["status"], "completed")
                self.assertEqual(result.stdout, "")

    @unittest.skipUnless(shutil.which("node"), "Node.js is needed for Pi extension tests")
    def test_pi_event_guards(self):
        result = subprocess.run(["node", "--test", str(ROOT / "tests/pi_guards.test.mjs")],
                                cwd=ROOT, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_approval_blocks_and_resume_requires_answer(self):
        for mode in ("blocked", "approval"):
            with self.subTest(mode=mode):
                self.home = self.base / mode
                self.env["FACTORY_HOME"] = str(self.home)
                result = self.run_factory("A task", mode=mode)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(self.state()["attempts"], 1)
                count = len(self.invocations())
                result = self.run_factory("--resume", self.run_folder(), mode=mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(len(self.invocations()), count)
                result = self.run_factory("--resume", self.run_folder(), "--answer", "Proceed with local scope", mode=mode)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(self.state()["attempts"], 2)
                self.assertEqual(self.state()["status"], "completed")

    def test_timeout_consumes_bounded_attempts(self):
        result = self.run_factory("A task", "--timeout", "1", mode="timeout")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(self.state()["attempts"], 5)
        self.assertIn("timed out", self.state()["last_failure"])

    def test_interrupted_run_resumes_with_consumed_attempt(self):
        result = self.run_factory("A task", mode="interrupt")
        self.assertEqual(result.returncode, 130, result.stderr)
        self.assertEqual(self.state()["status"], "interrupted")
        self.assertEqual(self.state()["attempts"], 1)
        result = self.run_factory("--resume", self.run_folder())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.state()["attempts"], 2)

    def test_detached_shell_cleanup_on_timeout_and_termination(self):
        for mode in ("detached_timeout", "detached_term", "detached_hup"):
            with self.subTest(mode=mode):
                self.home = self.base / mode
                self.env["FACTORY_HOME"] = str(self.home)
                result = self.run_factory("A task", "--timeout", "1", mode=mode)
                attempts = 5 if mode == "detached_timeout" else 1
                self.assertEqual(result.returncode, 1 if attempts == 5 else 130, result.stderr)
                self.assertEqual(self.state()["attempts"], attempts)
                self.assertEqual(len(list(self.project.glob("cleaned-*"))), attempts)
                self.assertEqual(list(self.project.glob("orphan-*")), [])
                for marker in self.project.glob("cleaned-*"):
                    marker.unlink()

    def test_resume_reverifies_project_changed_after_qa(self):
        result = self.run_factory("A task", mode="delivery_block")
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertTrue(self.state()["verified"])
        (self.project / "result.txt").write_text("BROKEN after checkpoint\n")
        count = len(self.invocations())
        result = self.run_factory("--resume", self.run_folder(), "--answer", "Continue", mode="no_repair")
        self.assertEqual(result.returncode, 1, result.stderr)
        resumed = self.invocations()[count:]
        self.assertIn("qa", [c["contract"]["role"] for c in resumed])
        self.assertNotIn("delivery", [c["contract"]["phase"] for c in resumed])
        self.assertEqual(self.state()["status"], "failed")
        self.assertEqual(result.stdout, "")

    def test_project_lock_prevents_overlapping_writes(self):
        locks = self.home / "locks"
        locks.mkdir(parents=True)
        key = hashlib.sha256(str(self.project).encode()).hexdigest()
        with (locks / key).open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.run_factory("A task")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("another factory process", result.stderr)
            self.assertFalse(self.calls.exists())
            self.assertEqual(self.state()["attempts"], 0)

    def test_handoff_validator_rejects_missing_qa_evidence(self):
        handoff = self.base / "handoff.json"
        handoff.write_text(json.dumps({"status": "ok", "summary": "Claimed success", "output": {"verdict": "pass"}}))
        result = subprocess.run(["bash", str(ROOT / "scripts/handoff.sh"), "qa", str(handoff)],
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("evidence", result.stderr)

    def test_installer_is_idempotent_and_handles_quoted_paths(self):
        env = dict(self.env, PATH=str(self.base) + os.pathsep + os.environ["PATH"], HOME=str(self.base / "user"))
        project_guidance = self.project / "AGENTS.md"
        original = "# Existing project conventions\n\nKeep café spelling; do not replace."
        project_guidance.write_text(original)
        installed = None
        for _ in range(2):
            result = subprocess.run(["bash", str(ROOT / "install.sh"), "--tool", "pi"], cwd=self.project,
                                    env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn("Authenticate Pi first", result.stdout)
            self.assertNotIn("pi --extension", result.stdout)
            self.assertIn(f"Installed AISF files in {self.home}", result.stdout)
            self.assertIn(f"To uninstall, delete {self.home}", result.stdout)
            self.assertIn("remove the AISF block", result.stdout)
            if installed is not None:
                self.assertEqual(project_guidance.read_text(), installed)
            installed = project_guidance.read_text()
            marker = self.home / "runs/keep.txt"
            marker.parent.mkdir(exist_ok=True)
            marker.write_text("saved state")
        self.assertTrue(installed.startswith(original + "\n\n"))
        self.assertIn(f"`{self.home}/SESSION.md`", installed)
        self.assertEqual(installed.count("<!-- AISF -->"), 1)
        self.assertEqual([p.name for p in self.project.iterdir()], ["AGENTS.md"])
        self.assertFalse((self.base / "user/.local/bin/factory").exists())
        self.assertEqual(marker.read_text(), "saved state")
        self.assertEqual(json.loads((self.home / "config.json").read_text())["runtime"], "pi")
        self.assertTrue((self.home / "adapters/pi/factory.py").is_file())
        self.assertEqual((self.home / "SESSION.md").read_text(), (ROOT / "SESSION.md").read_text())
        self.assertEqual((self.home / "PROJECT_ONBOARDING.md").read_text(), (ROOT / "PROJECT_ONBOARDING.md").read_text())
        self.assertEqual((self.home / "HOOKS.md").read_text(), (ROOT / "HOOKS.md").read_text())
        self.assertEqual(len(list((self.home / "agents").glob("*.md"))), 8)
        command = self.home / "scripts/run.sh"
        result = subprocess.run([str(command), "--help"], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--resume", result.stdout)
        # Verify the optional runner loads the installed policy, not source copies.
        philosophy = self.home / "PHILOSOPHY.md"
        philosophy.write_text(philosophy.read_text() + "\nInstalled policy sentinel.\n")
        result = subprocess.run([str(command), "A task"], cwd=self.project,
                                env=env, capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(list((self.home / "runs").glob("*/state.json"))), 1)
        self.assertEqual(project_guidance.read_text(), installed)
        for call in self.invocations():
            prompt = call["argv"][call["argv"].index("--system-prompt") + 1]
            self.assertIn((self.home / "PHILOSOPHY.md").read_text(), prompt)
            self.assertIn((self.home / "SESSION.md").read_text(), prompt)

    def test_piped_install_downloads_source_and_installs_missing_pi(self):
        archive = self.base / "source.tar.gz"
        with tarfile.open(archive, "w:gz") as bundle:
            for name in ("agents", "scripts", "adapters", "SESSION.md", "README.md", "PHILOSOPHY.md", "PROJECT_ONBOARDING.md", "HOOKS.md"):
                bundle.add(ROOT / name, arcname="factory-main/" + name)
        shims = self.base / "shims"
        shims.mkdir()
        shutil.copyfile(ROOT / "tests/fake_curl.py", shims / "curl")
        (shims / "curl").chmod(0o755)
        env = dict(self.env, PATH=str(shims) + ":/usr/bin:/bin", HOME=str(self.base / "user"),
                   FAKE_ARCHIVE=str(archive), FAKE_PI_SOURCE=str(self.pi))
        env.pop("FACTORY_HOME")
        self.home = self.base / "user/.config/aisf"
        result = subprocess.run(["bash", "-s", "--", "--tool", "pi"], input=(ROOT / "install.sh").read_text(),
                                cwd=self.project, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Installing Pi", result.stdout)
        self.assertNotIn("Authenticate Pi first", result.stdout)
        self.assertNotIn("pi --extension", result.stdout)
        self.assertIn(f"Installed AISF files in {self.home}", result.stdout)
        self.assertIn(f"To uninstall, delete {self.home}", result.stdout)
        self.assertTrue((self.base / "user/.local/bin/pi").is_file())
        self.assertEqual((self.home / "HOOKS.md").read_text(), (ROOT / "HOOKS.md").read_text())
        self.assertFalse((self.base / "user/.local/bin/factory").exists())
        self.assertFalse((self.base / "user/.factory").exists())
        project_guidance = self.project / "AGENTS.md"
        self.assertIn(f"`{self.home}/SESSION.md`", project_guidance.read_text())
        self.assertEqual([p.name for p in self.project.iterdir()], ["AGENTS.md"])
        # Removing the sole opt-in leaves no project-local AISF configuration or hooks.
        project_guidance.unlink()
        self.assertEqual(list(self.project.iterdir()), [])
        self.assertTrue((self.home / "PHILOSOPHY.md").is_file())
        result = subprocess.run([str(self.home / "scripts/run.sh"), "A task"], cwd=self.project,
                                env=env, capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.state()["status"], "completed")

    def test_catalog_drives_selection_and_dispatch_without_pi(self):
        sandbox = self.base / "catalog installation"
        (sandbox / "scripts").mkdir(parents=True)
        (sandbox / "adapters").mkdir()
        shutil.copyfile(ROOT / "scripts/factory.py", sandbox / "scripts/factory.py")
        shutil.copyfile(ROOT / "adapters/runtimes.py", sandbox / "adapters/runtimes.py")
        catalog = [{"id": "pi", "name": "Pi", "status": "planned"},
                   {"id": "fixture", "name": "Fixture", "status": "available"},
                   {"id": "other", "name": "Other", "status": "available"}]
        (sandbox / "adapters/tools.json").write_text(json.dumps(catalog))
        for identifier in ("fixture", "other"):
            adapter = sandbox / "adapters" / identifier
            adapter.mkdir()
            (adapter / "factory.py").write_text(f"print({identifier!r})\n")
        selector = sandbox / "adapters/runtimes.py"
        for arguments, expected in (([], "fixture"), (["--tool", "other"], "other")):
            result = subprocess.run([sys.executable, str(selector), *arguments], env=self.env,
                                    capture_output=True, text=True, start_new_session=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), expected)
        result = subprocess.run([sys.executable, str(selector), "--tool", "pi"], env=self.env,
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Available tools: Fixture, Other.", result.stderr)
        for saved, expected in ((None, "fixture"), ({"runtime": "other"}, "other")):
            if saved is not None:
                self.home.mkdir()
                (self.home / "config.json").write_text(json.dumps(saved))
            result = subprocess.run([sys.executable, str(sandbox / "scripts/factory.py")], env=self.env,
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), expected)

    def test_unavailable_tools_cannot_be_installed_or_dispatched(self):
        for tool in ("claude", "codex", "amp", "opencode"):
            with self.subTest(tool=tool):
                for arguments, env in ((["--tool", tool], self.env), ([], dict(self.env, FACTORY_RUNTIME=tool))):
                    result = subprocess.run(["bash", str(ROOT / "install.sh"), *arguments],
                                            env=env, capture_output=True, text=True)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn("will be implemented later", result.stderr)
                    self.assertFalse((self.home / "config.json").exists())
                self.home.mkdir(exist_ok=True)
                config = self.home / "config.json"
                config.write_text(json.dumps({"runtime": tool}))
                result = self.run_factory("A task")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("cannot be selected", result.stderr)
                self.assertFalse(self.calls.exists())
                config.unlink()

    def test_installer_without_terminal_defaults_to_pi(self):
        env = dict(self.env, PATH=str(self.base) + os.pathsep + os.environ["PATH"])
        result = subprocess.run(["bash", str(ROOT / "install.sh")], cwd=self.project, env=env, input="",
                                capture_output=True, text=True, start_new_session=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("No interactive terminal; selecting Pi", result.stderr)
        self.assertEqual(json.loads((self.home / "config.json").read_text())["runtime"], "pi")

    def test_interactive_installer_rejects_planned_tools_then_accepts_pi(self):
        env = dict(self.env, PATH=str(self.base) + os.pathsep + os.environ["PATH"])
        pid, terminal = pty.fork()
        if pid == 0:
            os.chdir(self.project)
            os.execve("/bin/bash", ["bash", str(ROOT / "install.sh")], env)
        transcript = b""
        sent = False
        deadline = time.monotonic() + 10
        try:
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0 or not select.select([terminal], [], [], remaining)[0]:
                    os.kill(pid, signal.SIGTERM)
                    self.fail("Installer menu timed out: " + transcript.decode())
                try:
                    chunk = os.read(terminal, 65536)
                except OSError:
                    break
                if not chunk:
                    break
                transcript += chunk
                if not sent and b"Select a tool" in transcript:
                    os.write(terminal, b"2\n3\n4\n5\nunknown\n1\n")
                    sent = True
        finally:
            os.close(terminal)
            _, status = os.waitpid(pid, 0)
        output = transcript.decode()
        self.assertEqual(os.waitstatus_to_exitcode(status), 0, output)
        for name in ("Claude Code", "Codex", "Amp", "OpenCode"):
            self.assertIn(name + " — will be implemented later; unavailable", output)
        self.assertEqual(output.count("cannot be selected yet"), 4)
        self.assertIn("Unknown tool", output)
        self.assertEqual(json.loads((self.home / "config.json").read_text())["runtime"], "pi")


if __name__ == "__main__":
    unittest.main()
