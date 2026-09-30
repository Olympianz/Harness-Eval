# GitHub 推送指南

目标仓库：https://github.com/Olympianz/Harness-Eval

## 1. 解压

解压 `Harness-Eval-project.zip`，得到 `Harness-Eval` 文件夹。进入包含 `package.json` 和 `README.md` 的这一层目录。请推送解压后的源码文件，不要仅把 ZIP 上传为仓库中的一个文件。

包内包含完整源码、锁文件、操作手册、底层原理和合成示例。没有包含原项目 Git 历史、依赖目录、构建缓存、浏览器私有数据或部署身份。项目本身不需要 API Key。

## 2. 推送到空仓库

需要本机安装 Git，并已通过 GitHub CLI、Git Credential Manager 或其他受支持方式完成 GitHub 登录。GitHub 网页登录与本地 Git 认证是两个步骤。

如果已安装 GitHub CLI，可先运行：

```bash
gh auth login
gh auth setup-git
```

选择 GitHub.com、HTTPS，并按浏览器提示使用有仓库写入权限的账号完成登录。

在解压后的 `Harness-Eval` 目录打开终端，依次执行：

```bash
git init -b main
git add .
git status
git commit -m "feat: add Harness Eval Lab with documentation and demo traces"
git remote add origin https://github.com/Olympianz/Harness-Eval.git
git remote -v
git push -u origin main
```

若 Git 提示未设置作者信息，设置本仓库作者后再提交：

```bash
git config user.name "你的 GitHub 显示名称"
git config user.email "你的 GitHub 提交邮箱"
```

邮箱可使用你在 GitHub 邮箱设置中看到的 noreply 地址。上述命令中的中文占位符要替换成自己的信息。

## 3. 仓库已经存在提交时

如果你已在 GitHub 创建 README、LICENSE 或其他文件，先克隆仓库，再将 ZIP 内 `Harness-Eval` 文件夹的内容合并到克隆目录中，保留克隆目录的 `.git`。检查同名文件后再执行：

```bash
git add .
git diff --cached --stat
git commit -m "feat: add Harness Eval Lab with documentation and demo traces"
git push
```

克隆命令：

```bash
git clone https://github.com/Olympianz/Harness-Eval.git Harness-Eval-repo
```

Windows 文件管理器和 macOS Finder 可能隐藏以点开头的文件；复制时请包含 `.gitignore`、`.npmrc` 和 `.openai`。不要用强制推送覆盖已有提交。

## 4. 推送后检查

- GitHub 仓库首页正常显示 README。
- `app/`、`components/`、`docs/`、`examples/traces/` 均存在。
- `package.json` 和 `pnpm-lock.yaml` 位于仓库根目录。
- 打开操作手册和 JSONL 示例，确认中文正常显示。
- 若希望限制源代码访问，在仓库 Settings 中将可见性调整为 Private；仓库可见性与已部署网站的访问控制相互独立。

## 5. 本地运行

使用 Node.js 22.13+ 和 pnpm 11.25.0：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

打开 http://localhost:5173 。详细运行说明和功能边界见根目录 README。

## 6. 常见问题

| 提示 | 处理 |
| --- | --- |
| `Author identity unknown` | 设置本仓库 user.name 和 user.email |
| `Authentication failed` 或 403 | 检查本地 Git 登录账号及目标仓库写入权限 |
| `remote origin already exists` | 用 `git remote -v` 核对已有地址，正确则不再添加 |
| `non-fast-forward` | 远端已有提交；使用第 3 节克隆后合并文件流程 |
| 未识别 pnpm | 先安装指定版本 pnpm，再安装项目依赖 |

未替你选择项目开源许可证；第三方依赖与随附组件的许可声明已保留。包内 `.gitattributes` 将文本文件统一为 LF，`.gitignore` 排除依赖、构建产物和本地密钥文件。所有源文件均远低于 GitHub 的普通 Git 单文件大小限制，无需 Git LFS。

## 官方参考（核对日期：2026-09-30）

- [添加本地代码到 GitHub](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)
- [GitHub 大文件限制](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)
