---
description: "Загрузка правил .omp в стиле oh-my-pi: руководство по включению, настройке бюджета и отладке discovery, инъекции и инструмента rule."
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-rules

[English](README.md) | 中文

## 概述

`dsh-agent-rules` 将兼容 oh-my-pi 的 `.omp` 规则文件加载到模型上下文：它发现项目规则与用户规则，把 always-apply 规则正文作为一条规则上下文消息注入持久历史，并将带 `description` 的规则列入按需目录，其正文由 `rule` 工具提供。它随基础组合包发布并给予 65,536 字节预算。一切内容都受该预算约束：装不下的 always-apply 正文按从宽泛到具体的顺序省略，之后才截断最具体的正文，空规则集不产生任何内容。每个符合条件的步骤都会重新读取规则文件；发布由 digest 把关，因此未更改的规则集不消耗 token。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

当 agent（智能体）需要遵循 oh-my-pi 规则文件时，挂载此插件。基础组合包已包含它并给予 65,536 字节预算，因此大多数组合只需调整 `maxBytes`；没有文件系统提供方的树加载不到任何内容，直到提供方出现。

### agent 获得的内容

第一次符合条件的 `agent/pre-step` 发布一条持久规则上下文消息：always-apply 规则正文以 `Rules from: <path>` 小节呈现（最宽泛的 scope 在前，最具体的在后），随后是带 `description` 规则的 `<available_rules>` 目录，再后是通过 `rule` 工具加载规则正文的指示。规则集发生变化时追加一条完整替代消息；规则集消失时产生显式的空替代消息，撤销此前所有规则。

### 配置

只有 `maxBytes` 必填——它限制完整渲染后的规则上下文消息，让每个部署显式选择自己的提示词预算。

