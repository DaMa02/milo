import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This file belongs in <repository>/scripts/check-contracts.mjs.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const validator = join(repoRoot, 'contracts', 'validate.py');
const probe = [
  'import sys',
  'if sys.version_info < (3, 9):',
  '    sys.exit("Python 3.9 or newer is required.")',
  'try:',
  '    import jsonschema',
  'except ImportError:',
  '    sys.exit("jsonschema is missing from this Python environment.")',
].join('\n');

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function venvPython(directory) {
  return process.platform === 'win32'
    ? join(directory, 'Scripts', 'python.exe')
    : join(directory, 'bin', 'python');
}

function probePython(command) {
  const result = spawnSync(command, ['-c', probe], {
    cwd: repoRoot,
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
    timeout: 10_000,
  });
  if (!result.error && result.status === 0) return null;
  if (result.error) {
    if (result.error.code === 'ENOENT') return 'executable not found';
    if (result.error.code === 'ETIMEDOUT') return 'Python check timed out after 10 seconds';
    return result.error.message;
  }
  return result.stderr?.trim()
    || `Python check failed (${result.signal ?? `exit ${result.status}`})`;
}

function main() {
  if (!isFile(validator)) {
    console.error(`Contracts validator not found: ${validator}`);
    console.error('Place this launcher in the repository scripts directory.');
    return 1;
  }

  let python;
  if (process.env.BAINSA_PYTHON !== undefined) {
    const supplied = process.env.BAINSA_PYTHON;
    if (!supplied.trim()) {
      console.error('BAINSA_PYTHON is empty. Set it to a Python executable path, or unset it to enable automatic discovery.');
      return 1;
    }
    // Treat the override as one literal executable path, never as a shell command.
    python = resolve(repoRoot, supplied);
    const failure = isFile(python) ? probePython(python) : 'executable file not found';
    if (failure) {
      console.error(`BAINSA_PYTHON (${python}): ${failure}`);
      console.error('Use Python 3.9+ with jsonschema installed, or unset BAINSA_PYTHON to enable automatic discovery.');
      return 1;
    }
  } else {
    const candidates = [];
    if (process.env.VIRTUAL_ENV) {
      candidates.push(venvPython(resolve(repoRoot, process.env.VIRTUAL_ENV)));
    }
    candidates.push(venvPython(join(repoRoot, '.venv')), 'python3', 'python');
    const failures = [];
    for (const candidate of new Set(candidates)) {
      const failure = probePython(candidate);
      if (!failure) {
        python = candidate;
        break;
      }
      failures.push(`${candidate}: ${failure}`);
    }
    if (!python) {
      console.error('No usable Python 3.9+ environment with jsonschema was found.');
      for (const failure of failures) console.error(`  ${failure}`);
      console.error('Install jsonschema in your Python environment and set BAINSA_PYTHON to its executable path if needed. No packages were installed automatically.');
      return 1;
    }
  }

  const result = spawnSync(python, [validator], {
    cwd: repoRoot,
    shell: false,
    windowsHide: true,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`Could not run the contracts validator with ${python}: ${result.error.message}`);
    return 1;
  }
  if (result.status === null) {
    console.error(`Contracts validator terminated by ${result.signal ?? 'an unknown signal'}.`);
    return 1;
  }
  return result.status;
}

process.exitCode = main();
