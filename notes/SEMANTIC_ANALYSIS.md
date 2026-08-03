# Semantic corpus analysis

- Corpus: 156 papers with complete English abstracts
- Embedding: `allenai/specter` over `title [SEP] abstract`, L2-normalized
- Corpus signature: `ff4d774613818a34`
- Diagnostic clustering: K-means with 50 restarts; cosine silhouette is used only to compare candidate counts
- Highest diagnostic silhouette in this range: **k=7** (0.2506)

The diagnostic clusters are not automatically promoted to the public taxonomy. They reveal natural neighborhoods; the final colors should remain stable, interpretable research questions.

## Taxonomy decision

**Use seven public topics.** k=7 has the highest cosine silhouette in the tested range (0.2506; k=5 is 0.2485). The five-cluster view merges video with world models and folds reinforcement learning into broader method clusters, while k=8–10 fragments VLA and systems into small subclusters.

1. Foundations, Objectives & Sampling
2. Architecture, Representation & Unified Generation
3. Video & Long-Horizon Generation
4. Systems & Inference Efficiency
5. Reinforcement Learning & Alignment
6. World Models & Interactive Simulation
7. Embodied AI & VLA

The public taxonomy supplies stable, interpretable colors. SPECTER cosine similarity and UMAP supply the edges and positions, so classification and geometric proximity remain related but are not forced to be identical.

## Candidate topic counts

| k | cosine silhouette | smallest cluster | largest cluster |
|---:|---:|---:|---:|
| 5 | 0.2485 | 20 | 43 |
| 6 | 0.2422 | 16 | 34 |
| 7 | 0.2506 | 7 | 34 |
| 8 | 0.2108 | 8 | 28 |
| 9 | 0.1953 | 7 | 28 |
| 10 | 0.1735 | 8 | 25 |

## k=5

### Cluster 1 · 43 papers

- Terms: video · world · long · interactive · attention · latent · quality · real time
- Representatives: Helios · SANA-Video · W.A.L.T. · LTX-Video · HunyuanVideo · Wan

### Cluster 3 · 34 papers

- Terms: action · robot · language · vla · vision · world · real · policies
- Representatives: dVLA · GR00T N1 · DexVLA · SmolVLA · GR-2 · Qwen-RobotWorld

### Cluster 2 · 32 papers

- Terms: text · image · multimodal · understanding · unified · modalities · human · dit
- Representatives: Seedream 4.0 · Scaling RAE DiT · BLIP3-o · Stable Diffusion 3 · Lumina-T2X · Qwen-Image

### Cluster 4 · 27 papers

- Terms: sampling · image · flow · quality · fid · process · dit · steps
- Representatives: Progressive Distillation · SiT · PixelDiT · Flow-GRPO · EDM · REPA

### Cluster 0 · 20 papers

- Terms: serving · gpu · parallelism · latency · communication · image · scheduling · workflow
- Representatives: FlashDiff · Katz / SwiftDiffusion · GF-DiT · LegoDiffusion · Z-Image · FlashPS / InstGenIE


## k=6

### Cluster 2 · 34 papers

- Terms: action · robot · language · vla · vision · world · real · policies
- Representatives: dVLA · GR00T N1 · DexVLA · SmolVLA · GR-2 · Qwen-RobotWorld

### Cluster 1 · 30 papers

- Terms: video · attention · quality · temporal · long · audio · latent · high
- Representatives: LTX-Video · Helios · SANA-Video · W.A.L.T. · Video Diffusion Models · Wan

### Cluster 0 · 28 papers

- Terms: image · text · multimodal · understanding · unified · human · synthesis · fine
- Representatives: Seedream 4.0 · BLIP3-o · Scaling RAE DiT · Stable Diffusion 3 · Qwen-Image · Hunyuan-DiT

### Cluster 5 · 28 papers

- Terms: sampling · image · flow · quality · fid · dit · process · efficient
- Representatives: Progressive Distillation · PixelDiT · SiT · Flow-GRPO · EDM · REPA

### Cluster 4 · 20 papers

- Terms: serving · gpu · parallelism · latency · communication · image · scheduling · workflow
- Representatives: FlashDiff · Katz / SwiftDiffusion · GF-DiT · LegoDiffusion · Z-Image · FlashPS / InstGenIE

