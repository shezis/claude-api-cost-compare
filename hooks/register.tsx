import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, Register } from 'claude-code'

import type { Price, PriceTable, Prices, Provider, Request, Scan, Tier } from '../types'
import { BUILTIN, parseTable } from './prices'

// The live table: the repository's prices.json, fetched at most once a day and
// kept in $.store, so a price fix merged on GitHub reaches every install
// without a new release. The built-in table answers until (or unless) it loads.
const PRICES_URL = 'https://raw.githubusercontent.com/shezis/claude-api-cost-compare/main/prices.json'
const PRICES_MAX_AGE = 24 * 60 * 60 * 1000
const STORE_KEY = 'prices'

const AS_USED = 'as-used'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const requests = atom({ plugin: 'api-cost-compare', key: 'requests' } as const, [] as Request[])
const scan = atom({ plugin: 'api-cost-compare', key: 'scan' } as const, { status: 'pending' } as Scan)
const picks = atom({ plugin: 'api-cost-compare', key: 'picks' } as const, {} as Record<string, string>)
const isCacheOn = atom({ plugin: 'api-cost-compare', key: 'isCacheOn' } as const, true)
const ttl = atom({ plugin: 'api-cost-compare', key: 'ttl' } as const, '1h' as '5m' | '1h')
const ledgerUsd = atom({ plugin: 'api-cost-compare', key: 'ledgerUsd' } as const, null as number | null)
const prices = atom({ plugin: 'api-cost-compare', key: 'prices' } as const, {
  table: BUILTIN,
  source: 'built-in',
  fetchedAt: null,
} as Prices)

const PANE = 'api-cost-compare'
const MAX_REQUESTS = 50_000

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

type Options = { isCacheOn: boolean; ttl: '5m' | '1h' }

/** The Claude price row for a model id the API reported (longest prefix wins). */
export const claudePrice = (models: readonly Price[], model: string): Price | undefined =>
  models.filter(p => model.startsWith(p.id)).sort((a, b) => b.id.length - a.id.length)[0]

export const requestCost = (price: Price, r: Request, o: Options): number => {
  const [, input, output, cacheRead, cacheWrite] = r
  const prompt = input + cacheRead + cacheWrite
  const tier: Tier = price.long && prompt > price.long.above ? price.long : price

  if (!o.isCacheOn) {
    return (prompt * tier.input + output * tier.output) / 1e6
  }

  const write = (o.ttl === '1h' ? (tier.write1h ?? tier.write) : tier.write) ?? tier.input

  return (input * tier.input + cacheRead * tier.cached + cacheWrite * write + output * tier.output) / 1e6
}

export const providerCost = (provider: Provider, pick: string, list: Request[], o: Options): number => {
  if (provider.isClaude && pick === AS_USED) {
    // A model the table doesn't know is priced as the current Opus.
    const fallback = claudePrice(provider.models, 'claude-opus-5-5') ?? provider.models[0]!
    return list.reduce((sum, r) => sum + requestCost(claudePrice(provider.models, r[0]) ?? fallback, r, o), 0)
  }
  const price = provider.models.find(m => m.id === pick) ?? provider.models[0]!

  return list.reduce((sum, r) => sum + requestCost(price, r, o), 0)
}

/** The table's providers, Claude first: the row every other one is compared to. */
const providersOf = (table: PriceTable): Provider[] => [
  ...table.providers.filter(p => p.isClaude),
  ...table.providers.filter(p => !p.isClaude),
]

const defaultPick = (provider: Provider) => (provider.isClaude ? AS_USED : provider.models[0]!.id)

// ---------------------------------------------------------------------------
// Live prices
// ---------------------------------------------------------------------------

type Stored = { fetchedAt: number; text: string }

const isStored = (v: unknown): v is Stored =>
  typeof v === 'object' && v !== null && typeof (v as Stored).fetchedAt === 'number' && typeof (v as Stored).text === 'string'

