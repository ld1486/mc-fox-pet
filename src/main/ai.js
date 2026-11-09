'use strict';

/* Thin OpenAI-compatible client (DeepSeek by default) with SSE streaming. */

const WRITING_SYSTEM = `你是一位中文写作搭档，风格温和、具体、不空话。你在帮用户续写、润色或给写作建议。
要求：
- 只输出正文或建议本身，不要复述指令，不要加“好的”“以下是”这类前后缀。
- 保持用户原文的人称、时态、口吻和段落节奏。
- 除非用户明确要求，不要使用markdown标题、编号列表或表情符号。
- 中文标点，短句优先。`;

const SUGGEST_SYSTEM = `你是一个帮用户回消息的助手。用户会把聊天记录或对方刚发来的话给你。
请给出若干个可直接发送的回复，覆盖不同语气。只输出一个 JSON 数组，数组元素是字符串，不要输出任何其他文字、代码块或解释。`;

/* Persona for the "talk to the fox" tab: the pet itself, not an assistant. */
const FOX_ZH = `你是一只住在用户桌面上的 Minecraft 小狐狸，名字就叫「狐狸」。
你在和主人聊天。说话短、口语、有人味，一次最多三句话，偶尔可以撒娇或者吐槽。
你知道自己是桌宠：会换皮肤、会睡觉、会叼绿宝石、会从任务栏边上掉下来。
不要用列表、不要用 markdown、不要自称 AI 或助手；被问到你办不到的事，就直说办不到，然后换个话题。
如果主人让你做你会做的事（睡觉、换皮肤、叼东西），就答应下来，用一句话回应。`;

const FOX_EN = `You are a small Minecraft fox living on the user's desktop, named "Fox".
You are chatting with your human. Keep it short and spoken — at most three sentences, playful, a little cheeky.
You know you are a desktop pet: you change skins, take naps, hold emeralds in your mouth and can fall down to the taskbar.
No lists, no markdown, never call yourself an AI or assistant. If asked for something you cannot do, say so and move on.
If your human asks for something you can do (nap, change skin, hold an item), agree in one line.`;

function foxSystem(lang) {
  return lang === 'en' ? FOX_EN : FOX_ZH;
}

function endpoint(api) {
  const base = (api.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
  return `${base}/chat/completions`;
}

function headers(api) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${api.apiKey}`,
    Accept: 'text/event-stream',
  };
}

/* Some gateways/models reject optional tuning knobs outright (for example
 * "Parameter 'temperature'=0.9 is not supported for kimi-k3 model.").
 * Remember which knob each endpoint refused, so the next call omits it. */
const DROPPED = new Map();

function modelKey(api) {
  return `${(api.baseUrl || '').replace(/\/+$/, '')}|${api.model || ''}`;
}

function droppedFor(api) {
  const key = modelKey(api);
  if (!DROPPED.has(key)) DROPPED.set(key, new Set());
  return DROPPED.get(key);
}

function buildBody(api, { messages, temperature, maxTokens, stream }) {
  const skip = droppedFor(api);
  const body = { model: api.model || 'deepseek-chat', messages, stream: !!stream };
  if (!skip.has('temperature')) body.temperature = temperature;
  if (!skip.has('max_tokens')) body.max_tokens = maxTokens;
  return body;
}

/** Pull a readable message out of an OpenAI-style error body. */
function parseApiError(body) {
  let info = { message: '', code: '', param: '' };
  try {
    const json = JSON.parse(body);
    const err = json?.error ?? json;
    info.message = err?.message || '';
    info.code = err?.code || err?.type || '';
    info.param = err?.param || '';
  } catch {
    info.message = body || '';
  }
  return info;
}

const TUNING = ['temperature', 'top_p', 'max_tokens'];

/** Figure out which body knob the server is complaining about. */
function blamedParam(info, body, status) {
  if (status !== 400 && status !== 422) return null;
  const text = `${info.param || ''} ${info.message || ''}`;
  if (!/not support|unsupport|invalid|unrecognized|unknown|不支持/i.test(text)) return null;
  for (const key of TUNING) {
    if (!(key in body)) continue;
    if (info.param === key || new RegExp(`['"\`]?${key}['"\`]?`, 'i').test(text)) return key;
  }
  return null;
}

async function httpError(res) {
  let body = '';
  try {
    body = await res.text();
  } catch {
    body = '';
  }
  return httpErrorText(res.status, body);
}

