/* theme.js — общий переключатель темы и языка для страниц AI and Human Messenger.
 *
 * Этот файл лежит в ДВУХ репозиториях и должен оставаться одинаковым:
 *   site\theme.js      → главная (/), вход (/accounts/), аккаунт (/account/)
 *   messenger\theme.js → страница чата и админка
 * Репозитории разные, поэтому «одного общего файла на всё» быть не может —
 * отсюда копия. Правки вносить в оба (они сверяются построчно при публикации).
 *
 * ЧТО ГДЕ ХРАНИТСЯ
 *   * localStorage `ui.theme` | `ui.lang` — кеш устройства. Нужен, чтобы страница
 *     встала в нужной теме до первой отрисовки (иначе вспышка светлого на тёмном)
 *     и работала без входа: у главной и страницы входа профиля нет вообще.
 *   * data\users\<id>\prefs.json на сервере — настройки человека (источник правды).
 *     GET|POST /__prefs. При входе серверные значения перекрывают кеш.
 *
 * ПОДКЛЮЧЕНИЕ (страница)
 *   1. в <head>, ДО <style>:  <script src="theme.js"></script>
 *   2. в разметке рядом с профилем:  <span class="ui-sw" data-ui="switch"></span>
 *   3. когда страница нашла сервер и токен:  UI.sync(base, tok)
 *   4. CSS страницы: цвета только через переменные из :root / html[data-theme="light"].
 *
 * САМОПРОВЕРКА: tools\theme_test.js (разбор файла и разметки страниц, без браузера).
 */
(function () {
'use strict';

var THEMES = ['dark', 'light', 'auto'];   // порядок кнопок: тёмная, светлая, системная
var LANGS  = ['ru', 'en', 'auto'];
var KTH = 'ui.theme', KLG = 'ui.lang';
var root = document.documentElement;
var mqL = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
var srv = { base: '', tok: '' };

function ls(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function lss(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function pick(v, list, def) {
  for (var i = 0; i < list.length; i++) if (list[i] === v) return v;
  return def;
}

function sysTheme() { return mqL && mqL.matches ? 'light' : 'dark'; }
function theme() { return pick(ls(KTH), THEMES, 'auto'); }
function lang() { return pick(ls(KLG), LANGS, 'auto'); }
function resolved() { var t = theme(); return t === 'auto' ? sysTheme() : t; }

// вид переключателя держим здесь, а не в пяти <style>: страницы не должны
// расходиться в мелочах. Цвета — из переменных страницы (--area, --line2, --tx3…)
function injectCss() {
  if (document.getElementById('ui-sw-css')) return;
  var st = document.createElement('style');
  st.id = 'ui-sw-css';
  st.textContent =
    '.ui-sw{display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;font-size:12px;line-height:1}' +
    '.ui-sw-g{display:inline-flex;align-items:center;gap:1px;padding:2px;border-radius:9px;' +
      'background:var(--area,#1d242c);border:1px solid var(--line2,#303a46)}' +
    '.ui-sw-b{background:none;border:0;color:var(--tx3,#8b949e);font:inherit;font-size:12px;line-height:1;' +
      'padding:6px 5px;border-radius:7px;cursor:pointer;min-width:25px;-webkit-tap-highlight-color:transparent}' +
    '.ui-sw-b:hover{color:var(--tx,#e6e9ee)}' +
    '.ui-sw-b[data-th]{font-size:16px;line-height:1.1;padding:5px 6px;font-family:"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif}' +
    '.ui-sw-b[aria-pressed="true"]{background:var(--acc,#2f6fb5);color:var(--accTx,#fff)}' +
    '@media (pointer:coarse){.ui-sw-b{min-width:30px;padding:7px 8px}}';
  (document.head || document.getElementsByTagName('head')[0]).appendChild(st);
}
injectCss();

// системный язык: «ru-RU» → «ru»; незнакомый считаем русским (страницы пока русские)
function sysLang() {
  var v = (navigator.languages && navigator.languages[0]) || navigator.language || 'ru';
  v = String(v).toLowerCase().slice(0, 2);
  return v === 'en' ? 'en' : 'ru';
}
function langNow() { var l = lang(); return l === 'auto' ? sysLang() : l; }

// ---------- применение ----------
function apply() {
  var th = resolved();
  if (root.getAttribute('data-theme') !== th) root.setAttribute('data-theme', th);
  root.setAttribute('data-theme-pref', theme());
  root.setAttribute('lang', langNow());
  // полоса адреса на телефоне красится в цвет фона страницы — его даёт --mtc
  var mc = document.querySelector('meta[name="theme-color"]');
  if (mc) {
    var c = '';
    try { c = window.getComputedStyle(root).getPropertyValue('--mtc'); } catch (e) {}
    c = String(c || '').replace(/\s+/g, '');
    if (c) mc.setAttribute('content', c);
  }
  paint();
}

function paint() {
  var th = theme(), lg = lang(), i;
  var a = document.querySelectorAll('.ui-sw [data-th]');
  for (i = 0; i < a.length; i++) a[i].setAttribute('aria-pressed', a[i].getAttribute('data-th') === th ? 'true' : 'false');
  var b = document.querySelectorAll('.ui-sw [data-lg]');
  for (i = 0; i < b.length; i++) b[i].setAttribute('aria-pressed', b[i].getAttribute('data-lg') === lg ? 'true' : 'false');
}

// ---------- сервер: у человека настройки главнее кеша ----------
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
    body: JSON.stringify({ theme: theme(), lang: lang() })
  }).then(function (r) { return !!r.ok; }).catch(function () { return false; });
}

function sync(base, tok) {
  if (!base || !tok) return Promise.resolve(false);
  srv.base = String(base).replace(/\/+$/, '');
  srv.tok = tok;
  return getPrefs().then(function (j) {
    if (!j || !j.ok) return false;
    if (j.set) {
      var th = pick(j.theme, THEMES, 'auto'), lg = pick(j.lang, LANGS, 'auto');
      if (th !== ls(KTH)) lss(KTH, th);
      if (lg !== ls(KLG)) lss(KLG, lg);
      apply();
      return true;
    }
    // у человека настроек ещё нет — записываем то, что выбрано на этом устройстве
    return putPrefs();
  });
}

// ---------- выбор ----------
function setTheme(v) {
  v = pick(v, THEMES, 'auto');
  lss(KTH, v);
  apply();
  putPrefs();
  if (UI.onChange) { try { UI.onChange({ theme: theme(), lang: lang() }); } catch (e) {} }
}

function setLang(v) {
  v = pick(v, LANGS, 'auto');
  lss(KLG, v);
  apply();
  putPrefs();
  if (UI.onChange) { try { UI.onChange({ theme: theme(), lang: lang() }); } catch (e) {} }
}

// ---------- вид переключателя ----------
var BTN_TH = [{ v: 'dark', t: '🌙', a: 'тёмная тема' },
              { v: 'light', t: '☀️', a: 'светлая тема' },
              { v: 'auto', t: '🖥️', a: 'как в системе' }];
var BTN_LG = [{ v: 'ru', t: 'RU', a: 'русский' },
              { v: 'en', t: 'EN', a: 'английский' },
              { v: 'auto', t: '🌐', a: 'язык системы' }];

function group(label, kind, items) {
  var g = document.createElement('span');
  g.className = 'ui-sw-g';
  g.setAttribute('role', 'group');
  g.setAttribute('aria-label', label);
  for (var i = 0; i < items.length; i++) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ui-sw-b';
    b.setAttribute('data-' + kind, items[i].v);
    b.title = items[i].a;
    b.setAttribute('aria-label', items[i].a);
    b.textContent = items[i].t;
    g.appendChild(b);
  }
  return g;
}

