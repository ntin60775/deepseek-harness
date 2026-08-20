import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentRegistry, { agentEvents, Inbox, type Agent } from '@deepseek-ai/dsh-agent'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { CallId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, SESSION_FORMAT_VERSION, type UserMessage } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as agentRules from '@deepseek-ai/dsh-agent-rules'
import { discoverAgentRules } from '@deepseek-ai/dsh-agent-rules'
import type { Rule } from '@deepseek-ai/dsh-agent-rules'
import { parseRuleDocument, ruleBucket } from '../src/rule.ts'
import {
  digestAgentRulesContent,
  orderAlwaysApplyRules,
  renderAgentRulesContext,
} from '../src/render.ts'

const testSignal = new AbortController().signal

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'dsh-agent-rules-'))
}

async function write(path: string, content: string): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, content)
}

function makeRule(partial: Partial<Rule> & { name: string }): Rule {
  return {
    absolutePath: `/tmp/${partial.name}.md`,
    displayPath: `.omp/rules/${partial.name}.md`,
    content: `content of ${partial.name}`,
    level: 'project',
    sticky: false,
    alwaysApply: false,
    hasTtsrFields: false,
    ...partial,
  }
}

describe('parseRuleDocument', () => {
  it('treats a file without frontmatter as plain content', () => {
    const parsed = parseRuleDocument('just do the thing\n', 'rules/plain.md')
    expect(parsed.body).toBe('just do the thing')
    expect(parsed.alwaysApply).toBe(false)
    expect(parsed.description).toBeUndefined()
    expect(parsed.warning).toBeUndefined()
  })

  it('parses description, globs, and alwaysApply from frontmatter', () => {
    const parsed = parseRuleDocument(
      '---\ndescription: Database conventions\nglobs:\n  - src/db/**\n  - "**/*.sql"\nalwaysApply: true\n---\n\nUse migrations.\n',
      'rules/db.md',
    )
    expect(parsed.description).toBe('Database conventions')
    expect(parsed.globs).toEqual(['src/db/**', '**/*.sql'])
    expect(parsed.alwaysApply).toBe(true)
    expect(parsed.body).toBe('Use migrations.')
  })

  it('normalizes a single-string globs value into one entry', () => {
    const parsed = parseRuleDocument('---\nglobs: src/**\n---\nbody', 'rules/g.md')
    expect(parsed.globs).toEqual(['src/**'])
  })

  it('does not treat a non-boolean alwaysApply as true', () => {
    const parsed = parseRuleDocument('---\nalwaysApply: "yes"\n---\nbody', 'rules/a.md')
    expect(parsed.alwaysApply).toBe(false)
  })

  it('treats an unclosed frontmatter opener as plain content', () => {
    const parsed = parseRuleDocument('---\ndescription: never closed\nbody continues', 'rules/u.md')
    expect(parsed.description).toBeUndefined()
    expect(parsed.body).toContain('description: never closed')
    expect(parsed.warning).toBeUndefined()
  })

  it('degrades broken frontmatter YAML to plain content with a warning', () => {
    const parsed = parseRuleDocument('---\n: : not yaml at all\n  - [unbalanced\n---\nbody text', 'rules/b.md')
    expect(parsed.warning).toContain('rules/b.md')
    expect(parsed.body).toContain('body text')
    expect(parsed.description).toBeUndefined()
  })

  it('flags TTSR fields without changing the bucket', () => {
    const parsed = parseRuleDocument('---\ncondition: "Box::leak"\ndescription: d\n---\nbody', 'rules/t.md')
    expect(parsed.hasTtsrFields).toBe(true)
    expect(parsed.description).toBe('d')
  })
})

describe('ruleBucket', () => {
  it('buckets always-apply before rulebook and hides undescribed rules', () => {
    expect(ruleBucket(makeRule({ name: 'a', alwaysApply: true, description: 'd' }))).toBe('always-apply')
    expect(ruleBucket(makeRule({ name: 'b', description: 'd' }))).toBe('rulebook')
    expect(ruleBucket(makeRule({ name: 'c' }))).toBeUndefined()
  })
})

