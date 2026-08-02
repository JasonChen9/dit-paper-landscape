# 维护指南

## 新增论文

1. 在 `catalog/papers.csv` 增加一行。
2. `category` 必须对应 `papers/` 下已有目录。
3. `window` 使用 `in-window` 或 `background`。
4. `dit_relation` 使用 `direct`、`adaptation`、`system` 或 `adjacent`。
5. `summary_zh` 只写论文解决的核心问题与方法，不复制摘要。
6. 运行 `python3 scripts/sync_papers.py` 下载 PDF。
7. 在相应 `notes/*.md` 中补充“为什么值得读”，必要时增加跨主题链接。

## 纳入判断

优先纳入至少满足一项的工作：

- 改变 DiT 的表示空间、骨干、注意力或生成范式；
- 对主流图像/视频 DiT 有可迁移的训练或推理优化；
- 将 RL 用于 DiT 能力/偏好后训练，或研究相应系统瓶颈；
- 将 DiT 用作动作策略、世界模型或跨模态生成器；
- 来自 AI systems/architecture 社区，提供可复用机制与真实 kernel/system 测量。

通常不纳入：只把 DiT 当作黑盒 backbone、缺少可迁移方法贡献的单一垂直应用。

## Venue 字段

- 只有找到会议官方页面或 OpenReview 最终状态时才写正式 venue。
- 只有 arXiv 时写 `arXiv preprint`，不要根据模板猜测录用状态。
- `background` 可以来自窗口前，但必须在笔记中说明为什么保留。

## PDF 版权与来源

PDF 均从 arXiv 官方 `https://arxiv.org/pdf/<id>` 下载，仅用于个人研究整理。提交 GitHub 前请根据仓库用途和文件体积决定是否用 Git LFS，或改为只提交目录与链接。
