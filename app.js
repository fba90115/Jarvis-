'use strict';

// id: internal key. speech: locale for the mic and voice. mm: MyMemory code.
// tr: code for the browser's on-device Translator API.
const LANGS = [
  { id: 'en', name: 'English', speech: 'en-US', mm: 'en', tr: 'en' },
  { id: 'zh', name: 'Chinese (Mandarin)', speech: 'zh-CN', mm: 'zh-CN', tr: 'zh' },
  { id: 'zh-TW', name: 'Chinese (Traditional)', speech: 'zh-TW', mm: 'zh-TW', tr: 'zh-Hant' },
  { id: 'yue', name: 'Cantonese', speech: 'zh-HK', mm: 'zh-TW', tr: 'zh-Hant' },
  { id: 'ms', name: 'Malay', speech: 'ms-MY', mm: 'ms', tr: 'ms' },
  { id: 'ta', name: 'Tamil', speech: 'ta-IN', mm: 'ta', tr: 'ta' },
  { id: 'id', name: 'Indonesian', speech: 'id-ID', mm: 'id', tr: 'id' },
  { id: 'ja', name: 'Japanese', speech: 'ja-JP', mm: 'ja', tr: 'ja' },
  { id: 'ko', name: 'Korean', speech: 'ko-KR', mm: 'ko', tr: 'ko' },
  { id: 'th', name: 'Thai', speech: 'th-TH', mm: 'th', tr: 'th' },
  { id: 'vi', name: 'Vietnamese', speech: 'vi-VN', mm: 'vi', tr: 'vi' },
  { id: 'tl', name: 'Filipino', speech: 'fil-PH', mm: 'tl', tr: 'fil' },
  { id: 'hi', name: 'Hindi', speech: 'hi-IN', mm: 'hi', tr: 'hi' },
  { id: 'bn', name: 'Bengali', speech: 'bn-IN', mm: 'bn', tr: 'bn' },
  { id: 'ar', name: 'Arabic', speech: 'ar-SA', mm: 'ar', tr: 'ar' },
  { id: 'he', name: 'Hebrew', speech: 'he-IL', mm: 'he', tr: 'he' },
  { id: 'tr', name: 'Turkish', speech: 'tr-TR', mm: 'tr', tr: 'tr' },
  { id: 'es', name: 'Spanish', speech: 'es-ES', mm: 'es', tr: 'es' },
  { id: 'fr', name: 'French', speech: 'fr-FR', mm: 'fr', tr: 'fr' },
  { id: 'de', name: 'German', speech: 'de-DE', mm: 'de', tr: 'de' },
  { id: 'it', name: 'Italian', speech: 'it-IT', mm: 'it', tr: 'it' },
  { id: 'pt', name: 'Portuguese', speech: 'pt-BR', mm: 'pt', tr: 'pt' },
  { id: 'nl', name: 'Dutch', speech: 'nl-NL', mm: 'nl', tr: 'nl' },
  { id: 'pl', name: 'Polish', speech: 'pl-PL', mm: 'pl', tr: 'pl' },
  { id: 'ru', name: 'Russian', speech: 'ru-RU', mm: 'ru', tr: 'ru' },
  { id: 'uk', name: 'Ukrainian', speech: 'uk-UA', mm: 'uk', tr: 'uk' },
  { id: 'sv', name: 'Swedish', speech: 'sv-SE', mm: 'sv', tr: 'sv' },
  { id: 'el', name: 'Greek', speech: 'el-GR', mm: 'el', tr: 'el' },
];
const byId = Object.fromEntries(LANGS.map((l) => [l.id, l]));

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
};

// ---------- storage ----------
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  },
};

const settings = Object.assign(
  { a: 'en', b: 'zh', autoSpeak: true, handsFree: false },
  store.get('jt.settings', {}),
);
if (!byId[settings.a]) settings.a = 'en';
if (!byId[settings.b]) settings.b = 'zh';
const saveSettings = () => store.set('jt.settings', settings);

const HISTORY_MAX = 200;
let history = store.get('jt.history', []);
const saveHistory = () => store.set('jt.history', history);

function addHistory(entry) {
  history.unshift(entry);
  // Drop the oldest unsaved entries first so starred phrases survive.
  while (history.length > HISTORY_MAX) {
    let i = history.length - 1;
    while (i > 0 && history[i].star) i--;
    history.splice(i, 1);
  }
  saveHistory();
}

