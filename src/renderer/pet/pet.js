import * as THREE from '../vendor/three.module.min.js';
import { buildFox } from './foxmodel.js';
import { FoxAnim } from './anim.js';

const canvas = document.getElementById('scene');
const bubble = document.getElementById('bubble');
const bubbleText = document.getElementById('bubble-text');
const heartsBox = document.getElementById('hearts');
const bar = document.getElementById('bar');
const skinsBox = document.getElementById('skins');
const sizer = document.getElementById('sizer');
const sizeRange = document.getElementById('size-range');
const sizeValue = document.getElementById('size-value');
const toastEl = document.getElementById('toast');

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
/* VIEW is what the two angle sliders edit; the animation states add their own
 * offsets on top so a look at the fox does not fight the sit/sleep framing. */
const VIEW = { yaw: 0.52, pitch: 0.07 };
const CAM = { target: new THREE.Vector3(-1.2, 6.6, 0.6), yaw: VIEW.yaw, pitch: VIEW.pitch, dist: 26 };
const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 240);
/* Size slider compensation: scaling the model pulls its nose closer to the
 * camera, so the camera backs off a little to keep the growth linear. */
let zoomMul = 1;
const camQ = new URLSearchParams(location.search);
if (camQ.has('yaw')) VIEW.yaw = Number(camQ.get('yaw'));
if (camQ.has('pitch')) VIEW.pitch = Number(camQ.get('pitch'));
if (camQ.has('dist')) CAM.dist = Number(camQ.get('dist'));
if (camQ.has('ty')) CAM.target.y = Number(camQ.get('ty'));
/* Manual camera for screenshots must not be overridden by the state easing. */
const camOverride = camQ.has('dist') || camQ.has('ty');
scene.add(camera);

/* ---------------------------------------------------------------- i18n */
let dict = {};
function t(key, vars) {
  let s = dict[key];
  if (s === undefined) return key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
function tlist(key) {
  return t(key).split('|').filter(Boolean);
}

/* Standing, sitting and sleeping poses sit very differently in space (the
 * vanilla sit lifts the head to ~19 model units), so ease the framing between
 * them instead of clipping the ears. */
const FRAMES = {
  stand: { off: 0, dist: 26, pitchOff: 0 },
  sit: { off: 3.2, dist: 30, pitchOff: 0.03 },
  sleep: { off: -2.0, dist: 26, pitchOff: 0.17 },
};
let pitchOff = 0;

/* The window never resizes, so the camera has to do the layout maths: the fox
 * is kept at the same pixel size whatever the window is, and its feet stay on
 * one fixed ground line. Only the model scale changes with the size slider. */
const DESIGN_H = 370;
const GROUND_FRAC = 0.88;

function layoutK() {
  return window.innerHeight / DESIGN_H;
}

function pxPerUnit(dist) {
  const halfH = window.innerHeight / 2;
  return halfH / Math.tan((camera.fov * Math.PI) / 360) / dist;
}

/* World-space height the camera must look at for the feet to land on the
 * ground line of this (fixed size) window. */
function anchorTy() {
  const halfH = window.innerHeight / 2;
  const ground = GROUND_FRAC * window.innerHeight;
  return (ground - halfH) / pxPerUnit(effDist());
}

function effDist() {
  return CAM.dist * layoutK() * zoomMul;
}

function placeCamera() {
  const d = effDist();
  const tgt = CAM.target;
  camera.position.set(
    tgt.x + Math.sin(CAM.yaw) * Math.cos(CAM.pitch) * d,
    tgt.y + Math.sin(CAM.pitch) * d,
    tgt.z - Math.cos(CAM.yaw) * Math.cos(CAM.pitch) * d,
  );
  camera.lookAt(tgt);
}
placeCamera();

const fox = buildFox();
scene.add(fox.root);

/* ------------------------------------------------------------ ground shadow */
function shadowTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(38, 22, 12, 0.55)');
  grad.addColorStop(0.55, 'rgba(38, 22, 12, 0.26)');
  grad.addColorStop(1, 'rgba(38, 22, 12, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(16, 16),
  new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.55 }),
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.set(0, 0.04, -0.4);
shadow.scale.set(1.02, 0.72, 1);
scene.add(shadow);

/* ------------------------------------------------------------------ textures */
const loader = new THREE.TextureLoader();
const texCache = new Map();

