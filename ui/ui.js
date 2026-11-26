/* ui.js — ОБЩИЙ ШАБЛОН СТРАНИЦ проекта: шапка (главная · тема · язык · аккаунт),
 * тема (тёмная/светлая/системная), язык и таблица надписей.
 *
 * ЛЕЖИТ ОДИН РАЗ — в репозитории главной страницы:
 *     site\ui\ui.js  →  https://dperegudov61.github.io/ui/ui.js
 * Его подключают ВСЕ страницы: главная (/), вход (/accounts/), аккаунт (/account/),
 * чат (/AI-Human-Messenger/), админка, мини-приложения и страница ошибки (/mini-apps/404.html).
 * Поэтому правка этого файла меняет вид всех страниц сразу. Второго экземпляра быть не должно —
 * раньше theme.js лежал в трёх репозиториях, и кнопки успели разойтись.
 *
 * ЧТО ДЕЛАЕТ
 *   * тема: атрибут data-theme на <html> (dark/light), auto разрешается через
 *     prefers-color-scheme; палитра страницы — её собственные переменные CSS;
 *   * язык: список в шапке, показывает две буквы (en, ru, …); словарь — столбцы в strings.tsv,
 *     сколько столбцов, столько языков в списке (новый язык = новый столбец, код не меняется);
 *   * надписи страницы помечены ключами: data-i18n / data-i18n-ph / data-i18n-title /
 *     data-i18n-aria, в коде — t('ключ', 'English fallback'); если таблица не загрузилась,
 *     виден английский текст из файла страницы, а не ключи;
 *   * шапка: логотип-ссылка на главную, значки темы и языка, имя вошедшего (или «Войти»);
 *   * выбор хранится в localStorage (ui.theme, ui.lang) и на сервере (data\users\<id>\prefs.json,
 *     маршруты GET|POST /__prefs) — серверные значения главнее кеша.
 *
 * КАК ПОДКЛЮЧИТЬ СТРАНИЦУ (в <head>, ДО своих стилей и разметки)
 *     <script src="/ui/ui.js" data-i18n="/путь/к/strings.tsv"></script>
 *   и в разметке, там где нужна шапка:
 *     <div class="uibar" data-ui="bar"></div>
 *   когда страница нашла сервер и токен:
 *     UI.sync(адрес, токен)
 *
 * НАСТРОЙКИ НА ТЕГЕ <script> (все необязательны)
 *     data-i18n="/…/strings.tsv"   таблица надписей этой страницы (по умолчанию strings.tsv рядом)
 *     data-home="0"                не показывать логотип-ссылку на главную
 *     data-account="0"             не показывать кнопку аккаунта
 *     data-home-href="/"           куда ведёт логотип
 *     data-account-href="/account/"  куда ведёт имя вошедшего
 *     data-signin-href="/accounts/"  куда ведёт «Войти»
 *     data-logo="/ui/logo.png"     какая картинка у логотипа (она же — значок вкладки:
 *                                  страницы без своего rel="icon" получают /favicon.png)
 *
 * НОВЫЙ ЭЛЕМЕНТ ШАБЛОНА (пусть будет на всех страницах)
 *     добавить функцию рядом с themeNode()/langNode() и вставить её в renderBar();
 *     если элемент нужен на одной странице, страница зовёт:
 *       UI.add({ icon:'…', text:t('ключ','…'), title:'…', href:'…', onClick:…, slot:'theme' })
 *
 * НАРУЖУ (window.UI)
 *     UI.theme() / UI.setTheme(v) / UI.resolved()   — тема
 *     UI.lang() / UI.langs() / UI.setLang(v)        — язык
 *     UI.t(ключ, запасной текст)                    — надпись
 *     UI.localize()                                 — перечитать разметку после правок DOM
 *     UI.refresh()                                  — перерисовать шапку (после входа/выхода)
 *     UI.online(true|false|null)                    — точка «сервер отвечает» в кнопке аккаунта
 *     UI.sync(адрес, токен)                         — взять настройки человека с сервера
 *     UI.add({...})                                 — свой элемент в шапку
 *     UI.onChange / UI.onLang                       — свои обработчики (страница)
 *
 * САМОПРОВЕРКИ: tools\theme_test.js, tools\i18n_test.js
 */
