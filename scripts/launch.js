#!/usr/bin/env node
/* Starts the Electron app with a clean environment.
 *
 * Some shells (CI images, IDE integrations, the harness this was built in)
 * export ELECTRON_RUN_AS_NODE=1, which makes electron.exe behave like plain
 * node and crash on `protocol.registerSchemesAsPrivileged`.  Clearing it here
 * means `npm start` works everywhere.
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

let bin;
try {
  bin = require('electron');
} catch {
  console.error('[launch] 找不到 electron，请先运行: npm install');
  process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const extra = process.argv.slice(2);
const child = spawn(bin, [root, ...extra], { cwd: root, env, stdio: 'inherit' });
child.on('close', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('[launch] 启动失败:', err.message);
  process.exit(1);
});
