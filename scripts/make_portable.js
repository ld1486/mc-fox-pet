/* Builds the "portable + shortcut installer" bundle.
 *
 *   node scripts/make_portable.js zh   -> dist\portable-zh\狐狸书桌
 *   node scripts/make_portable.js en   -> dist\portable-en\Fox Desk
 *
 * Windows 11 with Smart App Control (VerifiedAndReputablePolicyState=1) blocks
 * unsigned executables, including a normal NSIS installer and the repackaged
 * electron.exe that electron-builder produces. The unmodified electron.exe from
 * node_modules is signed and reputable, so the bundle keeps it as the launcher
 * and installs by copying files + creating shortcuts (no unsigned PE runs).
 */
const fs = require('node:fs');
const path = require('node:path');

const lang = process.argv[2] === 'en' ? 'en' : 'zh';
const name = lang === 'en' ? 'Fox Desk' : '狐狸书桌';

const ROOT = path.resolve(__dirname, '..');
const ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');
const OUT = path.join(ROOT, 'dist', 'portable-' + lang, name);
const APP = path.join(OUT, 'resources', 'app');

if (!fs.existsSync(path.join(ELECTRON_DIST, 'electron.exe'))) {
  console.error('缺少 node_modules/electron/dist，先运行: node node_modules/electron/install.js');
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(ELECTRON_DIST, OUT, { recursive: true });

fs.mkdirSync(APP, { recursive: true });
for (const item of ['src', 'assets']) {
  fs.cpSync(path.join(ROOT, item), path.join(APP, item), { recursive: true });
}

/* Ship a package.json whose productName / defaultLang match this build. */
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
pkg.productName = name;
pkg.defaultLang = lang;
fs.writeFileSync(path.join(APP, 'package.json'), JSON.stringify(pkg, null, 2) + '\n', 'utf8');

const files =
  lang === 'en'
    ? ['install.cmd', '卸载.cmd', 'install.ps1', 'uninstall.ps1', 'README.txt']
    : ['安装快捷方式.cmd', '卸载.cmd', 'install.ps1', 'uninstall.ps1', '使用说明.txt'];
for (const f of files) {
  fs.copyFileSync(path.join(ROOT, 'packaging', f), path.join(OUT, f));
}
if (lang === 'en') {
  // keep the Chinese entry point too, so both audiences can double-click
  fs.copyFileSync(path.join(ROOT, 'packaging', '安装快捷方式.cmd'), path.join(OUT, '安装快捷方式.cmd'));
}
if (lang === 'en') {
  fs.copyFileSync(path.join(ROOT, 'packaging', 'README.txt'), path.join(OUT, 'README.txt'));
}

const size = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, ent) => {
    const p = path.join(dir, ent.name);
    return sum + (ent.isDirectory() ? size(p) : fs.statSync(p).size);
  }, 0);

console.log(`portable bundle: ${OUT}`);
console.log(`payload: ${(size(APP) / 1024 / 1024).toFixed(1)} MB   total: ${(size(OUT) / 1024 / 1024).toFixed(0)} MB`);
