const $ = (sel) => document.querySelector(sel);

let dict = {};
function t(key, vars) {
  let s = dict[key];
  if (s === undefined) return key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll('{' + k + '}', String(v));
  return s;
}
function applyI18n() {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const s = dict[el.dataset.i18n];
    if (s !== undefined) el.textContent = s;
  }
  for (const el of document.querySelectorAll('[data-i18n-ph]')) {
    const s = dict[el.dataset.i18nPh];
    if (s !== undefined) el.placeholder = s;
  }
  for (const el of document.querySelectorAll('[data-i18n-title]')) {
    const s = dict[el.dataset.i18nTitle];
    if (s !== undefined) el.title = s;
  }
  document.documentElement.lang = dict.__lang === 'en' ? 'en' : 'zh-CN';
}

const ACTIONS = [
  { k: 'continue', label: 'action.continue' },
  { k: 'expand', label: 'action.expand' },
  { k: 'condense', label: 'action.condense' },
  { k: 'polish', label: 'action.polish' },
  { k: 'natural', label: 'action.natural' },
  { k: 'formal', label: 'action.formal' },
  { k: 'titles', label: 'action.titles' },
  { k: 'outline', label: 'action.outline' },
  { k: 'advice', label: 'action.advice', advice: true },
  { k: 'ending', label: 'action.ending' },
  { k: 'opener', label: 'action.opener' },
];

let settings = {};
let activeRequest = null;
let lastReplies = [];

/* ------------------------------------------------------------------ tabs */
function showTab(name) {
  document.querySelectorAll('.nav').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.dataset.page === name));
}

document.querySelectorAll('.nav').forEach((b) => {
  b.addEventListener('click', () => showTab(b.dataset.tab));
});

/* ------------------------------------------------------------------ toast */
function flash(el, text) {
  const old = el.textContent;
  el.textContent = text;
  el.classList.add('ok');
  setTimeout(() => {
    if (el.textContent === text) {
      el.textContent = old;
      el.classList.remove('ok');
    }
  }, 1600);
}

/* ---------------------------------------------------------------- actions */
function buildActions() {
  const box = $('#actions');
  box.innerHTML = '';
  for (const a of ACTIONS) {
    const b = document.createElement('button');
    b.textContent = t(a.label);
    if (a.advice) b.classList.add('advice');
    b.addEventListener('click', () => runWrite(a.k, b));
    box.appendChild(b);
  }
}

const draft = $('#draft');
const outWrite = $('#out-write');
const writeStatus = $('#write-status');
const btnStop = $('#btn-stop');
const btnCopy = $('#btn-copy');
const btnInsert = $('#btn-insert');

function draftText() {
  return draft.value.trim();
}

function setOut(text) {
  outWrite.textContent = text;
  outWrite.classList.toggle('filled', !!text);
}

function updateCount() {
  $('#draft-count').textContent = t('write.count', { n: draft.value.length });
  localStorage.setItem('fox.draft', draft.value);
}

draft.addEventListener('input', updateCount);
$('#draft-clear').addEventListener('click', () => {
  draft.value = '';
  updateCount();
  setOut('');
  btnCopy.hidden = true;
  btnInsert.hidden = true;
});

btnCopy.addEventListener('click', async () => {
  await deskAPI.clipboardWrite(outWrite.textContent || '');
  flash(btnCopy, t('write.copied'));
});

btnInsert.addEventListener('click', () => {
  const add = outWrite.textContent.trim();
  if (!add) return;
  draft.value = draft.value.replace(/\s*$/, '') + (draft.value.trim() ? '\n\n' : '') + add;
  updateCount();
  flash(btnInsert, t('write.inserted'));
});

btnStop.addEventListener('click', () => {
  if (activeRequest) deskAPI.cancel(activeRequest);
});