// ---------- translation ----------
const cache = new Map();
const deviceTranslators = new Map();

function setEngine(label) { $('engine').textContent = label; }

// Chrome's built-in Translator runs on the device. Only used when the language
// pack is already there, so we never trigger a surprise download.
async function deviceTranslate(text, from, to) {
  if (!('Translator' in self)) return null;
  const key = `${from.tr}>${to.tr}`;
  try {
    let t = deviceTranslators.get(key);
    if (t === undefined) {
      const pair = { sourceLanguage: from.tr, targetLanguage: to.tr };
      // The check can hang in some browsers, so give up after a moment
      // and use the online service for this pair instead.
      const giveUp = new Promise((resolve) => setTimeout(resolve, 1500, null));
      t = await Promise.race([
        self.Translator.availability(pair)
          .then((state) => (state === 'available' ? self.Translator.create(pair) : null)),
        giveUp,
      ]);
      deviceTranslators.set(key, t);
    }
    return t ? await t.translate(text) : null;
  } catch {
    deviceTranslators.set(key, null);
    return null;
  }
}

function decodeEntities(s) {
  return new DOMParser().parseFromString(s, 'text/html').documentElement.textContent;
}

// MyMemory accepts up to 500 bytes per request, so long text goes in pieces.
function chunk(text, maxBytes = 450) {
  const enc = new TextEncoder();
  const parts = text.match(/[^.!?。！？\n]+[.!?。！？\n]*\s*/g) || [text];
  const out = [];
  let cur = '';
  const push = (s) => { if (s.trim()) out.push(s); };
  for (let part of parts) {
    while (enc.encode(part).length > maxBytes) {
      push(cur); cur = '';
      let n = Math.min(part.length, maxBytes);
      while (enc.encode(part.slice(0, n)).length > maxBytes) n = Math.floor(n * 0.8);
      push(part.slice(0, n));
      part = part.slice(n);
    }
    if (enc.encode(cur + part).length > maxBytes) { push(cur); cur = part; } else cur += part;
  }
  push(cur);
  return out;
}

async function onlineTranslate(text, from, to) {
  const pieces = [];
  for (const piece of chunk(text)) {
    const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(piece.trim()) +
      '&langpair=' + encodeURIComponent(`${from.mm}|${to.mm}`);
    const res = await fetch(url);
    if (res.status === 429) throw new Error('limit');
    if (!res.ok) throw new Error('network');
    const data = await res.json();
    const out = data?.responseData?.translatedText || '';
    if (data.quotaFinished || Number(data.responseStatus) === 429 || /^MYMEMORY WARNING/i.test(out)) {
      throw new Error('limit');
    }
    if (Number(data.responseStatus) !== 200 || !out) throw new Error('network');
    pieces.push(decodeEntities(out));
  }
  return pieces.join(' ');
}

async function translate(text, from, to) {
  text = text.trim();
  if (!text) return '';
  if (from.mm === to.mm) return text;
  const key = `${from.id}>${to.id}:${text}`;
  if (cache.has(key)) return cache.get(key);
  let out = await deviceTranslate(text, from, to);
  if (out != null) setEngine('On-device');
  else {
    out = await onlineTranslate(text, from, to);
    setEngine('Online');
  }
  cache.set(key, out);
  return out;
}

function errorText(err) {
  if (err.message === 'limit') return 'The free translation service has hit its daily limit. Try again later.';
  if (!navigator.onLine) return 'You\'re offline. Translation needs a connection.';
  return 'Couldn\'t reach the translation service. Check your connection and try again.';
}

// ---------- speech out ----------
const synth = window.speechSynthesis;
let voices = [];
if (synth) {
  const load = () => { voices = synth.getVoices(); };
  load();
  synth.addEventListener?.('voiceschanged', load);
}

function pickVoice(locale) {
  const want = locale.toLowerCase().replace('_', '-');
  const norm = (v) => v.lang.toLowerCase().replace('_', '-');
  return voices.find((v) => norm(v) === want) ||
    voices.find((v) => norm(v).split('-')[0] === want.split('-')[0]) || null;
}