function loadTexture(url) {
  if (texCache.has(url)) return texCache.get(url);
  const p = new Promise((resolve, reject) => {
    loader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      resolve(tex);
    }, undefined, reject);
  });
  texCache.set(url, p);
  return p;
}

/* ----------------------------------------------------------------- animation */
const anim = new FoxAnim(fox, { onState: (s) => { document.documentElement.dataset.state = s; } });
anim.t = Math.random() * 10;
for (const k of Object.keys(anim.cur)) {
  anim.cur[k].p = anim.cur[k].p.slice();
}

/* ---------------------------------------------------------------- speech UI */
const LINES = {
  get click() { return tlist('pet.click'); },
  get doubleclick() { return tlist('pet.dbl'); },
  get land() { return tlist('pet.land'); },
  get wake() { return tlist('pet.wake'); },
  get pet() { return tlist('pet.pet'); },
};

/* Keep the speech bubble pinned just above the fox's head — with a fixed big
 * window the head is nowhere near the top edge any more. */
const anchorBox = new THREE.Box3();
const anchorVec = new THREE.Vector3();
function anchorBubble() {
  if (!fox || !fox.root) return;
  anchorBox.setFromObject(fox.root);
  if (anchorBox.isEmpty()) return;
  anchorVec.set(
    (anchorBox.min.x + anchorBox.max.x) / 2,
    anchorBox.max.y,
    (anchorBox.min.z + anchorBox.max.z) / 2,
  );
  anchorVec.project(camera);
  const y = (-anchorVec.y * 0.5 + 0.5) * window.innerHeight;
  bubble.style.bottom = `${Math.max(6, window.innerHeight - y + 10)}px`;
}

let sayTimer = null;
function say(text, ms = 2600) {
  bubbleText.textContent = text;
  bubble.classList.add('show');
  clearTimeout(sayTimer);
  if (ms) sayTimer = setTimeout(() => bubble.classList.remove('show'), ms);
}

let toastTimer = null;
function toast(text, ms = 1400) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/* -------------------------------------------------------------------- hearts */
function spawnHearts(n = 4) {
  const v = new THREE.Vector3(fox.root.position.x, 11.2, 0).project(camera);
  const x = (v.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
  for (let i = 0; i < n; i += 1) {
    const el = document.createElement('div');
    el.className = 'heart';
    el.textContent = '♥';
    el.style.left = `${x + (Math.random() - 0.5) * 46}px`;
    el.style.top = `${y - Math.random() * 10}px`;
    el.style.setProperty('--dx', `${(Math.random() - 0.5) * 40}px`);
    el.style.animationDelay = `${i * 60}ms`;
    heartsBox.appendChild(el);
    setTimeout(() => el.remove(), 1400 + i * 60);
  }
}

/* --------------------------------------------------------------------- audio */
let actx = null;
let soundOn = true;

function audio() {
  if (!actx) {
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      actx = null;
    }
  }
  return actx;
}

function tone({ freq = 520, to = 0, dur = 0.1, type = 'triangle', vol = 0.05, delay = 0 }) {
  if (!soundOn) return;
  const ctx = audio();
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const sfx = {
  click() {
    tone({ freq: 660, to: 880, dur: 0.09, vol: 0.055 });
    tone({ freq: 990, dur: 0.07, vol: 0.035, delay: 0.06 });
  },
  happy() {
    tone({ freq: 620, dur: 0.08, vol: 0.05 });
    tone({ freq: 780, dur: 0.08, vol: 0.05, delay: 0.07 });
    tone({ freq: 980, dur: 0.1, vol: 0.045, delay: 0.14 });
  },
  land() {
    tone({ freq: 300, to: 170, dur: 0.16, type: 'sine', vol: 0.07 });
  },
  sleep() {
    tone({ freq: 300, to: 220, dur: 0.4, type: 'sine', vol: 0.04 });
  },
  wake() {
    tone({ freq: 420, to: 620, dur: 0.14, type: 'sine', vol: 0.05 });
  },
};

/* --------------------------------------------------------------------- state */
let skins = [];
let skin = null;
let atlasTex = null;
let sleepTex = null;
let sleeping = false;
let blinkClosed = false;
let foxScale = 1;
let skinScale = 1;
let userScale = 1;

function applyFoxScale() {
  foxScale = skinScale * userScale;
  fox.root.scale.setScalar(foxScale);
  zoomMul = 1 + 0.35 * (userScale - 1);
}

function applySkinVisual(s) {
  skin = s;
  skinScale = Number(s.scale) || 1;
  fox.setModel(s.model || 'adult');
  applyFoxScale();
  Promise.all([loadTexture(s.atlas), loadTexture(s.sleep)]).then(([a, sl]) => {
    atlasTex = a;
    sleepTex = sl;
    fox.setTexture(a);
    document.documentElement.dataset.skin = s.id;
    skinsBox.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.skin === s.id));
  });
}