async function runWrite(action, btn) {
  const text = draftText();
  if (!text) {
    writeStatus.textContent = t('write.empty');
    setTimeout(() => { writeStatus.textContent = ''; }, 2200);
    return;
  }
  if (activeRequest) return;

  const id = `w-${Date.now()}`;
  activeRequest = id;
  let acc = '';
  writeStatus.textContent = t('write.working');
  setOut('');
  btnStop.hidden = false;
  btnCopy.hidden = true;
  btnInsert.hidden = true;
  if (btn) btn.classList.add('busy');
  $('#actions').classList.add('busy');

  const off = (msg) => {
    if (msg.id !== id) return;
    acc += msg.text;
    setOut(acc);
    outWrite.scrollTop = outWrite.scrollHeight;
  };
  window.__deltaHook = off;

  const res = await deskAPI.write({
    id,
    text,
    action,
    style: $('#style').value.trim() || settings.writingStyle,
  });

  activeRequest = null;
  window.__deltaHook = null;
  btnStop.hidden = true;
  if (btn) btn.classList.remove('busy');
  $('#actions').classList.remove('busy');

  if (!res.ok) {
    writeStatus.textContent = t('write.failed');
    setOut(`${t('write.failed')}: ${res.error}`);
    return;
  }
  writeStatus.textContent = t('write.done');
  setOut(res.text || acc);
  btnCopy.hidden = false;
  btnInsert.hidden = false;
  setTimeout(() => { writeStatus.textContent = ''; }, 1800);
}

/* ------------------------------------------------------------------- chat */
const chatInput = $('#chat-input');
const repliesBox = $('#replies');
const chatStatus = $('#chat-status');

$('#chat-paste').addEventListener('click', async () => {
  const text = await deskAPI.clipboardRead();
  if (text) {
    chatInput.value = text;
    chatStatus.textContent = t('chat.pasted');
    setTimeout(() => { chatStatus.textContent = ''; }, 1500);
  }
});

async function copyReply(text, el) {
  await deskAPI.clipboardWrite(text);
  el.classList.add('copied');
  const tag = el.querySelector('.tag');
  if (tag) tag.textContent = t('chat.copiedTag');
  setTimeout(() => {
    el.classList.remove('copied');
    if (tag) tag.textContent = t('chat.tag');
  }, 1400);
}

function renderReplies(list) {
  repliesBox.innerHTML = '';
  if (!list.length) {
    repliesBox.innerHTML = `<div class="placeholder">${t('chat.empty')}</div>`;
    return;
  }
  for (const text of list) {
    const d = document.createElement('div');
    d.className = 'reply';
    d.innerHTML = `<span class="tag">${t('chat.tag')}</span>`;
    const p = document.createElement('span');
    p.textContent = text;
    d.appendChild(p);
    d.addEventListener('click', () => copyReply(text, d));
    repliesBox.appendChild(d);
  }
}

$('#btn-suggest').addEventListener('click', async () => {
  if (activeRequest) return;
  const conversation = chatInput.value.trim();
  if (!conversation) {
    chatStatus.textContent = t('chat.needText');
    setTimeout(() => { chatStatus.textContent = ''; }, 2200);
    return;
  }
  const id = `s-${Date.now()}`;
  activeRequest = id;
  const btn = $('#btn-suggest');
  btn.disabled = true;
  chatStatus.textContent = t('chat.thinking');
  repliesBox.innerHTML = `<div class="placeholder">${t('chat.thinking')}</div>`;

  const res = await deskAPI.suggest({
    id,
    conversation,
    persona: $('#persona').value,
    count: Number($('#count').value) || 3,
  });

  activeRequest = null;
  btn.disabled = false;
  if (!res.ok) {
    chatStatus.textContent = t('chat.failed');
    repliesBox.innerHTML = `<div class="placeholder">${res.error}</div>`;
    return;
  }
  chatStatus.textContent = t('chat.choose');
  lastReplies = res.replies || [];
  renderReplies(lastReplies);
  $('#btn-copy-all').hidden = lastReplies.length === 0;
  setTimeout(() => { chatStatus.textContent = ''; }, 1600);
});

$('#btn-copy-all').addEventListener('click', async () => {
  await deskAPI.clipboardWrite(lastReplies.join('\n'));
  flash($('#btn-copy-all'), t('write.copied'));
});

/* --------------------------------------------------------------- settings */
function fillSettings(s) {
  settings = s;
  $('#api-base').value = s.api?.baseUrl || '';
  $('#api-model').value = s.api?.model || '';
  $('#api-key').value = s.api?.apiKey || '';
  $('#api-temp').value = String(s.api?.temperature ?? 0.9);
  $('#temp-val').textContent = String(s.api?.temperature ?? 0.9);
  $('#writing-style').value = s.writingStyle || '';
  $('#opt-hotkeys').checked = s.hotkeys !== false;
  $('#opt-sound').checked = s.sound !== false;
  $('#opt-top').checked = s.alwaysOnTop !== false;
  if ($('#persona').options.length) {
    $('#persona').value = s.chatPersona || '朋友';
    $('#persona-default').value = s.chatPersona || '朋友';
  }
}

