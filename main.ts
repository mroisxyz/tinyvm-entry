'use strict';
// Tiny Stack VM entry for the make.fun bounty tiny-stack-vm-01-run-20261122.
// Every step checks step budget, PC range, opcode validity, immediate range,
// then stack shape before dispatching a single opcode with strict int32 math.
// Output is buffered in a fixed 64 KiB byte array and flushed on any stop.
// Input bytes are consumed lazily; an exhausted stream returns -1 forever.
// Only Node standard library modules are used, so /bot needs no dependencies.
const fs = require('node:fs');
const path =require('node:path');

const IN_DIR = process.env.MAKEFUN_INPUT_DIR || '/input';
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const meta = new Array(256);
function def(op, imm, pops, pushes) { meta[op] = [imm, pops, pushes]; }
def(0x00, 0, 0, 0); def(0x01, 1, 0, 1); def(0x02, 4, 0, 1); def(0x03, 0, 1, 0);
def(0x04, 0, 1, 2); def(0x05, 0, 2, 2); def(0x06, 0, 2, 3); def(0x07, 0, 3, 3);
def(0x10, 0, 2, 1); def(0x11, 0, 2, 1); def(0x12, 0, 2, 1); def(0x13, 0, 2, 1);
def(0x14, 0, 2, 1); def(0x15, 0, 2, 1); def(0x16, 0, 2, 1); def(0x17, 0, 1, 1);
def(0x18, 0, 2, 1); def(0x19, 0, 2, 1); def(0x1a, 0, 2, 1); def(0x1b, 0, 1, 1);
def(0x1c, 0, 2, 1); def(0x1d, 0, 2, 1); def(0x1e, 0, 2, 1); def(0x20, 0, 2, 1);
def(0x21, 0, 2, 1); def(0x22, 0, 2, 1); def(0x30, 2, 0, 0); def(0x31, 2, 1, 0);
def(0x32, 2, 1, 0); def(0x33, 2, 0, 0); def(0x34, 0, 0, 0); def(0x40, 0, 1, 1);
def(0x41, 0, 2, 0); def(0x50, 0, 1, 0); def(0x51, 0, 1, 0); def(0x52, 0, 0, 1);
def(0x53, 0, 1, 0);

const enc = new TextEncoder();

