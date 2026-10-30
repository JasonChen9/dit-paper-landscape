# Diffusion Intelligence Atlas

面向研究阅读的双语论文地图，连接扩散与流模型、系统效率、强化学习、世界模型、机器人及智能体工作流。

[在线浏览](https://jasonchen9.github.io/dit-paper-landscape/) · [论文目录](catalog/papers.csv) · [数据维护说明](catalog/README.md)

目录收录 **362 篇独立论文**，每篇提供中英文介绍、英文原始摘要及完整中文译文；其中 120 篇已有核验过的会议或期刊链接。软件和技术文章单列在 `catalog/resources.json`，不计入论文数。

## 浏览与检索

- **论文卡片**：背景、挑战、方法、结果各一句；展开后阅读英文原始摘要或标注来源的 AI 中文译文。结果采用论文报告口径。
- **一个主类，多个筛选维度**：按主要贡献分为八个主类，应用领域、系统层级和收录来源独立筛选。同一维度满足任一选择，不同维度同时满足。
- **论文地图与作者地图**：支持缩放、平移、节点聚焦和地图内搜索。地图搜索保留当前图并高亮匹配项，点击结果定位节点；作者取消聚焦后恢复先前视野。
- **时间轴**：默认选择全部时间。当前年份前四年的年初以前压缩为一个短区段，近四年占据主要宽度；压缩只改变显示比例。
- **列表与导出**：检索标题、作者、标签及摘要；筛选状态保存在 URL。当前筛选结果可完整导出为 Markdown 或独立 HTML，不受分页影响。
- **个人收藏夹**：主页侧栏提供收藏及分类入口，展开后可新建、重命名、排序和删除分类；同一篇可加入多个分类。支持多选整理、论文批注，以及沿用列表格式的 Markdown / HTML 导出，可选附带批注。
- **界面**：中英文切换、深浅主题、适配手机。网站读取静态数据，访问时不调用模型或翻译服务。

八个主类为：基础方法、目标与采样；架构、表示与统一生成；视频与长时生成；系统与执行效率；强化学习与对齐；世界模型与交互模拟；具身智能与 VLA；智能体推理与工作流。

## 地图如何组织

当前全量地图按人工主类布局，连线根据主题标签的 TF-IDF 相似度计算。位置与连线用于发现相近问题，不代表引用关系、论文质量或方法可组合性。

作者图只统计第一作者、论文明确标注的共同第一作者及通讯作者。节点大小表示当前筛选下的论文数，主类由这些论文的主要贡献归属决定；连线根据论文标签相似度及共同署名计算。颜色表示目录中最近一次成功核验的论文署名单位，不保证是作者现任单位。

地图在构建阶段预计算。构建脚本也支持与完整目录及摘要签名匹配的语义快照；不匹配时使用标签相似度，人工主类始终独立维护。

## 本地预览

需要 Python 3 和 Node.js。以下命令在仓库根目录运行，不需要安装前端依赖，也不会下载 PDF 或模型：

```bash
python3 scripts/validate_catalog.py
node scripts/check_taxonomy_filters.cjs
node scripts/check_library_store.cjs
node scripts/check_library_notes.cjs
node scripts/check_library_export.cjs

mkdir -p tmp/site-preview/data
cp -R site/. tmp/site-preview/
cp catalog/papers.csv catalog/summaries_en.json catalog/abstracts.json catalog/paper_details.json catalog/taxonomy.json catalog/paper_taxonomy.json catalog/id_aliases.json tmp/site-preview/data/
node scripts/build_landscape_data.mjs catalog/papers.csv tmp/site-preview/data/landscape.json catalog/author_affiliations.json

python3 - <<'PY'
from datetime import datetime, timezone
from pathlib import Path
import json

output = Path('tmp/site-preview')
version = datetime.now(timezone.utc).strftime('local-%Y%m%d%H%M%S')
for name in ('index.html', 'library.html'):
    source = Path('site', name).read_text(encoding='utf-8')
    (output / name).write_text(source.replace('__DEPLOY_VERSION__', version), encoding='utf-8')
(output / 'version.json').write_text(json.dumps({'version': version}) + '\n', encoding='utf-8')
PY

python3 -m http.server 8000 --bind 127.0.0.1 --directory tmp/site-preview
```

打开 <http://127.0.0.1:8000/>。修改网站或目录后，重新执行生成预览的步骤并刷新页面；HTTP 服务可继续运行。

## 收藏与批注

收藏、分类和批注存放在当前浏览器的 IndexedDB 中，与公共目录分开。网站更新不会主动清空个人数据；清除浏览器站点数据则会删除本地收藏。不同浏览器、域名或端口拥有不同存储，因此从本地预览迁到线上、换浏览器或换设备时，应使用收藏页的 JSON“下载备份 / 恢复备份”。没有自动跨设备同步。

批注自动保存，保存失败时保留草稿；两个标签页同时修改同一笔记时会提示冲突并可保留两份内容。删除分类只移除分组关系，取消收藏仍保留批注，可从“我的批注”找回。分类删除和批注清空支持撤销。

收藏页导出仅针对勾选论文，使用与列表相同的 Markdown / HTML 格式；个人批注需主动勾选才会附带。JSON 备份单独包含全部个人分类和笔记，不进入网站发布文件。个人库按完整 JSON 备份大小限制为 12 MiB，写入超限时不会覆盖已有数据。

## 项目结构

```text
catalog/                    论文、摘要、双语卡片、分类及来源证据
site/                       静态网站 HTML、CSS、JavaScript
scripts/                    数据校验、地图预计算及资料维护脚本
notes/                      分主题阅读笔记与研究分析
papers/                     本地 PDF 分类目录和索引
.github/workflows/pages.yml  GitHub Pages 构建与部署
tmp/                        本地预览、缓存和检查结果，不进入 Git
```

`catalog/papers.csv` 是基本元数据入口。新增论文时，同步维护双语卡片、完整摘要、分类和来源证据，并运行校验；字段及操作约定见 [catalog/README.md](catalog/README.md)。

PDF 不打包到网站，也不进入普通 Git 历史。检查本地文件可运行 `python3 scripts/sync_papers.py --check`；需要获取文件时，`python3 scripts/sync_papers.py` 会按目录中的来源链接下载，可用 `--category` 限定分类。

## 发布

网站由 GitHub Pages 托管。`main` 分支中的网站、目录或相关构建文件变化会触发工作流，也可从 GitHub Actions 手动运行。工作流先校验数据，再生成静态文件及地图，最后部署。

本地修改与本地预览不会改变线上网站；需要将变更提交并推送到触发部署的分支。每次部署包含版本标识，已打开的页面发现新版后会保留当前 URL 筛选参数并刷新。
