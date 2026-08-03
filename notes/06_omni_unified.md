# 原生多模态、Omni 与统一理解/生成

## “Omni”至少有三种含义

| 含义 | 输入/输出 | 典型工作 | 难点 |
|---|---|---|---|
| Omni conditioning | 文本、图像、多参考、mask → 图像/视频 | OmniGen2、Qwen-Image、Seedream 4.0 | 指令对齐、参考身份与编辑保真 |
| Omni generation | 文本/图像 → 图像、视频、音频或交错序列 | 3MDiT、Loom、MMDiff、Qwen-Audio | 不同时间尺度、噪声空间和同步 |
| Understanding + generation | 同一表示/骨干兼顾感知、推理与生成 | UniDDT、UniGP、Twins | 目标冲突、灾难遗忘、离散/连续接口 |

因此看到模型名中的 Omni，首先要问它统一的是 condition、output，还是 representation/objective。

## 什么才算“原生多模态”

这个词不应只表示“模型能看图”或“能输出多种介质”。本文库用三个逐渐变强的标准来判断：

1. **共享语义接口**：不同模态有独立模型，通过 adapter 或对齐空间连接。这更接近模块化 Omni。
2. **共享 backbone 或层**：至少在主要 Transformer 中联合建模多个模态，即使 tokenizer、encoder 或 output head 仍专用。
3. **联合预训练与混合序列**：训练数据、目标和 attention pattern 从开始就处理文本、连续视觉/音频与交错上下文，而不是在成熟单模态模型上最后接入 adapter。

因此 [X2I](https://arxiv.org/abs/2503.06134) 是有价值的对照：它用 attention distillation 把 MLLM 理解能力注入已有 DiT，但不是从零开始的原生共训练。

## AR 与 diffusion/flow 如何放进同一模型

| 结合方式 | 代表工作 | 关键取舍 |
|---|---|---|
| 同一 Transformer，不同预测目标 | [Transfusion](https://arxiv.org/abs/2408.11039) | 文本 next-token 与连续图像 diffusion 共享容量，需平衡 token 与 patch 的 loss/compute |
| 同一 Transformer，不同 attention mask | [MonoFormer](https://arxiv.org/abs/2409.16280) | 因果 mask 用于 AR，双向 mask 用于 diffusion，结构简洁但目标仍可冲突 |
| AR + 离散 diffusion | [Show-o](https://arxiv.org/abs/2408.12528) | 易于在统一 token 序列中混合，但生成质量受视觉 tokenizer 与离散化影响 |
| AR + rectified flow | [JanusFlow](https://arxiv.org/abs/2411.07975) | 分离理解/生成 encoder 并对齐表示，承认完全共享不一定最优 |
| 多模态联合 rectified flow | [OmniFlow](https://arxiv.org/abs/2412.01169) | 用扩展 MMDiT 联合文本、图像、音频，但每个模态仍需要合适的表示与噪声标定 |
| 语义特征 diffusion | [BLIP3-o](https://arxiv.org/abs/2505.09568) | 直接生成 CLIP 特征强化语义，再由解码器还原像素，语义与细节可能脱节 |
| 大规模交错预训练 | [BAGEL](https://arxiv.org/abs/2505.14683) | 世界推理和生成能力可从混合数据涌现，但数据清洗、比例和可复现成本极高 |

历史上，[One Transformer Fits All](https://arxiv.org/abs/2303.06555) 已尝试用同一个 Transformer diffusion 拟合单模态与联合多模态分布；[MMaDA](https://arxiv.org/abs/2505.15809) 则用离散 diffusion Transformer 统一理解与生成。它们分别是连续多模态生成和离散多模态建模的背景锚点，不应因为都叫 diffusion 就视为同一种 DiT。

## 代表工作

- [3MDiT](https://arxiv.org/abs/2511.21780)：联合文本条件下的同步音频—视频去噪，跨模态时间对齐是核心。
- [Loom](https://arxiv.org/abs/2512.18254)：生成交错多模态内容，连接连续扩散与序列式交互。
- [UniDDT](https://arxiv.org/abs/2606.16255)：以 decoupled diffusion transformer 统一理解/生成，承认完全共享会产生任务干扰。
- [MMDiff](https://arxiv.org/abs/2606.16673)：扩展 DiT 处理多个输出模态，需协调每种连续信号的噪声参数化。
- [UniGP](https://arxiv.org/abs/2606.30332)：联合 generation/perception 时显式 preservation 生成先验。
- [Twins](https://arxiv.org/abs/2607.22531)：把统一连续表征本身作为预测对象，代表“先统一 representation，再统一任务”的路线。
- [Qwen-Audio-3.0-Gen](https://arxiv.org/abs/2607.27011)：说明 Omni 输出正在扩展到音频；它与视觉 DiT 更接近共享训练思想而非同一视觉架构。

## DiT 为什么适合做统一连续生成

Transformer 可以把不同模态表示成序列，通过 modality embedding、不同 patchifier/head 或分离路径处理；diffusion/flow 又天然适配图像、视频、音频、动作等连续变量。这比要求所有输出都离散 token 化更直接。

但统一并非免费：

- 图像按二维空间组织，视频/音频按不同频率的时间组织，动作还受动力学约束。
- 每种 latent 的尺度和 signal-to-noise ratio 不同，共用 timestep/noise schedule 未必合理。
- 理解任务追求不变性，生成任务需要保留细节；完全共享表示可能目标相反。
- 生成质量提升不自动带来推理或 grounding，仍需要明确的训练信号与评测。

## 与 Agent 的交叉

World-language-action 模型本质上也是一种 Omni：语言是目标与推理接口，视频/latent 是世界状态，动作是 Agent 输出。如果再加入音频和触觉，模型会自然落入多模态连续生成。未来更可能是“共享语义空间 + 模态专用 dynamics/head”，而不是所有 token 在所有层无差别混合。
