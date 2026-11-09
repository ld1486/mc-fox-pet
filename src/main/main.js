'use strict';

const {
  app, BrowserWindow, ipcMain, screen, Menu, clipboard, globalShortcut, protocol, net, shell, dialog,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const store = require('./store');
const ai = require('./ai');
const i18n = require('./i18n');
const { SKINS, skinById } = require('./skins');

const ROOT = path.resolve(__dirname, '..', '..');
const APP_ICON = path.join(ROOT, 'assets', 'icon.ico');
const IS_WIN = process.platform === 'win32';
/* The pet window never resizes: it is built at twice the design size and the
 * fox grows inside it. Resizing a transparent always-on-top window while the
 * size slider is dragged is what made the toolbar jump around, so the window
 * is deliberately fixed and the renderer scales the model instead. */
const PET_WIN = { width: 940, height: 740 };
const PET_WIN_SCALE = PET_WIN.height / 370;

protocol.registerSchemesAsPrivileged([
  { scheme: 'pet', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let petWin = null;
let panelWin = null;
let dragTimer = null;
let petSize = null;
let dragInfo = null;
const pending = new Map();

const argv = process.argv.slice(1);
function flag(name) {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  if (hit.includes('=')) return hit.slice(hit.indexOf('=') + 1);
  return 'true';
}

function petBounds() {
  return { ...PET_WIN };
}

function clampToDisplay(x, y, w, h) {
  const display = screen.getDisplayNearestPoint({ x: Math.round(x + w / 2), y: Math.round(y + h / 2) });
  const wa = display.workArea;
  /* The window is a fixed size now, so keep all of it on screen — a stray
   * window edge is what would let the fox wander off the display. */
  return {
    x: Math.round(Math.min(Math.max(x, wa.x), wa.x + wa.width - w)),
    y: Math.round(Math.min(Math.max(y, wa.y), wa.y + wa.height - h)),
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function registerProtocol() {
  protocol.handle('pet', async (request) => {
    try {
      const url = new URL(request.url);
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT)) return new Response('forbidden', { status: 403 });
      const res = await net.fetch(pathToFileURL(file).toString());
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      return new Response(res.body, { status: res.status, headers: { 'content-type': type } });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
}

function wireConsole(win, tag) {
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    const where = source ? `${source.split('/').pop()}:${line}` : '';
    console.log(`[${tag}] ${message} ${where}`);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[${tag}] load failed ${code} ${desc} ${url}`);
  });
}

/* ------------------------------------------------------------------ pet window */
function createPetWindow() {
  const cfg = store.get();
  const { width, height } = petBounds();
  const wa = screen.getPrimaryDisplay().workArea;
  const fallback = {
    x: wa.x + wa.width - width - 32,
    y: wa.y + wa.height - height + 6,
  };
  let pos = {
    x: Number.isFinite(cfg.petX) ? cfg.petX : fallback.x,
    y: Number.isFinite(cfg.petY) ? cfg.petY : fallback.y,
  };
  pos = clampToDisplay(pos.x, pos.y, width, height);

  const query = flag('pet-query')
    ? `?${flag('pet-query')}`
    : flag('pet-state')
      ? `?state=${encodeURIComponent(flag('pet-state'))}`
      : '';
  const win = new BrowserWindow({
    width,
    height,
    x: pos.x,
    y: pos.y,
    frame: false,
    thickFrame: false, // no OS resize frame: the pet must never be resizable
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: !!cfg.alwaysOnTop,
    focusable: true,
    show: false,
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'pet.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(!!cfg.alwaysOnTop, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  /* Windows can resize this frameless transparent window on its own when the
   * mouse button goes down (Aero Snap / DPI negotiation). The pet must stay the
   * size it was built with, so snap it back whenever the OS drifts far from it.
   * A few pixels of error are normal rounding on fractional DPI displays. */
  petSize = { width: win.getBounds().width, height: win.getBounds().height };
  win.on('resize', () => {
    if (win.isDestroyed() || !petSize) return;
    const b = win.getBounds();
    if (Math.abs(b.width - petSize.width) > 8 || Math.abs(b.height - petSize.height) > 8) {
      console.log('[pet] resize guard', JSON.stringify(b), '->', petSize.width, petSize.height);
      win.setBounds({ x: b.x, y: b.y, width: petSize.width, height: petSize.height });
    }
  });
  win.loadURL(`pet://app/src/renderer/pet/index.html${query}`);
  win.once('ready-to-show', () => {
    win.showInactive();
    if (flag('place-under-cursor')) {
      const p = screen.getCursorScreenPoint();
      const b = win.getBounds();
      win.setPosition(Math.round(p.x - b.width / 2), Math.round(p.y - b.height / 2));
    }
    if (flag('bounds-log')) {
      const t0 = Date.now();
      const timer = setInterval(() => {
        const b = win.getBounds();
        console.log('[bounds]', Date.now() - t0, JSON.stringify(b), 'zoom', win.webContents.getZoomFactor());
        if (Date.now() - t0 > Number(flag('bounds-log'))) clearInterval(timer);
      }, 250);
    }
    if (flag('shot')) setTimeout(() => captureAndQuit(win, flag('shot')), Number(flag('shot-delay')) || 1500);
  });
  if (flag('pet-eval')) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        win.webContents
          .executeJavaScript(flag('pet-eval'))
          .then((result) => console.log('[pet-eval]', JSON.stringify(result)))
          .catch((err) => console.error('[pet-eval]', err));
      }, 900);
    });
  }
  if (flag('pet-press')) {
    /* Chromium-level synthetic press+jitter, used to reproduce input bugs. */
    win.once('ready-to-show', () => {
      setTimeout(() => {
        const c = win.getContentBounds();
        const x = Math.round(c.width * 0.5);
        const y = Math.round(c.height * 0.62);
        win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
        setTimeout(() => {
          win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
          if (flag('pet-drag')) {
            /* Walk the pointer so the page sees real movement and starts a drag. */
            let step = 0;
            const walk = setInterval(() => {
              step += 1;
              win.webContents.sendInputEvent({
                type: 'mouseMove',
                x: x + step * 6,
                y: y + step * 2,
                button: 'left',
                buttons: 1,
              });
              if (step >= 12) clearInterval(walk);
            }, 40);
            setTimeout(() => {
              clearInterval(walk);
              win.webContents.sendInputEvent({ type: 'mouseUp', x: x + 72, y: y + 24, button: 'left', clickCount: 1 });
            }, Number(flag('pet-press')));
            return;
          }
          let i = 0;
          const jitter = setInterval(() => {
            i += 1;
            win.webContents.sendInputEvent({ type: 'mouseMove', x: x + (i % 2 ? 1 : 0), y, button: 'left', buttons: 1 });
          }, 60);
          setTimeout(() => {
            clearInterval(jitter);
            win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
          }, Number(flag('pet-press')));
        }, 300);
      }, 1200);
    });
  }
  win.on('moved', () => {
    if (dragInfo || fallTimer) return;
    const [x, y] = win.getPosition();
    store.set({ petX: x, petY: y });
  });
  win.on('closed', () => {
    petWin = null;
    app.quit();
  });
  win.webContents.on('render-process-gone', (_e, details) => console.error('[pet] gone', details));
  wireConsole(win, 'pet');
  petWin = win;
  return win;
}

/* -------------------------------------------------------------- panel window */
function createPanelWindow() {
  const cfg = store.get();
  const pane = cfg.panelBounds || {};
  const win = new BrowserWindow({
    width: pane.width || 1000,
    height: pane.height || 720,
    x: pane.x,
    y: pane.y,
    minWidth: 820,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#f6efe4',
    title: '狐狸书桌',
    show: false,
    autoHideMenuBar: true,
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'panel.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadURL('pet://app/src/renderer/panel/index.html');
  win.once('ready-to-show', () => {
    win.show();
    if (flag('panel-shot')) setTimeout(() => captureAndQuit(win, flag('panel-shot')), 1400);
  });
  if (flag('panel-tab')) {
    win.webContents.once('did-finish-load', () => win.webContents.send('panel:tab', flag('panel-tab')));
  }
  if (flag('panel-eval')) {
    win.webContents.once('did-finish-load', () => {
      win.webContents.executeJavaScript(flag('panel-eval')).catch((err) => console.error('[panel-eval]', err));
    });
  }
  win.on('close', () => {
    if (!dragInfo) store.set({ panelBounds: win.getBounds() });
  });
  win.on('closed', () => {
    panelWin = null;
    keepPetBehindPanel(false);
  });
  /* While the desk is open the fox should not float on top of it. */
  win.on('focus', () => keepPetBehindPanel(true));
  win.on('blur', () => keepPetBehindPanel(false));
  win.on('hide', () => keepPetBehindPanel(false));
  wireConsole(win, 'panel');
  panelWin = win;
  return win;
}

/* Drop / restore the always-on-top level of the fox while the desk is focused. */
function keepPetBehindPanel(behind) {
  if (!petWin || petWin.isDestroyed()) return;
  if (behind) petWin.setAlwaysOnTop(false);
  else if (store.get().alwaysOnTop) petWin.setAlwaysOnTop(true, 'screen-saver');
}

function openPanel(tab) {
  if (!panelWin) createPanelWindow();
  if (panelWin.isMinimized()) panelWin.restore();
  panelWin.show();
  panelWin.focus();
  if (tab) panelWin.webContents.send('panel:tab', tab);
}

function broadcast(channel, payload) {
  for (const win of [petWin, panelWin]) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

/* ------------------------------------------------------------------- dragging */
function startDrag() {
  if (!petWin || dragTimer) return;
  stopFall();
  const [sx, sy] = petWin.getPosition();
  const cur = screen.getCursorScreenPoint();
  dragInfo = { sx, sy, cx: cur.x, cy: cur.y, lx: cur.x, t: Date.now(), px: null, py: null };
  dragTimer = setInterval(() => {
    if (!petWin || !dragInfo) return;
    const p = screen.getCursorScreenPoint();
    /* Skip SetWindowPos when the cursor did not move: hammering the window
     * position with identical bounds makes Windows resize it occasionally. */
    const nx = Math.round(dragInfo.sx + p.x - dragInfo.cx);
    const ny = Math.round(dragInfo.sy + p.y - dragInfo.cy);
    if (nx !== dragInfo.px || ny !== dragInfo.py) {
      dragInfo.px = nx;
      dragInfo.py = ny;
      petWin.setPosition(nx, ny);
    }
    const now = Date.now();
    const dt = Math.max(16, now - dragInfo.t) / 1000;
    const vx = (p.x - dragInfo.lx) / dt;
    dragInfo.lx = p.x;
    dragInfo.t = now;
    petWin.webContents.send('pet:drag-velocity', vx);
  }, 8);
}

function stopDrag() {
  if (dragTimer) {
    clearInterval(dragTimer);
    dragTimer = null;
  }
  if (!petWin || !dragInfo) {
    dragInfo = null;
    return;
  }
  dragInfo = null;
  const [x, y] = petWin.getPosition();
  const b = petWin.getBounds();
  const clamped = clampToDisplay(x, y, b.width, b.height);
  petWin.setPosition(clamped.x, clamped.y);
  store.set({ petX: clamped.x, petY: clamped.y });
  petWin.webContents.send('pet:drag-end');
  if (store.get().gravity) setTimeout(startFall, 180);
}

/* ------------------------------------------------------------------- gravity */
/* Optional cartoon gravity: the pet drops until its paws touch the taskbar
 * (the bottom edge of the display work area, which excludes the taskbar). */
const GRAVITY = 3400; // px / s^2
const FEET_RATIO = 0.88; // where the paws sit inside the window (0..1 from top)
let fallTimer = null;
let fallV = 0;

function floorYFor(win) {
  const b = win.getBounds();
  const area = screen.getDisplayMatching(b).workArea;
  return Math.round(area.y + area.height - b.height * FEET_RATIO);
}

function stopFall() {
  if (fallTimer) {
    clearInterval(fallTimer);
    fallTimer = null;
  }
  fallV = 0;
}

function startFall() {
  if (!petWin || petWin.isDestroyed() || fallTimer || dragTimer || !store.get().gravity) {
    console.log('[gravity] skip', {
      win: !!petWin,
      drag: !!dragTimer,
      on: !!store.get().gravity,
    });
    return;
  }
  const [sx, sy] = petWin.getPosition();
  const floor0 = floorYFor(petWin);
  if (sy >= floor0 - 1) {
    console.log('[gravity] already at floor', sy, floor0);
    return;
  }
  console.log('[gravity] falling', sy, '->', floor0);
  petWin.webContents.send('pet:command', 'falling');
  let last = Date.now();
  fallTimer = setInterval(() => {
    if (!petWin || petWin.isDestroyed() || dragTimer || !store.get().gravity) {
      stopFall();
      return;
    }
    const now = Date.now();
    const dt = Math.min(0.05, Math.max(0.008, (now - last) / 1000));
    last = now;
    const floor = floorYFor(petWin);
    const [x, y] = petWin.getPosition();
    fallV = Math.min(3400, fallV + GRAVITY * dt);
    const ny = y + fallV * dt;
    if (ny >= floor) {
      petWin.setPosition(x, floor);
      stopFall();
      store.set({ petX: x, petY: floor });
      petWin.webContents.send('pet:command', 'landed');
      return;
    }
    petWin.setPosition(x, Math.round(ny));
  }, 16);
}

function applyGravity(on) {
  store.set({ gravity: !!on });
  broadcast('settings:changed', store.get());
  if (on) startFall();
  else stopFall();
}

/* ---------------------------------------------------------------- mouth item */
const ITEMS = [
  { id: 'none', label: '不叼东西' },
  { id: 'emerald', label: '绿宝石' },
  { id: 'chicken', label: '生鸡肉' },
  { id: 'cooked_chicken', label: '熟鸡肉' },
  { id: 'rabbit', label: '生兔肉' },
  { id: 'rabbit_foot', label: '兔脚' },
  { id: 'egg', label: '鸡蛋' },
  { id: 'wheat', label: '小麦' },
];

function applyItem(id) {
  const item = ITEMS.find((i) => i.id === id) || ITEMS[0];
  store.set({ item: item.id });
  broadcast('item:changed', item.id);
  if (petWin && item.id !== 'none') petWin.webContents.send('pet:say', i18n.t('pet.item'));
}

/* Localised copies handed to the renderers and native menus. */
function localizedSkins() {
  return SKINS.map((s) => ({ ...s, name: i18n.t(`skin.${s.id}`), desc: i18n.t(`skin.${s.id}.desc`) }));
}

function localizedItems() {
  return ITEMS.map((i) => ({ ...i, label: i18n.t(`item.${i.id}`) }));
}

function localizedPersonas() {
  return ai.PERSONAS;
}

/* ------------------------------------------------------------------ pet menu */
function showPetMenu() {
  const cfg = store.get();
  const t = i18n.t;
  const skinItems = localizedSkins().map((s) => ({
    label: s.name,
    type: 'radio',
    checked: cfg.skin === s.id,
    click: () => applySkin(s.id),
  }));
  const itemItems = localizedItems().map((it) => ({
    label: it.label,
    type: 'radio',
    checked: (cfg.item || 'none') === it.id,
    click: () => applyItem(it.id),
  }));
  const menu = Menu.buildFromTemplate([
    { label: t('menu.panel'), accelerator: 'CmdOrCtrl+Shift+Space', click: () => openPanel('chat') },
    { label: t('menu.write'), click: () => openPanel('write') },
    { label: t('menu.fox'), click: () => openPanel('fox') },
    { type: 'separator' },
    { label: t('menu.skin'), submenu: skinItems },
    {
      label: t('menu.size'),
      click: () => petWin?.webContents.send('pet:command', 'open-size'),
    },
    {
      label: t('menu.view'),
      click: () => petWin?.webContents.send('pet:command', 'open-view'),
    },
    { label: t('menu.item'), submenu: itemItems },
    { type: 'separator' },
    {
      label: t('menu.sleep'),
      click: () => petWin?.webContents.send('pet:command', 'toggle-sleep'),
    },
    {
      label: t('menu.gravity'),
      type: 'checkbox',
      checked: !!cfg.gravity,
      click: (item) => applyGravity(item.checked),
    },
    {
      label: t('menu.sound'),
      type: 'checkbox',
      checked: !!cfg.sound,
      click: (item) => {
        store.set({ sound: item.checked });
        broadcast('settings:changed', store.get());
      },
    },
    {
      label: t('menu.top'),
      type: 'checkbox',
      checked: !!cfg.alwaysOnTop,
      click: (item) => {
        store.set({ alwaysOnTop: item.checked });
        petWin?.setAlwaysOnTop(item.checked, 'screen-saver');
        broadcast('settings:changed', store.get());
      },
    },
    { type: 'separator' },
    { label: t('menu.quit'), click: () => app.quit() },
  ]);
  menu.popup({ window: petWin });
}

function applySkin(id) {
  const skin = skinById(id);
  store.set({ skin: skin.id });
  broadcast('skin:changed', skin);
  if (petWin) {
    petWin.webContents.send('pet:say', i18n.t('pet.skin', { name: i18n.t(`skin.${skin.id}`) }));
  }
}

function applyScale(scale) {
  const s = Math.max(0.5, Math.min(2, Number(scale) || 1));
  store.set({ scale: s });
  /* The window stays put; only the renderer scales the fox. */
  broadcast('settings:changed', store.get());
}

/* Look direction of the camera, driven by the two sliders in the pet window. */
function applyView(view) {
  const next = store.set({ view: { yaw: Number(view?.yaw ?? store.get().view.yaw), pitch: Number(view?.pitch ?? store.get().view.pitch) } });
  broadcast('settings:changed', next);
}

/* ---------------------------------------------------------------------- IPC */
function wireIpc() {
  const boot = () => ({
    settings: store.get(),
    skins: localizedSkins(),
    items: localizedItems(),
    personas: localizedPersonas(),
    lang: i18n.current(),
    dict: i18n.dict(i18n.current()),
    configPath: store.configPath(),
    platform: process.platform,
  });

  ipcMain.handle('app:bootstrap', () => boot());

  ipcMain.handle('settings:set', (_e, patch) => {
    const next = store.set(patch || {});
    if ('scale' in (patch || {})) applyScale(next.scale);
    if ('alwaysOnTop' in (patch || {})) petWin?.setAlwaysOnTop(!!next.alwaysOnTop, 'screen-saver');
    if ('skin' in (patch || {})) broadcast('skin:changed', skinById(next.skin));
    broadcast('settings:changed', next);
    if ('language' in (patch || {})) {
      const fresh = boot();
      broadcast('i18n:changed', { lang: fresh.lang, dict: fresh.dict, skins: fresh.skins, items: fresh.items });
      petWin?.webContents.reload();
      panelWin?.webContents.reload();
    }
    return next;
  });

  ipcMain.handle('view:set', (_e, view) => {
    applyView(view);
    return store.get().view;
  });

  ipcMain.handle('settings:open-folder', () => {
    shell.showItemInFolder(store.configPath());
  });

  ipcMain.handle('clipboard:read', () => clipboard.readText());
  ipcMain.handle('clipboard:write', (_e, text) => clipboard.writeText(String(text ?? '')));

  ipcMain.handle('panel:open', (_e, tab) => openPanel(tab));
  ipcMain.handle('panel:minimize', () => panelWin?.minimize());
  ipcMain.handle('panel:close', () => panelWin?.close());
  ipcMain.handle('panel:pick-fox', () => {
    if (!petWin) return;
    petWin.show();
    petWin.focus();
    petWin.webContents.send('pet:command', 'wave');
  });
  ipcMain.handle('app:quit', () => app.quit());
  ipcMain.handle('app:version', () => app.getVersion());

  ipcMain.handle('ai:write', async (event, req) => {
    const id = req?.id || `w${Date.now()}`;
    const controller = new AbortController();
    pending.set(id, controller);
    try {
      const cfg = store.get();
      const text = await ai.write({
        api: cfg.api,
        text: String(req?.text || ''),
        action: req?.action || 'continue',
        style: req?.style || cfg.writingStyle,
        temperature: req?.temperature,
        signal: controller.signal,
        onDelta: (delta) => {
          if (!event.sender.isDestroyed()) event.sender.send('ai:delta', { id, text: delta });
        },
      });
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    } finally {
      pending.delete(id);
    }
  });

  ipcMain.handle('ai:suggest', async (event, req) => {
    const id = req?.id || `s${Date.now()}`;
    const controller = new AbortController();
    pending.set(id, controller);
    try {
      const cfg = store.get();
      const replies = await ai.suggestReplies({
        api: cfg.api,
        conversation: String(req?.conversation || ''),
        persona: req?.persona || cfg.chatPersona,
        count: Number(req?.count) || 3,
        signal: controller.signal,
        onDelta: (delta) => {
          if (!event.sender.isDestroyed()) event.sender.send('ai:delta', { id, text: delta });
        },
      });
      return { ok: true, replies };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    } finally {
      pending.delete(id);
    }
  });

  /* Talk to the fox itself — same streaming path as the writer. */
  ipcMain.handle('fox:chat', async (event, req) => {
    const id = req?.id || `f${Date.now()}`;
    const controller = new AbortController();
    pending.set(id, controller);
    try {
      const cfg = store.get();
      if (!cfg.api.apiKey) throw new Error(i18n.t('set.badKey'));
      const text = await ai.foxChat({
        api: cfg.api,
        messages: Array.isArray(req?.messages) ? req.messages : [],
        lang: i18n.current(),
        signal: controller.signal,
        onDelta: (delta) => {
          if (!event.sender.isDestroyed()) event.sender.send('ai:delta', { id, text: delta });
        },
      });
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    } finally {
      pending.delete(id);
    }
  });

  ipcMain.handle('ai:test', async () => {
    try {
      const cfg = store.get();
      const text = await ai.test({ api: cfg.api });
      return { ok: true, text };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  /* works with unsaved form values, so the picker can probe before saving */
  ipcMain.handle('ai:models', async (_e, apiOverride) => {
    try {
      const api = { ...store.get().api, ...(apiOverride || {}) };
      const models = await ai.listModels({ api });
      return { ok: true, models };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.handle('ai:balance', async (_e, apiOverride) => {
    try {
      const api = { ...store.get().api, ...(apiOverride || {}) };
      const infos = await ai.balance({ api });
      return { ok: true, infos };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });

  ipcMain.on('ai:cancel', (_e, id) => {
    const c = pending.get(id);
    if (c) c.abort();
  });

  /* pet window */
  ipcMain.on('pet:ignore-mouse', (_e, ignore) => {
    if (!petWin) return;
    if (ignore) petWin.setIgnoreMouseEvents(true, { forward: true });
    else petWin.setIgnoreMouseEvents(false);
  });
  ipcMain.on('pet:drag-start', () => startDrag());
  ipcMain.on('pet:drag-end', () => stopDrag());
  ipcMain.on('pet:context-menu', () => showPetMenu());
  ipcMain.on('pet:say', (_e, text) => {
    if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.send('pet:mood', text);
  });
  ipcMain.on('set-skin', (_e, id) => applySkin(id));
  ipcMain.on('set-scale', (_e, s) => applyScale(s));
  ipcMain.on('set-item', (_e, id) => applyItem(id));
  ipcMain.on('pet:command', (_e, cmd) => {
    if (cmd === 'open-panel') openPanel('write');
  });
}

/* ----------------------------------------------------------------- hotkeys */
function registerHotkeys() {
  if (!store.get().hotkeys) return;
  const handlers = [
    ['CommandOrControl+Shift+Space', () => {
      openPanel('chat');
      const text = clipboard.readText();
      if (text) panelWin?.webContents.send('panel:prefill', { tab: 'chat', text });
    }],
    ['CommandOrControl+Shift+W', () => {
      openPanel('write');
      const text = clipboard.readText();
      if (text) panelWin?.webContents.send('panel:prefill', { tab: 'write', text });
    }],
    ['CommandOrControl+Shift+F', () => {
      if (!petWin) return;
      petWin.isVisible() ? petWin.hide() : petWin.showInactive();
    }],
  ];
  for (const [accel, fn] of handlers) {
    try {
      globalShortcut.register(accel, fn);
    } catch (err) {
      console.warn('[hotkey] failed', accel, err.message);
    }
  }
}

/* ---------------------------------------------------------------- screenshots */
async function captureAndQuit(win, target) {
  try {
    const image = await win.webContents.capturePage();
    const out = path.resolve(ROOT, target);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, image.toPNG());
    console.log('[shot] wrote', out);
  } catch (err) {
    console.error('[shot] failed', err);
  }
  app.exit(0);
}

/* --------------------------------------------------------------------- boot */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => openPanel('write'));
  app.whenReady().then(() => {
    registerProtocol();
    wireIpc();
    if (!fs.existsSync(store.configPath())) store.set({}); // materialise config.json on first run
    createPetWindow();
    registerHotkeys();
    if (store.get().gravity) setTimeout(startFall, 600);
    if (flag('panel-shot')) createPanelWindow();
    if (!flag('shot') && !flag('panel-shot')) {
      // panel stays closed until asked; give a hint on first run
      if (!store.get().api.apiKey) openPanel('settings');
    }
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('before-quit', () => {
    if (petWin) {
      const [x, y] = petWin.getPosition();
      store.set({ petX: x, petY: y });
    }
  });
}

module.exports = { openPanel };