function speak(text, lang) {
  return new Promise((resolve) => {
    if (!synth || !text) return resolve();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang.speech;
    const v = pickVoice(lang.speech);
    if (v) u.voice = v;
    u.onend = u.onerror = () => resolve();
    synth.speak(u);
  });
}

// iOS only lets a page talk after a tap. A silent utterance inside the tap
// handler keeps later, async speech allowed.
let voiceUnlocked = false;
function unlockVoice() {
  if (voiceUnlocked || !synth) return;
  voiceUnlocked = true;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  synth.speak(u);
}

// ---------- shared bubble rendering ----------
async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const old = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = old; }, 1200);
  } catch { /* clipboard blocked */ }
}

function toggleStar(entry, btn) {
  entry.star = !entry.star;
  saveHistory();
  btn.setAttribute('aria-pressed', String(entry.star));
  btn.textContent = entry.star ? 'Saved' : 'Save';
}

function bubble(entry, side) {
  const from = byId[entry.from];
  const to = byId[entry.to];
  const star = el('button', { type: 'button', className: 'ghost', textContent: entry.star ? 'Saved' : 'Save' });
  star.setAttribute('aria-pressed', String(!!entry.star));
  star.onclick = () => toggleStar(entry, star);
  const play = el('button', { type: 'button', className: 'ghost', textContent: 'Play' });
  play.onclick = () => speak(entry.out, to);
  const copy = el('button', { type: 'button', className: 'ghost', textContent: 'Copy' });
  copy.onclick = () => copyText(entry.out, copy);
  return el('div', { className: `bubble ${side}` },
    el('p', { className: 'src', dir: 'auto', textContent: entry.src }),
    el('p', { className: 'out', dir: 'auto', lang: to.speech, textContent: entry.out }),
    el('div', { className: 'meta' },
      el('span', { className: 'pair', textContent: `${from.name} to ${to.name}` }),
      play, copy, star),
  );
}

// ---------- conversation ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const thread = $('thread');
const notice = $('notice');
let rec = null;
let session = null;
let listeningSide = null;
let liveTimer = 0;
const LIVE_PAUSE_MS = 450;
const MAX_SILENT_RUNS = 2;

function showNotice(text) {
  notice.textContent = text || '';
  notice.hidden = !text;
}

function emptyThread() {
  if (thread.children.length) return;
  thread.append(el('p', {
    className: 'empty',
    textContent: SR
      ? 'Tap a language below and start talking. The translation appears as you speak. Tap again to stop.'
      : 'This browser can\'t listen through the microphone. Use Chrome, Edge or Safari for voice, or the Text tab here.',
  }));
}

function scrollThread() { thread.scrollTop = thread.scrollHeight; }

function sideLangs(side) {
  const mine = byId[side === 'a' ? settings.a : settings.b];
  const theirs = byId[side === 'a' ? settings.b : settings.a];
  return [mine, theirs];
}

