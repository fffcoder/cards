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

/* ---------- 主题拼装 ---------- */
// 「全部」这类主题只存来源列表，启动时在内存里拼一次，避免页面里存重复数据
function hydrateThemes() {
  const byId = {};
  // 先把真实主题的卡片收起来
  window.__THEMES__.forEach(t => { if (t.cards) byId[t.id] = t.cards; });
  // 再给「全部」这类主题拼出完整的卡片数组
  window.__THEMES__.forEach(t => {
    if ((!t.cards || !t.cards.length) && t.parts) {
      const merged = [];
      t.parts.forEach(id => {
        const src = byId[id];
        if (src) for (let i = 0; i < src.length; i++) merged.push(src[i]);
      });
      t.cards = merged;
    }
  });
  // 兜底：任何主题都没有卡片时，退回第一个有卡片的主题
  if (!window.__THEMES__.some(t => t.cards && t.cards.length && t.id !== 'all')) {
    console.error('没有可用的卡片数据');
  }
}
hydrateThemes();

/* ---------- 存储 ---------- */
function seenKey() {
  // 带上内容版本号：卡片内容一变，旧的阅读记录自动作废
  return 'cards.seen.' + theme.id + '.' + (window.__VERSION__ || 'v1');
}

function loadSeen() {
  try {
    const raw = JSON.parse(localStorage.getItem(seenKey()) || '{}');
    if (!raw || typeof raw !== 'object') return {};
    // 卡片数量变化后，越界的旧索引会污染统计，这里直接丢掉
    const clean = {};
    for (const k in raw) {
      const i = Number(k);
      if (Number.isInteger(i) && i >= 0 && i < pool.length) clean[i] = raw[k];
    }
    return clean;
  } catch (e) { return {}; }
}

function saveSeen() {
  try { localStorage.setItem(seenKey(), JSON.stringify(seen)); } catch (e) {}
}

/* ---------- 权重抽取 ---------- */
function weightOf(i) {
  const n = Number(seen[i]) || 0;
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
    const avail = [];
    for (let i = 0; i < pool.length; i++) if (exclude.indexOf(i) < 0) avail.push(i);
    const src = avail.length ? avail : Array.from({ length: pool.length }, (_, i) => i);
    return src[Math.floor(Math.random() * src.length)];
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
  for (const k in seen) {
    // 只统计当前池子范围内的索引（卡片内容换过之后，旧记录会越界）
    const i = Number(k);
    if (seen[k] > 0 && i >= 0 && i < pool.length) n++;
  }
  return n;
}

function updateHeader() {
  document.getElementById('themeName').textContent = theme.name;
}

/* ---------- 渲染 ---------- */
function place(el, offsetY, scale, opacity) {
  el.style.transform = 'translate3d(0, calc(-50% + ' + offsetY + 'px), 0) scale(' + scale + ')';
  el.style.opacity = String(opacity);
}

function markSeen(i) {
  seen[i] = (seen[i] || 0) + 1;
  saveSeen();
  updateHeader();
}

/** 把卡片内容刷成第 i 张（复用同一个元素） */
function fillCard(el, i) {
  const c = pool[i];
  el.innerHTML = '<div class="era"></div><h2></h2><p></p><div class="think"></div>';

  const era = el.querySelector('.era');
  if (c.e) era.textContent = c.e; else era.remove();

  el.querySelector('h2').textContent = c.t;
  el.querySelector('p').innerHTML = markTerms(c.b, c.terms);
  bindTerms(el);

  const think = el.querySelector('.think');
  if (c.x) think.textContent = c.x; else think.remove();

  el.dataset.i = i;
  curIdx = i;
  markSeen(i);
}

/**
 * 换卡：总是「当面这一张原地换内容」，不做双卡叠层动画。
 * 上下滑动时卡片跟手移动，松手后归位；成功翻页就用新内容复位。
 * 这样无论多快连滑，都不会出现卡片飞出后没有新卡接管、或者透明度停在 0。
 */
function render(i, fromDir) {
  if (!pool.length) return;
  i = Math.max(0, Math.min(i, pool.length - 1));

  const dir = fromDir || 0;
  resetGestures();

  // 清掉多余卡片，只留一张
  const cards = stage.querySelectorAll('.card');
  for (let k = 1; k < cards.length; k++) cards[k].remove();

  let el = cards[0];
  if (!el) {
    el = document.createElement('div');
    el.className = 'card';
    stage.appendChild(el);
  }

  fillCard(el, i);
  bindSwipe(el);

  // 新内容从滑动来的方向轻轻归位
  el.style.transition = 'none';
  place(el, dir === 0 ? 0 : -(dir * 26), 1, 1);

  requestAnimationFrame(() => {
    el.style.transition = '';
    place(el, 0, 1, 1);
  });
}

function next() {
  // 只记最近几张用于去重，不再支持回看
  history.push(curIdx);
  if (history.length > CONFIG.recent + 2) history.shift();
  const recent = history.slice(-CONFIG.recent).filter(x => x >= 0);
  render(pick(recent), 1);
}

/* ---------- 换卡 ---------- */
// 只靠底部的按钮切下一张，卡片不再跟手滑动

function bindSwipe(el) {
  // 预留：当前版本不绑定滑动手势
}

function resetGestures() {}

/** 点按钮：切到下一张 */
function nextCard() {
  hidePop();
  const el = stage.querySelector('.card');

  if (!el) {
    render(pick([]), 0);
    return;
  }

  // 轻轻往上一推，然后换内容
  el.style.transition = '';
  el.style.transform = 'translate3d(0, calc(-50% - 40px), 0)';
  el.style.opacity = '0';

  setTimeout(() => {
    next();
  }, 130);
}

/* ---------- 键盘 ---------- */
window.addEventListener('keydown', e => {
  if (sheet.classList.contains('on')) {
    if (e.key === 'Escape') closeSheet();
    return;
  }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
    e.preventDefault();
    nextCard();
  }
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
      '<div><span>' + t.name + '</span><small>' + t.desc.replace(t.name, '').replace(/^\s*·?\s*/, '') + '</small></div>' +
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
document.getElementById('nextBtn').onclick = nextCard;
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
  const seenEl = document.getElementById('seen');
  if (seenEl) seenEl.remove();

  updateHeader();
  render(pick([]), 0);
})();