```yaml
- name: '@deepseek-ai/dsh-agent-rules'
  config:
    maxBytes: 65536
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `maxBytes` | 必填 | 单条渲染后规则上下文消息的 UTF-8 字节上限；非正或非有限值禁用加载 |
| `maxSourceBytes` | 1 MiB | 单个规则文件读取的 UTF-8 字节上限，更大的文件被忽略 |
| `ompAgentDir` | `$PI_CODING_AGENT_DIR`，否则 `~/.omp/agent` | 存放 `rules/` 与 `RULES.md` 的 omp 用户 agent 目录；`~` 前缀会展开 |
| `projectRootMarkers` | `['.git']` | 从会话 cwd 向上查找时标记项目根目录的目录项 |
| `catalogDescriptionMaxLength` | 500 | 每个目录条目渲染的描述规范化长度上限；最小值 3 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-agent-rules)是每个受支持字段及其源声明的穷尽式真源。

### 工具：`rule`

| 参数 | 类型 | 说明 |
|---|---|---|
| `name` | string（必填） | 会话规则目录中的精确规则名 |

执行时为调用 agent 的会话 cwd 重新发现规则集，并在 always-apply 与 rulebook 规则中按精确名匹配返回规范的 `{ name, path, content }`。未知名称会失败并列出当前可用的规则名。

### 预算与有界读取

每个规则文件在 `maxSourceBytes` 下读取。渲染后的消息受 `maxBytes` 限制：装不下的 always-apply 小节按从宽泛到具体的顺序省略，幸存的最具体正文被截断以适应预算，每次省略与截断都在消息内的通知行中指名。当连框架与目录都超出预算时，消息退化为紧凑的预算通知。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节解释插件背后的设计决策；可观察行为见[使用本包](#use-this-package)。

### 发现

四个来源汇入一个按名称去重的规则集，按合并顺序先到先得去重，因此同名项目规则遮蔽用户规则：

1. **项目规则** — `<cwd>/.omp/rules/*.{md,mdc}`，仅当 cwd 自身的 `.omp/` 目录非空时读取。不做祖先目录遍历：monorepo 中嵌套的包不继承父包的规则目录。
2. **用户规则** — `<ompAgentDir>/rules/*.{md,mdc}`，仅当 omp 用户 agent 目录非空时读取。
3. **粘性用户规则** — `<ompAgentDir>/RULES.md`，合成为规则 `RULES` 并强制 `alwaysApply`。
4. **粘性项目规则** — 从 cwd 向项目根查找最近的非空 `.omp/` 目录中的 `RULES.md`，合成为 `RULES@project` 并强制 `alwaysApply`。即使最近的非空 `.omp/` 没有 `RULES.md`，遍历也在此停止。

空文件不贡献内容。规则名是去掉 `.md`/`.mdc` 扩展名的文件基名。规则正文是 Markdown，带可选 YAML frontmatter 块：`description` 选择按需 rulebook，`globs` 标注目录条目，`alwaysApply: true` 选择无条件注入。oh-my-pi 的 TTSR 字段（`condition`、`astCondition`、`scope`、`interruptMode`）会被识别并报告为发现警告，但从不执行。YAML 解析失败的 frontmatter 块使文件降级为纯正文并附带警告，而非丢弃。既无 `alwaysApply` 又无 `description` 的规则不可达，与 oh-my-pi 一致。

发现读取使用可选的 `ctx.fs` 提供方。插件不静态注入 `fs`，因此没有提供方的产品树仍能启动，规则加载在提供方出现前是 no-op。

### 生命周期

每个符合条件的 `agent/pre-step` 为会话 cwd 重新发现规则集，并对已发布记录做 digest——目录条目加上 always-apply 的名称、路径与内容摘要。digest 与可见发布一致时，批次原样通过。digest 变化时追加一条完整替代消息；发布后消失的规则集产生显式的空替代，撤销此前所有规则。压缩隐藏可见发布后，下一次观察重建当前上下文。仅当调用 agent 解析到本插件精确的 `rule` 工具注册时才发出上下文，因此受限或被遮蔽的工具会同时移除 schema 与指向它的目录。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：pre-step 监听器、`rule` 工具注册、上下文发布 |
| [`src/config.ts`](src/config.ts) | `Config` schema 与预算解析 |
| [`src/discovery.ts`](src/discovery.ts) | 四来源规则发现、frontmatter 解析、去重 |
| [`src/render.ts`](src/render.ts) | 规则上下文渲染、预算省略与截断、通知 |
| [`src/rule.ts`](src/rule.ts) | 规则记录类型与名称/路径规范化 |
| [`src/state.ts`](src/state.ts) | 已发布记录 digest 与可见历史的对账 |
| [`src/invariant.ts`](src/invariant.ts) | 持久上下文约定的不变式伴生插件 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

包级约定不够用时阅读以下页面。它们从规则文件格式逐步进入设计决策与穷尽式配置。

- [oh-my-pi 兼容性决策记录](../../../.agents/notes/implemented/feature/2026-08-20-agent-rules-omp-compat.zh.md)——发现与注入的理由。
- [context 组地图](../README.zh.md)——相邻的请求上下文包。
- [生成的配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-agent-rules)——每个受支持配置字段及其源声明。

-----

<a id="model-experience"></a> <a id="prompt-shape"></a>
## 模型体验

### 会话规则上下文

#### 模型看到的内容

当规则存在且 `rule` 工具可见时，agent 在第一次请求前收到一条持久 user 角色消息：每条 always-apply 规则对应一个 `Rules from:` 小节，每个 rulebook 条目对应一行随数据变化的内容。规则集变化时以相同布局重新发布，开场行为 `The active rule set changed. This complete rule context replaces all earlier rule contexts in this session.`；规则集清空时追加 `No .omp rules are currently active. Do not rely on rules listed earlier in this session.`

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

#### Token 影响

初始消息的成本是 always-apply 正文加上每个目录条目一行，受 `maxBytes` 限制。规则集未变时重复输入成本为零；每次实际变化添加一条保留的完整替代消息。

#### KV 缓存影响

未更改的上下文仅追加且前缀稳定。替代消息追加新 token 而非重写既有 token，因此保留已可复用的前缀；被替代的早期块保留在历史中直到压缩。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明规则加载何时不合适或需要运维注意。它们是当前包约束，不是任务积压。

- **不执行 TTSR**——声明 `condition`、`astCondition`、`scope` 或 `interruptMode` 的规则带发现警告加载并按其余元数据分桶；流中断需要 agent-loop 支持，是独立特性。
- **不展开 `@` import**——oh-my-pi 在上下文文件内展开 `@path` 标记；此处规则正文原样注入。
- **不读取 `.omp/AGENTS.md` 上下文文件**——只读取规则面（`rules/` 目录与 `RULES.md`）；工作区指令文件仍是 `dsh-agent-instructions` 包的约定。
- **不支持其他工具的规则格式**——Cursor 的 `.mdc` 规则仅在置于 `.omp/rules/` 下时加载；`.cursor/rules/`、`.clinerules`、`.github/instructions/` 目录不被发现。
- **不做跨提示词去重**——正文已出现在系统提示词或已加载指令文件中的 always-apply 规则仍会再次注入；oh-my-pi 会省略这类规则。
- **发现每步重读规则文件**——发布由 digest 把关，未变规则不消耗 token，但文件系统读取跨步骤不缓存。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