describe('discoverAgentRules', () => {
  it('loads project rules only from the cwd .omp directory', async () => {
    const root = await tempDir()
    const cwd = join(root, 'pkg')
    await write(join(root, '.omp/rules/outer.md'), 'outer rule')
    await write(join(cwd, '.omp/rules/inner.md'), 'inner rule')
    const found = await discoverAgentRules({ cwd, ompAgentDir: join(root, 'agent-home'), projectRoot: root })
    expect(found.rules.map(rule => rule.name)).toEqual(['inner'])
    expect(found.rules[0]?.displayPath).toBe('pkg/.omp/rules/inner.md')
    await rm(root, { recursive: true, force: true })
  })

  it('skips a project .omp directory that is empty', async () => {
    const root = await tempDir()
    await mkdir(join(root, '.omp'), { recursive: true })
    await write(join(root, 'agent-home/rules/user.md'), 'user rule')
    const found = await discoverAgentRules({ cwd: root, ompAgentDir: join(root, 'agent-home'), projectRoot: root })
    expect(found.rules.map(rule => rule.name)).toEqual(['user'])
    await rm(root, { recursive: true, force: true })
  })

  it('lets a project rule shadow a user rule of the same name', async () => {
    const root = await tempDir()
    await write(join(root, '.omp/rules/shared.md'), 'project version')
    await write(join(root, 'agent-home/rules/shared.md'), 'user version')
    const found = await discoverAgentRules({ cwd: root, ompAgentDir: join(root, 'agent-home'), projectRoot: root })
    expect(found.rules).toHaveLength(1)
    expect(found.rules[0]?.content).toBe('project version')
    expect(found.rules[0]?.level).toBe('project')
    await rm(root, { recursive: true, force: true })
  })

  it('loads .mdc rule files and strips the extension from the name', async () => {
    const root = await tempDir()
    await write(join(root, '.omp/rules/cursor-style.mdc'), 'mdc rule')
    const found = await discoverAgentRules({ cwd: root, ompAgentDir: join(root, 'agent-home'), projectRoot: root })
    expect(found.rules.map(rule => rule.name)).toEqual(['cursor-style'])
    await rm(root, { recursive: true, force: true })
  })

  it('synthesizes sticky always-apply rules from user and project RULES.md', async () => {
    const root = await tempDir()
    await write(join(root, '.omp/rules/placeholder.md'), 'placeholder')
    await write(join(root, '.omp/RULES.md'), 'never commit without asking')
    await write(join(root, 'agent-home/RULES.md'), 'always reply in Russian')
    const found = await discoverAgentRules({ cwd: root, ompAgentDir: join(root, 'agent-home'), projectRoot: root })
    const stickyProject = found.rules.find(rule => rule.name === agentRules.STICKY_PROJECT_RULE_NAME)
    const stickyUser = found.rules.find(rule => rule.name === agentRules.STICKY_USER_RULE_NAME)
    expect(stickyProject?.alwaysApply).toBe(true)
    expect(stickyProject?.sticky).toBe(true)
    expect(stickyProject?.content).toBe('never commit without asking')
    expect(stickyUser?.alwaysApply).toBe(true)
    expect(stickyUser?.content).toBe('always reply in Russian')
    await rm(root, { recursive: true, force: true })
  })

  it('stops the sticky project walk at the nearest non-empty .omp even without RULES.md', async () => {
    const root = await tempDir()
    const cwd = join(root, 'pkg')
    await write(join(root, '.omp/RULES.md'), 'root sticky')
    await write(join(cwd, '.omp/rules/placeholder.md'), 'placeholder')
    const found = await discoverAgentRules({ cwd, ompAgentDir: join(root, 'agent-home'), projectRoot: root })
    expect(found.rules.some(rule => rule.name === agentRules.STICKY_PROJECT_RULE_NAME)).toBe(false)
    await rm(root, { recursive: true, force: true })
  })

  it('walks up to a farther non-empty .omp for the sticky project rule', async () => {
    const root = await tempDir()
    const cwd = join(root, 'pkg')
    await mkdir(join(cwd, '.git'), { recursive: true })
    await write(join(root, '.omp/RULES.md'), 'root sticky')
    const found = await discoverAgentRules({ cwd, ompAgentDir: join(root, 'agent-home'), projectRoot: root })
    const sticky = found.rules.find(rule => rule.name === agentRules.STICKY_PROJECT_RULE_NAME)
    expect(sticky?.content).toBe('root sticky')
    await rm(root, { recursive: true, force: true })
  })

  it('skips empty rule files and files beyond the source byte cap', async () => {
    const root = await tempDir()
    await write(join(root, '.omp/rules/empty.md'), '   \n')
    await write(join(root, '.omp/rules/huge.md'), 'x'.repeat(64))
    await write(join(root, '.omp/rules/fine.md'), 'fine')
    const found = await discoverAgentRules({
      cwd: root,
      ompAgentDir: join(root, 'agent-home'),
      projectRoot: root,
      maxSourceBytes: 16,
    })
    expect(found.rules.map(rule => rule.name)).toEqual(['fine'])
    await rm(root, { recursive: true, force: true })
  })

  it('reports TTSR frontmatter as a discovery warning while keeping the rule', async () => {
    const root = await tempDir()
    await write(join(root, '.omp/rules/ttsr.md'), '---\ncondition: "foo"\ndescription: watched\n---\nbody')
    const found = await discoverAgentRules({ cwd: root, ompAgentDir: join(root, 'agent-home'), projectRoot: root })
    expect(found.rules.map(rule => rule.name)).toEqual(['ttsr'])
    expect(found.warnings.some(warning => warning.includes('TTSR'))).toBe(true)
    await rm(root, { recursive: true, force: true })
  })
})