(function () {
'use strict';

/* ---------- где лежит шаблон и что ему разрешено ---------- */
var CS = document.currentScript;
function cfg(n) { return (CS && CS.getAttribute && CS.getAttribute(n)) || ''; }
var SELF = (CS && CS.src) || '';
var BASE = SELF ? SELF.replace(/[?#].*$/, '').replace(/[^\/]*$/, '') : '/ui/';
var HOME = cfg('data-home-href') || 'https://dperegudov61.github.io/';
var LOGO = cfg('data-logo') || (BASE + 'logo.png');
var ACCP = cfg('data-account-href') || '/account/';
var SIGNP = cfg('data-signin-href') || '/accounts/';
var PAGE_TSV = cfg('data-i18n') || 'strings.tsv';
var SHARED_TSV = BASE + 'strings.tsv';
var NO_LOGO = cfg('data-home') === '0';
var NO_ACC = cfg('data-account') === '0';

var THEMES = ['dark', 'light', 'auto'];
var KTH = 'ui.theme', KLG = 'ui.lang';
var TK = 'door.token', UK = 'door.user', KK = 'door.key';
var DEF_LANG = 'en';
var SEL = '[data-ui="bar"],[data-ui="switch"]';

var root = document.documentElement;
var mqL = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
var srv = { base: '', tok: '' };
var tbl = { langs: [], col: {}, rows: 0, ready: false, failed: false };
var appliedLang = '';
var online = null;            // null — неизвестно, true — сервер отвечает, false — нет
var extras = [];              // свои элементы страниц (UI.add)

/* ---------- мелочи ---------- */
function ls(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function lss(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function lsd(k) { try { localStorage.removeItem(k); } catch (e) {} }
function pick(v, list, def) {
  for (var i = 0; i < list.length; i++) if (list[i] === v) return v;
  return def;
}
function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}
function hasClass(e, c) { return (' ' + (e.className || '') + ' ').indexOf(' ' + c + ' ') >= 0; }

/* ---------- тема ---------- */
function sysTheme() { return mqL && mqL.matches ? 'light' : 'dark'; }
function theme() { return pick(ls(KTH), THEMES, 'auto'); }
function resolved() { var v = theme(); return v === 'auto' ? sysTheme() : v; }

/* ---------- язык ---------- */
function sysLang() {
  var v = (navigator.languages && navigator.languages[0]) || navigator.language || '';
  return String(v).toLowerCase().slice(0, 2);
}
function allLangs() { return tbl.langs.length ? tbl.langs : [DEF_LANG]; }
function langNow() {
  var v = ls(KLG);
  if (!v) return DEF_LANG;
  if (v === 'auto') return pick(sysLang(), allLangs(), DEF_LANG);   // старое значение
  return pick(v, allLangs(), DEF_LANG);
}
/* t('chat.send', 'Send') — надпись по ключу; без таблицы остаётся английский текст */
function t(key, fallback) {
  var c = tbl.col[langNow()];
  var v = c ? c[key] : null;
  if (v === undefined || v === null || v === '') v = null;
  if (v === null) { var e = tbl.col[DEF_LANG]; v = e ? e[key] : null; }
  if (v === undefined || v === null || v === '') v = null;
  return v !== null ? v : (fallback !== undefined && fallback !== null ? fallback : key);
}

/* ---------- применение темы и языка к странице ---------- */
function metaTheme() {
  var mc = document.querySelector('meta[name="theme-color"]');
  if (!mc) return;
  var c = '';
  try { c = window.getComputedStyle(root).getPropertyValue('--mtc'); } catch (e) {}
  c = String(c || '').replace(/\s+/g, '');
  if (c) mc.setAttribute('content', c);
}
function apply() {
  var th = resolved();
  if (root.getAttribute('data-theme') !== th) root.setAttribute('data-theme', th);
  root.setAttribute('data-theme-pref', theme());
  root.setAttribute('lang', langNow());
  metaTheme();
  paint();
}

/* ---------- таблицы надписей: общая шаблона + своя страницы ---------- */
function parseTable(text) {
  var lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  var langs = [], col = {}, rows = 0, head = null, i, c;
  for (i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line || /^\s*#/.test(line)) continue;
    var cells = line.split('\t');
    if (!head) {
      head = cells;
      for (c = 1; c < cells.length; c++) langs.push(String(cells[c] || '').trim().toLowerCase());
      continue;
    }
    var key = (cells[0] || '').trim();
    if (!key) continue;
    rows++;
    for (c = 0; c < langs.length; c++) {
      var v = cells[c + 1];
      if (v === undefined || !langs[c]) continue;
      if (!col[langs[c]]) col[langs[c]] = {};
      col[langs[c]][key] = v.replace(/\\n/g, '\n');
    }
  }
  return { langs: langs, col: col, rows: rows };
}
function mergeTable(p) {
  if (!p || !p.rows) return false;
  var i, k;
  for (i = 0; i < p.langs.length; i++) {
    var lg = p.langs[i];
    if (!lg) continue;
    if (tbl.langs.indexOf(lg) < 0) tbl.langs.push(lg);
    if (!tbl.col[lg]) tbl.col[lg] = {};
    for (k in p.col[lg]) if (Object.prototype.hasOwnProperty.call(p.col[lg], k)) tbl.col[lg][k] = p.col[lg][k];
  }
  tbl.rows += p.rows;
  return true;
}
function fetchText(url) {
  if (!url || !window.fetch) return Promise.resolve('');
  return fetch(url, { cache: 'no-store' }).then(function (r) {
    return r.ok ? r.text() : '';
  }).catch(function () { return ''; });
}
function loadTables() {
  var jobs = [fetchText(SHARED_TSV)];
  if (PAGE_TSV && PAGE_TSV !== SHARED_TSV) jobs.push(fetchText(PAGE_TSV));
  Promise.all(jobs).then(function (txts) {
    var got = false, i;
    for (i = 0; i < txts.length; i++) if (mergeTable(parseTable(txts[i]))) got = true;
    if (!got) { tbl.failed = true; return; }
    tbl.ready = true;
    var cur = ls(KLG);
    if (cur && cur !== 'auto' && tbl.langs.indexOf(cur) < 0) lss(KLG, DEF_LANG);
    localize();
    mountBars();
    apply();
    if (UI.onLang) { try { UI.onLang(langNow()); } catch (e) {} }
  });
}

/* ---------- перевод разметки ---------- */
function isTablePath(k) { return /\.tsv$/i.test(String(k || '')); }
function localize() {
  // исходный английский текст запоминаем при первом проходе: если таблица не загрузилась,
  // человек всё равно видит надписи, а не ключи
  function src(elm, attr, store) {
    if (!elm.getAttribute(store)) {
      var v = attr ? (elm.getAttribute(attr) || '') : (elm.textContent || '');
      elm.setAttribute(store, v.replace(/^\s+|\s+$/g, ''));
    }
    return elm.getAttribute(store);
  }
  var i, els;
  els = document.querySelectorAll('[data-i18n]');
  for (i = 0; i < els.length; i++) {
    var k = els[i].getAttribute('data-i18n');
    if (isTablePath(k) || els[i].tagName === 'SCRIPT') continue;   // на теге <script> это адрес таблицы
    var v = t(k, src(els[i], '', 'data-i18n-src'));
    if (els[i].textContent !== v) els[i].textContent = v;
  }
  els = document.querySelectorAll('[data-i18n-ph]');
  for (i = 0; i < els.length; i++)
    els[i].setAttribute('placeholder', t(els[i].getAttribute('data-i18n-ph'), src(els[i], 'placeholder', 'data-i18n-ph-src')));
  els = document.querySelectorAll('[data-i18n-title]');
  for (i = 0; i < els.length; i++)
    els[i].setAttribute('title', t(els[i].getAttribute('data-i18n-title'), src(els[i], 'title', 'data-i18n-title-src')));
  els = document.querySelectorAll('[data-i18n-aria]');
  for (i = 0; i < els.length; i++)
    els[i].setAttribute('aria-label', t(els[i].getAttribute('data-i18n-aria'), src(els[i], 'aria-label', 'data-i18n-aria-src')));
  var tt = document.querySelector('title[data-i18n]');
  if (tt && !isTablePath(tt.getAttribute('data-i18n')))
    document.title = t(tt.getAttribute('data-i18n'), tt.getAttribute('data-i18n-src') || document.title);
}

/* ---------- сервер: у человека настройки главнее кеша ---------- */
function getPrefs() {
  if (!srv.base || !srv.tok || !window.fetch) return Promise.resolve(null);
  return fetch(srv.base + '/__prefs', {
    cache: 'no-store',
    headers: { 'Authorization': 'Bearer ' + srv.tok }
  }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
}
function putPrefs() {
  if (!srv.base || !srv.tok || !window.fetch) return Promise.resolve(false);
  return fetch(srv.base + '/__prefs', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Authorization': 'Bearer ' + srv.tok, 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme: theme(), lang: langNow() })
  }).then(function (r) { return !!r.ok; }).catch(function () { return false; });
}
function sync(base, tok) {
  if (!base || !tok) return Promise.resolve(false);
  srv.base = String(base).replace(/\/+$/, '');
  srv.tok = tok;
  return getPrefs().then(function (j) {
    if (!j || !j.ok) return false;
    if (j.set) {
      var th = pick(j.theme, THEMES, 'auto');
      var lg = pick(j.lang, allLangs(), '');
      if (th !== ls(KTH)) lss(KTH, th);
      if (lg && lg !== ls(KLG)) lss(KLG, lg);
      apply();
      // язык сервера другой — надписи в разметке надо собрать заново
      if (lg && lg !== appliedLang) { appliedLang = lg; location.reload(); }
      return true;
    }
    return putPrefs();
  });
}

/* ---------- выбор ---------- */
function setTheme(v) {
  lss(KTH, pick(v, THEMES, 'auto'));
  apply();
  putPrefs();
  if (UI.onChange) { try { UI.onChange({ theme: theme(), lang: langNow() }); } catch (e) {} }
}
function setLang(v) {
  if (!pick(v, allLangs(), '')) return;
  lss(KLG, v);
  putPrefs().then(function () { location.reload(); }, function () { location.reload(); });
}
function nextTheme() {
  var list = ['dark', 'light', 'auto'];             // тёмная → светлая → как в системе
  var i = list.indexOf(theme());
  setTheme(list[(i + 1) % list.length]);
}
function themeIcon(v) {
  if (v === 'light') return '\u2600\uFE0F';          // ☀️
  if (v === 'auto') return '\uD83C\uDF17';           // 🌗 — половина: как в системе
  return '\uD83C\uDF19';                             // 🌙
}
function themeName(v) { return t('ui.theme.' + v, v); }

/* ---------- шапка: сборка ---------- */
function signedIn() { return !!(ls(TK) || ls(KK)); }

function logoNode() {
  var a = el('a', 'ub-logo');
  a.href = HOME;
  a.setAttribute('rel', 'noopener');
  a.title = t('ui.home', 'Home page');
  a.setAttribute('aria-label', t('ui.home', 'Home page'));
  var img = document.createElement('img');
  img.src = LOGO;
  img.alt = '';
  img.width = 28;
  img.height = 28;
  a.appendChild(img);
  a.setAttribute('data-ub', 'logo');
  return a;
}

function accNode() {
  var a = el('a', 'ub-acc');
  a.setAttribute('data-ub', 'account');
  if (signedIn()) {
    a.href = ACCP;
    a.title = t('ui.account', 'Account');
    var d = el('i', 'ub-dot' + (online === true ? ' on' : online === false ? ' off' : ''));
    d.setAttribute('aria-hidden', 'true');
    a.appendChild(d);
    a.appendChild(el('span', 'nm', ls(UK) || t('ui.account', 'Account')));
  } else {
    a.className = 'ub-acc ub-in';
    a.href = SIGNP;
    a.title = t('ui.signin', 'Sign in');
    a.appendChild(el('span', 'nm', t('ui.signin', 'Sign in')));
  }
  return a;
}

function themeNode() {
  var b = el('button', 'ub-ico');
  b.type = 'button';
  b.setAttribute('data-ub', 'theme');
  b.onclick = nextTheme;
  paintTheme(b);
  return b;
}
function paintTheme(b) {
  if (!b) return;
  var v = theme();
  b.textContent = themeIcon(v);
  b.title = t('ui.theme', 'Theme') + ': ' + themeName(v);
  b.setAttribute('aria-label', b.title);
}

function langNode() {
  var s = el('select', 'ub-sel');
  s.setAttribute('data-ub', 'lang');
  s.title = t('ui.lang', 'Language');
  s.setAttribute('aria-label', t('ui.lang', 'Language'));
  var list = allLangs(), i;
  for (i = 0; i < list.length; i++) {
    var o = el('option', '', list[i]);
    o.value = list[i];
    o.title = t('lang.' + list[i], list[i].toUpperCase());
    s.appendChild(o);
  }
  s.value = langNow();
  s.onchange = function () { setLang(s.value); };
  return s;
}

function extraNode(it) {
  var n = it.href ? el('a', 'ub-btn') : el('button', 'ub-btn');
  if (it.href) { n.href = it.href; if (it.target) n.target = it.target; }
  else n.type = 'button';
  var ic = typeof it.icon === 'function' ? it.icon() : (it.icon || '');
  var tx = typeof it.text === 'function' ? it.text() : (it.text || '');
  n.textContent = ic && tx ? (ic + ' ' + tx) : (ic || tx || '?');
  var ttl = typeof it.title === 'function' ? it.title() : (it.title || '');
  if (ttl) { n.title = ttl; n.setAttribute('aria-label', ttl); }
  if (it.onClick) n.onclick = it.onClick;
  return n;
}

function slotNode(box, slot) {
  var i, kids = box.childNodes;
  for (i = 0; i < kids.length; i++)
    if (kids[i].nodeType === 1 && kids[i].getAttribute('data-ub') === slot) return kids[i];
  return null;
}

function renderBar(box) {
  if (!box) return;
  if (!hasClass(box, 'uibar')) box.className = (box.className ? box.className + ' ' : '') + 'uibar';
  box.innerHTML = '';
  var hideLogo = NO_LOGO || box.getAttribute('data-home') === '0';
  var hideAcc = NO_ACC || box.getAttribute('data-account') === '0';
  if (!hideLogo) box.appendChild(logoNode());
  box.appendChild(el('i', 'ub-grow'));
  box.appendChild(themeNode());
  box.appendChild(langNode());
  if (!hideAcc) box.appendChild(accNode());
  for (var i = 0; i < extras.length; i++) {
    var it = extras[i], node = extraNode(it), slot = it.slot || 'account';
    if (slot === 'end') box.appendChild(node);
    else {
      var anchor = slotNode(box, slot);
      if (anchor) box.insertBefore(node, anchor); else box.appendChild(node);
    }
  }
  box.setAttribute('data-ui-done', '1');
}

function mountBars() {
  var boxes = document.querySelectorAll(SEL), i;
  for (i = 0; i < boxes.length; i++) renderBar(boxes[i]);
}

/* обновление значений без пересборки: значок темы и выбранный язык */
function paint() {
  var boxes = document.querySelectorAll(SEL), i;
  for (i = 0; i < boxes.length; i++) {
    paintTheme(boxes[i].querySelector('[data-ub="theme"]'));
    var s = boxes[i].querySelector('[data-ub="lang"]');
    if (s && s.value !== langNow()) s.value = langNow();
  }
}

function setOnline(v) {
  var nv = (v === true || v === false) ? v : null;
  if (nv === online) return;      // страницы зовут часто — лишний перерисовки не надо
  online = nv;
  mountBars();
}

function add(item) {
  if (!item) return null;
  extras.push(item);
  mountBars();
  return item;
}

/* ---------- стили шаблона ---------- */
function injectCss() {
  if (document.getElementById('ui-css')) return;
  var l = document.createElement('link');
  l.id = 'ui-css';
  l.rel = 'stylesheet';
  l.href = BASE + 'ui.css';
  (document.head || document.getElementsByTagName('head')[0]).appendChild(l);
}

/* ---------- значок страницы (вкладка, закладки) ----------
 * Одна картинка на весь сайт: site\favicon.png = site\ui\logo.png (32 x 32).
 * Зовётся после разбора страницы: страница со своим значком (мини-приложения — icon.png)
 * остаётся при своём, остальные получают знак сайта. */
function injectIcon() {
  if (document.querySelector('link[rel~="icon"]')) return;
  var h = document.head || document.getElementsByTagName('head')[0];
  if (!h) return;
  var l = document.createElement('link');
  l.rel = 'icon';
  l.type = 'image/png';
  l.setAttribute('sizes', '32x32');
  l.href = '/favicon.png';          // знак сайта лежит в корне домена (site\favicon.png)
  h.appendChild(l);
}

/* ---------- старт ---------- */
injectCss();
apply();   // тема должна стоять до разбора CSS ниже по странице

document.addEventListener('DOMContentLoaded', function () {
  appliedLang = langNow();
  injectIcon();   // только теперь видно, объявила ли страница свой значок
  mountBars();
  localize();
  apply();
  loadTables();
});

/* система переключила тему — если выбрано «как в системе», меняемся следом */
function onSys() { if (theme() === 'auto') apply(); }
if (mqL) {
  if (mqL.addEventListener) mqL.addEventListener('change', onSys);
  else if (mqL.addListener) mqL.addListener(onSys);
}

var UI = {
  theme: theme, resolved: resolved, setTheme: setTheme,
  lang: langNow, langs: function () { return allLangs().slice(); }, setLang: setLang,
  t: t, localize: localize, apply: apply, sync: sync,
  refresh: mountBars, online: setOnline, add: add,
  ready: function () { return tbl.ready; },
  account: { page: ACCP, signin: SIGNP },
  onChange: null, onLang: null
};
window.UI = UI;
window.t = t;   // чтобы код страниц мог писать t('ключ', 'English fallback')
})();
