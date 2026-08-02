# PDF 分层索引

本目录共保存 55 篇已校验的 arXiv PDF。论文只存放在一个主分类中；跨主题关系和中文解读见 `../notes/`，可检索元数据见 `../catalog/papers.csv`。

```text
papers/
├── 00_background/                  8  背景锚点，不计入最近一年统计
├── 01_foundation_architecture/     9  基础模型、表示与架构
├── 02_video_long_context/          7  视频、长上下文与流式生成
├── 03_efficiency_systems/         10  缓存、量化、并行、调度与系统
├── 04_rl_alignment/                7  RL、奖励与对齐
├── 05_agent_world_robotics/        7  Agent、World Model 与机器人
└── 06_omni_unified/                7  Omni 与统一理解/生成
```

## 主题入口

| PDF 目录 | 中文解读 |
|---|---|
| [背景锚点](00_background/) | 在各主题笔记中按上下文引用 |
| [基础模型与架构](01_foundation_architecture/) | [notes/01](../notes/01_foundation_architecture.md) |
| [视频与长上下文](02_video_long_context/) | [notes/02](../notes/02_video_long_context.md) |
| [效率与系统](03_efficiency_systems/) | [notes/03](../notes/03_efficiency_systems.md) |
| [RL 与对齐](04_rl_alignment/) | [notes/04](../notes/04_rl_alignment.md) |
| [Agent 与 World Model](05_agent_world_robotics/) | [notes/05](../notes/05_agent_world_robotics.md) |
| [Omni 与统一模型](06_omni_unified/) | [notes/06](../notes/06_omni_unified.md) |

## 维护

不要手动复制同一 PDF 到多个目录。新增论文时更新 `catalog/papers.csv`，再从仓库根目录运行：

```bash
python3 scripts/sync_papers.py
```

文件名由脚本稳定生成为 `arxiv_id__short-title.pdf`。

