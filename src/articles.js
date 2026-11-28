/* ==========================================================================
   历史文章集 · 逻辑
   列表 + 阅读页 + 全局搜索
   ========================================================================== */

const ARTS = window.__ARTICLES__ || [];
const LS_READ = 'articles.read.v1';

const listEl = document.getElementById('list');
const readerEl = document.getElementById('reader');
const qEl = document.getElementById('q');
const clearBtn = document.getElementById('clearBtn');
const backBtn = document.getElementById('backBtn');
const progressEl = document.getElementById('progress');

let currentId = null;

/* ---------- 已读记录 ---------- */
function readSet() {
  try {
    const a = JSON.parse(localStorage.getItem(LS_READ) || '[]');
    return new Set(Array.isArray(a) ? a : []);
  } catch (e) { return new Set(); }
}
function markRead(id) {
  const s = readSet();
  s.add(id);
  try { localStorage.setItem(LS_READ, JSON.stringify([...s])); } catch (e) {}
}

/* ---------- 高亮 ---------- */
function esc(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function highlight(text, terms) {
  let out = esc(text);
  if (!terms.length) return out;
  terms.forEach(t => {
    if (!t) return;
    const safe = esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(safe, 'gi'), m => '<mark>' + m + '</mark>');
  });
  return out;
}

/* ---------- 搜索 ---------- */
function tokenize(q) {
  return q.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** 在正文里取包含关键词的一小段 */
function snippet(a, terms) {
  if (!terms.length) return '';
  const lower = a.text.toLowerCase();
  let idx = -1;
  for (const t of terms) {
    idx = lower.indexOf(t);
    if (idx >= 0) break;
  }
  if (idx < 0) return '';
  const start = Math.max(0, idx - 34);
  const end = Math.min(a.text.length, idx + 80);
  return (start > 0 ? '…' : '') + a.text.slice(start, end) + (end < a.text.length ? '…' : '');
}

function score(a, terms) {
  if (!terms.length) return 1;
  const title = a.title.toLowerCase();
  const sub = a.subtitle.toLowerCase();
  const tags = a.tags.join(' ').toLowerCase();
  const era = a.era.toLowerCase();
  const text = a.text.toLowerCase();
  let s = 0;
  for (const t of terms) {
    let hit = 0;
    if (title.includes(t)) hit += 10;
    if (sub.includes(t)) hit += 5;
    if (tags.includes(t)) hit += 6;
    if (era.includes(t)) hit += 5;
    if (text.includes(t)) hit += 1;
    if (!hit) return 0; // 所有词都要出现
    s += hit;
  }
  return s;
}

/* ---------- 列表渲染 ---------- */
function renderList() {
  const terms = tokenize(qEl.value);
  const read = readSet();

  const items = ARTS
    .map(a => ({ a, s: score(a, terms) }))
    .filter(x => x.a.track !== '导航')
    .filter(x => x.s > 0)
    .sort((x, y) => (terms.length ? y.s - x.s : 0) || (y.a.date > x.a.date ? 1 : -1));

  if (!items.length) {
    listEl.innerHTML = '<div class="empty">没有找到相关文章<br>试试换个词，比如「叫魂」「官僚」「鸦片」</div>';
    return;
  }

  const nav = ARTS.find(x => x.track === '导航');
  const navCard = (nav && !terms.length) ? `<button class="art nav-card" data-id="${nav.id}">
      <div class="meta"><span>从这里开始</span></div>
      <h2>${esc(nav.title)}</h2>
      <p class="sub">${esc(nav.subtitle)}</p>
    </button>` : '';

  listEl.innerHTML = navCard + items.map(({ a }) => {
    const snip = snippet(a, terms);
    return `<button class="art" data-id="${a.id}">
      <div class="meta">
        <span>${highlight(a.era, terms)}</span>
        <span class="sep">·</span>
        <span>${a.words} 字</span>
        ${read.has(a.id) ? '<span class="sep">·</span><span>已读</span>' : ''}
      </div>
      <h2>${highlight(a.title, terms)}</h2>
      ${a.subtitle ? `<p class="sub">${highlight(a.subtitle, terms)}</p>` : ''}
      ${snip ? `<p class="snippet">${highlight(snip, terms)}</p>` : ''}
      <div class="tags">${a.tags.map(t => `<span class="tag">${highlight(t, terms)}</span>`).join('')}</div>
    </button>`;
  }).join('');

  listEl.querySelectorAll('.art').forEach(btn => {
    btn.onclick = () => openArticle(btn.dataset.id);
  });
}

/* ---------- 阅读页 ---------- */
function openArticle(id) {
  const a = ARTS.find(x => x.id === id);
  if (!a) return;
  currentId = id;

  readerEl.innerHTML = `
    <div class="era">${esc(a.era)}</div>
    <h1>${esc(a.title)}</h1>
    ${a.subtitle ? `<p class="lede">${esc(a.subtitle)}</p>` : ''}
    <div class="body">${a.html}</div>
    <div class="reading-meta">${a.words} 字 · ${a.tags.map(t => '#' + t).join(' ')}</div>
  `;

  // 文内链接：跳到对应文章
  readerEl.querySelectorAll('a[data-article]').forEach(link => {
    link.onclick = e => {
      e.preventDefault();
      openArticle(link.dataset.article);
    };
  });

  document.body.classList.add('reading');
  window.scrollTo(0, 0);
  markRead(id);
  history.pushState({ id }, '', '#' + id);
  updateProgress();
}

function closeArticle(fromPop) {
  document.body.classList.remove('reading');
  readerEl.innerHTML = '';
  currentId = null;
  progressEl.style.width = '0';
  renderList();
  if (!fromPop) {
    history.pushState({}, '', location.pathname + location.search);
  }
  window.scrollTo(0, 0);
}

backBtn.onclick = () => {
  if (history.state && history.state.id) history.back();
  else closeArticle();
};

window.addEventListener('popstate', e => {
  if (e.state && e.state.id) openArticle(e.state.id);
  else if (document.body.classList.contains('reading')) closeArticle(true);
});

/* ---------- 阅读进度 ---------- */
function updateProgress() {
  if (!document.body.classList.contains('reading')) return;
  const h = document.documentElement.scrollHeight - window.innerHeight;
  const p = h > 0 ? Math.min(1, window.scrollY / h) : 0;
  progressEl.style.width = (p * 100) + '%';
}
window.addEventListener('scroll', updateProgress, { passive: true });

/* ---------- 搜索交互 ---------- */
let t = null;
qEl.addEventListener('input', () => {
  clearBtn.classList.toggle('on', !!qEl.value);
  clearTimeout(t);
  t = setTimeout(renderList, 90);
});
qEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const first = listEl.querySelector('.art');
    if (first) openArticle(first.dataset.id);
    qEl.blur();
  }
});
clearBtn.onclick = () => {
  qEl.value = '';
  clearBtn.classList.remove('on');
  renderList();
  qEl.focus();
};

// 在阅读页里输入则先返回列表
qEl.addEventListener('focus', () => {
  if (document.body.classList.contains('reading')) closeArticle();
});

/* ---------- 启动 ---------- */
(function init() {
  renderList();
  const hash = decodeURIComponent(location.hash.replace('#', ''));
  if (hash && ARTS.some(a => a.id === hash)) {
    openArticle(hash);
  } else {
    history.replaceState({}, '', location.pathname + location.search);
  }
})();
