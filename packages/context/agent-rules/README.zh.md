# @deepseek-ai/dsh-agent-rules

[English](README.md) | 中文

兼容 oh-my-pi 的 `.omp` 规则文件加载器。该插件发现项目级与用户级规则，将 always-apply 规则正文作为一条规则上下文消息注入持久历史，并把带 description 的规则列入按需目录，其正文由 `rule` 工具提供。

## 发现

四个来源汇入一个按名称去重的规则集，按合并顺序先到者胜，因此同名项目规则会遮蔽用户规则：

1. **项目规则** — `<cwd>/.omp/rules/*.{md,mdc}`，仅当 cwd 自身的 `.omp/` 目录非空时读取。不做祖先回溯：嵌套在 monorepo 中的包不会继承父包的规则目录。
2. **用户规则** — `<ompAgentDir>/rules/*.{md,mdc}`，仅当 omp 用户 agent 目录非空时读取。
3. **sticky 用户规则** — `<ompAgentDir>/RULES.md`，合成为名为 `RULES` 且强制 `alwaysApply` 的规则。
4. **sticky 项目规则** — 从 cwd 向项目根回溯时遇到的最近非空 `.omp/` 目录中的 `RULES.md`，合成为 `RULES@project` 并强制 `alwaysApply`。即使该目录没有 `RULES.md`，回溯也在最近的非空 `.omp/` 处停止。

空文件不参与。规则名是其文件名去掉 `.md`/`.mdc` 扩展名。规则正文为 Markdown，可带 YAML frontmatter：`description` 选择按需 rulebook，`globs` 标注目录条目，`alwaysApply: true` 选择无条件注入。oh-my-pi 的 TTSR 字段（`condition`、`astCondition`、`scope`、`interruptMode`）会被识别并作为发现警告报告，但永不执行。YAML 解析失败的 frontmatter 会让文件降级为纯文本并产生警告，而不是被丢弃。既无 `alwaysApply` 又无 `description` 的规则不可达，与 oh-my-pi 一致。

发现读取使用可选的 `ctx.fs` provider。插件不静态注入 `fs`，因此无 provider 的产品树仍可启动，规则加载在 provider 出现前为空操作。

## 生命周期

每个符合条件的 `agent/pre-step` 都会为会话 cwd 重新发现规则集，并对已发布记录取摘要——目录条目加上 always-apply 的名称、路径与内容摘要。摘要与可见发布一致时，批次原样继续。摘要变化会追加一条完整的替换消息；发布后清空的规则集会得到一条显式的空替换，废止此前的所有规则。当压缩隐藏了可见发布时，下一次观察会重新建立当前上下文。仅当发起调用的 agent 解析到本插件注册的 `rule` 工具本身时才发出上下文，因此工具被限制或被同名遮蔽时，schema 与指向它的目录会一并移除。

## 提示词形态

规则上下文是一条以 system-reminder 模式装帧的持久 user 角色消息：always-apply 正文按 `Rules from: <path>` 分节，范围从宽到窄排列，随后是 `<available_rules>` 目录（每行 `- \`name\` (\`glob\`, ...): description`），最后是通过 `rule` 工具加载规则正文的指引。显示路径对项目规则取项目根相对路径，对用户规则取 home 锚定形式（`~/.omp/agent/...`）。

## 配置

| 键 | 默认值 | 作用 |
|---|---|---|
| `maxBytes` | —（必填） | 单条规则上下文消息的 UTF-8 字节上限；非正或非有限值会禁用加载。 |
| `maxSourceBytes` | 1 MiB | 单个规则文件读取的 UTF-8 字节上限；更大的文件被忽略。 |
| `ompAgentDir` | `$PI_CODING_AGENT_DIR`，否则 `~/.omp/agent` | 存放 `rules/` 与 `RULES.md` 的 omp 用户 agent 目录；`~` 前缀会展开。 |
| `projectRootMarkers` | `['.git']` | 从会话 cwd 向上回溯时标识项目根的目录条目。 |
| `catalogDescriptionMaxLength` | 500 | 每个目录条目渲染的规范化描述长度上限；最小为 3。 |

## 预算与有界读取

每个规则文件在 `maxSourceBytes` 限制下读取。渲染消息以 `maxBytes` 为上限：放不下的 always-apply 分节按从宽到窄省略，幸存的最具体正文被截断以适应，每次省略与截断都在消息内的提示行中具名。当连框架与目录都超出预算时，消息降级为紧凑的预算提示。

## 工具：`rule`

| 参数 | 类型 | 说明 |
|---|---|---|
| `name` | string（必填） | 会话规则目录中的确切规则名。 |

执行时为发起调用的 agent 的会话 cwd 重新发现规则集，并在 always-apply 与 rulebook 规则中按确切名称返回规范的 `{ name, path, content }`。未知名称会失败并列出当前可用的规则名。

## 模型体验

### 会话规则上下文

#### 模型看到的内容

当规则存在且 `rule` 工具可见时，agent 会在首个请求前收到一条持久的 user 角色消息，其中每个 always-apply 规则一个 `Rules from:` 分节，每个 rulebook 条目一行数据相关文本。规则集变化时以相同版式重新发布，开头行变为 `The active rule set changed. This complete rule context replaces all earlier rule contexts in this session.`；规则集清空时附加 `No .omp rules are currently active. Do not rely on rules listed earlier in this session.`

##### 规则上下文模板

```markdown
<system-reminder>
The following rules are active in this session. They come from .omp rule files on disk. Follow them as guidance for all tasks; more specific rules take precedence over broader ones. They do not override system, developer, or direct user instructions.

Rules from: <display path>

<rule body>

The following additional rules are available on demand:

<available_rules>
- `<name>` (`<glob>`, ...): <description>
</available_rules>

Call the `rule` tool with the exact rule name to load a rule's full body before relying on it. This catalog contains summaries only; do not infer or follow a rule's content until it has been loaded.
</system-reminder>
```

#### token 影响

首条消息的开销为 always-apply 正文加每个目录条目一行，受 `maxBytes` 限制。规则集不变时重复输入开销为零；每次实际变化增加一条保留的完整替换消息。

#### KV 缓存影响

不变的上下文是仅追加且前缀稳定的。替换消息追加新 token 而非改写早期 token，因此保留已可复用的前缀；被替换的早期块在压缩前一直留在历史中。

## 已知限制与待定工作

- **不执行 TTSR** — 声明 `condition`、`astCondition`、`scope` 或 `interruptMode` 的规则加载时产生发现警告，并按其余元数据分桶；流式中断需要 agent-loop 支持，属于独立特性。
- **不展开 `@` 导入** — oh-my-pi 会展开上下文文件中的 `@path` 记号；此处的规则正文按原文注入。
- **不支持 `.omp/AGENTS.md` 上下文文件** — 只读取规则表面（`rules/` 目录与 `RULES.md`）；工作区指令文件仍是 `dsh-agent-instructions` 包的契约。
- **不支持其他工具的规则格式** — Cursor `.mdc` 规则只有放在 `.omp/rules/` 下才会加载；`.cursor/rules/`、`.clinerules` 与 `.github/instructions/` 目录不会被发现。
- **不做跨提示词去重** — 正文已出现在系统提示词或已加载指令文件中的 always-apply 规则会被再次注入；oh-my-pi 会省略这类规则。
- **每一步都重新读取规则文件** — 发布由摘要门控，规则不变时不消耗 token，但文件系统读取不会跨步缓存。
