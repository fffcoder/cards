#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 themes/<主题>/*.json + src/ 合成单文件 index.html。

用法：
    python3 build.py            # 构建
    python3 build.py --check    # 只检查数据，不写文件

目录结构：
    src/shell.html   页面骨架（三个占位符）
    src/style.css    样式（改配色只动这里的变量）
    src/app.js       逻辑
    themes/<id>/*.json  一张卡片一个文件
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
THEME_DIR = os.path.join(ROOT, 'themes')
OUT = os.path.join(ROOT, 'index.html')

# 主题元信息：目录名 -> (显示名, 简介)
# 新增主题时在这里加一行，否则用目录名兜底
THEME_META = {
    'ming': ('明朝', '洪武到南明'),
    'qing': ('清朝', '入关到逊位'),
}

# 卡片必填字段
REQUIRED = ('title', 'body')

# 词条文件名（放在主题目录里，不当作卡片）
GLOSSARY_FILE = 'glossary.json'

# 排序，决定主题列表的顺序
THEME_ORDER = ['ming', 'qing']


def iter_card_files(theme_dir):
    """遍历主题目录下的卡片文件（支持朝代子目录，跳过 _backup 等下划线目录）"""
    for root, dirs, files in os.walk(theme_dir):
        dirs[:] = sorted(x for x in dirs if not x.startswith('_'))
        for name in sorted(files):
            if name.endswith('.json') and name != GLOSSARY_FILE:
                yield os.path.join(root, name)


def load_theme(tid):
    d = os.path.join(THEME_DIR, tid)
    cards, problems = [], []
    for path in iter_card_files(d):
        name = os.path.relpath(path, d)
        try:
            with open(path, encoding='utf-8') as f:
                raw = json.load(f)
        except Exception as e:
            problems.append('%s 解析失败：%s' % (name, e))
            continue

        missing = [k for k in REQUIRED if not raw.get(k)]
        if missing:
            problems.append('%s 缺字段 %s' % (name, ', '.join(missing)))
            continue

        cards.append({
            'e': raw.get('era', ''),
            't': raw['title'],
            'b': raw['body'],
            'x': raw.get('think', ''),
        })
    return cards, problems


def load_glossary(tid):
    # 词条可以放在 themes/glossary.json（通用），也可以放在主题目录里
    for path in (os.path.join(THEME_DIR, GLOSSARY_FILE),
                 os.path.join(THEME_DIR, tid, GLOSSARY_FILE)):
        if os.path.isfile(path):
            try:
                with open(path, encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
    return {}


def _load_glossary_old(tid):
    path = os.path.join(THEME_DIR, tid, GLOSSARY_FILE)
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def collect():
    themes, problems = [], []
    if not os.path.isdir(THEME_DIR):
        sys.exit('没有 themes/ 目录')

    order = {k: i for i, k in enumerate(THEME_ORDER)}
    for tid in sorted(os.listdir(THEME_DIR), key=lambda x: (order.get(x, 99), x)):
        d = os.path.join(THEME_DIR, tid)
        if not os.path.isdir(d) or tid.startswith('_'):
            continue
        cards, probs = load_theme(tid)
        problems.extend('%s/%s' % (tid, p) for p in probs)
        if not cards:
            problems.append('%s 没有卡片' % tid)
            continue
        name, desc = THEME_META.get(tid, (tid, ''))
        themes.append({
            'id': tid,
            'name': name,
            'desc': ('%s · ' % desc if desc else '') + '%d 张' % len(cards),
            'cards': cards,
        })
    return themes, problems


def build():
    themes, problems = collect()
    if problems:
        print('数据有问题：')
        for p in problems:
            print('  -', p)
        if '--check' in sys.argv:
            sys.exit(1)

    if not themes:
        sys.exit('没有可用的主题')

    with open(os.path.join(SRC, 'shell.html'), encoding='utf-8') as f:
        shell = f.read()
    with open(os.path.join(SRC, 'style.css'), encoding='utf-8') as f:
        style = f.read()
    with open(os.path.join(SRC, 'app.js'), encoding='utf-8') as f:
        app = f.read()

    # 词条合并（多个主题的词条合到一起，同名以先出现的为准）
    glossary = {}
    for tid in sorted(os.listdir(THEME_DIR)):
        if not os.path.isdir(os.path.join(THEME_DIR, tid)):
            continue
        for k, v in load_glossary(tid).items():
            glossary.setdefault(k, v)

    # 内容指纹：卡片集合一变，阅读进度自动重置
    import hashlib
    fingerprint = hashlib.md5(
        ''.join(c['t'] for t in themes for c in t['cards']).encode('utf-8')
    ).hexdigest()[:10]

    data = ('window.__VERSION__ = ' + repr(fingerprint) + ';\n'
            + 'window.__THEMES__ = ' + json.dumps(themes, ensure_ascii=False) + ';\n'
            + 'window.__GLOSSARY__ = ' + json.dumps(glossary, ensure_ascii=False) + ';')

    html = (shell
            .replace('/*__STYLE__*/', style)
            .replace('/*__DATA__*/', data)
            .replace('/*__APP__*/', app))

    if '--check' not in sys.argv:
        with open(OUT, 'w', encoding='utf-8') as f:
            f.write(html)

    total = sum(len(t['cards']) for t in themes)
    print('%s %s' % ('检查通过' if '--check' in sys.argv else '生成', OUT))
    for t in themes:
        print('  %-10s %-6s %3d 张' % (t['id'], t['name'], len(t['cards'])))
    print('  合计 %d 张' % total)
    print('  词条 %d 条' % len(glossary))


if __name__ == '__main__':
    build()
