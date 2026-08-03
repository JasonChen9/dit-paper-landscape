# Diffusion Intelligence Atlas（2023-08-02—2026-08-02）

这是一个以扩散与流模型为方法主线、面向研究阅读的文献仓库。DiT 是核心架构线索，收录范围同时覆盖高效系统、强化学习、世界模型、具身智能/VLA、Agent workflow 与原生多模态，重点回答三个问题：

1. 最近三年扩散智能相关研究在集中解决什么问题？
2. DiT、RL、世界模型、具身智能/VLA、Agent workflow 和原生多模态如何连接？
3. 哪些结论适用于主流 Dense DiT 或通用扩散/流模型，哪些只适用于研究型 MoE、特定系统或特定任务？

## 在线网站

- 网站：<https://jasonchen9.github.io/dit-paper-landscape/>
- GitHub 操作说明：[GITHUB_GUIDE.md](GITHUB_GUIDE.md)

网站直接读取 `catalog/papers.csv`，支持标题、作者、主题与完整摘要搜索，并将论文来源页和 PDF 显示为浏览器可点击链接。每篇论文可在卡片内展开完整 abstract；网站默认使用英文，切换中文后显示缓存的 GPT-5.6-sol 全文翻译。人工撰写的一句话导读仍单独保留。主图可在论文主题图和关键作者图之间切换；时间、主题、作者和下方论文列表使用同一筛选状态。作者统计只包含第一作者、论文明确标注的共同第一作者和通讯作者，完整作者列表仍用于展示与搜索。论文列表默认每页显示 12 篇，也可切换为 24 或 48 篇；当前子集可导出为 Markdown 或独立 HTML，且不受分页影响。

### 分类与相似度口径

- 156 篇论文的标题与完整英文 abstract 使用 `allenai/specter` 生成学术文献 embedding。比较 `k=5–10` 后，`k=7` 的 cosine silhouette 最高（0.2506；`k=5` 为 0.2485）。5 类会合并视频与世界模型，也无法单独保留 RL；8 类以上开始把 VLA 和系统方向切成过小碎片。因此采用 7 个可解释主题：基础方法/目标/采样、架构/表示/统一生成、视频、系统效率、RL/对齐、世界模型、具身智能/VLA。
- 分类负责稳定、可解释的颜色；论文连线来自校准后的 SPECTER cosine similarity，二维位置由 UMAP 生成。分类与空间邻近相关，但不会被强制设为同一个结果。完整诊断见 `notes/SEMANTIC_ANALYSIS.md`。
- 网站上下只使用这一套 7 类主题筛选。`topic_tags` 继续用于词云、检索和解释，而不再决定主图几何位置。
- 语义位置保存在大型虚拟画布中，并在可见区域内平滑 Fit；支持以指针为中心的滚轮/捏合缩放、双指或拖拽平移和 Fit 复位。位置用于探索相近问题，不代表论文质量或严格学科边界。
- 作者相似度由双方关键作者论文的语义近邻聚合得到，共同署名提供少量加权；节点大小表示关键作者论文数，颜色表示单位，细外圈表示主要论文主题。论文图默认高亮原始 DiT，作者图默认高亮关键作者论文数最多的人；默认高亮不会自动筛选列表。
- abstract、embedding、相似度、聚类、连边和初始布局都在维护或部署阶段生成。浏览器直接加载静态结果，只负责筛选、绘制、缩放和低速漂浮；语义文件缺失或与目录版本不一致时才回退到标签方法。
- GitHub Pages 每次部署会生成 commit 版本文件；已打开的页面每 15 秒检查一次，发现新版后保留当前筛选参数并自动刷新。

## 快速入口

- [总览与核心结论](notes/00_landscape.md)
- [基础模型、表示空间与架构](notes/01_foundation_architecture.md)
- [视频、长上下文与流式生成](notes/02_video_long_context.md)
- [推理、训练与系统效率](notes/03_efficiency_systems.md)
- [RL、偏好对齐与可验证奖励](notes/04_rl_alignment.md)
- [世界模型、具身智能与 Agent workflow](notes/05_agent_world_robotics.md)
- [原生多模态、Omni 与统一理解/生成](notes/06_omni_unified.md)
- [开放问题与研究机会](notes/07_open_questions.md)
- [结构化论文目录](catalog/papers.csv)
- [双语完整摘要](catalog/abstracts.json)
- [语义分析报告](notes/SEMANTIC_ANALYSIS.md)
- [PDF 分层索引](papers/README.md)
- [维护指南](CONTRIBUTING.md)
- [GitHub 与网站维护指南](GITHUB_GUIDE.md)

