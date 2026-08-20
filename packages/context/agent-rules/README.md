# @deepseek-ai/dsh-agent-rules

English | [中文](README.zh.md)

oh-my-pi-compatible rule loading for `.omp` rule files. The plugin discovers project and user rules, injects always-apply rule bodies into durable history as one rule context message, and lists description-carrying rules in an on-demand catalog whose bodies the `rule` tool serves.

## Discovery

Four sources feed one name-deduplicated rule set, in merge order with first-wins deduplication, so a project rule shadows a user rule of the same name:

1. **Project rules** — `<cwd>/.omp/rules/*.{md,mdc}`, read only when the cwd's own `.omp/` directory is non-empty. No ancestor walk: a package nested in a monorepo does not inherit a parent package's rule directory.
2. **User rules** — `<ompAgentDir>/rules/*.{md,mdc}`, read only when the omp user agent directory is non-empty.
3. **Sticky user rule** — `<ompAgentDir>/RULES.md`, synthesized as the rule `RULES` with `alwaysApply` forced on.
4. **Sticky project rule** — `RULES.md` from the nearest non-empty `.omp/` directory found walking from the cwd toward the project root, synthesized as `RULES@project` with `alwaysApply` forced on. The walk stops at the nearest non-empty `.omp/` even when that directory has no `RULES.md`.

Empty files contribute nothing. A rule's name is its file basename without the `.md`/`.mdc` extension. Rule bodies are Markdown with an optional YAML frontmatter block: `description` selects the on-demand rulebook, `globs` annotates the catalog entry, and `alwaysApply: true` selects unconditional injection. The oh-my-pi TTSR fields (`condition`, `astCondition`, `scope`, `interruptMode`) are recognized and reported as discovery warnings but never enforced. A frontmatter block that fails YAML parsing degrades the file to plain content with a warning instead of dropping it. Rules with neither `alwaysApply` nor `description` are unreachable, matching oh-my-pi.

Discovery reads use the optional `ctx.fs` provider. The plugin does not statically inject `fs`, so providerless product trees still boot and rule loading becomes a no-op until a provider is present.

## Lifecycle

Every eligible `agent/pre-step` rediscovers the rule set for the session cwd and digests the published records — catalog entries plus always-apply name, path, and content digests. When the digest matches the visible publication, the batch proceeds untouched. A changed digest appends one complete replacement message; a rule set that disappears after publishing earns an explicit empty replacement that retires every earlier rule. When compaction hides the visible publication, the next observation re-establishes the current context. The context is emitted only when the calling agent resolves this plugin's exact `rule` tool registration, so a restricted or shadowed tool removes both the schema and the catalog pointing at it.

## Prompt Shape

The rule context is a durable user-role message framed with the system-reminder pattern: always-apply bodies as `Rules from: <path>` sections, broadest scope first and most specific last, then the `<available_rules>` catalog of `- \`name\` (\`glob\`, ...): description` lines, then the instruction to load rule bodies through the `rule` tool. Display paths are project-root-relative for project rules and home-anchored (`~/.omp/agent/...`) for user rules.

## Configuration

| Key | Default | Effect |
|---|---|---|
| `maxBytes` | — (required) | UTF-8 byte cap for one rendered rule context message; non-positive or non-finite disables loading. |
| `maxSourceBytes` | 1 MiB | Maximum UTF-8 bytes read from one rule file; larger files are ignored. |
| `ompAgentDir` | `$PI_CODING_AGENT_DIR`, else `~/.omp/agent` | omp user agent directory holding `rules/` and `RULES.md`; `~` prefixes expand. |
| `projectRootMarkers` | `['.git']` | Directory entries that identify the project root while walking upward from the session cwd. |
| `catalogDescriptionMaxLength` | 500 | Maximum normalized description length rendered per catalog entry; minimum 3. |

## Budgeting And Bounded Reads

Each rule file is read under `maxSourceBytes`. The rendered message is capped at `maxBytes`: always-apply sections that do not fit are omitted broadest-first, the most specific surviving body is truncated to fit, and every omission and truncation is named in a notice line inside the message. When even the framing and catalog exceed the budget, the message degrades to the compact budget notice.

## Tool: `rule`

| Arg | Type | Notes |
|---|---|---|
| `name` | string (required) | Exact rule name from the session rule catalog. |

Execution rediscovers the rule set for the calling agent's session cwd and returns the canonical `{ name, path, content }` of the exact-name match among always-apply and rulebook rules. An unknown name fails with the list of currently available rule names.

## Model Experience

### Session rule context

#### What the model sees

When rules exist and the `rule` tool is visible, the agent receives one durable user-role message before the first request, with one `Rules from:` section per always-apply rule and one data-dependent line per rulebook entry. A changed rule set republishes the same layout with the opening line `The active rule set changed. This complete rule context replaces all earlier rule contexts in this session.`; an emptied rule set adds `No .omp rules are currently active. Do not rely on rules listed earlier in this session.`

##### Rule context template

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

#### Token effect

The initial message costs the always-apply bodies plus one line per catalog entry, capped by `maxBytes`. Repeated input cost is zero while the rule set is unchanged; each actual change adds one retained complete replacement message.

#### KV Cache effect

The unchanged context is append-only and prefix-stable. A replacement message appends new tokens rather than rewriting earlier ones, so it preserves the already-reusable prefix; earlier replaced blocks remain in history until compaction.

## Known Limitations and Deferred Work

- **No TTSR enforcement** — rules declaring `condition`, `astCondition`, `scope`, or `interruptMode` load with a discovery warning and bucket by their remaining metadata; stream interruption requires agent-loop support and is a separate feature.
- **No `@` import expansion** — oh-my-pi expands `@path` tokens inside context files; rule bodies here are injected verbatim.
- **No `.omp/AGENTS.md` context files** — only the rule surfaces (`rules/` directories and `RULES.md`) are read; workspace instruction files remain the `dsh-agent-instructions` package's contract.
- **No other tools' rule formats** — Cursor `.mdc` rules load only when placed under `.omp/rules/`; `.cursor/rules/`, `.clinerules`, and `.github/instructions/` directories are not discovered.
- **No cross-prompt deduplication** — an always-apply rule whose body already appears in the system prompt or a loaded instruction file is injected again; oh-my-pi omits such rules.
- **Discovery rereads rule files every step** — publication is digest-gated so unchanged rules cost no tokens, but the filesystem reads are not cached across steps.
