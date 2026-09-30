// Gauntlet runner: node scripts/gauntlet.mjs small|feature|major   (see docs/GAUNTLET.md)
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const level = process.argv[2] ?? 'small';
const LEVELS = ['small', 'feature', 'major'];
if (!LEVELS.includes(level)) { console.error(`level must be one of ${LEVELS.join(', ')}`); process.exit(2); }
const at = (l) => LEVELS.indexOf(level) >= LEVELS.indexOf(l);
const py = existsSync('.venv/bin/python') ? resolve('.venv/bin/python') : 'python3';
const results = [];

function run(name, cmd, args, opts = {}) {
  const t = Date.now();
  console.log(`\n▶ ${name}: ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  const ok = r.status === 0;
  results.push({ name, ok, s: ((Date.now() - t) / 1000).toFixed(1) });
  if (!ok) throw new StepFailed(name);
}

class StepFailed extends Error {}

function chunkHashes() {
  const dir = 'public/world/chunks';
  const h = createHash('sha256');
  for (const f of readdirSync(dir).sort()) h.update(f).update(readFileSync(join(dir, f)));
  h.update(readFileSync('public/world/roads/graph.json')).update(readFileSync('public/world/businesses.json'));
  return h.digest('hex');
}

function finish(code) {
  console.log('\n══ Gauntlet', level, code ? 'FAILED' : 'PASSED');
  for (const r of results) console.log(`${r.ok ? '✔' : '✘'} ${r.name} (${r.s}s)`);
  process.exit(code);
}

let code = 0;
try {
  run('typecheck', 'npx', ['tsc', '--noEmit']);
  run('unit tests', 'npx', ['vitest', 'run']);
  run('pipeline tests', py, ['-m', 'pytest', '-q', 'pipeline/tests'], { cwd: '.', env: { ...process.env, PYTHONPATH: 'pipeline' } });

  if (at('major')) {
    const before = chunkHashes();
    run('pipeline rebuild', py, ['-m', 'franklin_pipeline', 'build'], { cwd: 'pipeline' });
    const after = chunkHashes();
    const same = before === after;
    results.push({ name: `pipeline determinism (${same ? 'identical' : 'CHANGED'} world output)`, ok: same, s: '0' });
    if (!same) console.warn('World output changed on rebuild: commit it if intended, else investigate nondeterminism.');
    run('geo verification', py, ['-m', 'franklin_pipeline.geo_verify'], { cwd: 'pipeline' });
  }

  if (at('feature')) {
    run('production build', 'npx', ['vite', 'build']);
    run('e2e', 'npx', ['playwright', 'test']);
    mkdirSync('artifacts/gauntlet', { recursive: true });
    const srv = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore', detached: true });
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const views = [
        ['spawn', ''],
        ['aerial', '__franklin.setFly(true); __franklin.setY(80); __franklin.look(200,-35)'],
        ['public-square', '__franklin.teleport(6,-2,0)'],
      ];
      for (const [name, js] of views) run(`screenshot ${name}`, 'node', ['scripts/shot.mjs', `artifacts/gauntlet/${name}.png`, js]);
      if (at('major')) run('perf capture', 'node', ['scripts/perf.mjs']);
    } finally {
      try { process.kill(-srv.pid); } catch { /* already gone */ }
    }
  }
} catch (e) {
  if (!(e instanceof StepFailed)) throw e;
  code = 1;
}
finish(code || (results.every((r) => r.ok) ? 0 : 1));
