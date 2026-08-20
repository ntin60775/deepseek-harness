# Agent Note: 兼容 oh-my-pi 的 agent 规则

Status: implemented

[English](2026-08-20-agent-rules-omp-compat.md) | 中文

## 问题

用户在项目中维护 oh-my-pi (omp) 规则文件——`.omp/rules/*.{md,mdc}` 规则册与顶层 sticky `RULES.md`——并希望同一份磁盘文件无需复制或迁移即可驱动 DeepSeek Harness 会话。DeepSeek Harness 原本没有任何 `.omp` 发现机制：`dsh-agent-instructions` 只加载 `AGENTS.md`/`CLAUDE.md` 链，且没有任何代码解析规则 frontmatter 或区分 always-apply 内容与按需 rulebook。

## 决策

新增单一用途插件包 `packages/context/agent-rules`（`@deepseek-ai/dsh-agent-rules`），以 1:1 的发现语义读取 omp 原生规则表面，并通过模型表面提供服务：

- 项目规则只来自 `<cwd>/.omp/rules/`，且仅当 cwd 的 `.omp/` 目录非空时读取；不做祖先回溯，与 omp 的 `getConfigDirs` 一致。
- 用户规则来自 `<ompAgentDir>/rules/`，目录解析顺序为 `ompAgentDir` 配置、`PI_CODING_AGENT_DIR`、`~/.omp/agent`。
- sticky 规则：`<ompAgentDir>/RULES.md` 合成为规则 `RULES`；从 cwd 向项目根回溯时最近非空 `.omp/` 中的 `RULES.md` 合成为 `RULES@project`；两者都强制 `alwaysApply`。即使该目录没有该文件，回溯也在最近的非空 `.omp/` 处停止。
- 合并顺序为项目规则、用户规则、sticky 用户、sticky 项目，按名称先到者胜去重，因此同名项目规则会遮蔽用户规则。
- frontmatter 解析 `description`、`globs` 与 `alwaysApply`；omp 的 TTSR 字段被识别、作为发现警告报告、但永不执行——流式中断需要 agent-loop 支持，属待定工作。既无 `alwaysApply` 又无 `description` 的规则不可达，与 omp 一致。
- always-apply 规则以 `Rules from:` 分节渲染进一条持久 user 角色消息，范围从宽到窄排列；rulebook 渲染为 `<available_rules>` 目录（名称/glob/描述行）。`rule` 工具按确切名称加载规则全文，并为调用会话的 cwd 重新发现规则集。
- 发布由 durable 记录（目录条目加上 always-apply 的身份/内容摘要）的摘要门控，永不依据渲染框架。摘要变化时追加一条完整替换消息；清空时追加显式空替换；被压缩隐藏的上下文在下次观察时重新建立。仅当发起调用的 agent 解析到本插件注册的 `rule` 工具本身时才发布上下文。
- 插件通过可选的 `ctx.fs` provider 读取，无 provider 时为空操作，与 `dsh-agent-instructions` 一致。`maxBytes` 为必填配置，非正值禁用加载。`maxSourceBytes`、`ompAgentDir`、`projectRootMarkers`、`catalogDescriptionMaxLength` 均可配置。

## 备选方案

- **扩展 `dsh-agent-instructions` 的候选文件**。其候选模型是同一目录内的文件名加内容去重；规则则是带 frontmatter 语义的目录 glob、跨层按名去重以及 always-apply/rulebook 拆分。并入会在同一生命周期内耦合两种不同的发现模型。
- **将 always-apply 规则与目录拆成两条消息**。单条消息使整个规则上下文保持原子：一个摘要驱动重新发布，模型在一个稳定块中同时看到 always-apply 规则与指向其按需同级的目录。
- **通过带内部 scheme 的 `read` 提供 rulebook 正文**。这会扩展另一个包的工具表面；`rule` 工具镜像现有 `skill` 工具模式，并把契约保持在包内。
- **本轮实现 TTSR**。在 token 中途中止 provider 流并用注入规则重试会触及 agent-loop 与 provider 流式；现在解析并警告 frontmatter 以保持规则可移植，但执行仍是独立特性。

## 验证

包测试覆盖：发现来源、空目录跳过、最近非空 sticky 回溯、项目覆盖用户的名称去重、`.md`/`.mdc` 加载、frontmatter 边界情况（未闭合块、YAML 损坏、字符串 globs、非布尔 `alwaysApply`）、TTSR 警告、分桶、渲染顺序、字节预算省略/截断及具名提示、提醒标签转义、显式空替换、摘要稳定性，以及插件发布生命周期（首次发布、集合不变不重发、变化时完整替换、空集静默）。真实组合通过 `ctx.plugin` 启动 `SystemPrompt`、`ToolRuntime`、`AgentRegistry`、`LocalFileSystem` 与插件，并断言 durable 消息与 `rule` 工具的正文/错误行为。类型检查、oxlint、workspace constraints 门禁、export-JSDoc、note-format、翻译配对、README model-experience 与 README limitations 门禁均通过。

`rule` 工具由 agent-rules 插件自身注册，而非独立的 `tool-*` 消费包。生成的工具目录（`docs/tool-catalog.md`）只覆盖 `tool-*` 叶子，因此工具 schema 改在包 README 中记录；若工具日后获得独立的演进轴，仍可拆分出 `tool-*` 包。

## 后果

带 omp 规则文件的项目无需迁移即可在 DeepSeek Harness 会话中获得相同的指引；同一批文件同时驱动两个工具。插件在每次规则集变化时增加一条 durable 上下文消息，受 `maxBytes` 限制，并每步重读规则文件（摘要门控，集合不变时不消耗 token）。待定工作——TTSR 执行、`@` 导入展开、`.omp/AGENTS.md` 上下文文件、其他工具的规则格式、跨提示词去重与逐步读取缓存——记录在包 README 的 Known Limitations 中。
