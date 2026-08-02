# 推理、训练与系统效率

## 先区分四类瓶颈

| 层次 | 典型瓶颈 | 代表方法 |
|---|---|---|
| 算法 | denoising 步数、全注意力复杂度 | 蒸馏、线性/稀疏 attention |
| 模型 | 重复特征、权重/激活带宽 | cache、quantization、结构稀疏 |
| 并行 | all-gather / reduce-scatter / all-to-all 暴露 | sequence/context parallel、通信计算重叠 |
| 服务 | batch 波动、异构请求、GPU 空泡 | 并行策略选择、流水、请求调度 |

同一模型在单卡、NVLink 机内多卡和跨机 InfiniBand 上会落入不同瓶颈，因此不能用一张 FLOPs 饼图判断通信优化有没有价值。

## 论文地图

### 缓存与压缩

- [SpeCa](../papers/03_efficiency_systems/2509.11628__speca.pdf)：推测哪些中间特征可以跨 timestep 复用。
- [BWCache](../papers/03_efficiency_systems/2509.13789__bwcache.pdf)：在视频 DiT block 粒度缓存。
- [OmniCache](../papers/03_efficiency_systems/2607.23844__omnicache.pdf)：组合层、时间步、token 等多维层级策略。
- [QuantSparse](../papers/03_efficiency_systems/2509.23681__quantsparse.pdf)：联合量化与 attention sparsification，避免单点优化互相抵消。

缓存的核心风险是误差会在多步去噪中累积；比较时应同时看 wall-clock、额外控制开销、不同 prompt/分辨率的最差画质下降。

### Kernel 与注意力执行

- [FlashOmni](../papers/03_efficiency_systems/2509.25401__flashomni.pdf)：统一稀疏注意力模式的执行引擎。
- SANA-Video 系列：算法复杂度和 kernel 友好性共同决定线性注意力是否真快。

“理论稀疏”只有在索引、数据布局和 kernel 足够规则时才会变成端到端收益。

### 多 GPU 推理与 serving

- [SwiftFusion](../papers/03_efficiency_systems/2601.20273__swiftfusion.pdf)：长序列 DiT 的可扩展 sequence parallel。
- [PipeDiT](../papers/03_efficiency_systems/2511.12056__pipedit.pdf)：任务流水和模型解耦，填补 denoising 阶段空泡。
- [GF-DiT](../papers/03_efficiency_systems/2606.13501__gf-dit.pdf)：在 serving 层调度不同并行策略。
- [X-Stage](../papers/03_efficiency_systems/2607.23264__x-stage.pdf)：让发送端 remote-store 与下一层计算重叠，补足只优化接收/collective 侧的遗漏阶段。

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

