# 推理、训练与系统效率

## 先区分四类瓶颈

| 层次 | 典型瓶颈 | 代表方法 |
|---|---|---|
| 算法 | denoising 步数、全注意力复杂度 | 蒸馏、线性/稀疏 attention |
| 模型 | 重复特征、权重/激活带宽 | cache、quantization、结构稀疏 |
| 并行 | all-gather / reduce-scatter / all-to-all 暴露 | sequence/context parallel、通信计算重叠 |
| 服务 | batch 波动、异构请求、GPU 空泡、显存峰值与碎片 | 并行策略选择、流水、请求调度、细粒度显存控制 |

同一模型在单卡、NVLink 机内多卡和跨机 InfiniBand 上会落入不同瓶颈，因此不能用一张 FLOPs 饼图判断通信优化有没有价值。

## 论文地图

### 生成方程与采样基础

- [DDIM](https://arxiv.org/abs/2010.02502)：在相同训练目标下改用非马尔可夫隐式采样，说明推理轨迹可以独立于训练链设计。
- [DPM-Solver](https://arxiv.org/abs/2206.00927)：利用 diffusion ODE 的结构做高阶少步求解，是评估 DiT 采样器时必须纳入的经典 baseline。
- [Progressive Distillation](https://arxiv.org/abs/2202.00512)：通过教师—学生逐轮减半采样步数，奠定 few-step diffusion distillation 的基本范式。
- [Consistency Flow Matching](https://arxiv.org/abs/2407.02398)：从训练目标侧约束同一路径上的速度一致性，连接 flow matching 与少步生成。
- [Rectified Diffusion](https://arxiv.org/abs/2410.07303)：提醒“轨迹更直”不是最终目标，应把离散采样误差与生成质量分开衡量。

这些方法减少的是 denoiser 调用次数或单步离散误差；cache、quantization、kernel 和并行则减少每次调用成本。两层优化可以叠加，但比较时必须固定采样步数与质量。

### 缓存与压缩

- [SpeCa](https://arxiv.org/abs/2509.11628)：推测哪些中间特征可以跨 timestep 复用。
- [BWCache](https://arxiv.org/abs/2509.13789)：在视频 DiT block 粒度缓存。
- [OmniCache](https://arxiv.org/abs/2607.23844)：组合层、时间步、token 等多维层级策略。
- [QuantSparse](https://arxiv.org/abs/2509.23681)：联合量化与 attention sparsification，避免单点优化互相抵消。

缓存的核心风险是误差会在多步去噪中累积；比较时应同时看 wall-clock、额外控制开销、不同 prompt/分辨率的最差画质下降。

### Kernel 与注意力执行

- [FlashOmni](https://arxiv.org/abs/2509.25401)：统一稀疏注意力模式的执行引擎。
- SANA-Video 系列：算法复杂度和 kernel 友好性共同决定线性注意力是否真快。

“理论稀疏”只有在索引、数据布局和 kernel 足够规则时才会变成端到端收益。

### 多 GPU 推理与 serving

- [DistriFusion](https://arxiv.org/abs/2402.19481)：以 patch 并行和跨步特征复用建立高分辨率分布式 diffusion 基线。
- [PipeFusion](https://arxiv.org/abs/2405.14430)：在 patch 粒度把去噪过程组成 pipeline，目标是重叠计算和通信。
- [xDiT](https://arxiv.org/abs/2411.01738)：把 sequence、tensor 和 pipeline 并行组合成大规模 DiT 推理引擎。
- [SwiftFusion](https://arxiv.org/abs/2601.20273)：长序列 DiT 的可扩展 sequence parallel。
- [PipeDiT](https://arxiv.org/abs/2511.12056)：任务流水和模型解耦，填补 denoising 阶段空泡。
- [GF-DiT](https://arxiv.org/abs/2606.13501)：在 serving 层调度不同并行策略。
- [Xema](https://arxiv.org/abs/2607.11136)：根据请求模板的离线显存轨迹，只在短暂峰值区间实施最小必要的显存缓解；静态张量布局减少碎片，并由离线规划器联合选择并行、并发和显存策略。
- [X-Stage](https://arxiv.org/abs/2607.23264)：让发送端 remote-store 与下一层计算重叠，补足只优化接收/collective 侧的遗漏阶段。

### 生产服务与生成工作流

- [Nirvana](https://arxiv.org/abs/2312.04429)：在相似 prompt 请求之间复用中间噪声状态，把跨请求近似缓存带入生产扩散服务。
- [Katz / SwiftDiffusion](https://www.usenix.org/conference/atc25/presentation/li-suyi-katz)：把 ControlNet、LoRA 等模块的计算和加载特征分开管理，为多适配器工作流做独立扩缩容、缓存与 latent parallelism。
- [DiffServe](https://arxiv.org/abs/2411.15381)：根据请求难度构造模型级联，并联合考虑质量、负载与 SLO。
- [PATCHEDSERVE](https://arxiv.org/abs/2501.09253)：把不同分辨率请求统一成 patch 级连续批处理，并在同一粒度做缓存与调度。
- [FlashPS / InstGenIE](https://arxiv.org/abs/2505.20600)：利用编辑 mask 只执行受影响区域，并将缓存加载、连续批处理和负载均衡组合起来。
- [Production Diffusion Serving](https://doi.org/10.1145/3772052.3772206)：用 300 多块 GPU、350 万请求的生产数据分析 workload、缓存、调度、扩缩容和资源效率。
- [LegoDiffusion](https://arxiv.org/abs/2604.08123)：把文生图工作流拆成模型级微服务，使各阶段能够独立共享、扩缩容和选择并行策略。
- [DisagFusion](https://arxiv.org/abs/2605.25550)：将编码器、DiT 与解码器解耦到异构 GPU，以异步流水和反馈式弹性调度解决阶段失衡。
- [TurboServe](https://arxiv.org/abs/2606.19271)：面向流式长视频会话联合管理迁移、状态卸载、批处理和 GPU 扩缩容。
- [FlashDiff](https://arxiv.org/abs/2607.12121)：按 latent 区域的收敛速度跳过低影响更新，并把释放的算力调度给其他请求。
- [ServerlessT2I](https://arxiv.org/abs/2607.26566)：把工作流拆为可独立扩缩容的 serverless 模型函数，并处理多租户公平性和 GPU 显存共享。

这组工作表明，扩散服务的对象已经从“一个固定 denoiser”扩展为由编码器、基础模型、ControlNet/LoRA、解码器和编辑模块组成的动态工作流。研究问题也相应从单 kernel 延迟扩展到阶段拆分、模型共享、缓存复用、异构放置、弹性扩缩容、SLO 与多租户公平。

### VLA 与混合 workflow serving

- [vLLM-Omni](https://arxiv.org/abs/2602.02204)：用 stage graph 表示 VLM/LLM、DiT action expert 和其他模态组件，每个阶段独立 batching、GPU 分配和路由。它解决的是混合模型服务，不是机器人上的整个闭环控制器。
- [VLA-Perf](https://arxiv.org/abs/2602.18397)：把长视频、模型架构、异步推理、端/边/云部署统一到延迟模型中。
- [EfficientVLA](https://arxiv.org/abs/2506.10100)：联合裁剪 VLM 层、视觉 token 和缓存 action head，提醒优化必须覆盖全 pipeline。
- [QuantVLA](https://arxiv.org/abs/2602.20309)：针对 VLM 与 DiT action head 的数值尺度做训练后量化。
- [Realtime-VLA FLASH](https://arxiv.org/abs/2605.13778)：用 draft—verify—fallback 降低高频重规划中完整 VLA 调用的比例。
- [vla.cpp](https://arxiv.org/abs/2606.08094)：把多种 VLM 和 diffusion/flow action head 放进轻量 C++ runtime，面向 batch-1 和边缘设备。
- [ActionCache](https://arxiv.org/abs/2607.06370)：从历史相似观测检索中间 action，用于热启动 flow denoising。

VLA 不是简单的“vLLM + DiT”同机拼接。它的关键路径是视觉编码/VLM prefill → 动作条件缓存 → 多步 DiT/flow action expert → action chunk 执行 → 新观测触发重规划。通用 serving engine 可以处理前三段，但实时控制还要处理 deadline、过期 action、安全回退和控制器连续性。

## 回答“DiT 计算高，通信瓶颈真的大吗”

答案是：**不是所有 DiT 都大，但在长序列多 GPU 推理的某些并行配置里很大。**

设单层计算时间为 `T_compute`，无法覆盖的通信为 `T_comm_exposed`。端到端关键路径更接近：

```text
T_layer ≈ T_compute + T_comm_exposed + T_sync
```

即使总通信字节换算出的理论时间小于计算，只要 collective 或发送端 store 位于依赖链上、与下一层计算错开，`T_comm_exposed` 就直接进入延迟。X-Stage 的价值是减少 exposed 部分，而不是声称通信总工作量超过矩阵计算。

更可能受益的条件：视频/高分辨率长序列、较高 sequence-parallel degree、单请求低 batch、跨 NUMA/跨机链路、或 MoE all-to-all 叠加。较少受益的条件：单卡、低并行度、大 batch GEMM 足够长、通信已经完全隐藏、或算子本身严重 memory-bound。

## 读系统论文时必查

- baseline 是否已经使用 fused kernel、异步 collective 和合理 chunking。
- 报告的是 kernel microbenchmark 还是端到端 latency/throughput。
- 网络拓扑、GPU 型号、SP/TP/EP degree、batch、分辨率与帧数。
- 优化是否改变显存峰值、数值结果或可支持的模型范围。
- 多步扩散是否每一步都获益，还是只在少数层/阶段获益。