## PDF 层级

```text
papers/
├── 00_background/             # 生成基础与解释当前趋势所需的前置工作
├── 01_foundation_architecture/
├── 02_video_long_context/
├── 03_efficiency_systems/
├── 04_rl_alignment/
├── 05_agent_world_robotics/
└── 06_omni_unified/
```

文件名统一为 `arxiv_id__short-title.pdf`。同一论文只保存一份 PDF；跨主题关系由各主题 Markdown 交叉链接。

## 口径

- **三年主窗口**：首次公开日期位于 2023-08-02 至 2026-08-02。
- **历史锚点**：包括 DDPM / LDM / Flow Matching、原始 DiT 与 Diffusion Policy 等方法基础；其中 17 篇早于三年窗口，但对解释方法演进不可缺少。当前目录共 156 篇，其中 139 篇位于三年窗口内。
- **来源优先级**：会议官方页 / OpenReview / arXiv / 作者项目页；不以二手新闻作为论文事实依据。
- **DiT 关系标签**：
  - `direct`：DiT/MMDiT 是核心生成或策略网络；
  - `adaptation`：基于已有 DiT 做后训练、缓存、量化、控制；
  - `system`：优化 DiT 的训练、推理或通信；
  - `adjacent`：使用 diffusion/flow，但 DiT 不是论文贡献核心。
- **不是穷举清单**：关键词初筛超过 600 条，本仓库保存的是能代表问题结构的精选集合。应用型论文只有在引入可迁移的架构、训练或系统观点时才纳入。

## 当前结论（极简版）

最近三年最明显的主线不是“把 DiT 再堆大一点”，而是：

1. **换 latent**：从传统 VAE latent 转向语义更强的 Representation Autoencoder（RAE），同时重新处理高维 latent 的噪声尺度与宽度匹配。
2. **降低 token/attention 成本**：更强 VAE、线性/稀疏注意力、token routing、缓存、量化和多 GPU 并行成为共同主题。
3. **视频走向长时、流式、交互**：block-causal、autoregressive diffusion、constant-memory state、self-forcing/causal distillation 都在解决训练—推理分布差异和长期漂移。
4. **RL 从审美对齐走向能力训练**：GRPO/online RL 开始优化计数、文字、几何、物理与规则约束；同时 reward model 和 rollout 系统成为新瓶颈。
5. **World model、VLA 和 Agent workflow 应分开看**：world model 预测动作后的未来，VLA 生成连续 action chunk，Agent workflow 管理目标、记忆、候选动作、验证和恢复。三者在联合 world—action 模型和 model-based policy evaluation 中汇合。
6. **VLA 的核心瓶颈是闭环延迟**：VLM prefill、视觉编码、多步 action denoising 与执行必须流水化；异步推理、cache、量化、推测验证和边缘 runtime 已形成独立系统主线。
7. **“原生多模态”比 Omni 命名更严格**：Transfusion、Show-o、MonoFormer、JanusFlow、OmniFlow 和 BLIP3-o 代表不同的共享骨干/目标；只是支持更多 condition 或 output 不等于原生统一。
8. **架构持续分化**：Dense、single-stream、hybrid、RAE、pixel-space 与不同粒度的专家模型都在被探索；公开结果尚未收敛为单一路线。

## 同步 PDF

PDF 保存在本地分类目录，但默认不进入普通 Git 历史：当前全集约 1.2 GB，且可由结构化目录重复下载。若需要把 PDF 一并推送到远端，建议另行配置 Git LFS。

```bash
python3 scripts/sync_papers.py
```

只检查文件而不下载：

```bash
python3 scripts/sync_papers.py --check
```

## 更新摘要与语义地图

```bash
python3 scripts/enrich_abstracts.py --require-chinese
python3 -m venv tmp/semantic-venv
tmp/semantic-venv/bin/python -m pip install -r requirements-semantic.txt
tmp/semantic-venv/bin/python scripts/analyze_semantic_landscape.py
node scripts/build_landscape_data.mjs catalog/papers.csv site/data/landscape.json catalog/author_affiliations.json catalog/semantic_landscape.json
```

`scripts/analyze_semantic_landscape.py` 需要 PyTorch、Transformers、scikit-learn 与 UMAP；模型与 embedding 缓存在被忽略的 `tmp/` 中，提交到仓库的是可直接部署的语义结果。

## 更新日期

2026-08-03（Asia/Singapore）
