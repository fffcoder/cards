/* ===== Tab 切换 ===== */
(function () {
  const LS = 'app.tab.v1';
  const panels = { cards: document.getElementById('panel-cards'), articles: document.getElementById('panel-articles') };
  const tabs = document.querySelectorAll('#tabbar .tab');

  function show(name, save) {
    if (!panels[name]) name = 'cards';
    Object.keys(panels).forEach(k => panels[k].classList.toggle('on', k === name));
    tabs.forEach(t => t.classList.toggle('on', t.dataset.tab === name));
    document.body.classList.toggle('in-articles', name === 'articles');
    if (save !== false) { try { localStorage.setItem(LS, name); } catch (e) {} }
    window.scrollTo(0, 0);
  }

  tabs.forEach(t => { t.onclick = () => show(t.dataset.tab); });

  let saved = 'cards';
  try { saved = localStorage.getItem(LS) || 'cards'; } catch (e) {}
  // 如果链接里带文章锚点，直接进史论
  if (location.hash && location.hash.length > 1) saved = 'articles';
  show(saved, false);

  window.__showTab = show;
})();
