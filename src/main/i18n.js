'use strict';

const fs = require('node:fs');
const path = require('node:path');
const store = require('./store');

const DIR = path.join(__dirname, '..', 'i18n');
const loaded = new Map();

function dict(lang) {
  const l = lang === 'en' ? 'en' : 'zh';
  if (!loaded.has(l)) {
    loaded.set(l, JSON.parse(fs.readFileSync(path.join(DIR, `${l}.json`), 'utf8')));
  }
  return loaded.get(l);
}

/* Each installer bakes its default language into package.json ("defaultLang"),
 * so the English build starts in English until the user picks otherwise. */
function defaultLang() {
  try {
    const pkg = require(path.join(__dirname, '..', '..', 'package.json'));
    return pkg.defaultLang === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}

function current() {
  const saved = store.get().language;
  return saved === 'en' || saved === 'zh' ? saved : defaultLang();
}

function t(key, vars) {
  const table = dict(current());
  let text = table[key];
  if (text === undefined) text = dict('zh')[key];
  if (text === undefined) return key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  }
  return text;
}

/** "a|b|c" style string tables (random pick lists) become arrays. */
function list(key) {
  return t(key).split('|').filter(Boolean);
}

module.exports = { t, list, dict, current, defaultLang, LANGS: ['zh', 'en'] };