### Cluster 3 · 16 papers

- Terms: world · interactive · video · game · real time · agents · environment · foundation
- Representatives: AlayaWorld · Matrix-Game 2.0 · Pandora · Genie · DIAMOND · VideoRLVR


## k=7

### Cluster 1 · 34 papers

- Terms: action · robot · language · vla · vision · world · real · policies
- Representatives: dVLA · GR00T N1 · DexVLA · SmolVLA · GR-2 · Qwen-RobotWorld

### Cluster 0 · 33 papers

- Terms: text · image · multimodal · understanding · unified · dit · synthesis · modalities
- Representatives: Seedream 4.0 · Scaling RAE DiT · BLIP3-o · Stable Diffusion 3 · Lumina-T2X · Qwen-Image

### Cluster 4 · 25 papers

- Terms: video · attention · quality · temporal · audio · long · memory · latent
- Representatives: LTX-Video · SANA-Video · Helios · W.A.L.T. · Step-Video-T2V · Video Diffusion Models

### Cluster 3 · 22 papers

- Terms: flow · fid · image · sampling · quality · conditional · ode · process
- Representatives: Progressive Distillation · SiT · PixelDiT · EDM · DDIM · REPA

### Cluster 5 · 18 papers

- Terms: serving · gpu · latency · parallelism · image · communication · scheduling · workflow
- Representatives: Katz / SwiftDiffusion · FlashDiff · GF-DiT · LegoDiffusion · FlashPS / InstGenIE · Z-Image

### Cluster 2 · 17 papers

- Terms: world · interactive · video · game · real time · consistency · long · foundation
- Representatives: Matrix-Game 2.0 · AlayaWorld · Pandora · VideoRLVR · Genie · DIAMOND

### Cluster 6 · 7 papers

- Terms: reinforcement · policy · reward · rl · human · fine tune · feedback · optimization
- Representatives: DiffusionNFT · D3PO · JAGG · Diffusion-DPO · DPOK · ADWM


## k=8

### Cluster 2 · 28 papers

- Terms: text · image · multimodal · understanding · unified · synthesis · visual · human
- Representatives: Seedream 4.0 · BLIP3-o · Scaling RAE DiT · Stable Diffusion 3 · Lumina-T2X · OmniGen2

### Cluster 3 · 26 papers

- Terms: video · attention · quality · temporal · long · audio · latent · vae
- Representatives: LTX-Video · SANA-Video · Helios · W.A.L.T. · Video Diffusion Models · Step-Video-T2V

### Cluster 7 · 25 papers

- Terms: image · fid · sampling · quality · flow · score · conditional · sample
- Representatives: Progressive Distillation · PixelDiT · SiT · DDIM · EDM · REPA

### Cluster 5 · 20 papers

- Terms: serving · parallelism · gpu · communication · latency · image · scheduling · workflow
- Representatives: FlashDiff · Katz / SwiftDiffusion · GF-DiT · LegoDiffusion · SwiftFusion · Z-Image

### Cluster 0 · 17 papers

- Terms: robot · manipulation · policy · action · learning · world · policies · real
- Representatives: GR00T N1 · DexVLA · DP3 · Tenma · Octo · GR-2

### Cluster 1 · 16 papers

- Terms: world · interactive · video · game · real · frame · foundation · long
- Representatives: AlayaWorld · Matrix-Game 2.0 · Pandora · Genie · VideoRLVR · DIAMOND

### Cluster 6 · 16 papers

- Terms: action · vla · language · vision · inference · robot · success · world
- Representatives: dVLA · Dream-VLA · SmolVLA · Qwen-RobotWorld · VLAFlow · ActionCache

### Cluster 4 · 8 papers

- Terms: rl · reinforcement · reward · policy · human · learning · fine tune · llm
- Representatives: DiffusionNFT · D3PO · JAGG · Diffusion-DPO · DPOK · MMOE


## k=9

### Cluster 3 · 28 papers

- Terms: video · attention · quality · temporal · audio · latent · t2v · long
- Representatives: LTX-Video · Helios · W.A.L.T. · SANA-Video · Video Diffusion Models · Step-Video-T2V

### Cluster 5 · 25 papers

