# 基础模型、表示空间与架构

## 核心变化：tokenizer 不再只是预处理

传统 latent diffusion 往往把 VAE 当作固定压缩器；RAE 路线把 DINO/MAE/SigLIP 一类预训练视觉表征带入生成 latent。收益是语义结构更强，代价是 latent 通道更高、分布更异质，原有噪声尺度、patchify 和 DiT 宽度设计不再自然适配。

这意味着模型缩放至少有四个耦合轴：数据量、DiT 参数量、latent 维度/空间压缩率、训练计算。近三年真正新的问题是如何联合缩放这四项，而不只是把 backbone 参数做大。

## DiT 之前已经确定的基础变量

| 工作 | 留给 DiT 的核心接口 |
|---|---|
| [DDPM](https://arxiv.org/abs/2006.11239) / [Score SDE](https://arxiv.org/abs/2011.13456) | 离散去噪目标与连续时间 score / probability-flow 表述 |
| [LDM](https://arxiv.org/abs/2112.10752) | 自编码器 latent、cross-attention 条件接口与计算—细节折中 |
| [EDM](https://arxiv.org/abs/2206.00364) | 预条件、噪声分布、loss weighting 与采样配置的系统设计 |
| [Flow Matching](https://arxiv.org/abs/2210.02747) / [Rectified Flow](https://arxiv.org/abs/2209.03003) | 现代 flow-based DiT 常用的速度场目标和近直传输路径 |
| [DiT](https://arxiv.org/abs/2212.09748) | 将 latent patch 交给 Transformer，并验证模型规模与生成质量的缩放关系 |

因此“DiT”只替换骨干的说法不完整：今天公开模型的差异往往同时来自 tokenizer/latent、噪声或流路径、条件注入、采样器与 Transformer block。

## 代表论文

| 论文 | 主要问题 | 我的判断 |
|---|---|---|
| [Qwen-Image](https://arxiv.org/abs/2508.02324) | 复杂文字渲染、生成编辑统一 | 证明数据、文本编码和后训练仍可比“新 block”更决定上限 |
| [Seedream 4.0](https://arxiv.org/abs/2509.20427) | 多图参考与生成编辑统一 | 代表产品级多条件图像模型，而非单纯架构论文 |
| [RAE](https://arxiv.org/abs/2510.11690) | 用语义表征编码器替代 VAE | 近期最值得跟踪的基础变量之一 |
| [Scaling RAE DiT](https://arxiv.org/abs/2601.16208) | RAE latent 的规模化规律 | 让“latent 如何扩展”成为可测量的研究问题 |
| [PixelDiT](https://arxiv.org/abs/2511.20645) | 是否需要 VAE | 理念干净，但像素 token 计算量和高频建模仍是门槛 |
| [Z-Image](https://arxiv.org/abs/2511.22699) | 单流与低成本图像基础模型 | 更接近工程主线：减少路径复杂度并优化低步推理 |
| [Chimera](https://arxiv.org/abs/2607.28611) | 混合模块与 Chinchilla scaling | 重要之处是把架构选择和 compute-optimal scaling 联动 |

## 专家化架构分支

| 工作 | 路由粒度 | 解决的问题 | 局限 |
|---|---|---|---|
| DiT-MoE / EC-DiT | token / expert | 低激活参数下扩大容量 | all-to-all、负载均衡、部署复杂 |
| Dense2MoE | 从 dense 重构到 token MoE | 复用已有 checkpoint，降低激活计算 | 转换后的质量与硬件收益需分别验证 |
| MMOE | 高效专家设计 | 改良专家容量/计算比 | 仍是很新的预印本，缺少大规模生产证据 |
| timestep specialists | 扩散阶段 | 让不同噪声阶段分工 | 参数占用、阶段边界与部署收益需单独评估 |

这类方法需要同时报告质量、激活 FLOPs、显存、通信和实际吞吐。对 DiT 来说，FFN FLOPs 很大，使稀疏激活有吸引力；但训练负载均衡、小 batch 专家 GEMM 和 all-to-all 也会改变真实收益。

## 值得观察的指标

- 相同训练 FLOPs 与数据量，而不是只看参数量。
- latent 的空间压缩率、通道数和重建指标。
- 不同分辨率下的 token 数与 attention 占比。
- 单卡、机内 NVLink、跨机网络三种部署的真实吞吐。
- 低步数蒸馏后是否仍保留原架构收益。
