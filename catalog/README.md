# 论文目录与数据约定

目录包含 362 篇独立论文。每篇以稳定 ID 关联基本信息、双语卡片、完整摘要及分类；非论文资源单列，不混入论文统计。网站只读取已生成的数据，元数据核验、翻译和地图计算在维护阶段完成。

## 数据文件

| 文件 | 用途 |
|---|---|
| `papers.csv` | 论文 ID、标题、作者、日期、来源链接、标签及 PDF 分类 |
| `paper_details.json` | 中英文背景、挑战、方法、结果，各一句；附来源证据及发表状态 |
| `abstracts.json` | 英文原始摘要、完整中文译文及原文、提取和翻译来源 |
| `summaries_en.json` | 与 CSV `summary_zh` 对应的英文短简介 |
| `taxonomy.json` | 八个主类及独立筛选维度的中英文定义 |
| `paper_taxonomy.json` | 逐篇主类、归类理由、应用领域和系统层级 |
| `key_authors.json` | 关键作者角色与核验记录 |
| `author_affiliations.json` | 关键作者论文的单位快照与依据 |
| `id_aliases.json` | 简称或其他 ID 到论文规范 ID 的映射 |
| `import_provenance.json` | 收录来源及待核验项 |
| `resources.json` | 软件、项目或技术文章等非论文资料 |
| `metadata_quality.json` / `metadata_corrections.json` / `tag_review.json` | 元数据检查与修订依据 |
| `semantic_landscape.json` | 可选语义快照；能否使用由目录覆盖和内容签名决定 |

## 论文 ID 与基本字段

`arxiv_id` 是所有数据文件共用的规范键。有 arXiv 编号的论文使用不带版本号的编号；非 arXiv 论文使用稳定短 ID，例如 `scalefusion`。论文更名不创建新记录，其他标题写入 `alternate_titles`；纠正 ID 时同时维护别名映射和所有引用。

收藏夹使用这个稳定键关联个人数据，`id_aliases.json` 随站点发布并在个人库初始化时迁移旧 ID。更名不创建新收藏；目录暂时移除的论文仍保留个人元数据快照与批注。个人收藏、分类、笔记和备份不写入 `catalog/`，也不随公共网站部署。

| CSV 字段 | 约定 |
|---|---|
| `title` / `title_zh` / `short_title` | 原始标题、中文整理标题及便于引用的简称 |
| `alternate_titles` | 同一工作的其他标题，分号分隔 |
| `authors` | 完整作者列表，分号分隔，用于展示和搜索 |
| `key_authors` | 姓名与角色用竖线分隔，多位作者用分号分隔；角色可用 `+` 组合 |
| `published` | 首次公开日期；支持 `YYYY`、`YYYY-MM`、`YYYY-MM-DD` |
| `published_precision` / `published_basis` | 已知日期精度及来源，不将仅知年份表述为已知具体日期 |
| `venue` / `venue_url` | 会议或期刊名称及对应正式页面 |
| `venue_status` / `venue_evidence_url` | 发表状态及核验依据 |
| `source_label` / `arxiv_url` / `pdf_url` | 来源按钮名、论文来源页及 PDF；非 arXiv 来源也使用这些字段 |
| `topic_tags` | 研究方法与问题标签，分号分隔，用于检索和相似度计算 |
| `collection_tags` | 收录来源，可多值：`original`、`systems-research`、`robotics-library` |
| `dit_relation` | `direct`、`adaptation`、`system` 或 `adjacent` |
| `summary_zh` / `summary_zh_kind` / `summary_en_kind` | 短简介及其内容类型；简介与原始摘要分开保存 |
| `metadata_status` | 尚未确认或仅有部分信息的字段说明 |
| `category` | PDF 的唯一存放分类，与网站主类独立 |
| `window` | 主窗口或基础参考标记；不限制“全部时间”展示 |

来源优先使用可核验的会议、期刊、OpenReview 正式发表页，并保留 arXiv 或作者来源。`published` 表示已核验发表，`author-reported-accepted` / `author-reported-published` 只表示作者声明；`preprint` 与 `unknown` 分别表示预印本和未确认状态。OpenReview 投稿页本身不等于已录用。

## 双语介绍与摘要