- Terms: image · text · multimodal · understanding · unified · synthesis · visual · human
- Representatives: Seedream 4.0 · BLIP3-o · Scaling RAE DiT · Stable Diffusion 3 · OmniGen2 · Qwen-Image

### Cluster 0 · 24 papers

- Terms: image · sampling · fid · flow · quality · conditional · samples · time
- Representatives: Progressive Distillation · PixelDiT · SiT · EDM · DDIM · REPA

### Cluster 6 · 17 papers

- Terms: world · interactive · video · game · real · long · action · environments
- Representatives: AlayaWorld · Matrix-Game 2.0 · Pandora · Genie · VideoRLVR · DIAMOND

### Cluster 1 · 16 papers

- Terms: action · vla · language · vision · inference · world · success · embodied
- Representatives: dVLA · SmolVLA · Dream-VLA · VLAFlow · CogACT · Qwen-RobotWorld

### Cluster 4 · 16 papers

- Terms: robot · policy · policies · manipulation · learning · action · world · real
- Representatives: Tenma · GR00T N1 · DP3 · DexVLA · Octo · GR-2

### Cluster 2 · 14 papers

- Terms: parallelism · communication · gpu · serving · computation · overhead · inference · latency
- Representatives: FlashDiff · SwiftFusion · GF-DiT · PipeFusion · xDiT · DistriFusion

### Cluster 7 · 9 papers

- Terms: serving · workflow · image · loading · production · text · t2i · latency
- Representatives: LegoDiffusion · Katz / SwiftDiffusion · Nirvana · DiffServe · ServerlessT2I · FlashPS / InstGenIE

### Cluster 8 · 7 papers

- Terms: reinforcement · policy · reward · rl · human · fine tune · feedback · optimization
- Representatives: DiffusionNFT · D3PO · JAGG · Diffusion-DPO · DPOK · ADWM


## k=10

### Cluster 5 · 25 papers

- Terms: image · text · multimodal · understanding · unified · modalities · parameters · dit
- Representatives: Seedream 4.0 · Scaling RAE DiT · BLIP3-o · Stable Diffusion 3 · Lumina-T2X · UniDDT

### Cluster 8 · 20 papers

- Terms: flow · fid · sampling · image · quality · conditional · ode · guidance
- Representatives: Progressive Distillation · PixelDiT · SiT · REPA · DDIM · EDM

### Cluster 4 · 19 papers

- Terms: robot · policy · policies · action · manipulation · world · learning · real
- Representatives: GR00T N1 · DP3 · DexVLA · Tenma · Octo · GR-2

### Cluster 1 · 17 papers

- Terms: world · video · interactive · game · real time · foundation · consistency · long
- Representatives: Matrix-Game 2.0 · AlayaWorld · Pandora · VideoRLVR · Genie · DIAMOND

### Cluster 2 · 15 papers

- Terms: action · vla · language · vision · inference · success · embodied · libero
- Representatives: dVLA · SmolVLA · Dream-VLA · VLAFlow · Qwen-RobotWorld · ActionCache

### Cluster 6 · 14 papers

- Terms: video · attention · quality · caching · cache · block · acceleration · inference
- Representatives: SANA-Video · LTX-Video · SANA-Video 2.0 · Helios · MobileWan · OmniCache

### Cluster 9 · 14 papers

- Terms: serving · image · workflow · text · efficient · gpu · scaling · quality
- Representatives: Katz / SwiftDiffusion · Z-Image · LegoDiffusion · SANA 1.5 · Nirvana · PATCHEDSERVE

### Cluster 7 · 13 papers

- Terms: video · audio · temporal · t2v · long · text · latent · generate
- Representatives: W.A.L.T. · HunyuanVideo · Latte · CogVideoX · Video Diffusion Models · Step-Video-T2V

### Cluster 3 · 11 papers

- Terms: serving · parallelism · communication · gpu · scheduling · latency · computation · pipeline
- Representatives: GF-DiT · FlashDiff · SwiftFusion · PipeFusion · DisagFusion · DistriFusion

### Cluster 0 · 8 papers

- Terms: reward · human · preference · feedback · learning · policy · text image · reinforcement
- Representatives: D3PO · Diffusion-DPO · DiT-Reward · DiffusionNFT · DPOK · ImageReward