$('#api-temp').addEventListener('input', () => {
  $('#temp-val').textContent = $('#api-temp').value;
});

async function saveSettings() {
  const patch = {
    api: {
      baseUrl: $('#api-base').value.trim() || 'https://api.deepseek.com/v1',
      model: $('#api-model').value.trim() || 'deepseek-chat',
      apiKey: $('#api-key').value.trim(),
      temperature: Number($('#api-temp').value),
    },
    writingStyle: $('#writing-style').value.trim() || '简洁自然的中文',
    chatPersona: $('#persona-default').value,
    hotkeys: $('#opt-hotkeys').checked,
    sound: $('#opt-sound').checked,
    alwaysOnTop: $('#opt-top').checked,
    language: $('#opt-lang').value,
  };
  settings = await deskAPI.settings(patch);
  $('#api-status').textContent = t('set.saved');
  $('#api-status').classList.add('ok');
  setTimeout(() => { $('#api-status').textContent = ''; }, 1800);
}

$('#btn-save').addEventListener('click', saveSettings);

$('#btn-test').addEventListener('click', async () => {
  const st = $('#api-status');
  st.textContent = t('set.testing');
  st.className = 'status';
  await saveSettings();
  const res = await deskAPI.testApi();
  if (res.ok) {
    st.textContent = t('set.connected', { text: res.text });
    st.className = 'status ok';
  } else {
    st.textContent = res.error;
    st.className = 'status err';
  }
});

$('#btn-folder').addEventListener('click', () => deskAPI.openFolder());

/* ------------------------------------------------------ models + balance */
function formApi() {
  return {
    baseUrl: $('#api-base').value.trim() || 'https://api.deepseek.com/v1',
    model: $('#api-model').value.trim() || 'deepseek-chat',
    apiKey: $('#api-key').value.trim(),
  };
}

function markModelChips() {
  const current = $('#api-model').value.trim();
  for (const chip of $('#model-chips').children) {
    chip.classList.toggle('on', chip.dataset.model === current);
  }
}

function paintModels(models) {
  const chips = $('#model-chips');
  const list = $('#model-list');
  chips.textContent = '';
  list.textContent = '';
  for (const id of models) {
    const opt = document.createElement('option');
    opt.value = id;
    list.append(opt);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.model = id;
    chip.textContent = id;
    chip.addEventListener('click', () => {
      $('#api-model').value = id;
      markModelChips();
    });
    chips.append(chip);
  }
  markModelChips();
}

$('#btn-models').addEventListener('click', async () => {
  const st = $('#api-status');
  const btn = $('#btn-models');
  btn.disabled = true;
  st.textContent = t('set.modelsLoading');
  st.className = 'status';
  const res = await deskAPI.listModels(formApi());
  btn.disabled = false;
  if (res.ok && res.models.length) {
    paintModels(res.models);
    st.textContent = t('set.modelsFound', { n: res.models.length });
    st.className = 'status ok';
  } else if (res.ok) {
    st.textContent = t('set.modelsNone');
    st.className = 'status';
  } else {
    st.textContent = res.error;
    st.className = 'status err';
  }
});

const CURRENCY = { CNY: '¥', USD: '$' };

function paintBalance(infos) {
  const el = $('#balance-value');
  el.classList.remove('err');
  el.textContent = infos
    .map((b) => {
      const symbol = CURRENCY[b.currency] || '';
      const total = Number(b.total);
      const money = Number.isFinite(total) ? `${symbol}${total.toFixed(2)}` : `${symbol}${b.total}`;
      return b.currency === 'CNY' || symbol ? money : `${b.total} ${b.currency}`;
    })
    .join(' / ');
}

$('#btn-balance').addEventListener('click', async () => {
  const btn = $('#btn-balance');
  const el = $('#balance-value');
  const st = $('#api-status');
  btn.disabled = true;
  el.classList.remove('err');
  el.textContent = t('set.balanceLoading');
  const res = await deskAPI.balance(formApi());
  btn.disabled = false;
  if (res.ok) {
    paintBalance(res.infos);
    st.textContent = '';
  } else {
    el.textContent = t('set.balanceNone');
    el.classList.add('err');
    st.textContent = res.error;
    st.className = 'status err';
  }
});

