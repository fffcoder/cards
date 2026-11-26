#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 themes/<主题>/*.json 合成单文件 index.html。

用法：
    python3 build.py

每个主题目录里的卡片按文件名排序（001-、002- …），
字段：era 时代 / title 标题 / body 正文 / think 多想一层（可选）
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
THEME_DIR = os.path.join(ROOT, 'themes')
OUT = os.path.join(ROOT, 'index.html')

# 主题显示顺序与名称（新增主题时在这里加一行）
THEME_META = {
    'history':  ('历史', '三皇五帝到民国'),
}

SHELL = os.path.join(ROOT, 'shell.html')


def load_theme(tid):
    d = os.path.join(THEME_DIR, tid)
    cards = []
    for name in sorted(os.listdir(d)):
        if not name.endswith('.json'):
            continue
        with open(os.path.join(d, name), encoding='utf-8') as f:
            raw = json.load(f)
        cards.append({
            'e': raw.get('era', ''),
            't': raw.get('title', ''),
            'b': raw.get('body', ''),
            'x': raw.get('think', ''),
        })
    return cards


def main():
    themes = []
    for tid in sorted(os.listdir(THEME_DIR)):
        path = os.path.join(THEME_DIR, tid)
        if not os.path.isdir(path):
            continue
        cards = load_theme(tid)
        if not cards:
            continue
        name, desc = THEME_META.get(tid, (tid, ''))
        themes.append({
            'id': tid,
            'name': name,
            'desc': '%s · %d 张' % (desc, len(cards)),
            'cards': cards,
        })

    if not themes:
        sys.exit('themes/ 下没有找到卡片')

    with open(SHELL, encoding='utf-8') as f:
        shell = f.read()

    data = json.dumps(themes, ensure_ascii=False)
    html = shell.replace('__THEMES__', data)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(html)

    total = sum(len(t['cards']) for t in themes)
    print('生成 %s' % OUT)
    for t in themes:
        print('  %-10s %-6s %3d 张' % (t['id'], t['name'], len(t['cards'])))
    print('  合计 %d 张' % total)


if __name__ == '__main__':
    main()
