# PDF 分层索引

结构化目录当前收录 156 篇；其中本地目录已保存 98 篇校验过的 PDF，其他论文先以在线来源与 PDF 链接纳入网站。PDF 被 Git 忽略；GitHub 浏览器阅读请使用在线网站或中文笔记中的原始链接。论文只存放在一个主分类中；跨主题关系和中文解读见 `../notes/`，可检索元数据见 `../catalog/papers.csv`。

```text
papers/
├── 00_background/                 28  基础与前置工作，其中 16 篇早于三年窗口
├── 01_foundation_architecture/     9  基础模型、表示与架构
├── 02_video_long_context/          7  视频、长上下文与流式生成
├── 03_efficiency_systems/         33  缓存、量化、显存、并行、调度与系统
├── 04_rl_alignment/                7  RL、奖励与对齐
├── 05_agent_world_robotics/        7  Agent、World Model 与机器人
└── 06_omni_unified/                7  Omni 与统一理解/生成
```

## 主题入口

| PDF 目录 | 中文解读 |
|---|---|
| `00_background` | 在各主题笔记中按上下文引用 |
| `01_foundation_architecture` | [notes/01](../notes/01_foundation_architecture.md) |
| `02_video_long_context` | [notes/02](../notes/02_video_long_context.md) |
| `03_efficiency_systems` | [notes/03](../notes/03_efficiency_systems.md) |
| `04_rl_alignment` | [notes/04](../notes/04_rl_alignment.md) |
| `05_agent_world_robotics` | [notes/05](../notes/05_agent_world_robotics.md) |
| `06_omni_unified` | [notes/06](../notes/06_omni_unified.md) |

## 维护

不要手动复制同一 PDF 到多个目录。新增论文时更新 `catalog/papers.csv`，再从仓库根目录运行：

```bash
python3 scripts/sync_papers.py
```

文件名由脚本稳定生成为 `arxiv_id__short-title.pdf`。
