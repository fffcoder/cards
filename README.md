# 卡片

滑动阅读的知识卡片。一张一张滑，看过的会降低再出现的概率。

在线访问：https://fffcoder.github.io/cards/

iOS 上在 Safari 打开后，点「分享 → 添加到主屏幕」，就是一个全屏的 App 图标，可离线使用。

## 结构

```
themes/            每个主题一个目录
  history/         历史（180 张）
    001-xxx.json   一张卡片一个文件
build.py           把 themes/ 合成单文件 index.html
shell.html         页面模板（样式 + 逻辑）
index.html         构建产物，不要手改
```

## 卡片格式

```json
{
  "era": "北宋",
  "title": "王安石变法的根本矛盾",
  "body": "青苗、免役、市易等法……",
  "think": "设计再好的政策，执行时也可能走样。"
}
```

- `era` 时代标签
- `title` 标题
- `body` 正文
- `think` 多想一层（可选）

## 加卡片 / 加主题

1. 往 `themes/<主题>/` 里加一个 json 文件，文件名以数字开头，决定顺序
2. 新主题要在 `build.py` 的 `THEME_META` 里登记名字和简介
3. 本地跑 `python3 build.py` 生成 `index.html`；推到 main 分支后 GitHub Actions 会自动构建并发布

## 机制

- 权重池随机抽取：没看过权重 1，看过 n 次权重 `0.3^n`（下限 0.03）
- 最近 8 张不重复
- 进度存在浏览器 localStorage，每个主题独立计数
