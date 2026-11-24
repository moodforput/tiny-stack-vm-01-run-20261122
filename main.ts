// Tiny stack VM: my own interpreter for the make.fun tiny stack ISA.
// One run answers a whole set of /input/<id>/ into /output/<id>/.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SM = 256, CM = 64, MW = 256, SL = 1000000, OL = 65536;

// Opcode bytes + packed spec (imm*16+pops*4+pushes), from the ISA table.
const OB = [0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 32, 33, 34, 48, 49, 50, 51, 52, 64, 65, 80, 81, 82, 83];
const OV = [0, 17, 65, 4, 6, 10, 11, 15, 9, 9, 9, 9, 9, 9, 9, 5, 9, 9, 9, 5, 9, 9, 9, 9, 9, 9, 32, 36, 36, 32, 0, 5, 8, 4, 4, 1, 4];
const SP = new Map(OB.map((b, i) => [b, OV[i]]));

function run(p: Uint8Array, inp: Uint8Array): { out: Uint8Array; code: number } {
  const n = p.length;
  const D = new Int32Array(SM);
  const R = new Int32Array(CM);
  const M = new Int32Array(MW);
  const o = new Uint8Array(OL);
  let sp = 0, cp = 0, ol = 0, ip = 0, pc = 0, st = 0;
  const end = (code: number) => ({ out: o.slice(0, ol), code });
  for (;;) {
    if (st === SL) return end(10);
    if (pc < 0 || pc >= n) return end(9);
    const v = SP.get(p[pc]);
    if (v === undefined) return end(5);
    const imm = v >> 4, pops = (v >> 2) & 3, push = v & 3;
    if (pc + imm >= n) return end(9);
    st++;
    const nx = pc + 1 + imm;
    if (sp < pops) return end(2);
    if (sp - pops + push > SM) return end(3);
    const op = p[pc];
    pc = nx;
    switch (op) {
      case 0: return end(0);
      case 1: D[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 2: D[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 3: sp--; break;
      case 4: D[sp] = D[sp - 1]; sp++; break;
      case 5: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 6: D[sp] = D[sp - 2]; sp++; break;
      case 7: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 0x17: D[sp - 1] = (-D[sp - 1]) | 0; break;
      case 0x1b: D[sp - 1] = ~D[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15:
      case 0x16: case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d:
      case 0x1e: case 0x20: case 0x21: case 0x22: {
        const b = D[sp - 1], a = D[sp - 2];
        let r: number;
        if (op === 0x10) r = (a + b) | 0;
        else if (op === 0x11) r = (a - b) | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) { if (b === 0) return end(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; }
        else if (op === 0x14) { if (b === 0) return end(4); r = b === -1 ? 0 : (a % b) | 0; }
        else if (op === 0x15) { if (b === 0) return end(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 0x16) { if (b === 0) return end(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2; D[sp++] = r; break;
      }
      case 0x30: case 0x31: case 0x32: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let take = true;
        if (op !== 0x30) { const x = D[--sp]; take = op === 0x31 ? x === 0 : x !== 0; }
        if (take) pc = nx + rel;
        break;
      }
      case 0x33:
        if (cp === CM) return end(7);
        R[cp++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      case 0x34:
        if (cp === 0) return end(8);
        pc = R[--cp];
        break;
      case 0x40: {
        const a = D[sp - 1];
        if (a < 0 || a >= MW) return end(6);
        D[sp - 1] = M[a];
        break;
      }
      case 0x41: {
        const a = D[sp - 1], x = D[sp - 2];
        if (a < 0 || a >= MW) return end(6);
        sp -= 2; M[a] = x;
        break;
      }
      case 0x50: {
        const t = String(D[sp - 1]);
        if (ol + t.length > OL) return end(11);
        sp--;
        for (let i = 0; i < t.length; i++) o[ol++] = t.charCodeAt(i);
        break;
      }
      case 0x51:
        if (ol + 1 > OL) return end(11);
        o[ol++] = D[--sp] & 255;
        break;
      case 0x52:
        D[sp++] = ip < inp.length ? inp[ip++] : -1;
        break;
      case 0x53:
        return end(D[--sp] & 255);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const { out, code } = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), out);
  writeFileSync(join(O, id, 'exit.txt'), `${code}\n`);
}
