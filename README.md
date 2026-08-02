# DiT Paper Landscape（2025-08-02—2026-08-02）

这是一个面向研究阅读的 Diffusion Transformer（DiT）文献仓库，重点回答三个问题：

1. 最近一年 DiT 社区在集中解决什么问题？
2. RL、Agent/World Model、Omni/统一多模态怎样与 DiT 结合？
3. 哪些结论适用于主流 Dense DiT，哪些只适用于研究型 MoE、特定系统或特定任务？

## 在线网站

- 网站：<https://jasonchen9.github.io/dit-paper-landscape/>
- GitHub 操作说明：[GITHUB_GUIDE.md](GITHUB_GUIDE.md)

网站直接读取 `catalog/papers.csv`，支持标题/摘要搜索、主题与 DiT 关系筛选，并将 arXiv 摘要和 PDF 显示为浏览器可点击链接。`research landscape` 页面还提供动态论文点图、自动聚类、主题词云、最近邻工作和跨主题桥接关系。

### 聚类口径

- 从 `topic_tags` 构造 TF-IDF 特征，并加入架构、视频、系统、RL、Agent、Omni 六类概念特征。
- 使用确定性初始化的 `k=6` cosine k-means；聚类名称由组内高频概念和标签自动生成。
- 点图边和最近邻来自 cosine 相似度，布局使用前端 force simulation；位置用于探索相近问题，不代表论文质量或严格学科边界。
- 该方法刻意保持轻量和可解释。若以后加入论文摘要 embedding，可升级为 UMAP/SPECTER 等语义聚类。

## 快速入口

- [总览与核心结论](notes/00_landscape.md)
- [基础模型、表示空间与架构](notes/01_foundation_architecture.md)
- [视频、长上下文与流式生成](notes/02_video_long_context.md)
- [推理、训练与系统效率](notes/03_efficiency_systems.md)
- [RL、偏好对齐与可验证奖励](notes/04_rl_alignment.md)
- [Agent、World Model 与机器人](notes/05_agent_world_robotics.md)
- [Omni 与统一理解/生成](notes/06_omni_unified.md)
- [开放问题与研究机会](notes/07_open_questions.md)
- [结构化论文目录](catalog/papers.csv)
- [PDF 分层索引](papers/README.md)
- [维护指南](CONTRIBUTING.md)
- [GitHub 与网站维护指南](GITHUB_GUIDE.md)

## PDF 层级

```text
papers/
├── 00_background/             # 窗口外但解释当前趋势必需的锚点
├── 01_foundation_architecture/
├── 02_video_long_context/
├── 03_efficiency_systems/
├── 04_rl_alignment/
├── 05_agent_world_robotics/
└── 06_omni_unified/
```

文件名统一为 `arxiv_id__short-title.pdf`。同一论文只保存一份 PDF；跨主题关系由各主题 Markdown 交叉链接。

## 口径

- **严格时间窗口**：首次公开日期位于 2025-08-02 至 2026-08-02。
- **背景锚点**：DiT、DiT-MoE、Wan、Flow-GRPO、DanceGRPO、Self-Forcing、OmniGen2 等虽然早于窗口，但对理解最近一年不可缺少，单列而不计入年度趋势数量。
- **来源优先级**：会议官方页 / OpenReview / arXiv / 作者项目页；不以二手新闻作为论文事实依据。
- **DiT 关系标签**：
  - `direct`：DiT/MMDiT 是核心生成或策略网络；
  - `adaptation`：基于已有 DiT 做后训练、缓存、量化、控制；
  - `system`：优化 DiT 的训练、推理或通信；
  - `adjacent`：使用 diffusion/flow，但 DiT 不是论文贡献核心。
- **不是穷举清单**：关键词初筛超过 600 条，本仓库保存的是能代表问题结构的精选集合。应用型论文只有在引入可迁移的架构、训练或系统观点时才纳入。

## 当前结论（极简版）

最近一年最明显的主线不是“把 DiT 再堆大一点”，而是：

1. **换 latent**：从传统 VAE latent 转向语义更强的 Representation Autoencoder（RAE），同时重新处理高维 latent 的噪声尺度与宽度匹配。
2. **降低 token/attention 成本**：更强 VAE、线性/稀疏注意力、token routing、缓存、量化和多 GPU 并行成为共同主题。
3. **视频走向长时、流式、交互**：block-causal、autoregressive diffusion、constant-memory state、self-forcing/causal distillation 都在解决训练—推理分布差异和长期漂移。
4. **RL 从审美对齐走向能力训练**：GRPO/online RL 开始优化计数、文字、几何、物理与规则约束；同时 reward model 和 rollout 系统成为新瓶颈。
5. **Agent 交叉主要发生在两端**：一端用 DiT 生成动作序列（diffusion policy），另一端用视频 DiT 预测未来世界（world/action model）；真正闭环、长时规划仍不成熟。
6. **Omni 有三种不同含义**：多条件输入、跨模态输出、理解—生成统一。近期更重要的是共享连续表示，而不是简单把更多输入拼进 MMDiT。
7. **架构持续分化**：Dense、single-stream、hybrid、RAE、pixel-space 与不同粒度的专家模型都在被探索；公开结果尚未收敛为单一路线。

## 同步 PDF

PDF 保存在本地分类目录，但默认不进入普通 Git 历史：当前全集接近 0.9 GB，且可由结构化目录重复下载。若需要把 PDF 一并推送到远端，建议另行配置 Git LFS。

```bash
python3 scripts/sync_papers.py
```

只检查文件而不下载：

```bash
python3 scripts/sync_papers.py --check
```

## 更新日期

2026-08-02（Asia/Singapore）
