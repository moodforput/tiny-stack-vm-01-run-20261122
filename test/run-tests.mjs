// Test: main.ts on the practice set vs the reference manifest (40 cases).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const K = new URL('../../tiny-stack-vm-01-run-20261122-kit/', import.meta.url).pathname;
const E = new URL('..', import.meta.url).pathname;
const OUT = '/tmp/vm-t-out';
const man = JSON.parse(readFileSync(join(K, 'practice/reference/manifest.json'), 'utf8'));
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
execFileSync(process.execPath, [join(E, 'main.ts')], { env: { ...process.env, MAKEFUN_INPUT_DIR: join(K, 'practice/input'), MAKEFUN_OUTPUT_DIR: OUT }, stdio: 'pipe' });
let f = 0;
for (const inst of man.instances) {
  const want = Buffer.from(inst.key.stdout, 'base64');
  const got = new Uint8Array(readFileSync(join(OUT, inst.id, 'stdout.bin')));
  const code = Number(readFileSync(join(OUT, inst.id, 'exit.txt'), 'utf8'));
  if (!Buffer.from(got).equals(want) || code !== inst.key.exit) { f++; console.log('FAIL', inst.id, 'got', code, 'want', inst.key.exit); }
}
console.log(`${man.instances.length - f}/${man.instances.length} practice instances pass`);
if (f) process.exit(1);