`paper_details.json` 的 `papers[id]` 包含 `background`、`challenge`、`method`、`result`，各有 `en` 和 `zh`。四句依次回答：什么场景、面临什么问题、如何解决、报告了什么效果。`evidence_urls` 保存依据，`venue` 保存发表信息。结果使用论文报告口径，不表述为独立复现结论。

`abstracts.json` 的 `papers[id]` 保存完整摘要：

- `en_kind=source-abstract`：英文原始摘要，保留 `source_url` 和 `extraction`。
- `zh_kind=translation`：与英文原文对应的完整中文译文，保留 `translation` 来源信息。
- 网站展开“摘要 / Abstract”时显示这两项；四句卡片和短简介不替代原始摘要。

中文摘要由 AI 翻译并进行完整性核对，页面明确标注译文和原文来源。英文收集脚本 `scripts/enrich_abstracts.py` 会访问原始来源，不自动完成中文翻译；修改后仍需核对逐条出处、翻译和内容类型。

## 主类与筛选

每篇按**主要贡献**选择一个主类：`foundation`、`architecture`、`video`、`systems`、`rl`、`world`、`vla`、`agent`。分类保存在 `paper_taxonomy.json` 的 `papers[id]`：

| 字段 | 含义 |
|---|---|
| `primary_topic` | 唯一主类 |
| `primary_reason.en` / `.zh` | 按主要贡献归类的双语理由 |
| `application_domains` | 应用领域，可多值 |
| `system_layers` | 论文设计或优化的系统对象，可多值；不适用时为空 |

“智能体推理与工作流”涵盖反馈改写、推理过程、工具调用和工作流方法；优化 Agent 服务的系统工作仍根据系统贡献归类。系统层级不枚举论文使用过的全部组件。收录来源用于追溯资料集合，不表示研究方法。

同维度多选取并集，跨维度取交集；未选表示不限。主类、应用领域、系统层级、收录来源与搜索、时间、作者筛选共同作用。URL 保存筛选状态；导出采用相同筛选结果。每篇只保存一份 PDF，跨方向联系由分类和笔记链接表达。

## 作者与地图

关键作者仅包括第一作者、论文明确标注的共同第一作者和通讯作者，角色分别为 `first`、`co-first`、`corresponding`。不能仅从作者顺序推断共一或通讯。同一作者兼具多种角色时可写为 `姓名|co-first+corresponding`。

作者单位取目录中最新一篇成功解析的关键作者论文，使用其署名处第一个单位，并保留论文、日期和来源。无法可靠匹配时使用 `Unknown`；这个快照不等于作者现任单位。`scripts/enrich_affiliations.py` 用于更新，`--cached-only` 可仅根据本地缓存重建。

当前全量地图按人工主类布局，以主题标签 TF-IDF 相似度连线；作者相似度使用其论文标签并对共同署名加权。标签相似不能证明引用关系或方法兼容性。

`scripts/build_landscape_data.mjs` 预计算浏览器使用的 `landscape.json`。论文 ID、元数据签名和 `taxonomySignature` 用于防止过期预计算覆盖当前目录或分类。可选语义快照只有在覆盖完整目录、矩阵与位置有效、摘要内容签名一致时才会使用；否则使用标签方法。语义聚类不覆盖人工主类。

## 维护与校验

新增论文时，先查 ID、简称和其他标题，避免把预印本与正式发表版本重复收录；随后补齐基本信息、双语四句卡片、原始摘要与完整翻译、主类与筛选项、来源证据。目录中不要放私人路径或内部资料链接。

在仓库根目录运行离线检查：

```bash
python3 scripts/validate_catalog.py --report tmp/catalog-validation.json
node scripts/check_taxonomy_filters.cjs
node scripts/build_landscape_data.mjs catalog/papers.csv tmp/landscape.json catalog/author_affiliations.json
```

校验要求 CSV、卡片、摘要和人工分类的 ID 完全对应，检查双语字段、日期、公开 URL、发表证据和分类值。需要固定论文数量时可添加 `--expected-count 362`；新增论文后相应调整。筛选检查覆盖同维度并集、跨维度交集及组合场景。

地图构建不下载 PDF 或模型。前端读取的文件复制与本地预览步骤见 [项目 README](../README.md)；部署使用相同数据及构建脚本。