function buildSkinPicker() {
  skinsBox.innerHTML = '';
  for (const s of skins) {
    const b = document.createElement('button');
    b.dataset.skin = s.id;
    b.innerHTML = `<span class="dot" style="background:${s.accent}"></span>${s.name}`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      petAPI.setSkin(s.id);
      skinsBox.classList.remove('show');
      setTimeout(() => skinsBox.classList.remove('show'), 1200);
      sfx.happy();
      say(`${s.name}，变身！`, 1800);
    });
    skinsBox.appendChild(b);
  }
}

/* ---------------------------------------------------------------- interaction */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const meshes = fox.parts ? Object.values(fox.parts).map((p) => p.mesh) : [];
let interactive = false;
let barTimer = null;
let pressed = null;
let moved = false;

function setInteractive(v) {
  if (v === interactive) return;
  interactive = v;
  petAPI.ignoreMouse(!v);
  canvas.style.cursor = v ? 'grab' : 'default';
}

function overBar(x, y) {
  const rects = [];
  if (bar.classList.contains('show')) rects.push(bar.getBoundingClientRect());
  if (skinsBox.classList.contains('show')) rects.push(skinsBox.getBoundingClientRect());
  if (sizer.classList.contains('show')) rects.push(sizer.getBoundingClientRect());
  if (viewer && viewer.classList.contains('show')) rects.push(viewer.getBoundingClientRect());
  return rects.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
}

function hitsFox(x, y) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObjects(meshes, false).length > 0;
}

function showBar() {
  bar.classList.add('show');
  clearTimeout(barTimer);
  barTimer = setTimeout(() => {
    if (!overBar(lastX, lastY)) {
      bar.classList.remove('show');
      skinsBox.classList.remove('show');
      sizer.classList.remove('show');
      if (viewer) viewer.classList.remove('show');
    }
  }, 1800);
}

let lastX = 0;
let lastY = 0;
let hoverAt = 0;

addEventListener('pointermove', (e) => {
  lastX = e.clientX;
  lastY = e.clientY;
  const overUI = overBar(e.clientX, e.clientY);
  const overFox = hitsFox(e.clientX, e.clientY);
  setInteractive(overUI || overFox || !!pressed);
  if (interactive) showBar();
  if (overFox && !pressed) {
    // let it watch the cursor
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    if (anim.state === 'stand' || anim.state === 'sit' || anim.state === 'look') {
      anim.lookTarget.yaw = THREE.MathUtils.clamp(-nx * 0.7, -0.75, 0.75);
      anim.lookTarget.pitch = THREE.MathUtils.clamp(ny * 0.45, -0.25, 0.35);
    }
  }
  // click vs drag bookkeeping happens on the canvas, this keeps hover sane
  if (pressed) {
    // The window follows the cursor while dragging, so clientX barely changes;
    // measure real mouse travel with movementX/Y instead.
    // The window follows the cursor while dragging, so clientX barely changes;
    // measure real mouse travel with movementX/Y, falling back to the client
    // delta for synthesized input that reports no movement.
    const mx = e.movementX || 0;
    const my = e.movementY || 0;
    const dx = e.clientX - pressed.x;
    const dy = e.clientY - pressed.y;
    pressed.travel += Math.max(Math.hypot(mx, my), Math.hypot(dx, dy));
    pressed.x = e.clientX;
    pressed.y = e.clientY;
    if (!moved && pressed.travel > 6) {
      moved = true;
      /* Only start following the cursor once the press is really a drag: a
       * plain press-and-hold must not move or resize the window. */
      petAPI.dragStart();
      anim.startDrag();
      bar.classList.remove('show');
      skinsBox.classList.remove('show');
    }
    if (moved) anim.setDragVelocity(e.movementX * 60);
  }
});