/** Loads the cached table, then fetches a fresh one when the cache is stale (or `force`). */
const loadPrices = async ($: EngineInterface, force = false) => {
  const stored = await $.store.get(STORE_KEY)
  const cached = isStored(stored) ? parseTable(stored.text) : undefined
  if (cached && isStored(stored)) {
    const fetchedAt = stored.fetchedAt
    await update($, prices, () => ({ table: cached, source: 'live', fetchedAt }) as Prices)
  }
  const now = await $.clock.now()
  if (!force && cached && isStored(stored) && now - stored.fetchedAt < PRICES_MAX_AGE) return

  try {
    const res = await $.http.fetch(PRICES_URL)
    const table = res.ok ? parseTable(res.text) : undefined
    if (!table) {
      await update($, prices, p => ({ ...p, note: `Live prices unavailable (HTTP ${res.status}); using ${p.source} prices.` }))
      return
    }
    await $.store.set(STORE_KEY, { fetchedAt: now, text: res.text } satisfies Stored)
    await update($, prices, () => ({ table, source: 'live', fetchedAt: now }) as Prices)
  } catch {
    await update($, prices, p => ({ ...p, note: `Couldn't reach GitHub; using ${p.source} prices.` }))
  }
}

// ---------------------------------------------------------------------------
// Reading the transcript, so turns from before the mod loaded count too
// ---------------------------------------------------------------------------

type Line = {
  type?: string
  message?: { id?: string; model?: string; usage?: Partial<ModelUsage> }
}

const toRequest = (model: string, u: Partial<ModelUsage>): Request => [
  model,
  u.input_tokens ?? 0,
  u.output_tokens ?? 0,
  u.cache_read_input_tokens ?? 0,
  u.cache_creation_input_tokens ?? 0,
]

/** Each API response once, by message id; its last line carries the final usage. */
export const parseTranscript = (text: string, into: Map<string, Request>) => {
  for (const raw of text.split('\n')) {
    if (!raw.includes('"usage"')) continue
    let line: Line
    try {
      line = JSON.parse(raw)
    } catch {
      continue
    }
    const m = line.message
    if (line.type !== 'assistant' || !m?.id || !m.usage || !m.model || m.model === '<synthetic>') continue
    into.set(m.id, toRequest(m.model, m.usage))
  }
}

