# Agent Note：fork 合并仪式

Status: implemented

[English](2026-09-08-fork-merge-ritual.md) | 中文

## 问题

本仓库是 `deepseek-ai/deepseek-harness` 的 fork，携带若干 fork 本地表面：`apps/desktop/src/main.ts` 中仅开发用的图标补丁，以及 GitHub 侧对真实 API E2E 工作流的禁用。并入上游（2026-09-08 的合并带来 1199 个提交）以已知方式扰动了其中每一处，而每处修复当时都是手工完成的。没有成文流程，下一次合并会重复同样的发现成本，并且存在一种静默失败：上游对 `e2e.yml` 的编辑重新启用 GitHub 已禁用的夜间工作流。

## 决策

`scripts/fork-merge-ritual.sh` 把整个并入过程作为有序阶段运行：preflight（干净工作树，或续跑进行中的合并）、merge（仅对本 fork 会重新生成的文件自动 `--theirs` 解冲突）、install + build、docs（运行 `gen-tsconfig-paths`、`gen-doc-graphs`、`gen-config-catalog`，重录 pairing 哈希）、verify（`typecheck`、`constraints`、`test:docs`、`test:snapshot`），最后一步检查 GitHub Actions：若上游编辑重新激活了 fork 已禁用的工作流（`e2e.yml`、`ci-master.yml`、`sandbox.yml`）中的任何一个，就再次禁用（[验证通道](2026-09-10-fork-linux-x64-validation-lanes.md)）。脚本提交修复轮，但从不 push。它不拥有的冲突会终止运行，列出文件清单并给出内联解决指南。

fork 本地表面都带标记，便于脚本和人类定位：`apps/desktop/src/main.ts` 里的 `Fork-local` 注释。

## 备选方案

- **用 GitHub Action 自动合并上游。** 否决：合并需要脚本刻意停下来的冲突判断；fork 的 CI secret 处境正是被禁用的 E2E 工作流所保护的；自动合并会经由仪式所防范的同一条文件编辑路径重新启用它。
- **在 fork 中删除 `e2e.yml` 而非在 GitHub 上禁用。** 否决：删除保证每次上游编辑该文件都产生 modify/delete 冲突，而禁用只是一个 API 调用，仪式会复查。
- **对生成文件用 git pre-merge 钩子或 `merge.ours.driver`。** 否决：属性驱动的解决会把冲突藏离操作者，并在上游改动生成器时静默保留过期的 fork 条目——这正是 docs 阶段要防止的失败。
- **只用散文记录仪式。** 否决：序列长、机械、有两个静默失败点；脚本就是文档，本注记是其理由。

## 后果

每次上游并入变成一条命令，外加至多脚本点名的冲突。三个被禁用工作流的禁用是仓库状态而非文件状态；仪式最后一步是唯一能防止上游编辑静默重新启用夜间真实 API 运行或非 Linux 通道的关口（禁用集合由[验证通道](2026-09-10-fork-linux-x64-validation-lanes.md)拥有）。