addEventListener('mouseleave', () => {
  if (pressed) return;
  setInteractive(false);
  bar.classList.remove('show');
  skinsBox.classList.remove('show');
});

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (!hitsFox(e.clientX, e.clientY)) return;
  pressed = { x: e.clientX, y: e.clientY, travel: 0 };
  moved = false;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* synthetic or already-released pointers */
  }
  anim.wake();
});

canvas.addEventListener('pointerup', (e) => {
  if (!pressed) return;
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {
    /* not captured */
  }
  const wasDrag = moved;
  pressed = null;
  if (wasDrag) petAPI.dragEnd();
  if (wasDrag) {
    sfx.land();
  } else if (anim.state !== 'sleep') {
    clickFox();
  }
});

/* Safety net: if the button is released outside the canvas or the window loses
 * focus mid-drag, tell the main process to stop following the cursor. */
function cancelPress() {
  if (!pressed) return;
  const wasDrag = moved;
  pressed = null;
  if (wasDrag) petAPI.dragEnd();
}
addEventListener('pointercancel', cancelPress);
addEventListener('blur', cancelPress);

canvas.addEventListener('dblclick', (e) => {
  if (!hitsFox(e.clientX, e.clientY)) return;
  anim.react('doubleclick');
  sfx.happy();
  spawnHearts(5);
  say(pick(LINES.doubleclick), 1600);
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (hitsFox(e.clientX, e.clientY)) {
    anim.wake();
    say('选一个吧～', 1500);
    petAPI.contextMenu();
  }
});

function clickFox() {
  if (sleeping) {
    sleeping = false;
    anim.setState('stand');
    sfx.wake();
    say(pick(LINES.wake), 1800);
    return;
  }
  anim.react('click');
  sfx.click();
  spawnHearts(2 + Math.floor(Math.random() * 3));
  say(pick(LINES.click), 2200);
}

/* --------------------------------------------------------------------- toolbar */
bar.querySelector('[data-act="panel"]').addEventListener('click', (e) => {
  e.stopPropagation();
  sfx.click();
  say(t('pet.desk'), 1400);
  petAPI.openPanel();
});

bar.querySelector('[data-act="skin"]').addEventListener('click', (e) => {
  e.stopPropagation();
  sizer.classList.remove('show');
  skinsBox.classList.toggle('show');
  sfx.click();
});

/* ------------------------------------------------------------ size slider */
let sizeTimer = null;

function syncSizer(scale) {
  const pct = Math.round((Number(scale) || 1) * 100);
  sizeRange.value = String(Math.min(200, Math.max(50, pct)));
  sizeValue.textContent = `${pct}%`;
  const fill = ((Number(sizeRange.value) - 50) / 150) * 100;
  sizeRange.style.setProperty('--fill', `${fill}%`);
}

function openSizer(show) {
  const next = show === undefined ? !sizer.classList.contains('show') : show;
  if (next) {
    skinsBox.classList.remove('show');
    if (viewer) viewer.classList.remove('show');
  }
  sizer.classList.toggle('show', next);
  if (next) showBar();
}

sizeRange.addEventListener('input', () => {
  const pct = Number(sizeRange.value);
  sizeValue.textContent = `${pct}%`;
  sizeRange.style.setProperty('--fill', `${((pct - 50) / 150) * 100}%`);
  /* Resizing the window on every pixel of travel looks jittery; 70ms is
   * frequent enough to feel live and calm enough to stay smooth. */
  clearTimeout(sizeTimer);
  sizeTimer = setTimeout(() => petAPI.setScale(pct / 100), 70);
});
sizeRange.addEventListener('pointerdown', (e) => e.stopPropagation());

bar.querySelector('[data-act="size"]').addEventListener('click', (e) => {
  e.stopPropagation();
  sfx.click();
  openSizer();
});

/* ------------------------------------------------------------ view sliders */
const viewer = document.getElementById('viewer');
const yawRange = document.getElementById('yaw-range');
const pitchRange = document.getElementById('pitch-range');
const yawValue = document.getElementById('yaw-value');
const pitchValue = document.getElementById('pitch-value');
let viewTimer = null;

function paintView() {
  yawRange.value = String(Math.round((VIEW.yaw * 180) / Math.PI));
  pitchRange.value = String(Math.round((VIEW.pitch * 180) / Math.PI));
  yawValue.textContent = `${yawRange.value}°`;
  pitchValue.textContent = `${pitchRange.value}°`;
  yawRange.style.setProperty('--fill', `${((Number(yawRange.value) + 90) / 180) * 100}%`);
  pitchRange.style.setProperty('--fill', `${((Number(pitchRange.value) + 12) / 67) * 100}%`);
}

