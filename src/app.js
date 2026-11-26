/* ==========================================================================
   卡片 · 逻辑
   数据从 window.__THEMES__ 读（build.py 注入）。
   ========================================================================== */

/* ---------- 配置 ---------- */
const CONFIG = {
  decay: 0.3,        // 看过一次后的权重倍数
  floor: 0.03,       // 权重下限，避免老卡片彻底不出现
  recent: 8,         // 最近抽过的若干张不重复
  threshold: 55,     // 滑动多少像素算翻页
  axisLock: 8        // 手势方向判定阈值
};

const KEY_THEME = 'cards.theme.v1';

/* ---------- 状态 ---------- */
let theme = null;
let pool = [];
let seen = {};
let history = [];
let curIdx = -1;

const stage = document.getElementById('stage');
const sheet = document.getElementById('sheet');
const themeList = document.getElementById('themeList');

/* ---------- 存储 ---------- */
function seenKey() { return 'cards.seen.' + theme.id + '.v1'; }

function loadSeen() {
  try {
    const o = JSON.parse(localStorage.getItem(seenKey()) || '{}');
    return (o && typeof o === 'object') ? o : {};
  } catch (e) { return {}; }
}

function saveSeen() {
  try { localStorage.setItem(seenKey(), JSON.stringify(seen)); } catch (e) {}
}

/* ---------- 权重抽取 ---------- */
function weightOf(i) {
  const n = seen[i] || 0;
  if (!n) return 1;
  return Math.max(CONFIG.floor, Math.pow(CONFIG.decay, n));
}

function pick(exclude) {
  exclude = exclude || [];
  let total = 0;
  const weights = [];
  for (let i = 0; i < pool.length; i++) {
    const w = exclude.indexOf(i) >= 0 ? 0 : weightOf(i);
    weights.push(w);
    total += w;
  }
  if (total <= 0) {
    // 全部看过了：均匀随机，但尽量避开刚看过的
    let i;
    do { i = Math.floor(Math.random() * pool.length); }
    while (exclude.indexOf(i) >= 0 && exclude.length < pool.length);
    return i;
  }
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return pool.length - 1;
}

/* ---------- 顶部信息 ---------- */
function seenCount() {
  let n = 0;
  for (const k in seen) if (seen[k] > 0) n++;
  return n;
}

function updateHeader() {
  document.getElementById('themeName').textContent = theme.name;
  document.getElementById('seen').innerHTML =
    '已看 <b>' + seenCount() + '</b> / ' + pool.length;
}

/* ---------- 渲染 ---------- */
function makeCard(i) {
  const c = pool[i];
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = '<div class="era"></div><h2></h2><p></p><div class="think"></div>';

  const era = el.querySelector('.era');
  if (c.e) era.textContent = c.e; else era.remove();

  el.querySelector('h2').textContent = c.t;
  el.querySelector('p').innerHTML = markTerms(c.b, c.terms);
  bindTerms(el);

  const think = el.querySelector('.think');
  if (c.x) think.textContent = c.x; else think.remove();

  return el;
}

function place(el, offsetY, scale, opacity) {
  el.style.transform = 'translate3d(0, calc(-50% + ' + offsetY + 'px), 0) scale(' + scale + ')';
  el.style.opacity = String(opacity);
}

function markSeen(i) {
  seen[i] = (seen[i] || 0) + 1;
  saveSeen();
  updateHeader();
}

function render(i, fromDir) {
  if (!pool.length) return;
  i = Math.max(0, Math.min(i, pool.length - 1));

  stage.innerHTML = '';
  const el = makeCard(i);
  el.style.transition = 'none';
  place(el, fromDir ? fromDir * 36 : 0, fromDir ? 0.95 : 1, 0);
  stage.appendChild(el);
  bindSwipe(el);

  requestAnimationFrame(() => {
    el.style.transition = '';
    place(el, 0, 1, 1);
  });

  curIdx = i;
  markSeen(i);
}