const findSessionDir = async ($: EngineInterface, id: string): Promise<string | undefined> => {
  const home = await $.env.get('HOME')
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${home}/.claude`
  const projects = `${config}/projects`
  for (const entry of await $.fs.list(projects)) {
    if (entry.kind === 'dir' && (await $.fs.exists(`${projects}/${entry.name}/${id}.jsonl`))) {
      return `${projects}/${entry.name}`
    }
  }

  return undefined
}

const setScan = ($: EngineInterface, next: Scan) => update($, scan, () => next)

const rescan = async ($: EngineInterface) => {
  await setScan($, { status: 'pending' })
  try {
    const id = await $.session.id()
    const dir = await findSessionDir($, id)
    if (!dir) {
      await setScan($, { status: 'failed', note: 'Transcript not found; counting from now on.' })
      return
    }
    const main = `${dir}/${id}.jsonl`
    const files = [main]
    const subagents = `${dir}/${id}/subagents`
    if (await $.fs.exists(subagents)) {
      for (const f of await $.fs.list(subagents)) {
        if (f.kind === 'file' && f.name.endsWith('.jsonl')) files.push(`${subagents}/${f.name}`)
      }
    }
    const seen = new Map<string, Request>()
    const skipped: string[] = []
    for (const file of files) {
      try {
        parseTranscript(await $.fs.read(file), seen)
      } catch {
        skipped.push(file)
      }
    }
    if (skipped.includes(main)) {
      // Over the 4 MiB read limit: keep the live counts instead.
      await setScan($, { status: 'failed', note: 'Transcript too large to read; counting live responses only.' })
      return
    }
    await update($, requests, () => [...seen.values()].slice(-MAX_REQUESTS))
    await setScan(
      $,
      skipped.length > 0 ? { status: 'partial', note: `${skipped.length} subagent transcript(s) unreadable.` } : { status: 'done' },
    )
  } catch (err) {
    await setScan($, { status: 'failed', note: `Scan failed: ${String(err)}`.slice(0, 160) })
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export const usd = (n: number) =>
  n === 0 ? '$0.00' : n < 0.01 ? `$${n.toFixed(4)}` : n < 1000 ? `$${n.toFixed(2)}` : `$${Math.round(n)}`

const tokens = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`

const bar = (fraction: number, width: number) => {
  const filled = Math.max(fraction > 0 ? 1 : 0, Math.round(fraction * width))

  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

const ago = (ms: number) => {
  const m = Math.round(ms / 60_000)
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`
}

const options = async ($: EngineInterface): Promise<Options> => ({
  isCacheOn: await read($, isCacheOn),
  ttl: await read($, ttl),
})

const refreshStatus = async ($: EngineInterface) => {
  const list = await read($, requests)
  if (list.length === 0) return
  const o = await options($)
  const chosen = await read($, picks)
  const providers = providersOf((await read($, prices)).table)
  const costs = providers.map(p => ({ p, c: providerCost(p, chosen[p.id] ?? defaultPick(p), list, o) }))
  const cheapest = costs.slice(1).sort((a, b) => a.c - b.c)[0]
  $.ui.status(
    `Claude API ${usd(costs[0]!.c)}${cheapest ? ` · cheapest ${cheapest.p.short} ${usd(cheapest.c)}` : ''} · /api-cost`,
  )
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export const register: Register = (on, config) => {
  const isLive = config.livePrices !== false

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'api-cost',
      description: 'Compare what this session would cost on Claude, OpenAI, DeepSeek, GLM and Kimi APIs',
    })
    const usage = await $.session.usage()
    if (usage.cost) {
      const spent = usage.cost.usd
      await update($, ledgerUsd, () => spent)
    }
    if ((await read($, scan)).status === 'pending') await rescan($)
    if (isLive) {
      // Off the start's own budget: the network can be slow.
      $.clock.after(0, async () => {
        await loadPrices($)
        await refreshStatus($)
      })
      $.clock.every(PRICES_MAX_AGE / 4, () => loadPrices($))
    }
    await refreshStatus($)

    return result
  })

  on('command.run', { command: 'api-cost' }, async $ => {
    await $.ui.open({ id: PANE, title: 'API cost' })
    const list = await read($, requests)

    return { text: `API cost pane opened (${list.length} API responses counted).` }
  })

  // Every model request, main loop and subagents alike.
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    if (r.usage) {
      const req = toRequest(r.usage.model, r.usage)
      await update($, requests, list => [...list, req].slice(-MAX_REQUESTS))
      await refreshStatus($)
    }

    return r
  })

  // A compaction's own summarizer request.
  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if ('usage' in r && r.usage) {
      const usage = r.usage
      const model = (await read($, requests)).at(-1)?.[0] ?? 'claude-opus-5-5'
      await update($, requests, l => [...l, toRequest(model, usage)].slice(-MAX_REQUESTS))
    }

    return r
  })

  on('session.measure', async ($, e, next) => {
    if (e.cost) {
      const spent = e.cost.usd
      await update($, ledgerUsd, () => spent)
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    // Mobile has no Select: a Button there cycles through the models.
    const Select = 'Select' in elements ? elements.Select : undefined
    const choose = async (provider: string, value: string) => {
      await update($, picks, prev => ({ ...prev, [provider]: value }))
      await refreshStatus($)
    }
    const list = await read($, requests)
    const status = await read($, scan)
    const chosen = await read($, picks)
    const o = await options($)
    const ledger = await read($, ledgerUsd)
    const priced = await read($, prices)
    const now = await $.clock.now()
    const cols = Math.max(30, e.props.bodyColumns ?? e.viewport?.columns ?? 60)

    const totals = list.reduce(
      (t, [, i, out, cr, cw]) => ({ input: t.input + i, out: t.out + out, cr: t.cr + cr, cw: t.cw + cw }),
      { input: 0, out: 0, cr: 0, cw: 0 },
    )
    const prompt = totals.input + totals.cr + totals.cw
    const hitRate = prompt > 0 ? Math.round((totals.cr / prompt) * 100) : 0

    const rows = providersOf(priced.table).map(p => {
      const pick = chosen[p.id] ?? defaultPick(p)
      return { p, pick, cost: providerCost(p, pick, list, o) }
    })
    const claudeCost = rows[0]?.cost ?? 0
    const max = Math.max(...rows.map(r => r.cost), 1e-9)
    const barWidth = Math.max(10, Math.min(48, cols - 2))
    const usedModels = [...new Set(list.map(r => r[0]))]
    const priceLine =
      priced.source === 'live' && priced.fetchedAt !== null
        ? `Prices as of ${priced.table.asOf} (live, fetched ${ago(now - priced.fetchedAt)})`
        : `Prices as of ${priced.table.asOf} (built-in${isLive ? '' : '; live prices off'})`

    return (
      <Box flexDirection="column">
        <Text bold>What this session would cost on each API</Text>
        <Text dimColor>
          {list.length} responses · {tokens(prompt)} prompt tokens ({hitRate}% cache hits) · {tokens(totals.out)} output
        </Text>
        {usedModels.length > 0 && <Text dimColor wrap="truncate-end">Models used: {usedModels.join(', ')}</Text>}
        {ledger !== null && <Text dimColor>Claude Code's own /cost ledger: {usd(ledger)}</Text>}
        {status.status === 'pending' && <Text color="warning">Reading the transcript…</Text>}
        {status.note && <Text color="warning">{status.note}</Text>}

        {rows.map(({ p, pick, cost }) => {
          const ratio = claudeCost > 0 ? cost / claudeCost : 0
          const choices = [
            ...(p.isClaude ? [{ value: AS_USED, label: 'As used (each model at its own rate)' }] : []),
            ...p.models.map(m => ({ value: m.id, label: `${m.label} · $${m.input} in / $${m.output} out` })),
          ]
          return (
            <Box key={p.id} flexDirection="column" marginTop={1}>
              <Box flexDirection="row" justifyContent="space-between">
                <Text bold color={p.isClaude ? 'claude' : undefined}>
                  {p.name}
                </Text>
                <Text>
                  <Text bold>{usd(cost)}</Text>
                  {!p.isClaude && claudeCost > 0 && cost > 0 && (
                    <Text dimColor>{ratio < 1 ? ` ${(1 / ratio).toFixed(1)}× cheaper` : ` ${ratio.toFixed(1)}× pricier`}</Text>
                  )}
                </Text>
              </Box>
              <Text color={p.isClaude ? 'claude' : 'suggestion'}>{bar(cost / max, barWidth)}</Text>
              {Select ? (
                <Select
                  key={`pick-${p.id}`}
                  label="Model: "
                  options={choices}
                  value={choices.some(c => c.value === pick) ? pick : choices[0]!.value}
                  onSelect={(value: string) => choose(p.id, value)}
                />
              ) : (
                <Button
                  key={`pick-${p.id}`}
                  label={`Model: ${choices.find(c => c.value === pick)?.label ?? choices[0]!.label} ▸`}
                  onPress={() => {
                    const at = choices.findIndex(c => c.value === pick)
                    choose(p.id, choices[(at + 1) % choices.length]!.value)
                  }}
                />
              )}
            </Box>
          )
        })}

        <Box flexDirection="row" flexWrap="wrap" columnGap={1} marginTop={1}>
          <Button
            key="cache"
            hotkey="c"
            label={o.isCacheOn ? 'Caching: on' : 'Caching: off'}
            onPress={async () => {
              await update($, isCacheOn, v => !v)
              await refreshStatus($)
            }}
          />
          <Button
            key="ttl"
            hotkey="t"
            label={`Cache writes: ${o.ttl === '1h' ? '1-hour' : '5-minute'}`}
            onPress={async () => {
              await update($, ttl, v => (v === '1h' ? '5m' : '1h'))
              await refreshStatus($)
            }}
          />
          <Button key="rescan" hotkey="r" label="Rescan" onPress={() => rescan($)} />
          {isLive && (
            <Button
              key="prices"
              hotkey="p"
              label="Update prices"
              onPress={async () => {
                await loadPrices($, true)
                await refreshStatus($)
              }}
            />
          )}
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>{priceLine}</Text>
          {priced.note && <Text color="warning">{priced.note}</Text>}
          <Text dimColor>
            Claude's token counts priced at each provider's list rate. Other tokenizers count the same text
            differently, so non-Claude figures are estimates. "Caching: off" bills every prompt token at the full
            input rate. The cache-write TTL applies to Claude and Kimi K3.
          </Text>
        </Box>
      </Box>
    )
  })
}