function syncView(v) {
  if (!v) return;
  if (typeof v.yaw === 'number') VIEW.yaw = v.yaw;
  if (typeof v.pitch === 'number') VIEW.pitch = v.pitch;
  paintView();
}

function openViewer(show) {
  const next = show === undefined ? !viewer.classList.contains('show') : show;
  if (next) {
    sizer.classList.remove('show');
    skinsBox.classList.remove('show');
  }
  viewer.classList.toggle('show', next);
  if (next) showBar();
}

function onViewInput() {
  VIEW.yaw = (Number(yawRange.value) * Math.PI) / 180;
  VIEW.pitch = (Number(pitchRange.value) * Math.PI) / 180;
  paintView();
  clearTimeout(viewTimer);
  viewTimer = setTimeout(() => petAPI.setView({ yaw: VIEW.yaw, pitch: VIEW.pitch }), 60);
}
yawRange.addEventListener('input', onViewInput);
pitchRange.addEventListener('input', onViewInput);
for (const el of [yawRange, pitchRange]) el.addEventListener('pointerdown', (e) => e.stopPropagation());

bar.querySelector('[data-act="view"]').addEventListener('click', (e) => {
  e.stopPropagation();
  sfx.click();
  openViewer();
});

bar.querySelector('[data-act="sleep"]').addEventListener('click', (e) => {
  e.stopPropagation();
  if (anim.state === 'sleep') {
    anim.wake();
    sfx.wake();
    say(pick(LINES.wake), 1600);
  } else {
    anim.setState('sleep', 999);
    sfx.sleep();
    say(t('pet.night'), 2200);
  }
});

bar.querySelector('[data-act="mute"]').addEventListener('click', (e) => {
  e.stopPropagation();
  soundOn = !soundOn;
  petAPI.setSetting({ sound: soundOn });
  toast(t(soundOn ? 'pet.soundOn' : 'pet.soundOff'));
});

/* ------------------------------------------------------------------- pipeline */
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  anim.update(dt);

  const closed = anim.state === 'sleep' || anim.eyeClosed;
  if (closed !== blinkClosed && atlasTex && sleepTex) {
    blinkClosed = closed;
    fox.material.map = closed ? sleepTex : atlasTex;
    fox.material.needsUpdate = true;
  }
  sleeping = anim.state === 'sleep';

  if (!camOverride) {
    const fr = FRAMES[anim.state] || FRAMES.stand;
    const ease = 1 - Math.exp(-dt * 2.4);
    CAM.target.y += (anchorTy() + fr.off - CAM.target.y) * ease;
    CAM.dist += (fr.dist - CAM.dist) * ease;
    pitchOff += (fr.pitchOff - pitchOff) * ease;
    CAM.yaw = VIEW.yaw;
    CAM.pitch = VIEW.pitch + pitchOff;
    placeCamera();
  } else {
    CAM.yaw = VIEW.yaw;
    CAM.pitch = VIEW.pitch;
    placeCamera();
  }

  const jump = Math.max(0, fox.rig.position.y - 24);
  const s = 1 + jump * 0.06;
  shadow.scale.set(1.02 * s * foxScale, 0.72 * s * foxScale, 1);
  shadow.material.opacity = 0.55 * Math.max(0.25, 1 - jump * 0.12);
  shadow.position.x = fox.root.position.x;

  anchorBubble();
  renderer.render(scene, camera);
  if (camQ.has('debug') && performance.now() - lastDebug > 400) {
    lastDebug = performance.now();
    console.log(
      '[pet]',
      JSON.stringify({
        state: anim.state,
        dist: +CAM.dist.toFixed(2),
        ty: +CAM.target.y.toFixed(2),
        pitch: +CAM.pitch.toFixed(2),
        scale: +fox.root.scale.x.toFixed(3),
        rigY: +fox.rig.position.y.toFixed(2),
        w: innerWidth,
        h: innerHeight,
        dpr: devicePixelRatio,
      }),
    );
  }
  requestAnimationFrame(frame);
}

let lastDebug = 0;

