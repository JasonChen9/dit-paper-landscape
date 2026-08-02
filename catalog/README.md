# 结构化目录说明

`papers.csv` 是仓库的单一论文元数据源。新增论文时先更新 CSV，再运行 `scripts/sync_papers.py` 下载和校验 PDF，最后把它放进相应主题笔记的讨论中。

## 字段

| 字段 | 含义 |
|---|---|
| `arxiv_id` | arXiv 标识；脚本会忽略版本号 |
| `short_title` | 用于文件名和短引用 |
| `title` | 论文完整标题 |
| `published` | arXiv 首次公开日期 |
| `category` | PDF 唯一存放目录 |
| `window` | `in-window` 或 `background` |
| `venue` | 已核实的正式 venue；否则保守写 `arXiv preprint` |
| `dit_relation` | `direct` / `adaptation` / `system` / `adjacent` |
| `topic_tags` | 分号分隔的检索标签 |
| `summary_zh` | 一句话中文研究意义 |
| `arxiv_url` / `pdf_url` | 摘要页与 PDF 来源 |

## 分类原则

一篇论文只选择一个主目录，避免重复保存 PDF；跨主题关系由 Markdown 链接表达。例如 WorldDiT 主目录是 Agent/World Model，同时在视频和 Omni 笔记中交叉讨论。

