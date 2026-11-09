/* Build one installer with a fixed default UI language.
 *
 *   node scripts/dist.js zh   -> dist\fox-desk-setup-1.0.0.exe        (狐狸书桌, 默认中文)
 *   node scripts/dist.js en   -> dist\fox-desk-en-setup-1.0.0.exe     (Fox Desk, English by default)
 *
 * electron-builder needs `pnpm` (or npm) on PATH to collect production deps;
 * on this machine pnpm lives outside PATH, so we prepend .inspect\bin.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const lang = process.argv[2] === 'en' ? 'en' : 'zh';
const root = path.resolve(__dirname, '..');
const node = process.execPath;
const cli = path.join(root, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');

const name = lang === 'en' ? 'Fox Desk' : '狐狸书桌';
/* electron-builder builds and then runs the uninstaller through a path that is
 * derived from productName. A space in it ("Fox Desk") makes that spawn fail
 * with `spawn UNKNOWN`, so the installer is built under a space-free product
 * name and only the display name / packaged metadata keep the space. */
const productName = lang === 'en' ? 'FoxDesk' : '狐狸书桌';
const artifact = `fox-desk-${lang === 'en' ? 'en-' : ''}setup-\${version}.\${ext}`;

const args = [
  cli,
  '--win',
  'nsis',
  '-c.productName=' + productName,
  '-c.extraMetadata.defaultLang=' + lang,
  '-c.extraMetadata.productName=' + name,
  '-c.win.artifactName=' + artifact,
  '-c.nsis.artifactName=' + artifact,
  '-c.nsis.shortcutName=' + name,
  '-c.nsis.uninstallDisplayName=' + name,
];

const env = {
  ...process.env,
  ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR: 'https://npmmirror.com/mirrors/electron-builder-binaries/',
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  PATH: path.join(root, '.inspect', 'bin') + path.delimiter + (process.env.PATH || ''),
};

console.log(`[dist] ${name} (defaultLang=${lang})`);
const r = spawnSync(node, args, { cwd: root, env, stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