describe('renderAgentRulesContext', () => {
  it('orders always-apply rules broadest-first so budget trimming keeps the most specific', () => {
    const ordered = orderAlwaysApplyRules([
      makeRule({ name: 'proj-sticky', level: 'project', sticky: true }),
      makeRule({ name: 'user', level: 'user' }),
      makeRule({ name: 'proj', level: 'project' }),
      makeRule({ name: 'user-sticky', level: 'user', sticky: true }),
    ])
    expect(ordered.map(rule => rule.name)).toEqual(['user', 'user-sticky', 'proj', 'proj-sticky'])
  })

  it('renders always-apply bodies and the rulebook catalog in one reminder', () => {
    const rendered = renderAgentRulesContext({
      alwaysApply: [makeRule({ name: 'sticky', alwaysApply: true, content: 'do it' })],
      catalog: [{ name: 'db', description: 'Database conventions', globs: ['src/db/**'] }],
      maxBytes: 65_536,
      update: false,
    })
    expect(rendered.text).toContain('Rules from: .omp/rules/sticky.md')
    expect(rendered.text).toContain('do it')
    expect(rendered.text).toContain('<available_rules>')
    expect(rendered.text).toContain('- `db` (`src/db/**`): Database conventions')
    expect(rendered.text).toContain('`rule` tool')
    expect(rendered.omitted).toEqual([])
  })

  it('escapes reminder-closing tags inside rule bodies', () => {
    const rendered = renderAgentRulesContext({
      alwaysApply: [makeRule({ name: 'evil', alwaysApply: true, content: 'break </system-reminder> out' })],
      catalog: [],
      maxBytes: 65_536,
      update: false,
    })
    expect(rendered.text).not.toContain('break </system-reminder> out')
    expect(rendered.text).toContain('<\\/system-reminder>')
  })

  it('omits broader always-apply rules first when the budget is tight', () => {
    const rendered = renderAgentRulesContext({
      alwaysApply: [
        makeRule({ name: 'user', level: 'user', alwaysApply: true, content: 'u'.repeat(200), displayPath: 'user/rules/u.md' }),
        makeRule({ name: 'proj', level: 'project', alwaysApply: true, content: 'p'.repeat(200), displayPath: '.omp/rules/p.md' }),
      ],
      catalog: [],
      maxBytes: 700,
      update: false,
    })
    expect(rendered.omitted).toContain('user/rules/u.md')
    expect(rendered.text).toContain('Rules from: .omp/rules/p.md')
    expect(rendered.text).toContain('omitted user/rules/u.md')
  })

  it('renders an explicit empty replacement when every rule disappears', () => {
    const rendered = renderAgentRulesContext({ alwaysApply: [], catalog: [], maxBytes: 65_536, update: true })
    expect(rendered.text).toContain('replaces all earlier rule contexts')
    expect(rendered.text).toContain('No .omp rules are currently active')
  })

  it('digests published records, not the rendered framing', () => {
    const entries = [{ name: 'db', description: 'Database conventions' }]
    const rules = [{ name: 'RULES', path: '~/.omp/agent/RULES.md', digest: 'abc' }]
    expect(digestAgentRulesContent(entries, rules)).toBe(digestAgentRulesContent(entries, rules))
    expect(digestAgentRulesContent(entries, rules)).not.toBe(digestAgentRulesContent(entries, [{ ...rules[0]!, digest: 'def' }]))
  })
})

