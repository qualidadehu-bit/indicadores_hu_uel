#!/usr/bin/env node
/**
 * Sobe Worker (8788) + Vite (8787) juntos.
 * Abra http://127.0.0.1:8787 — a plataforma React; /api é proxy para o Worker.
 */
import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];

function run(label, args) {
  const child = spawn(npm, args, {
    stdio: 'inherit',
    shell: isWin,
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    if (signal) return;
    if (code && code !== 0) {
      console.error(`[dev-full] ${label} encerrou com código ${code}`);
      shutdown(code);
    }
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('[dev-full] Worker API → http://127.0.0.1:8788');
console.log('[dev-full] Plataforma  → http://127.0.0.1:8787');

run('worker', ['run', 'cf:dev']);
run('vite', ['run', 'dev:vite']);
