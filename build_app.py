#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把卡片和文章集合并成一个单页应用 index.html（底部 Tab 切换）"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
OUT = os.path.join(ROOT, 'index.html')

sys.path.insert(0, ROOT)
import build as cardbuild      # 复用卡片的主题读取
import build_articles as artbuild  # 复用文章解析


def read(*parts):
    with open(os.path.join(*parts), encoding='utf-8') as f:
        return f.read()


def main():
    # ---- 卡片数据 ----
    themes, problems = cardbuild.collect()
    if problems:
        print('卡片数据有问题：')
        for p in problems:
            print('  -', p)

    glossary = {}
    for tid in sorted(os.listdir(cardbuild.THEME_DIR)):
        p = os.path.join(cardbuild.THEME_DIR, tid)
        if not os.path.isdir(p) or tid.startswith('_'):
            continue
        for k, v in cardbuild.load_glossary(tid).items():
            glossary.setdefault(k, v)

    import hashlib
    fingerprint = hashlib.md5(
        ''.join(c['t'] for t in themes for c in t.get('cards', [])).encode('utf-8')
    ).hexdigest()[:10]

    # ---- 文章数据 ----
    arts = artbuild.load_articles()

    data = ('window.__VERSION__ = ' + repr(fingerprint) + ';\n'
            + 'window.__THEMES__ = ' + json.dumps(themes, ensure_ascii=False) + ';\n'
            + 'window.__GLOSSARY__ = ' + json.dumps(glossary, ensure_ascii=False) + ';\n'
            + 'window.__ARTICLES__ = ' + json.dumps(arts, ensure_ascii=False) + ';')

    style = read(SRC, 'style.css') + '\n' + read(SRC, 'articles.css') + '\n' + read(SRC, 'tabs.css')
    cards_app = read(SRC, 'app.js')
    arts_app = read(SRC, 'articles.js')

    html = (read(SRC, 'app_shell.html')
            .replace('/*__STYLE__*/', style)
            .replace('/*__DATA__*/', data)
            .replace('/*__CARDS_APP__*/', cards_app)
            .replace('/*__ARTICLES_APP__*/', read(SRC, 'tabs.js') + '\n' + arts_app))

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(html)

    total_cards = sum(len(t.get('cards', [])) for t in themes)
    print('生成 %s' % OUT)
    print('  卡片 %d 个主题 / %d 张' % (len(themes), total_cards))
    print('  文章 %d 篇 / %d 字' % (len(arts), sum(a['words'] for a in arts)))
    print('  词条 %d 条' % len(glossary))


if __name__ == '__main__':
    main()
