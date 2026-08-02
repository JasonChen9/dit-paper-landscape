# GitHub 与网站维护指南

## 常用地址

- 仓库：<https://github.com/JasonChen9/dit-paper-landscape>
- 网站：<https://jasonchen9.github.io/dit-paper-landscape/>
- 自动部署记录：<https://github.com/JasonChen9/dit-paper-landscape/actions/workflows/pages.yml>

这是一个独立的 GitHub 项目站点，不会覆盖 `JasonChen9.github.io` 个人主页。

## 最简单的浏览器维护方式

1. 打开仓库中的 `catalog/papers.csv`。
2. 点击右上角铅笔按钮 **Edit this file**。
3. 修改或新增一行。`arxiv_url` 和 `pdf_url` 会自动显示为网站上的可点击按钮。
4. 点击 **Commit changes**，目标选择 `main`。
5. 打开仓库的 **Actions** 页面。`Deploy GitHub Pages` 变绿后，网站即已更新。

CSV 字段解释见 [`catalog/README.md`](catalog/README.md)。编辑时保留表头和双引号，标签使用英文分号 `;` 分隔。

## 在本地维护

进入本地仓库后：

```bash
git pull
```

修改 `catalog/papers.csv` 或网站文件，然后检查和提交：

```bash
python3 scripts/sync_papers.py --check
git add catalog README.md notes site
git commit -m "Update paper catalog"
git push
```

推送到 `main` 后，GitHub Actions 自动重新发布网站。

## 添加论文链接

每条记录包含两个浏览器可点击来源：

```text
arxiv_url = https://arxiv.org/abs/论文编号
pdf_url   = https://arxiv.org/pdf/论文编号
```

网站部署时读取 `catalog/papers.csv`，因此不需要把本地 PDF 上传到 GitHub。PDF 仍可以通过 `scripts/sync_papers.py` 下载到分类目录，供离线阅读。

## 查看或手动重新部署

1. 打开仓库的 **Actions**。
2. 左侧选择 **Deploy GitHub Pages**。
3. 点击 **Run workflow**，选择 `main`，再确认运行。

正常更新不需要手动操作；只有网站没有自动刷新时才使用这个入口。

## GitHub Pages 设置

在仓库中打开：

```text
Settings → Pages
```

部署来源应显示为 **GitHub Actions**。不要把它改成个人主页仓库，也不要把本站文件复制到 `JasonChen9.github.io`。

## 可选：使用独立域名

如果以后希望使用 `papers.example.com`：

1. 在域名服务商添加 `papers` 的 CNAME，指向 `JasonChen9.github.io`。
2. 在仓库 **Settings → Pages → Custom domain** 填入 `papers.example.com`。
3. 等待证书生成后勾选 **Enforce HTTPS**。

不配置自定义域名时，继续使用项目站地址即可。