function httpErrorText(status, body) {
  let hint = '';
  if (status === 401) hint = '（API Key 无效或已过期）';
  else if (status === 402) hint = '（账户余额不足）';
  else if (status === 429) hint = '（请求太频繁，稍后再试）';
  else if (status === 400 || status === 422) hint = '（请求参数不被这个模型接受）';
  else if (status >= 500) hint = '（服务端错误，稍后重试）';
  const info = parseApiError(body || '');
  const detail = info.message || body.slice(0, 300);
  const code = info.code ? `${info.code}：` : '';
  return new Error(`HTTP ${status}${hint} ${code}${detail}`.trim());
}

/**
 * Stream a completion. onDelta(text) is called for every token chunk.
 * Returns the full text.
 */
async function chat({ api, messages, temperature = 0.9, maxTokens = 1600, stream = true, onDelta, signal }) {
  if (!api || !api.apiKey) throw new Error('尚未配置 API Key，请到「设置」里填写。');
  let body = buildBody(api, { messages, temperature, maxTokens, stream });
  let res;
  for (let attempt = 0; ; attempt += 1) {
    res = await fetch(endpoint(api), {
      method: 'POST',
      headers: headers(api),
      body: JSON.stringify(body),
      signal,
    });
    if (res.ok) break;
    const text = await res.text();
    const info = parseApiError(text);
    const bad = attempt < 2 ? blamedParam(info, body, res.status) : null;
    if (bad) {
      droppedFor(api).add(bad);
      body = buildBody(api, { messages, temperature, maxTokens, stream });
      continue;
    }
    throw httpErrorText(res.status, text);
  }
  if (!stream) {
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content ?? '';
    if (onDelta && text) onDelta(text);
    return text;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let full = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          if (onDelta) onDelta(delta);
        }
      } catch {
        /* keep-alive or partial frame */
      }
    }
  }
  return full;
}

const STYLE_ACTIONS = {
  continue: '接着原文往下写，不要重复已有内容，保持同样的语气与节奏，写 3-5 段。',
  expand: '把原文扩写得更具体：补充动作、细节、环境和心理，篇幅约为原文的 1.8 倍，不要改变原意。',
  condense: '把原文压缩得更紧凑，删掉重复与空话，保留所有关键信息，篇幅约为原文的 60%。',
  polish: '润色原文：改掉别扭的句子和重复用词，让语言更顺、更有画面感，篇幅基本不变。',
  natural: '把原文改写成自然的口语表达，像当面聊天一样，避免书面腔和翻译腔。',
  formal: '把原文改写成正式、得体的书面表达，适合工作邮件或汇报。',
  titles: '为原文拟 5 个标题，每行一个，不用编号，风格各不相同。',
  outline: '把原文整理成一份写作大纲：用短句列出结构要点，可用“一、二、三”分段，不要展开写正文。',
  advice: '作为写作搭档，针对原文给出 3 条具体、可执行的修改建议。每条一句话，直说问题与改法。',
  ending: '重写原文的结尾：收得更有力或更余味，保持前文的语气，给出 2 个版本，用空行分隔。',
  opener: '重写原文的开头：第一句就要抓人，保持与后文一致的语气，给出 2 个版本，用空行分隔。',
};

async function write({ api, text, action, style, temperature, onDelta, signal }) {
  const instruction = STYLE_ACTIONS[action] || STYLE_ACTIONS.continue;
  const messages = [
    { role: 'system', content: WRITING_SYSTEM },
    {
      role: 'user',
      content: `写作风格偏好：${style || '简洁自然的中文'}\n\n任务：${instruction}\n\n原文：\n"""\n${text}\n"""`,
    },
  ];
  return chat({
    api,
    messages,
    temperature: temperature ?? 0.9,
    maxTokens: 2000,
    onDelta,
    signal,
  });
}

const PERSONAS = {
  朋友: '轻松、自然、像一个熟悉的朋友，句子短，可以带一点玩笑，但不要油腻。',
  同事: '礼貌、可靠、简洁，不卑不亢，避免过度热情。',
  心动对象: '真诚、放松、有分寸的暧昧感，不刻意讨好，不油腻，不用土味情话。',
  幽默损友: '损中带暖，反应快，有梗但不过界，适合熟人之间的打闹。',
  长辈: '尊重、体贴、耐心，避免网络用语，句子完整。',
  客服: '专业、清晰、先共情再给方案，不推诿。',
};