function next() {
  history.push(curIdx);
  const recent = history.slice(-CONFIG.recent).concat([curIdx]).filter(x => x >= 0);
  render(pick(recent), 1);
}

function prev() {
  if (history.length < 2) return;
  history.pop();
  render(history[history.length - 1], -1);
}

/* ---------- 手势 ---------- */
function bindSwipe(el) {
  let x0 = 0, y0 = 0, dx = 0, active = false, axis = null;

  el.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    active = true;
    dx = 0;
    axis = null;
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    el.style.transition = 'none';
  }, { passive: true });

  el.addEventListener('touchmove', e => {
    if (!active) return;
    const tx = e.touches[0].clientX;
    const ty = e.touches[0].clientY;
    dx = tx - x0;
    const dy = ty - y0;

    if (axis === null && (Math.abs(dx) > CONFIG.axisLock || Math.abs(dy) > CONFIG.axisLock)) {
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (axis === 'y') return;

    if (e.cancelable) e.preventDefault();
    el.style.transform = 'translate3d(' + dx + 'px, -50%, 0) rotate(' + (dx * 0.025) + 'deg)';
    el.style.opacity = String(Math.max(0.4, 1 - Math.abs(dx) / 460));
  }, { passive: false });

  // 用 endIndex 防止重复触发（touchend 和 touchcancel 只会有一个生效）
  let endToken = 0;

  function finish() {
    if (!active) return;
    active = false;
    el.style.transition = '';

    if (dx <= -CONFIG.threshold) {
      el.style.transform = 'translate3d(-120vw, -50%, 0) rotate(-10deg)';
      el.style.opacity = '0';
      // 兜底：万一动画回调没跑，也不能把界面卡死
      const token = ++endToken;
      setTimeout(() => { if (token === endToken) next(); }, 170);
    } else if (dx >= CONFIG.threshold) {
      el.style.transform = 'translate3d(120vw, -50%, 0) rotate(10deg)';
      el.style.opacity = '0';
      const token = ++endToken;
      setTimeout(() => { if (token === endToken) prev(); }, 170);
    } else {
      place(el, 0, 1, 1);
    }
  }

  el.addEventListener('touchend', finish, { passive: true });
  el.addEventListener('touchcancel', () => {
    if (!active) return;
    active = false;
    el.style.transition = '';
    place(el, 0, 1, 1);
  }, { passive: true });


  /* 桌面 / 鼠标 */
  let mx = 0, down = false;
  el.addEventListener('mousedown', e => {
    down = true;
    mx = e.clientX;
    el.style.transition = 'none';
  });
  window.addEventListener('mousemove', e => {
    if (!down) return;
    const d = e.clientX - mx;
    el.style.transform = 'translate3d(' + d + 'px, -50%, 0) rotate(' + (d * 0.025) + 'deg)';
  });
  window.addEventListener('mouseup', e => {
    if (!down) return;
    down = false;
    el.style.transition = '';
    const d = e.clientX - mx;
    if (d <= -CONFIG.threshold) next();
    else if (d >= CONFIG.threshold) prev();
    else place(el, 0, 1, 1);
  });
}

/* ---------- 键盘 ---------- */
window.addEventListener('keydown', e => {
  if (sheet.classList.contains('on')) {
    if (e.key === 'Escape') closeSheet();
    return;
  }
  if (e.key === 'ArrowRight') next();
  if (e.key === 'ArrowLeft') prev();
});

/* ---------- 词条 ---------- */
const GLOSSARY = window.__GLOSSARY__ || {};
let activePop = null;
let activeTerm = null;

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/**
 * 正文里的词条包成 <span class="term">。
 * 同一张卡里同一个词只标第一次出现；优先匹配长词。
 */