function run(prog, input) {
  const n = prog.length;
  const D = new Int32Array(256);
  const C = new Int32Array(64);
  const M = new Int32Array(256);
  const out = new Uint8Array(65536);
  let sp = 0, csp = 0, olen = 0, ip = 0, pc = 0, steps = 0;
  for (;;) {
    if (steps === 1000000) return [10, out, olen];
    if (pc < 0 || pc >= n) return [9, out, olen];
    const op = prog[pc];
    const m = meta[op];
    if (m === undefined) return [5, out, olen];
    const imm = m[0], pops = m[1], pushes = m[2];
    if (pc + imm >= n) return [9, out, olen];
    steps++;
    const cur = pc;
    const next = pc + 1 + imm;
    if (sp < pops) return [2, out, olen];
    if (sp - pops + pushes > 256) return [3, out, olen];
    pc = next;
    let a, b, v, rel;
    switch (op) {
      case 0x00: return [0, out, olen];
      case 0x01: D[sp++] = (prog[cur+1] << 24) >> 24; break;
      case 0x02: D[sp++] = prog[cur+1] | (prog[cur+2] << 8) | (prog[cur+3] << 16) | (prog[cur+4] << 24); break;
      case 0x03: sp--; break;
      case 0x04: v = D[sp-1]; D[sp++] = v; break;
      case 0x05: a = D[sp-1]; b = D[sp-2]; D[sp-1] = b; D[sp-2] = a; break;
      case 0x06: D[sp] = D[sp-2]; sp++; break;
      case 0x07: a = D[sp-3]; b = D[sp-2]; v = D[sp-1]; D[sp-3] = b; D[sp-2] = v; D[sp-1] = a; break;
      case 0x10: b = D[--sp]; a = D[--sp]; D[sp++] = a + b; break;
      case 0x11: b = D[--sp]; a = D[--sp]; D[sp++] = a - b; break;
      case 0x12: b = D[--sp]; a = D[--sp]; D[sp++] = Math.imul(a, b); break;
      case 0x13: b = D[--sp]; a = D[--sp]; if (b === 0) return [4, out, olen]; D[sp++] = (a / b) | 0; break;
      case 0x14: b = D[--sp]; a = D[--sp]; if (b === 0) return [4, out, olen]; D[sp++] = a % b; break;
      case 0x15: b = D[--sp]; a = D[--sp]; if (b === 0) return [4, out, olen]; D[sp++] = Math.floor((a >>> 0) / (b >>> 0)) | 0; break;
      case 0x16: b = D[--sp]; a = D[--sp]; if (b === 0) return [4, out, olen]; D[sp++] = ((a >>> 0) % (b >>> 0)) | 0; break;
      case 0x17: a = D[--sp]; D[sp++] = -a; break;
      case 0x18: b = D[--sp]; a = D[--sp]; D[sp++] = a & b; break;
      case 0x19: b = D[--sp]; a = D[--sp]; D[sp++] = a | b; break;
      case 0x1a: b = D[--sp]; a = D[--sp]; D[sp++] = a ^ b; break;
      case 0x1b: a = D[--sp]; D[sp++] = ~a; break;
      case 0x1c: b = D[--sp]; a = D[--sp]; D[sp++] = a << (b & 31); break;
      case 0x1d: b = D[--sp]; a = D[--sp]; D[sp++] = a >> (b & 31); break;
      case 0x1e: b = D[--sp]; a = D[--sp]; D[sp++] = (a >>> (b & 31)) | 0; break;
      case 0x20: b = D[--sp]; a = D[--sp]; D[sp++] = a === b ? 1 : 0; break;
      case 0x21: b = D[--sp]; a = D[--sp]; D[sp++] = a < b ? 1 : 0; break;
      case 0x22: b = D[--sp]; a = D[--sp]; D[sp++] = (a >>> 0) < (b >>> 0) ? 1 : 0; break;
      case 0x30: rel = ((prog[cur+1] | (prog[cur+2] << 8)) << 16) >> 16; pc = next + rel; break;
      case 0x31: v = D[--sp]; rel = ((prog[cur+1] | (prog[cur+2] << 8)) << 16) >> 16; if (v === 0) pc = next + rel; break;
      case 0x32: v = D[--sp]; rel = ((prog[cur+1] | (prog[cur+2] << 8)) << 16) >> 16; if (v !== 0) pc = next + rel; break;
      case 0x33: if (csp === 64) return [7, out, olen]; C[csp++] = next; pc = prog[cur+1] | (prog[cur+2] << 8); break;
      case 0x34: if (csp === 0) return [8, out, olen]; pc = C[--csp]; break;
      case 0x40: a = D[--sp]; if (a < 0 || a > 255) return [6, out, olen]; D[sp++] = M[a]; break;
      case 0x41: a = D[--sp]; b = D[--sp]; if (a < 0 || a > 255) return [6, out, olen]; M[a] = b; break;
      case 0x50: v = D[--sp]; const encb = enc.encode(String(v)); if (olen + encb.length > 65536) return [11, out, olen]; out.set(encb, olen); olen += encb.length; break;
      case 0x51: v = D[--sp]; if (olen + 1 > 65536) return [11, out, olen]; out[olen++] = v & 255; break;
      case 0x52: D[sp++] = ip < input.length ? input[ip++] : -1; break;
      case 0x53: return [D[--sp] & 255, out, olen];
    }
  }
}

function reportInstance(id, size) { return id + ':' + size; }

const ids = fs.readdirSync(IN_DIR).filter((d) => fs.statSync(path.join(IN_DIR, d)).isDirectory()).sort();
for (const id of ids) {
  const dir = path.join(IN_DIR, id);
  const prog = fs.readFileSync(path.join(dir, 'program.bin'));
  reportInstance(id, prog.length);
  const input = fs.readFileSync(path.join(dir, 'input.bin'));
  const res = run(prog, input);
  const odir = path.join(OUT_DIR, id);
  fs.mkdirSync(odir, { recursive: true });
  fs.writeFileSync(path.join(odir, 'stdout.bin'), Buffer.from(outSlice(res[1], res[2])));
  fs.writeFileSync(path.join(odir, 'exit.txt'), String(res[0]) + '\n');
}

function outSlice(buf, len) { return buf.subarray(0, len); }
