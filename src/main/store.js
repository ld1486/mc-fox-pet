'use strict';

const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  skin: 'red',
  scale: 1,
  alwaysOnTop: true,
  sound: true,
  gravity: false,
  item: 'none',
  language: '',
  view: { yaw: 0.52, pitch: 0.07 },
  petX: null,
  petY: null,
  panelBounds: null,
  api: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: '',
    temperature: 0.9,
  },
  hotkeys: true,
  writingStyle: '简洁自然的中文',
  chatPersona: '朋友',
};

let cache = null;

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(base, patch) {
  const out = clone(base);
  for (const key of Object.keys(patch || {})) {
    const value = patch[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object') {
      out[key] = deepMerge(out[key], value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function load() {
  if (cache) return cache;
  let saved = {};
  try {
    // Users may hand-edit this file in an editor that prepends a BOM.
    const raw = fs.readFileSync(configPath(), 'utf8').replace(/^\uFEFF/, '');
    saved = JSON.parse(raw);
  } catch {
    saved = {};
  }
  cache = deepMerge(DEFAULTS, saved);
  return cache;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.error('[store] save failed', err);
  }
}

function get() {
  return load();
}

function set(patch) {
  cache = deepMerge(load(), patch);
  save();
  return cache;
}

module.exports = { get, set, DEFAULTS, configPath };
