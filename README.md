# DiT Paper Landscape（2023-08-02—2026-08-02）

这是一个面向研究阅读的 Diffusion Transformer（DiT）文献仓库，重点回答三个问题：

1. 最近三年 DiT 社区在集中解决什么问题？
2. RL、世界模型、具身智能/VLA、Agent workflow 和原生多模态怎样与 DiT 结合？
3. 哪些结论适用于主流 Dense DiT，哪些只适用于研究型 MoE、特定系统或特定任务？

## 在线网站

- 网站：<https://jasonchen9.github.io/dit-paper-landscape/>
- GitHub 操作说明：[GITHUB_GUIDE.md](GITHUB_GUIDE.md)

网站直接读取 `catalog/papers.csv`，支持标题/摘要搜索、主题与 DiT 关系筛选，并将 arXiv 摘要和 PDF 显示为浏览器可点击链接。网站默认使用英文，可在顶部切换中文；中文研究摘要保存在 `papers.csv`，对应英文摘要保存在 `catalog/summaries_en.json`。动态点图的自动聚类、词云和发表时间区间与下方论文列表双向同步；论文列表默认每页显示 12 篇，也可切换为 24 或 48 篇。当前子集可以直接导出为 Markdown 或独立 HTML，导出范围不受分页影响，并包含论文名称、当前语言的摘要、标签、arXiv 与 PDF 链接。`research landscape` 还提供最近邻工作和跨主题桥接关系。

### 聚类口径

- 从 `topic_tags` 构造 TF-IDF 特征，并加入架构、视频、系统、RL、世界模型/交互模拟、具身智能/机器人控制、原生多模态/Omni 七类概念特征。
- 使用确定性初始化的 `k=7` cosine k-means；聚类名称由组内高频概念和标签自动生成。
- 网站的上下两处主题筛选共用这 7 个自动聚类，不再另设一套人工分类口径。
- 点图边和最近邻来自 cosine 相似度，布局使用前端 force simulation；位置用于探索相近问题，不代表论文质量或严格学科边界。
- 该方法刻意保持轻量和可解释。若以后加入论文摘要 embedding，可升级为 UMAP/SPECTER 等语义聚类。

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
- **历史锚点**：包括 DDPM / LDM / Flow Matching、原始 DiT 与 Diffusion Policy 等方法基础；其中 17 篇早于三年窗口，但对解释方法演进不可缺少。
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

## 更新日期

2026-08-03（Asia/Singapore）
