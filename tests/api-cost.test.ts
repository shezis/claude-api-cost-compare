import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { BUILTIN, parseTable } from '../hooks/prices'
import { claudePrice, parseTranscript, providerCost, requestCost } from '../hooks/register'
import type { Request } from '../types'

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

const on = { isCacheOn: true, ttl: '1h' as const }
const off = { isCacheOn: false, ttl: '1h' as const }
const CLAUDE = BUILTIN.providers.find(p => p.isClaude)!.models

const PANE = {
  plugin: 'api-cost-compare',
  component: 'Pane',
  requestId: 'api-cost-compare',
  props: { title: 'API cost', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

/** What the engine answers beneath the plugin at session start, in a test. */
const stubSession = (hooks: On) => {
  hooks('session.start', (_$, e) => ({ cwd: e.cwd }))
  hooks('command.register', (_$, e) => ({ value: { command: e.name } }))
  hooks('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [] } }))
}

describe('pricing', () => {
  test('Claude prices each request by the model that answered', async () => {
    expect(claudePrice(CLAUDE, 'claude-opus-5-5')?.label).toBe('Opus 5.5')
    expect(claudePrice(CLAUDE, 'claude-opus-5')?.label).toBe('Opus 5')
    expect(claudePrice(CLAUDE, 'claude-haiku-5-5[1m]')?.label).toBe('Haiku 5.5')
    expect(claudePrice(CLAUDE, 'gpt-6')).toBe(undefined)
  })

  test('cache hits, 1-hour writes and output each at their own rate', async () => {
    // Opus 5.5: $4 in, $0.20 hit, $8 1h write, $20 out.
    const r: Request = ['claude-opus-5-5', 1_000_000, 1_000_000, 1_000_000, 1_000_000]
    const opus = claudePrice(CLAUDE, 'claude-opus-5-5')!
    expect(near(requestCost(opus, r, on), 4 + 0.2 + 8 + 20)).toBe(true)
    expect(near(requestCost(opus, r, { ...on, ttl: '5m' }), 4 + 0.2 + 5 + 20)).toBe(true)
    // Caching off: all 3M prompt tokens at $4.
    expect(near(requestCost(opus, r, off), 12 + 20)).toBe(true)
  })

  test('long prompts move to the long-context tier', async () => {
    const haiku = claudePrice(CLAUDE, 'claude-haiku-5-5')!
    const short: Request = ['claude-haiku-5-5', 50_000, 0, 0, 0]
    const long: Request = ['claude-haiku-5-5', 200_000, 0, 0, 0]
    expect(near(requestCost(haiku, short, on), 0.005)).toBe(true)
    expect(near(requestCost(haiku, long, on), 0.1)).toBe(true)
  })

  test('every provider prices a session', async () => {
    const list: Request[] = [['claude-opus-5-5', 10, 500, 90_000, 2_000]]
    for (const p of BUILTIN.providers) {
      for (const m of p.models) {
        expect(providerCost(p, m.id, list, on)).toBeGreaterThan(0)
      }
    }
  })
})

describe('price table', () => {
  test('the built-in table round-trips through prices.json', async () => {
    expect(parseTable(JSON.stringify(BUILTIN))).toEqual(BUILTIN)
  })

  test('a table this version cannot read is refused', async () => {
    expect(parseTable('not json')).toBe(undefined)
    expect(parseTable(JSON.stringify({ ...BUILTIN, version: 2 }))).toBe(undefined)
    expect(parseTable(JSON.stringify({ ...BUILTIN, providers: BUILTIN.providers.filter(p => !p.isClaude) }))).toBe(undefined)
    const bad = structuredClone(BUILTIN)
    ;(bad.providers[1]!.models[0] as { input: unknown }).input = '2'
    expect(parseTable(JSON.stringify(bad))).toBe(undefined)
  })

  test('session start loads the live table from GitHub', async ($, hooks) => {
    mock.store(hooks)
    stubSession(hooks)
    const clock = mock.clock(hooks)
    const live = { ...BUILTIN, asOf: '2099-01-01' }
    const urls: string[] = []
    hooks('http.fetch', (_$, e) => {
      urls.push(e.url)
      return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(live) } }
    })
    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
    await clock.advance(1)
    expect(urls).toEqual(['https://raw.githubusercontent.com/shezis/claude-api-cost-compare/main/prices.json'])
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(JSON.stringify(await ui.drawn()).includes('Prices as of 2099-01-01 (live')).toBe(true)
  })

  test('with live prices off nothing is fetched', { options: { livePrices: false } }, async ($, hooks) => {
    mock.store(hooks)
    stubSession(hooks)
    const clock = mock.clock(hooks)
    const urls: string[] = []
    hooks('http.fetch', (_$, e) => {
      urls.push(e.url)
      return { value: { status: 500, ok: false, headers: {}, text: '' } }
    })
    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
    await clock.advance(1)
    expect(urls).toEqual([])
  })
})

describe('transcript', () => {
  test('counts each response once, by its last line', async () => {
    const line = (id: string, out: number, model = 'claude-opus-5-5') =>
      JSON.stringify({
        type: 'assistant',
        message: { id, model, usage: { input_tokens: 1, output_tokens: out, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 } },
      })
    const text = [
      line('msg_a', 5),
      line('msg_a', 9),
      line('msg_b', 1),
      line('msg_c', 1, '<synthetic>'),
      JSON.stringify({ type: 'user', message: { content: 'hi "usage"' } }),
      'not json "usage"',
    ].join('\n')
    const seen = new Map<string, Request>()
    parseTranscript(text, seen)
    expect([...seen.values()]).toEqual([
      ['claude-opus-5-5', 1, 9, 2, 3],
      ['claude-opus-5-5', 1, 1, 2, 3],
    ])
  })
})

describe('pane', () => {
  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    test(`draws every provider and toggles caching on ${surface}`, async ($, hooks) => {
      mock.clock(hooks)
      const ui = await $.ui.mount({ ...PANE, surface })
      const text = JSON.stringify(await ui.drawn())
      for (const name of ['Claude API', 'OpenAI API', 'DeepSeek API', 'GLM API', 'Kimi API']) {
        expect(text.includes(name)).toBe(true)
      }
      expect(text.includes('Prices as of 2026-10-11 (built-in)')).toBe(true)
      // The terminal adds its own ": " after a Select's label.
      if (surface === 'terminal') expect((await ui.find({ key: 'pick-claude' }))?.props.label).toBe('Model')
      expect((await ui.find({ key: 'cache' }))?.props.label).toBe('Caching: on')
      await ui.press({ key: 'cache' })
      expect((await ui.find({ key: 'cache' }))?.props.label).toBe('Caching: off')
    })
  }
})