function setListening(side) {
  listeningSide = side;
  for (const s of ['a', 'b']) {
    const btn = $(s === 'a' ? 'micA' : 'micB');
    const on = side === s;
    btn.classList.toggle('listening', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.querySelector('.mic-label').textContent = on ? 'Listening… tap to stop' : `Speak ${sideLangs(s)[0].name}`;
  }
}

function stopListening() {
  session = null;
  clearTimeout(liveTimer);
  if (rec) {
    rec.onend = null;
    rec.onresult = null;
    rec.onerror = null;
    try { rec.abort(); } catch { /* already stopped */ }
    rec = null;
  }
  thread.querySelector('.bubble.live')?.remove();
  setListening(null);
}

// A session keeps the mic open sentence after sentence until it's tapped off.
// Each sentence is its own short recognition run, because phone browsers end
// recognition at every pause anyway.
function startSession(side) {
  if (!SR) return;
  stopListening();
  synth?.cancel();
  showNotice('');
  session = { side, empties: 0 };
  hearOne();
}

function hearOne() {
  const s = session;
  if (!s) return;
  const side = s.side;
  const [from, to] = sideLangs(side);
  thread.querySelector('.empty')?.remove();

  const srcP = el('p', { className: 'src', dir: 'auto', textContent: '…' });
  const outP = el('p', { className: 'out', dir: 'auto', lang: to.speech });
  const live = el('div', { className: `bubble ${side} live` }, srcP, outP);
  thread.append(live);
  scrollThread();

  let finalText = '';
  let heard = '';
  let failed = false;
  let liveSeq = 0;
  const r = new SR();
  rec = r;
  r.lang = from.speech;
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;

  r.onresult = (e) => {
    let interim = '';
    finalText = '';
    for (const res of e.results) {
      if (res.isFinal) finalText += res[0].transcript;
      else interim += res[0].transcript;
    }
    heard = (finalText + interim).trim();
    srcP.textContent = heard || '…';
    scrollThread();
    // Translate while the person is still talking, at each short pause.
    clearTimeout(liveTimer);
    if (!heard) return;
    liveTimer = setTimeout(async () => {
      const seq = ++liveSeq;
      try {
        const out = await translate(heard, from, to);
        if (seq === liveSeq && live.isConnected) { outP.textContent = out; scrollThread(); }
      } catch { /* the final pass reports errors */ }
    }, LIVE_PAUSE_MS);
  };

  r.onerror = (e) => {
    failed = true;
    const fatal = {
      'not-allowed': 'Microphone access is blocked. Allow it in your browser\'s site settings, then try again.',
      'service-not-allowed': 'Microphone access is blocked. Allow it in your browser\'s site settings, then try again.',
      'language-not-supported': `This browser can't listen in ${from.name}. Try the Text tab for this language.`,
      'network': 'Speech recognition needs an internet connection.',
      'audio-capture': 'No microphone was found.',
    }[e.error];
    if (fatal) { showNotice(fatal); session = null; }
  };

  r.onend = async () => {
    if (rec !== r) return;
    rec = null;
    clearTimeout(liveTimer);
    liveSeq++;
    live.remove();
    // Some browsers end without marking the last result final.
    const text = (finalText || heard).trim();
    if (text && !failed) {
      s.empties = 0;
      const ok = await commit(side, text, from, to);
      if (!ok && session === s) session = null;
      else if (session === s && settings.handsFree) s.side = side === 'a' ? 'b' : 'a';
    } else if (session === s && ++s.empties >= MAX_SILENT_RUNS) {
      session = null; // nobody is talking, so let the mic go
    }
    if (session === s) hearOne();
    else if (!session) { setListening(null); emptyThread(); }
  };

  setListening(side);
  try { r.start(); } catch { stopListening(); }
}

// Shows the finished sentence, reads it aloud, and resolves once the voice is
// done so the mic doesn't pick up its own translation.
async function commit(side, text, from, to) {
  const pending = el('div', { className: `bubble ${side} pending` },
    el('p', { className: 'src', dir: 'auto', textContent: text }),
    el('p', { className: 'out', textContent: 'Translating…' }));
  thread.append(pending);
  scrollThread();

  let out;
  try {
    out = await translate(text, from, to);
  } catch (err) {
    pending.remove();
    emptyThread();
    showNotice(errorText(err));
    return false;
  }

  const entry = { id: Date.now(), from: from.id, to: to.id, src: text, out, star: false };
  addHistory(entry);
  pending.replaceWith(bubble(entry, side));
  scrollThread();

  if (settings.autoSpeak) await speak(out, to);
  return true;
}

for (const btn of [$('micA'), $('micB')]) {
  btn.addEventListener('click', () => {
    unlockVoice();
    const side = btn.dataset.side;
    if (listeningSide !== side) return startSession(side);
    // Tapped off: keep the sentence in progress, but don't reopen the mic.
    session = null;
    synth?.cancel();
    if (rec) { try { rec.stop(); } catch { stopListening(); } } else setListening(null);
  });
}

// ---------- text ----------
const src = $('src');
const outEl = $('out');
let textTimer = 0;
let textSeq = 0;
let textEntry = null;

function resetSave() {
  textEntry = null;
  $('saveOut').textContent = 'Save';
  $('saveOut').setAttribute('aria-pressed', 'false');
}

function setTextButtons() {
  const has = !!outEl.textContent;
  for (const id of ['speakOut', 'copyOut', 'saveOut']) $(id).disabled = !has;
}

async function runText() {
  const seq = ++textSeq;
  const text = src.value.trim();
  resetSave();
  if (!text) {
    outEl.textContent = '';
    $('textStatus').textContent = '';
    setTextButtons();
    return;
  }
  $('textStatus').textContent = 'Translating…';
  try {
    const out = await translate(text, byId[settings.a], byId[settings.b]);
    if (seq !== textSeq) return;
    outEl.textContent = out;
    outEl.lang = byId[settings.b].speech;
    $('textStatus').textContent = '';
  } catch (err) {
    if (seq !== textSeq) return;
    $('textStatus').textContent = errorText(err);
  }
  setTextButtons();
}

src.addEventListener('input', () => {
  $('count').textContent = `${src.value.length} / 2000`;
  clearTimeout(textTimer);
  textTimer = setTimeout(runText, 400);
});
$('clearSrc').onclick = () => { src.value = ''; src.dispatchEvent(new Event('input')); src.focus(); };
$('speakOut').onclick = () => speak(outEl.textContent, byId[settings.b]);
$('copyOut').onclick = () => copyText(outEl.textContent, $('copyOut'));
$('saveOut').onclick = () => {
  if (!textEntry) {
    textEntry = { id: Date.now(), from: settings.a, to: settings.b, src: src.value.trim(), out: outEl.textContent, star: false };
    addHistory(textEntry);
  }
  toggleStar(textEntry, $('saveOut'));
};

// ---------- history ----------
function renderHistory() {
  const list = $('historyList');
  const only = $('onlyStar').checked;
  const items = history.filter((h) => (!only || h.star) && byId[h.from] && byId[h.to]);
  list.replaceChildren(...items.map((h) => bubble(h, h.from === settings.a ? 'a' : 'b')));
  if (!items.length) {
    list.append(el('p', { className: 'empty', textContent: only ? 'Nothing saved yet. Tap Save on any translation.' : 'Your translations will show up here.' }));
  }
}
$('onlyStar').onchange = renderHistory;
$('clearHistory').onclick = () => {
  const saved = history.filter((h) => h.star).length;
  const msg = saved
    ? `Clear history? Your ${saved} saved translation${saved === 1 ? '' : 's'} will be kept.`
    : 'Clear all history?';
  if (!confirm(msg)) return;
  history = history.filter((h) => h.star);
  saveHistory();
  renderHistory();
};

// ---------- languages, tabs, toggles ----------
function fillSelect(sel, value) {
  sel.replaceChildren(...LANGS.map((l) => el('option', { value: l.id, textContent: l.name })));
  sel.value = value;
}

function langsChanged() {
  saveSettings();
  $('langA').value = settings.a;
  $('langB').value = settings.b;
  stopListening();
  emptyThread();
  if (src.value.trim()) runText();
}

$('langA').onchange = (e) => {
  if (e.target.value === settings.b) settings.b = settings.a;
  settings.a = e.target.value;
  langsChanged();
};
$('langB').onchange = (e) => {
  if (e.target.value === settings.a) settings.a = settings.b;
  settings.b = e.target.value;
  langsChanged();
};
$('swap').onclick = () => {
  [settings.a, settings.b] = [settings.b, settings.a];
  if (outEl.textContent) src.value = outEl.textContent;
  $('count').textContent = `${src.value.length} / 2000`;
  langsChanged();
};

for (const tab of document.querySelectorAll('.tabs button')) {
  tab.addEventListener('click', () => {
    for (const t of document.querySelectorAll('.tabs button')) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      $(`view-${t.dataset.view}`).hidden = !on;
    }
    if (tab.dataset.view !== 'talk') { stopListening(); emptyThread(); }
    if (tab.dataset.view === 'history') renderHistory();
  });
}

for (const key of ['autoSpeak', 'handsFree']) {
  $(key).checked = settings[key];
  $(key).onchange = (e) => {
    settings[key] = e.target.checked;
    saveSettings();
    if (key === 'autoSpeak' && !e.target.checked) synth?.cancel();
  };
}

// ---------- start ----------
fillSelect($('langA'), settings.a);
fillSelect($('langB'), settings.b);
setListening(null);
emptyThread();
setTextButtons();
if (!SR) { $('micA').disabled = true; $('micB').disabled = true; }
if (!synth) { $('autoSpeak').checked = false; $('autoSpeak').disabled = true; settings.autoSpeak = false; }

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
