// Runs the game server and the Vite client side by side (npm scripts use cmd.exe on Windows,
// so a tiny spawner is more portable than `a & b`).
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = ['server', 'client'].map((ws) =>
  spawn(npm, ['run', 'dev', '-w', ws], { stdio: 'inherit', shell: process.platform === 'win32' }),
);
const stop = () => children.forEach((c) => c.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((c) => c.on('exit', (code) => { if (code) { stop(); process.exit(code); } }));