$('#api-model').addEventListener('input', markModelChips);

/* -------------------------------------------------------------- fox talk */
const talk = $('#talk');
const talkInput = $('#talk-input');
const talkHistory = [];
let talkBusy = false;

function addMsg(role, text) {
  const d = document.createElement('div');
  d.className = 'msg ' + role;
  const who = document.createElement('div');
  who.className = 'who';
  who.textContent = t(role === 'fox' ? 'fox.name' : 'fox.you');
  const body = document.createElement('div');
  body.className = 'body';
  body.textContent = text;
  d.append(who, body);
  talk.append(d);
  talk.scrollTop = talk.scrollHeight;
  return body;
}

async function sendTalk() {
  if (talkBusy) return;
  const text = talkInput.value.trim();
  if (!text) return;
  talkInput.value = '';
  addMsg('me', text);
  talkHistory.push({ role: 'user', content: text });

  talkBusy = true;
  $('#fox-send').disabled = true;
  const id = 'f-' + Date.now();
  const body = addMsg('fox', '…');
  let acc = '';
  window.__deltaHook = (msg) => {
    if (msg.id !== id) return;
    acc += msg.text;
    body.textContent = acc;
    talk.scrollTop = talk.scrollHeight;
  };

  const res = await deskAPI.foxChat({ id, messages: talkHistory.slice(-14) });
  window.__deltaHook = null;
  talkBusy = false;
  $('#fox-send').disabled = false;

  const answer = res.ok ? res.text || acc : t('fox.failed') + ': ' + res.error;
  body.textContent = answer;
  talkHistory.push({ role: 'assistant', content: answer });
  talk.scrollTop = talk.scrollHeight;
}

$('#fox-send').addEventListener('click', sendTalk);
talkInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendTalk();
  }
});
$('#fox-clear').addEventListener('click', () => {
  talkHistory.length = 0;
  talk.textContent = '';
  addMsg('fox', t('fox.greeting'));
});

/* -------------------------------------------------------------- titlebar */
$('#btn-min').addEventListener('click', () => deskAPI.minimize());
$('#btn-close').addEventListener('click', () => deskAPI.close());
$('#summon').addEventListener('click', () => deskAPI.summonFox());

/* ------------------------------------------------------------------- boot */
async function boot() {
  const data = await deskAPI.bootstrap();
  settings = data.settings;
  dict = data.dict || {};
  dict.__lang = data.lang || 'zh';
  applyI18n();

  for (const [name, label] of Object.entries(data.personas || {})) {
    for (const sel of [$('#persona'), $('#persona-default')]) {
      const o = document.createElement('option');
      o.value = name;
      o.textContent = label;
      sel.appendChild(o);
    }
  }

  fillSettings(settings);
  $('#style').value = settings.writingStyle || '';
  $('#opt-lang').value = settings.language || '';
  buildActions();
  draft.value = localStorage.getItem('fox.draft') || '';
  updateCount();

  deskAPI.onDelta((msg) => {
    if (window.__deltaHook) window.__deltaHook(msg);
  });

  deskAPI.onTab((tab) => showTab(['chat', 'write', 'fox', 'settings'].includes(tab) ? tab : 'settings'));
  deskAPI.onI18n(({ lang, dict: d }) => {
    dict = d || dict;
    dict.__lang = lang;
    applyI18n();
    buildActions();
    fillSettings(settings);
  });

  deskAPI.onPrefill(({ tab, text }) => {
    if (tab === 'chat') {
      showTab('chat');
      if (text) chatInput.value = text;
      chatStatus.textContent = t('chat.prefill');
      setTimeout(() => { chatStatus.textContent = ''; }, 2400);
    } else {
      showTab('write');
      if (text) {
        draft.value = draft.value.trim() ? `${draft.value}\n\n${text}` : text;
        updateCount();
      }
    }
  });

  deskAPI.onSettings((s) => fillSettings(s));
  deskAPI.onMood((text) => {
    chatStatus.textContent = text;
    setTimeout(() => { chatStatus.textContent = ''; }, 3200);
  });

  deskAPI.version().then((v) => { $('#version').textContent = `v${v}`; });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (document.querySelector('[data-page="chat"].active')) $('#btn-suggest').click();
      else if (document.querySelector('[data-page="fox"].active')) sendTalk();
      else runWrite('continue', null);
    }
  });
}

boot();