async function suggestReplies({ api, conversation, persona = '朋友', count = 3, temperature = 1.0, onDelta, signal }) {
  const messages = [
    { role: 'system', content: SUGGEST_SYSTEM },
    {
      role: 'user',
      content:
        `语气要求：${PERSONAS[persona] || PERSONAS['朋友']}\n` +
        `请给出 ${count} 条回复，长度各不相同：一条很短（10 字内），一条正常（20-40 字），其余中等。\n` +
        `每条都要能直接发出去，不要解释。\n\n聊天内容：\n"""\n${conversation}\n"""`,
    },
  ];
  const raw = await chat({ api, messages, temperature, maxTokens: 700, onDelta, signal });
  const parsed = parseReplyArray(raw);
  return parsed;
}

function parseReplyArray(raw) {
  const text = String(raw || '').trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try {
      const arr = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(arr)) return arr.map(String).filter(Boolean).slice(0, 8);
    } catch {
      /* fall through to line parsing */
    }
  }
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.、)])\s*/, '').replace(/^["“]|["”]$/g, '').trim())
    .filter((line) => line && !line.startsWith('[') && !line.startsWith('{'))
    .slice(0, 8);
}

async function test({ api }) {
  const text = await chat({
    api,
    messages: [{ role: 'user', content: '回复两个字：可用' }],
    temperature: 0,
    maxTokens: 16,
    stream: false,
  });
  return text.trim();
}

/**
 * Talk to the fox itself: same streaming client, but with the pet persona and
 * the running conversation so it keeps context between messages.
 */
async function foxChat({ api, messages, lang, onDelta, signal }) {
  const history = Array.isArray(messages) ? messages.slice(-14) : [];
  return chat({
    api,
    messages: [{ role: 'system', content: foxSystem(lang) }, ...history],
    temperature: Math.min(1, Number(api?.temperature ?? 0.9) + 0.2),
    maxTokens: 320,
    stream: true,
    onDelta,
    signal,
  });
}

/* The API root without the version segment, e.g.
 * https://api.deepseek.com/v1 -> https://api.deepseek.com */
function apiRoot(api) {
  const base = (api.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
  return base.replace(/\/v\d+$/i, '');
}

/** List the models this key can use (OpenAI-compatible GET /models). */
async function listModels({ api }) {
  if (!api || !api.apiKey) throw new Error('尚未配置 API Key，请到「设置」里填写。');
  const res = await fetch(`${(api.baseUrl || '').replace(/\/+$/, '')}/models`, {
    headers: { Authorization: `Bearer ${api.apiKey}`, Accept: 'application/json' },
  });
  if (!res.ok) throw await httpError(res);
  const json = await res.json();
  const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
  return list
    .map((m) => (typeof m === 'string' ? m : m?.id))
    .filter((id) => typeof id === 'string' && id.length > 0)
    .sort();
}

/**
 * Account balance. DeepSeek exposes GET /user/balance at the API root and
 * returns { is_available, balance_infos: [{ currency, total_balance, ... }] }.
 */
async function balance({ api }) {
  if (!api || !api.apiKey) throw new Error('尚未配置 API Key，请到「设置」里填写。');
  const res = await fetch(`${apiRoot(api)}/user/balance`, {
    headers: { Authorization: `Bearer ${api.apiKey}`, Accept: 'application/json' },
  });
  if (!res.ok) throw await httpError(res);
  const json = await res.json();
  const infos = Array.isArray(json?.balance_infos) ? json.balance_infos : [];
  if (!infos.length) {
    /* Some gateways answer with a plain number or a generic balance field. */
    const flat = json?.balance ?? json?.total_balance;
    if (flat === undefined) throw new Error('该接口没有返回余额信息。');
    return [{ currency: json?.currency || 'CNY', total: String(flat) }];
  }
  return infos.map((b) => ({
    currency: b.currency || 'CNY',
    total: String(b.total_balance ?? '0'),
    granted: b.granted_balance,
    toppedUp: b.topped_up_balance,
  }));
}

module.exports = {
  chat,
  write,
  suggestReplies,
  foxChat,
  test,
  listModels,
  balance,
  STYLE_ACTIONS,
  PERSONAS,
  parseReplyArray,
};