/* ------------------------------------------------------------------ bootstrap */
function applyDict() {
  document.documentElement.lang = dict.__lang || 'zh';
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const s = dict[el.dataset.i18n];
    if (s !== undefined) el.textContent = s;
  }
  for (const el of document.querySelectorAll('[data-i18n-title]')) {
    const s = dict[el.dataset.i18nTitle];
    if (s !== undefined) el.title = s;
  }
}

async function boot() {
  const data = await petAPI.bootstrap();
  dict = data.dict || {};
  dict.__lang = data.lang || 'zh';
  applyDict();
  skins = data.skins;
  soundOn = data.settings.sound !== false;
  userScale = Number(data.settings.scale) || 1;
  /* Only the fox follows the size slider — toolbar, sizer, bubble and skins
   * keep a fixed pixel size (--s stays 1) in a fixed-size window, so nothing
   * around the fox ever moves or resizes. */
  syncSizer(userScale);
  if (!camQ.has('yaw') && !camQ.has('pitch')) syncView(data.settings.view);
  else paintView();
  buildSkinPicker();
  const wanted = camQ.get('skin') || data.settings.skin;
  applySkinVisual(skins.find((s) => s.id === wanted) || skins[0]);
  fox.setItem(camQ.get('item') || data.settings.item || 'none');
  /* Dev hook: force the hover UI open so screenshots can show the toolbar. */
  if (camQ.has('ui')) {
    bar.classList.add('show');
    if (camQ.get('ui') === 'skins') skinsBox.classList.add('show');
    if (camQ.get('ui') === 'size') sizer.classList.add('show');
    if (camQ.get('ui') === 'view') viewer.classList.add('show');
    if (camQ.get('ui') === 'none') {
      for (const el of document.querySelectorAll('#bar, #skins, #sizer, #viewer, #hearts, #bubble')) {
        el.style.display = 'none';
      }
    }
  }
  petAPI.onSkin((s) => {
    applySkinVisual(s);
  });
  petAPI.onItem((id) => fox.setItem(id));
  petAPI.onSettings((s) => {
    soundOn = s.sound !== false;
    userScale = Number(s.scale) || 1;
    syncSizer(userScale);
    applyFoxScale();
    if (s.view) syncView(s.view);
  });
  petAPI.onSay((text) => say(text, 3200));
  petAPI.onCommand((cmd) => {
    if (cmd === 'toggle-sleep') {
      if (anim.state === 'sleep') {
        anim.wake();
        sfx.wake();
        say(pick(LINES.wake), 1600);
      } else {
        anim.setState('sleep', 999);
        sfx.sleep();
        say(t('pet.night'), 2200);
      }
    } else if (cmd === 'wave') {
      anim.react('doubleclick');
      say(t('pet.here'), 1800);
      spawnHearts(3);
    } else if (cmd === 'open-size') {
      openSizer(true);
      say(t('pet.sizeHint'), 1600);
    } else if (cmd === 'open-view') {
      openViewer(true);
      say(t('pet.viewHint'), 1600);
    } else if (cmd === 'falling') {
      if (anim.state !== 'drag') anim.startDrag();
      say(pick(tlist('pet.fall')), 1400);
    } else if (cmd === 'landed') {
      if (anim.state === 'drag') anim.endDrag();
      else anim.setState('land', 0.5);
      sfx.land();
      say(pick(tlist('pet.landed')), 1600);
    }
  });
  petAPI.onDragVelocity((vx) => anim.setDragVelocity(vx));
  petAPI.onDragEnd(() => {
    if (anim.state === 'drag') {
      anim.endDrag();
      sfx.land();
      say(pick(LINES.land), 1600);
    }
  });

  const forced = new URLSearchParams(location.search).get('state');
  if (forced) {
    anim.setState(forced, 999, { force: true });
    const snap = anim.statePose();
    for (const k of Object.keys(snap)) {
      anim.cur[k] = { p: snap[k].p.slice(), r: snap[k].r.slice(), v: snap[k].v };
    }
    anim.fox.applyPose(anim.cur);
    if (forced === 'sleep') say('z Z z', 0);
  }

  setTimeout(() => {
    if (!forced && camQ.get('ui') !== 'none') say(t('pet.hint'), 5200);
  }, 900);

  frame();
  /* Debug handle for dev hooks (--pet-eval screenshots / state probes). */
  window.__foxDebug = { CAM, fox, anim };
}

boot();
