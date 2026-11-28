#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 articles/*.md 编译成一个可搜索、可阅读的单页应用。

用法：
    python3 build_articles.py

每篇文章头部是 YAML 风格的元信息：
    ---
    title: 标题
    subtitle: 副标题
    era: 时代
    tags: 标签 用空格分隔
    date: 2026-11-28
    sources: 逗号分隔的参考来源
    ---

正文用 Markdown（支持 ## 标题、**粗体**、列表、引用、分隔线）。
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
ART_DIR = os.path.join(ROOT, 'articles')
OUT = os.path.join(ROOT, 'articles.html')


# ---------------- Markdown 极简解析 ----------------

def inline(text):
    """行内元素：粗体、斜体、行内代码、链接"""
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'<em>\1</em>', text)
    def link(m):
        label, href = m.group(1), m.group(2)
        if href.endswith('.md'):
            aid = href[:-3].split('/')[-1]
            return '<a href="#%s" data-article="%s">%s</a>' % (aid, aid, label)
        return '<a href="%s" target="_blank" rel="noopener">%s</a>' % (href, label)
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', link, text)
    return text


def md_to_html(md):
    lines = md.split('\n')
    out = []
    i = 0
    in_ul = False
    in_ol = False
    in_quote = False

    def close_lists():
        nonlocal in_ul, in_ol, in_quote
        if in_ul:
            out.append('</ul>')
            in_ul = False
        if in_ol:
            out.append('</ol>')
            in_ol = False
        if in_quote:
            out.append('</blockquote>')
            in_quote = False

    while i < len(lines):
        line = lines[i].rstrip()

        if not line.strip():
            close_lists()
            i += 1
            continue

        m = re.match(r'^(#{1,4})\s+(.*)$', line)
        if m:
            close_lists()
            level = len(m.group(1))
            out.append('<h%d>%s</h%d>' % (level, inline(m.group(2)), level))
            i += 1
            continue

        if re.match(r'^---+$', line.strip()):
            close_lists()
            out.append('<hr>')
            i += 1
            continue

        if line.startswith('> '):
            if not in_quote:
                close_lists()
                out.append('<blockquote>')
                in_quote = True
            out.append('<p>%s</p>' % inline(line[2:]))
            i += 1
            continue

        m = re.match(r'^[-*]\s+(.*)$', line)
        if m:
            if in_ol:
                out.append('</ol>')
                in_ol = False
            if not in_ul:
                close_lists()
                out.append('<ul>')
                in_ul = True
            out.append('<li>%s</li>' % inline(m.group(1)))
            i += 1
            continue

        m = re.match(r'^\d+\.\s+(.*)$', line)
        if m:
            if in_ul:
                out.append('</ul>')
                in_ul = False
            if not in_ol:
                close_lists()
                out.append('<ol>')
                in_ol = True
            out.append('<li>%s</li>' % inline(m.group(1)))
            i += 1
            continue

        close_lists()
        out.append('<p>%s</p>' % inline(line))
        i += 1

    close_lists()
    return '\n'.join(out)


# ---------------- 文章读取 ----------------

def parse_front(text):
    if not text.startswith('---'):
        return {}, text
    end = text.find('\n---', 3)
    if end < 0:
        return {}, text
    head = text[3:end].strip()
    body = text[end + 4:].lstrip('\n')
    meta = {}
    for line in head.split('\n'):
        if ':' in line:
            k, v = line.split(':', 1)
            meta[k.strip()] = v.strip()
    return meta, body


def load_articles():
    arts = []
    for name in sorted(os.listdir(ART_DIR)):
        if not name.endswith('.md'):
            continue
        with open(os.path.join(ART_DIR, name), encoding='utf-8') as f:
            text = f.read()
        meta, body = parse_front(text)
        html = md_to_html(body)
        plain = re.sub(r'<[^>]+>', '', html)
        arts.append({
            'id': name[:-3],
            'title': meta.get('title', name),
            'subtitle': meta.get('subtitle', ''),
            'era': meta.get('era', ''),
            'tags': meta.get('tags', '').split(),
            'date': meta.get('date', ''),
            'track': meta.get('track', ''),
            'order': int(meta.get('order', 99) or 99),
            'html': html,
            'text': plain,
            'words': len(re.findall(r'[\u4e00-\u9fa5]', plain)),
        })
    # 按日期倒序，没有日期按文件名
    arts.sort(key=lambda a: (a['date'], a['id']), reverse=True)
    return arts


def build():
    if not os.path.isdir(ART_DIR):
        sys.exit('没有 articles/ 目录')
    arts = load_articles()
    if not arts:
        sys.exit('articles/ 里没有文章')

    with open(os.path.join(ROOT, 'src', 'articles_shell.html'), encoding='utf-8') as f:
        shell = f.read()
    with open(os.path.join(ROOT, 'src', 'articles.css'), encoding='utf-8') as f:
        style = f.read()
    with open(os.path.join(ROOT, 'src', 'articles.js'), encoding='utf-8') as f:
        app = f.read()

    data = 'window.__ARTICLES__ = ' + json.dumps(arts, ensure_ascii=False) + ';'
    html = (shell
            .replace('/*__STYLE__*/', style)
            .replace('/*__DATA__*/', data)
            .replace('/*__APP__*/', app))
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(html)

    total = sum(a['words'] for a in arts)
    print('生成 %s' % OUT)
    for a in arts:
        print('  %-6s %-40s %5d 字' % (a['era'], a['title'][:38], a['words']))
    print('  合计 %d 篇 / %d 字' % (len(arts), total))


if __name__ == '__main__':
    build()
