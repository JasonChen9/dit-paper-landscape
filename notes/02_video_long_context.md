# 视频、长上下文与流式生成

## 为什么视频把问题放大

视频 token 数约等于空间 token × 时间长度。即便总 FLOPs 中 MLP/卷积仍可能占大头，全注意力的中间激活、KV 读写和 sequence-parallel 通信会随长序列迅速暴露。于是“计算占比高于通信”与“通信成为缩放瓶颈”可以同时成立：前者看总量，后者看关键路径中无法被计算覆盖的部分。

## 三组问题

### 1. 降低每段视频的成本

- [SANA-Video](https://arxiv.org/abs/2509.24695)：block linear attention 加高压缩表示，目标是直接改变序列复杂度。
- [SANA-Video 2.0](https://arxiv.org/abs/2607.21553)：用 hybrid attention 和 residual 路径补回纯线性注意力丢掉的表达力。
- [MobileWan](https://arxiv.org/abs/2607.06173)：从移动端约束反推蒸馏、量化和算子设计。

### 2. 延长时间而不积累漂移

- [Mixture of Contexts](https://arxiv.org/abs/2508.21058)：让短期细节与长期语义上下文分工，而不是保存全部历史。
- [StableAvatar](https://arxiv.org/abs/2508.08248)：在分块生成中维持身份、口型和跨片段连续性。
- [Helios](https://arxiv.org/abs/2603.04379)：把目标推到实时长视频，延迟和状态管理与画质同等重要。

### 3. 从离线片段走向流式和交互

- Self Forcing（背景锚点）：训练时让模型看到自己的生成历史，减轻 exposure bias。
- [Causal-rCM](https://arxiv.org/abs/2606.25473)：统一 teacher-forcing/self-forcing 的因果蒸馏，并明确连接 interactive world models。
- World model 论文把动作作为条件；此时未来帧不只是“好看”，还必须对动作响应正确。

## 当前共识与未决问题

当前共识是：无限长视频不能靠无限扩 context window。需要压缩状态、层级记忆、因果生成和在模型自身轨迹上的训练共同工作。

未决问题是长期评测。短 clip 的 FVD/偏好分无法可靠衡量身份漂移、物理累积误差、动作可控性和数分钟后的状态一致性。随着视频模型转向 world model，评测将越来越像轨迹预测与控制，而不是传统视觉质量评分。
