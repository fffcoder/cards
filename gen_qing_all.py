# -*- coding: utf-8 -*-
"""运行全部清朝脚本，输出到 themes/history/qing/ 并去重"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import gen_qing          # noqa: E402
import gen_qing2         # noqa: E402
import gen_qing3         # noqa: E402

OUT = os.path.join(HERE, 'themes', 'history', 'qing')
os.makedirs(OUT, exist_ok=True)

# 清掉旧的 qing 卡片
for f in os.listdir(OUT):
    if f.endswith('.json'):
        os.remove(os.path.join(OUT, f))

cards = gen_qing.CARDS
seen = set()
unique = []
for c in cards:
    if c['title'] in seen:
        print('重复跳过:', c['title'])
        continue
    seen.add(c['title'])
    unique.append(c)

for i, c in enumerate(unique, 1):
    slug = re.sub(r'[^\w\u4e00-\u9fa5]+', '-', c['title']).strip('-')[:34]
    name = '%03d-%s.json' % (i, slug)
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        json.dump(c, f, ensure_ascii=False, indent=2)

print('清朝卡片 %d 张' % len(unique))
