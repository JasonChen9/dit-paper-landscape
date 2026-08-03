# 结构化目录说明

`papers.csv` 是仓库的单一论文元数据源。新增论文时先更新 CSV，再运行 `scripts/sync_papers.py` 下载和校验 PDF，最后把它放进相应主题笔记的讨论中。

## 字段

| 字段 | 含义 |
|---|---|
| `arxiv_id` | arXiv 标识；脚本会忽略版本号 |
| `short_title` | 用于文件名和短引用 |
| `title` | 论文完整标题 |
| `alternate_titles` | 同一工作在 preprint / venue 版本中的其他标题，分号分隔 |
| `authors` | 完整作者列表，分号分隔；用于展示和搜索 |
| `key_authors` | 作者图统计口径，格式为 `姓名|角色`；多个作者用分号分隔 |
| `published` | arXiv 首次公开日期 |
| `category` | PDF 唯一存放目录 |
| `window` | `in-window` 或 `background` |
| `venue` | 已核实的正式 venue；否则保守写 `arXiv preprint` |
| `dit_relation` | `direct` / `adaptation` / `system` / `adjacent` |
| `topic_tags` | 分号分隔的检索标签 |
| `summary_zh` | 一句话中文研究意义 |
| `source_label` | 来源按钮名称，如 `arXiv`、`USENIX` 或 `ACM` |
| `arxiv_url` / `pdf_url` | 论文来源页与 PDF 来源；非 arXiv 工作也沿用这两个兼容字段名 |

`key_authors` 只统计第一作者、论文明确标注的共同第一作者和通讯作者。角色使用 `first`、`co-first`、`corresponding`，同一作者兼具多个角色时用 `+` 连接，例如 `Suyi Li|co-first+corresponding`。未明确标注共一或通讯时不从作者顺序推断。

## 作者单位

`author_affiliations.json` 是作者图的单位快照。每位作者取目录中最新一篇已成功解析的关键作者论文，使用论文署名处列出的第一个单位作为主单位，并保留论文、日期和来源。无法可靠匹配时标记为 `Unknown`。

新增或更新论文后运行 `python3 scripts/enrich_affiliations.py`，然后运行地图预计算脚本。单位信息在部署时写入 `landscape.json`，访问者打开网站时不会重新抓取或解析单位数据。

## 分类原则

一篇论文只选择一个主目录，避免重复保存 PDF；跨主题关系由 Markdown 链接表达。例如 WorldDiT 主目录是 Agent/World Model，同时在视频和 Omni 笔记中交叉讨论。
