import { basename } from 'node:path';

// A bounded shell subset, not an interpreter: preserve quoted arguments as single
// words, and never infer successful verification through unsupported syntax.
function shellWords(command) {
  const commands = [];
  const operators = [];
  let words = [], word = '', started = false, quote = '', unsupported = false, expansion = false;
  const flush = () => {
    if (started) words.push(word);
    word = '';
    started = false;
  };
  const source = command.trim();
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '\\' && quote !== "'") {
      const next = source[++i];
      if (next === undefined) { unsupported = true; break; }
      if (next === '\n') continue;
      if (quote === '"' && !['$', '`', '"', '\\'].includes(next)) word += '\\';
      word += next;
      started = true;
    } else if (quote) {
      if (char === quote) quote = '';
      else {
        if (quote === '"' && /[$`]/.test(char)) expansion = true;
        word += char;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (char === '#' && !started) {
      while (i < source.length && source[i] !== '\n') i++;
      i--;
    } else if (/[;&|\n]/.test(char)) {
      flush();
      commands.push(words);
      words = [];
      let operator = char;
      if ((char === '&' || char === '|') && source[i + 1] === char) operator += source[++i];
      operators.push(operator);
    } else if (/\s/.test(char)) {
      flush();
    } else {
      if (/[$`(){}<>]/.test(char)) unsupported = true;
      if (/[$`]/.test(char)) expansion = true;
      word += char;
      started = true;
    }
  }
  flush();
  commands.push(words);
  return { commands, operators, unsupported: unsupported || Boolean(quote), expansion };
}

function invocation(words) {
  let index = 0;
  while (/^[A-Za-z_][A-Za-z_0-9]*=/.test(words[index] || '')) index++;
  return { executable: basename(words[index] || ''), args: words.slice(index + 1) };
}

function operation(args) {
  let index = 0;
  while (args[index]?.startsWith('-')) {
    if (args[index] === '--') return args.slice(index + 1);
    const takesValue = /^(?:--prefix|--cwd|--dir|-C|--cache|--registry|--userconfig|--config|--project)$/.test(args[index]);
    index += takesValue ? 2 : 1;
  }
  return args.slice(index);
}

export function classifyShell(command) {
  const parsed = shellWords(command);
  const calls = parsed.commands.map(invocation);
  let opaque = parsed.unsupported || parsed.expansion;
  const dependency = calls.some(({ executable, args }) => {
    // Preserve conservative matching for nested interpreters and wrappers.
    if (/^(?:bash|sh|dash|zsh|eval|exec|command|env)$/.test(executable)) opaque = true;
    if (/^(?:npx|bunx|pipx)$/.test(executable)) return true;
    if (!/^(?:npm|pnpm|yarn|bun|pip3?|uv|cargo|gem|go)$/.test(executable)) return false;
    // Options may consume values and managers have nested subcommands (uv pip).
    // Stay conservative inside a real manager invocation, never inside printf data.
    return args.some(arg => /^(?:install|ci|add|get|update|upgrade|dlx|exec|x)$/.test(arg));
  });
  const fallback = opaque && /\b(?:npm|pnpm|yarn|bun|pip3?|uv|cargo|gem|go)\s+(?:[^;&|\n]*\s)?(?:install|ci|add|get|update|upgrade|dlx|exec)\b|(?:^|[;&|\n])\s*(?:npx|bunx|pipx)\b/.test(command);
  const { executable, args } = calls.at(-1);
  const [verb, script] = operation(args);
  const scriptCheck = value => /^(?:test|check|lint|typecheck)(?::[\w.-]+)?$/.test(value || '');
  const check = /^(?:test|\[|pytest|pytest3|tsc|eslint)$/.test(executable)
    || (/^python(?:3(?:\.\d+)?)?$/.test(executable) && args[0] === '-m' && /^(?:pytest|unittest)$/.test(args[1] || ''))
    || (executable === 'node' && /^--(?:test|check)$/.test(args[0] || ''))
    || (/^(?:npm|pnpm|yarn|bun)$/.test(executable) && (scriptCheck(verb) || (verb === 'run' && scriptCheck(script))))
    || (executable === 'go' && verb === 'test')
    || (executable === 'cargo' && /^(?:test|check|clippy)$/.test(verb || ''))
    || (executable === 'ruff' && verb === 'check');
  return {
    dependency: dependency || fallback,
    // OR, pipes, background jobs, and semicolon lists can mask/skip failures.
    // Only a final check in a simple command or AND chain proves its exit status.
    verification: !parsed.unsupported && parsed.operators.every(operator => operator === '&&') && check
      && !args.some(arg => /^(?:--help|-h|--version)$/.test(arg)),
  };
}