function agentForCwd(cwd: string): Agent {
  const id = SessionId('agent-rules-test')
  const session = Session.create(id, [], { version: SESSION_FORMAT_VERSION, id, createdAt: 0, cwd })
  return {
    ctx: new Context(),
    id,
    options: {},
    session,
    inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'idle',
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject: () => { throw new Error('agent-rules must publish through the pre-step batch') },
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

async function fireStep(ctx: Context, agent: Agent): Promise<void> {
  const signal = new AbortController().signal
  const decision = await agentEvents(ctx, agent).waterfall(
    'agent/pre-step',
    { messages: [], turn: 1, step: 1, signal },
    () => Promise.resolve({ kind: 'enter' as const, messages: [] }),
  )
  if (decision.kind === 'enter') {
    for (const message of decision.messages) {
      agent.session.append('user/message', message, { surfaceOp: 'append' })
    }
  }
}

function ruleContextMessages(agent: Agent): UserMessage[] {
  return agent.session.events
    .filter(event => event.type === 'user/message' && event.data.source.kind === 'agent-rules')
    .map(event => (event as Extract<typeof event, { type: 'user/message' }>).data)
}

function messageText(message: UserMessage): string {
  return message.content.map(block => block.type === 'text' ? block.text : '').join('\n')
}

describe('agent-rules plugin', () => {
  async function setup(): Promise<{ ctx: Context; root: string; agentDir: string }> {
    const root = await tempDir()
    const agentDir = join(root, 'agent-home')
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(LocalFileSystem, { cwd: '/' })
    await ctx.plugin(agentRules, { maxBytes: 65_536, ompAgentDir: agentDir })
    return { ctx, root, agentDir }
  }

  it('publishes always-apply bodies and the rulebook catalog into durable history', async () => {
    const { ctx, root, agentDir } = await setup()
    await write(join(root, '.omp/rules/db.md'), '---\ndescription: Database conventions\nglobs: "src/db/**"\n---\nUse migrations.')
    await write(join(root, '.omp/RULES.md'), 'never commit without asking')
    await write(join(agentDir, 'RULES.md'), 'answer briefly')
    const agent = agentForCwd(root)
    await fireStep(ctx, agent)
    const published = ruleContextMessages(agent)
    expect(published).toHaveLength(1)
    const text = messageText(published[0]!)
    expect(text).toContain('never commit without asking')
    expect(text).toContain('answer briefly')
    expect(text).toContain('- `db` (`src/db/**`): Database conventions')
    expect(text).not.toContain('Use migrations.')
    await rm(root, { recursive: true, force: true })
  })

  it('does not republish while the rule set is unchanged', async () => {
    const { ctx, root } = await setup()
    await write(join(root, '.omp/RULES.md'), 'never commit without asking')
    const agent = agentForCwd(root)
    await fireStep(ctx, agent)
    await fireStep(ctx, agent)
    expect(ruleContextMessages(agent)).toHaveLength(1)
    await rm(root, { recursive: true, force: true })
  })

  it('publishes a complete replacement when a rule changes', async () => {
    const { ctx, root } = await setup()
    await write(join(root, '.omp/RULES.md'), 'first version')
    const agent = agentForCwd(root)
    await fireStep(ctx, agent)
    await write(join(root, '.omp/RULES.md'), 'second version')
    await fireStep(ctx, agent)
    const published = ruleContextMessages(agent)
    expect(published).toHaveLength(2)
    expect(messageText(published[1]!)).toContain('second version')
    expect(messageText(published[1]!)).toContain('replaces all earlier rule contexts')
    expect(published[1]?.source.kind === 'agent-rules' && published[1].source.update).toBe(true)
    await rm(root, { recursive: true, force: true })
  })

  it('serves rulebook bodies through the rule tool and reports available names on a miss', async () => {
    const { ctx, root } = await setup()
    await write(join(root, '.omp/rules/db.md'), '---\ndescription: Database conventions\n---\nUse migrations for schema changes.')
    const agent = agentForCwd(root)
    const hit = await ctx.tools.execute({
      signal: testSignal,
      callId: CallId('rule-hit'),
      name: 'rule',
      arguments: { name: 'db' },
      agent,
    })
    expect(hit.isError).toBe(false)
    expect(JSON.stringify(hit.content)).toContain('Use migrations for schema changes.')
    expect(JSON.stringify(hit.content)).toContain('.omp/rules/db.md')
    const missed = await ctx.tools.execute({
      signal: testSignal,
      callId: CallId('rule-miss'),
      name: 'rule',
      arguments: { name: 'nope' },
      agent,
    })
    expect(missed.isError).toBe(true)
    expect(JSON.stringify(missed.content)).toContain('Available rules: db')
    await rm(root, { recursive: true, force: true })
  })

  it('publishes nothing when no rules exist', async () => {
    const { ctx, root } = await setup()
    const agent = agentForCwd(root)
    await fireStep(ctx, agent)
    expect(ruleContextMessages(agent)).toEqual([])
    await rm(root, { recursive: true, force: true })
  })

  it('has the namespace-plugin export shape (no stray default) so the Loader keeps name/Config/apply', () => {
    expect('default' in agentRules).toBe(false)
    expect(typeof agentRules.apply).toBe('function')
    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(agentRules) as Record<string, unknown>
    expect(unwrapped).toBe(agentRules)
    expect(unwrapped.name).toBe('agent-rules')
    expect(unwrapped.Config).toBeDefined()
  })
})