function markTerms(text, allowed) {
  if (!text) return '';
  let keys = Object.keys(GLOSSARY);
  if (allowed && allowed.length) keys = keys.filter(k => allowed.indexOf(k) >= 0);
  keys.sort((a, b) => b.length - a.length);
  if (!keys.length) return escapeHtml(text);

  const used = [];
  let out = '', i = 0;
  while (i < text.length) {
    let hit = null;
    for (const k of keys) {
      if (text.startsWith(k, i) && used.indexOf(k) < 0) { hit = k; break; }
    }
    if (hit) {
      used.push(hit);
      out += '<span class="term" data-term="' + escapeHtml(hit) + '">' + escapeHtml(hit) + '</span>';
      i += hit.length;
    } else {
      out += escapeHtml(text[i]);
      i++;
    }
  }
  return out;
}

function ensurePop() {
  if (activePop) return activePop;
  activePop = document.createElement('div');
  activePop.id = 'pop';
  document.body.appendChild(activePop);
  return activePop;
}

function hidePop() {
  if (activePop) activePop.classList.remove('on');
  activeTerm = null;
}

function showPop(term, anchor) {
  const def = GLOSSARY[term];
  if (!def) return;
  const pop = ensurePop();
  pop.innerHTML = '<b>' + escapeHtml(term) + '</b>' + escapeHtml(def);

  const r = anchor.getBoundingClientRect();
  const pad = 12;
  pop.style.visibility = 'hidden';
  pop.classList.add('on');

  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let left = r.left + r.width / 2 - pw / 2;
  left = Math.max(pad, Math.min(left, window.innerWidth - pw - pad));

  const above = r.top - ph - 12;
  let top;
  if (above >= pad + 8) {
    top = above;
    pop.classList.remove('below');
    pop.classList.add('above');
  } else {
    top = r.bottom + 12;
    pop.classList.remove('above');
    pop.classList.add('below');
  }

  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
  pop.style.setProperty('--arrow-x', Math.max(14, Math.min(pw - 14, r.left + r.width / 2 - left)) + 'px');
  pop.style.visibility = '';
  activeTerm = term;
}

function bindTerms(el) {
  el.querySelectorAll('.term').forEach(t => {
    t.addEventListener('click', e => {
      e.stopPropagation();
      const term = t.dataset.term;
      if (activeTerm === term && activePop && activePop.classList.contains('on')) hidePop();
      else showPop(term, t);
    });
  });
}

document.addEventListener('touchstart', e => {
  if (e.target.closest && e.target.closest('.term')) return;
  hidePop();
}, { passive: true });
document.addEventListener('mousedown', e => {
  if (e.target.closest && e.target.closest('.term')) return;
  hidePop();
});
window.addEventListener('resize', hidePop);

/* ---------- 主题选择 ---------- */
function renderThemeList() {
  themeList.innerHTML = '';
  window.__THEMES__.forEach(t => {
    const b = document.createElement('button');
    b.className = 'titem' + (t.id === theme.id ? ' now' : '');
    b.innerHTML =
      '<div><span>' + t.name + '</span><small>' + t.desc + '</small></div>' +
      '<span class="dot">●</span>';
    b.onclick = () => switchTheme(t.id);
    themeList.appendChild(b);
  });
}

function openSheet() {
  renderThemeList();
  sheet.classList.add('on');
}

function closeSheet() {
  sheet.classList.remove('on');
}

function switchTheme(id) {
  theme = window.__THEMES__.find(t => t.id === id) || window.__THEMES__[0];
  try { localStorage.setItem(KEY_THEME, theme.id); } catch (e) {}
  pool = theme.cards;
  seen = loadSeen();
  history = [];
  closeSheet();
  updateHeader();
  render(pick([]), 0);
}

document.getElementById('themeBtn').onclick = openSheet;
document.getElementById('closeSheet').onclick = closeSheet;
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });

/* ---------- 启动 ---------- */
(function init() {
  const saved = localStorage.getItem(KEY_THEME);
  theme = window.__THEMES__.find(t => t.id === saved) || window.__THEMES__[0];
  pool = theme.cards;
  seen = loadSeen();

  // 只有一个主题时，隐藏切换按钮
  if (window.__THEMES__.length < 2) {
    document.getElementById('themeBtn').style.display = 'none';
  }

  updateHeader();
  render(pick([]), 0);
})();