function mount(box) {
  if (!box || box.getAttribute('data-ui-done')) return;
  box.setAttribute('data-ui-done', '1');
  if ((' ' + box.className + ' ').indexOf(' ui-sw ') < 0) box.className += ' ui-sw';
  box.innerHTML = '';
  box.appendChild(group('Тема', 'th', BTN_TH));
  box.appendChild(group('Язык', 'lg', BTN_LG));
}

function fromNode(n) {
  for (; n && n !== document; n = n.parentNode) {
    if (n.nodeType === 1 && n.getAttribute('data-ui') === 'switch') return n;
  }
  return null;
}

document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t || !t.getAttribute) return;
  var v = t.getAttribute('data-th'), l = t.getAttribute('data-lg');
  if (v) { setTheme(v); e.preventDefault(); return; }
  if (l) { setLang(l); e.preventDefault(); return; }
  var box = fromNode(t);
  if (box) mount(box);
});

// ---------- старт ----------
apply();   // сразу: тема должна стоять до разбора CSS ниже по странице

document.addEventListener('DOMContentLoaded', function () {
  var boxes = document.querySelectorAll('[data-ui="switch"]');
  for (var i = 0; i < boxes.length; i++) mount(boxes[i]);
  apply();
});

// система переключила тему — если выбрано «как в системе», меняемся следом
function onSys() { if (theme() === 'auto') apply(); }
if (mqL) {
  if (mqL.addEventListener) mqL.addEventListener('change', onSys);
  else if (mqL.addListener) mqL.addListener(onSys);
}

window.UI = {
  theme: theme, lang: lang, resolved: resolved,
  setTheme: setTheme, setLang: setLang,
  apply: apply, sync: sync,
  onChange: null
};
})();
