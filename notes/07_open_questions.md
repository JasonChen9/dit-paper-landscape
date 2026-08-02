# 开放问题与研究机会

下面按“问题是否重要、能否做出清晰实验、是否仍缺可信答案”排序，而不是按论文热度排序。

## A. 高价值且可操作

### 1. 面向 RAE 的 compute-optimal DiT

问题：latent 维度、空间压缩、DiT 宽度、数据量和训练步数如何联合缩放？目前很多对比把 tokenizer 和 backbone 一起变了，难以归因。

可做实验：固定总训练 FLOPs，系统扫描 latent dimension × spatial compression × model width；同时报告重建、收敛速度和最终生成质量。

### 2. 缓存/稀疏/量化的可组合性

问题：三类方法通常单独报告，但缓存改变激活分布，稀疏改变 kernel 形态，量化误差又会跨 timestep 积累，简单叠加未必相乘。

可做实验：建立统一端到端矩阵，覆盖图像/视频、不同步数和硬件；同时测 p50/p99、峰值显存、能耗和最差质量下降。

### 3. 通信瓶颈的可复现实证

问题：X-Stage 等系统工作的收益取决于拓扑和并行配置，社区缺少标准化的 exposed-communication breakdown。

可做实验：对同一 Dense DiT 与 MoE DiT，在单机 NVLink、跨机网络、不同 SP/EP degree 下分解 compute、collective、remote store、同步和空泡；明确何时优化会反向减速。

### 4. DiT RL 的 reward-cost frontier

问题：方法论文经常只报告最终 reward/质量，不报告产生它用了多少 rollout、reward-model FLOPs 和失败样本。

可做实验：固定总 GPU 小时，对比 SFT、best-of-N、rejection sampling、direct preference optimization 和 online GRPO；画出质量—多样性—成本 Pareto 前沿。

## B. 影响大但难度更高

### 5. 可用于规划而不只是可视化的 world model

关键指标不是生成视频“像真”，而是 action-conditioned counterfactual 是否正确，以及 planner 是否能利用模型完成真实任务。需要闭环 benchmark，专门检测 planner 对模型漏洞的 exploitation。

### 6. 长时视频的状态而非像素记忆

无限上下文不可持续。需要显式或隐式 state，保存物体、关系、接触、身份和任务进度，同时允许重新渲染细节。可以比较 continuous memory token、结构化 state 和检索式 episodic memory。

### 7. 少步 diffusion policy

机器人控制要求低延迟、高频重规划，而 diffusion policy 的多步采样与之冲突。值得研究 consistency/flow distillation 是否在 1—4 步仍保持动作多模态性和闭环鲁棒性。

### 8. 真正可验证的视觉/视频奖励

VLM judge 不是严格 verifier。几何、物理、文字、计数和任务成功可以部分程序化，但覆盖有限。研究机会在多 verifier 组合、置信校准、对抗 reward hacking 和不确定性驱动的数据采样。

## C. 应保持怀疑的问题

### 专家化架构是否值得部署

需要和相同质量的 dense 模型比较端到端吞吐，而非只比较激活 FLOPs。不同路由粒度的专家模型应分别统计激活参数、显存、负载均衡、通信和小 batch 效率。

### 一个 backbone 是否应该统一所有模态和任务

完全共享可能在论文叙事上漂亮，却让理解、生成、音频、动作互相干扰。更现实的研究假设是共享语义/接口、保留模态专用的 tokenizer、dynamics、noise schedule 和输出 head。

### RL 是否真的产生新能力

必须排除 reward overfitting、训练集 verifier 泄漏和更大采样预算带来的 best-of-N 效应。应测试分布外规则、组合任务、不同 judge 和真实人类/环境成功率。

## 推荐的三个选题切口

1. **偏系统**：Dense/MoE video DiT 的通信暴露剖析 + X-Stage/SP/EP 自适应调度。
2. **偏算法系统联合**：视频 DiT cache × quant × sparse attention 的误差预算与自动策略搜索。
3. **偏 Agent/RL**：低步 WorldDiT policy + 程序可验证动力学奖励，在闭环环境比较 joint world/action 与模块化基线。
