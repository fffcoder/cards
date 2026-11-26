# 卡片

滑动阅读的知识卡片。一张一张滑，看过的会降低再出现的概率。

线上地址：<https://fffcoder.github.io/cards/>

在 iOS 上用 Safari 打开后，点「分享 → 添加到主屏幕」，就是一个全屏图标，可离线用。

---

## 结构

```
src/
  shell.html      页面骨架
  style.css       全部样式（配色在顶部变量里）
  app.js          逻辑（权重抽取、手势、主题切换）
themes/
  history/        历史主题，一张卡片一个 json
build.py          合成单文件 index.html
index.html        构建产物，别手改
```

## 数据格式

`themes/<主题>/001-某某.json`：

```json
{
  "era": "北宋",
  "title": "王安石变法的根本矛盾",
  "body": "青苗、免役、市易等法……",
  "think": "设计再好的政策，执行时也可能走样。"
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `era` | 否 | 右上角的时代标签 |
| `title` | 是 | 标题 |
| `body` | 是 | 正文 |
| `think` | 否 | 底部「多想一层」，没有就不显示 |

文件名数字前缀决定顺序，用 `001-` 这种格式。

## 改设计

| 想改什么 | 改哪里 |
| --- | --- |
| 配色 | `src/style.css` 顶部 `:root` 的变量 |
| 卡片圆角、宽度 | `--radius`、`--card-w` |
| 字号 | `--t-title`、`--t-body`、`--t-think` |
| 动画快慢 | `--dur`、`--ease` |
| 抽取概率、翻页灵敏度 | `src/app.js` 顶部 `CONFIG` |
| 骨架结构 | `src/shell.html` |

改完跑一次构建：

```bash
python3 build.py
```

## 加内容

**加卡片**：往 `themes/history/` 放 json，文件名接着编号。

**加主题**：新建 `themes/<id>/` 放卡片，再在 `build.py` 的 `THEME_META` 里登记名字：

```python
THEME_META = {
    'history': ('历史', '三皇五帝到民国'),
    'psych':   ('心理学', '认知与情绪'),
}
```

多个主题时，左上角会出现切换按钮。

## 检查数据

```bash
python3 build.py --check
```

会报出字段缺失、json 语法错误。

## 发布

推到 `main` 分支，GitHub Actions 自动构建并发布到 Pages。

```bash
git add -A && git commit -m "更新卡片" && git push
```

## 机制

- 权重池随机抽：没看过权重 `1`，看过 n 次权重 `0.3^n`，下限 `0.03`
- 最近 8 张不重复
- 进度存在浏览器 localStorage，按主题分开计数
