import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const home = resolve(process.env.FACTORY_HOME || resolve(dirname(fileURLToPath(import.meta.url)), '../../..'));
export const digest = value => createHash('sha256').update(value).digest('hex');
export const within = (root, path) => path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);

export function canonical(path) {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  return parent === path ? path : resolve(canonical(parent), relative(parent, path));
}

export function sensitivePath(path) {
  const withoutFixtures = path.replace(/\.env\.(?:example|sample|template)(?=$|[\s'";])/gi, 'fixture');
  return /(?:^|[\/\\\s'"=])(?:\.env(?:\.[\w-]+)?|id_(?:rsa|ed25519|ecdsa)|credentials(?:\.json)?|[^\s/'"]+\.(?:pem|key|p12|pfx))(?=$|[\/\\\s'";])/i.test(withoutFixtures);
}

export function redact(value) {
  let output = String(value);
  for (const [name, secret] of Object.entries(process.env)) {
    if (/(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|CREDENTIAL)/i.test(name) && secret.length >= 8) {
      output = output.split(secret).join('[REDACTED]');
    }
  }
  return output
    .replace(/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/\b(?:sk-[\w-]{16,}|gh[pousr]_[\w]{20,}|github_pat_[\w_]{20,}|AKIA[A-Z0-9]{16})\b/g, '[REDACTED]')
    .replace(/((?:api[_-]?key|token|secret|password|authorization)["']?\s*[=:]\s*["']?)(?:Bearer\s+)?[^\s,"';}]+/gi, '$1[REDACTED]');
}

export function snapshot(project) {
  // No shell, external diff drivers, or file contents are written to evidence.
  try {
    const deadline = Date.now() + 7000;
    let visited = 0;
    let bytes = 0;
    let names;
    try {
      names = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
        { cwd: project, timeout: 5000, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
        .toString().split('\0').filter(Boolean);
    } catch {
      names = [];
      const walk = directory => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          if (['.git', '.amp', 'node_modules', '.venv', '__pycache__'].includes(entry.name)) continue;
          const path = resolve(directory, entry.name);
          if (++visited > 5000 || Date.now() > deadline || path === home) throw new Error('Snapshot limit reached.');
          if (entry.isDirectory()) walk(path);
          else names.push(relative(project, path));
        }
      };
      walk(project);
    }
    if (names.length > 5000) return null;
    const result = {};
    for (const name of names.sort()) {
      if (Date.now() > deadline) return null;
      const path = resolve(project, name);
      if (!within(project, path)) continue;
      let stat;
      try { stat = lstatSync(path); } catch { result[name] = 'deleted'; continue; }
      if (stat.isSymbolicLink()) result[name] = `link:${readlinkSync(path)}`;
      else if (stat.isFile()) {
        if (stat.size <= 2 * 1024 * 1024) bytes += stat.size;
        if (bytes > 32 * 1024 * 1024) return null;
        const contents = stat.size <= 2 * 1024 * 1024 ? digest(readFileSync(path)) : `${stat.size}:${stat.mtimeMs}`;
        result[name] = `${stat.mode & 0o777}:${contents}`;
      }
    }
    return result;
  } catch {
    return null;
  }
}

export function createGuardState(pi) {
  const state = {
    active: false, guardFailed: false, scope: [], history: new Map(), calls: new Map(), denied: new Map(),
    successfulChecks: 0, auditRetries: 0, compacting: false, compactRequested: false,
    on(name, handler) {
      // Pi catches extension exceptions and may continue; guard errors must fail closed.
      pi.on(name, async (event, ctx) => {
        try { return await handler(event, ctx); }
        catch {
          state.guardFailed = true;
          const reason = 'AISF guard failed; stop and inspect the adapter before resuming.';
          try { state.stop('Guard runtime', reason); } catch { /* Missing evidence also blocks the runner. */ }
          if (name === 'tool_call') return { block: true, reason, terminate: true };
          if (name === 'session_before_compact') return { cancel: true };
          ctx.abort();
        }
      });
    },
    persist() {
      mkdirSync(dirname(state.reportPath), { recursive: true, mode: 0o700 });
      const temporary = state.reportPath + '.tmp';
      writeFileSync(temporary, JSON.stringify(state.report,
        (_key, value) => typeof value === 'string' ? redact(value) : value, 2) + '\n', { mode: 0o600 });
      renameSync(temporary, state.reportPath);
    },
    record(guard, status, reason) {
      state.report.events.push({ guard, status, reason, time: new Date().toISOString() });
      state.report.events = state.report.events.slice(-100);
      state.persist();
    },
    stop(guard, reason, status = 'blocked') {
      state.denied.set(guard, { status, reason });
      state.report.status = status;
      state.report.summary = reason;
      state.record(guard, status, reason);
      return { block: true, reason, terminate: true };
    },
    changedPaths() {
      if (!state.baseline || !state.current) return null;
      return [...new Set([...Object.keys(state.baseline), ...Object.keys(state.current)])]
        .filter(path => state.baseline[path] !== state.current[path]);
    },
    evidenceExists(path) {
      const candidate = canonical(resolve(state.project, path));
      const roots = [state.project, home, ...(state.contract ? [state.contract.artifacts] : [])];
      return existsSync(candidate) && roots.some(root => within(canonical(resolve(root)), candidate));
    },
    saveCheckpoint() {
      const { contract, report } = state;
      report.checkpoint = {
        task_id: report.task_id, role: report.role, attempt: report.attempt,
        objective: contract?.objective || report.objective,
        acceptance_criteria: contract?.context?.pm?.output?.acceptance_criteria || [],
        previous_results: contract ? Object.keys(contract.context) : [],
        owner_response_present: Boolean(contract?.owner_response), last_failure: contract?.last_failure || '',
        contract_path: process.env.AISF_CONTRACT || null,
        changed_paths: state.changedPaths(), scope: state.scope, successful_checks: state.successfulChecks,
        ...state.checkpoint,
      };
      state.persist();
    },
    async approval(ctx, guard, description) {
      // Task text and --answer are never parsed as command authorization.
      if (ctx.hasUI && await ctx.ui.confirm(guard, description)) {
        state.denied.delete(guard);
        state.record(guard, 'approved', 'Owner approved this exact tool call in the Pi confirmation dialog.');
        return;
      }
      return state.stop(guard, 'This operation needs scoped Owner approval. Use an interactive confirmation or perform the approved operation outside the runner, then resume.', 'awaiting_approval');
    },
  };
  return state;
}
