// The built-in price table: the fallback when the live table in the
// repository's prices.json can't be fetched, and the source that file is
// generated from (`node scripts/build-prices.mjs`).
//
// USD per 1M tokens, official list rates. `cached` is a cache hit. `write` is a
// 5-minute cache write and `write1h` a 1-hour one; absent, a write is billed at
// `input` (a plain cache miss). `long` is the tier a request moves to once its
// prompt (input + cache read + cache write) is over `above` tokens.

import type { Price, PriceTable, Tier } from '../types'

/** Claude cache writes: 1.25x input for the 5-minute TTL, 2x for 1 hour. */
const claude = (id: string, label: string, input: number, cached: number, output: number, long?: Tier & { above: number }): Price => ({
  id,
  label,
  input,
  cached,
  output,
  write: input * 1.25,
  write1h: input * 2,
  ...(long && { long: { ...long, write: long.input * 1.25, write1h: long.input * 2 } }),
})

/** OpenAI's long-context tier starts past 272K prompt tokens. */
const openai = (id: string, label: string, t: Tier, long?: Tier): Price => ({
  id,
  label,
  ...t,
  ...(long && { long: { above: 272_000, ...long } }),
})

export const BUILTIN: PriceTable = {
  version: 1,
  asOf: '2026-10-11',
  providers: [
    {
      id: 'claude',
      name: 'Claude API',
      short: 'Claude',
      isClaude: true,
      models: [
        claude('claude-fable-5-1', 'Fable 5.1', 10, 0.25, 50),
        claude('claude-mythos-5-1', 'Mythos 5.1', 10, 0.25, 50),
        claude('claude-fable-5', 'Fable 5', 10, 1, 50),
        claude('claude-mythos-5', 'Mythos 5', 10, 1, 50),
        claude('claude-opus-5-5', 'Opus 5.5', 4, 0.2, 20),
        claude('claude-opus-5', 'Opus 5', 5, 0.5, 25),
        claude('claude-opus-4', 'Opus 4.6–4.8', 5, 0.5, 25),
        claude('claude-sonnet-5-5', 'Sonnet 5.5', 2, 0.2, 10),
        claude('claude-sonnet-5', 'Sonnet 5', 2, 0.2, 10),
        claude('claude-sonnet-4', 'Sonnet 4.6', 3, 0.3, 15),
        claude('claude-haiku-5-5', 'Haiku 5.5', 0.1, 0.01, 0.5, { above: 100_000, input: 0.5, cached: 0.05, output: 2.5 }),
        claude('claude-haiku-4', 'Haiku 4.5', 1, 0.1, 5),
      ],
    },
    {
      id: 'openai',
      name: 'OpenAI API',
      short: 'OpenAI',
      models: [
        openai('gpt-6.1-sol', 'GPT-6.1 Sol', { input: 2, cached: 0.1, output: 10, write: 2.5 }, { input: 4, cached: 0.2, output: 15, write: 5 }),
        openai('gpt-6-astra', 'GPT-6 Astra', { input: 10, cached: 1, output: 50, write: 12.5 }, { input: 20, cached: 2, output: 75, write: 25 }),
        openai('gpt-6-sol', 'GPT-6 Sol', { input: 2, cached: 0.2, output: 10, write: 2.5 }, { input: 4, cached: 0.4, output: 15, write: 5 }),
        openai('gpt-6-luna', 'GPT-6 Luna', { input: 0.1, cached: 0.01, output: 0.5, write: 0.125 }, { input: 0.2, cached: 0.02, output: 0.75, write: 0.25 }),
        openai('gpt-5.6-sol', 'GPT-5.6 Sol (promo)', { input: 4, cached: 0.4, output: 20, write: 5 }, { input: 8, cached: 0.8, output: 30, write: 10 }),
        openai('gpt-5.6-terra', 'GPT-5.6 Terra', { input: 2, cached: 0.2, output: 12, write: 2.5 }, { input: 4, cached: 0.4, output: 18, write: 5 }),
        openai('gpt-5.5', 'GPT-5.5', { input: 5, cached: 0.5, output: 30 }, { input: 10, cached: 1, output: 45 }),
        openai('gpt-5.4-mini', 'GPT-5.4 mini', { input: 0.75, cached: 0.075, output: 4.5 }),
      ],
    },
    {
      id: 'deepseek',
      name: 'DeepSeek API',
      short: 'DeepSeek',
      models: [
        { id: 'deepseek-v4-pro', label: 'V4-Pro (peak)', input: 1.32, cached: 0.044, output: 3.96 },
        { id: 'deepseek-v4-pro@off', label: 'V4-Pro (off-peak)', input: 0.66, cached: 0.022, output: 1.98 },
        { id: 'deepseek-flash', label: 'V4.1-Flash (peak)', input: 0.3, cached: 0.006, output: 1.2 },
        { id: 'deepseek-flash@off', label: 'V4.1-Flash (off-peak)', input: 0.15, cached: 0.003, output: 0.6 },
      ],
    },
    {
      id: 'glm',
      name: 'GLM API (Z.ai)',
      short: 'GLM',
      models: [
        { id: 'glm-5.3', label: 'GLM-5.3', input: 1.4, cached: 0.26, output: 4.4 },
        { id: 'glm-5', label: 'GLM-5', input: 1, cached: 0.2, output: 3.2 },
        { id: 'glm-5.3-flashx', label: 'GLM-5.3-FlashX', input: 0.37, cached: 0.075, output: 1.25 },
        { id: 'glm-5.3-flash', label: 'GLM-5.3-Flash', input: 0.15, cached: 0.03, output: 0.5 },
        { id: 'glm-4.7', label: 'GLM-4.7', input: 0.6, cached: 0.11, output: 2.2 },
      ],
    },
    {
      id: 'kimi',
      name: 'Kimi API (Moonshot)',
      short: 'Kimi',
      models: [
        { id: 'kimi-k3', label: 'Kimi K3', input: 3, cached: 0.3, output: 15, write: 3, write1h: 6 },
        { id: 'kimi-k2.7-code', label: 'Kimi K2.7 Code', input: 0.95, cached: 0.19, output: 4 },
        { id: 'kimi-k2.6', label: 'Kimi K2.6', input: 0.95, cached: 0.16, output: 4 },
        { id: 'kimi-k2.7-code-highspeed', label: 'Kimi K2.7 Code HS', input: 1.9, cached: 0.38, output: 8 },
      ],
    },
  ],
}

const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0

const isTier = (t: unknown): t is Tier => {
  if (typeof t !== 'object' || t === null) return false
  const o = t as Record<string, unknown>
  return (
    isNum(o.input) &&
    isNum(o.cached) &&
    isNum(o.output) &&
    (o.write === undefined || isNum(o.write)) &&
    (o.write1h === undefined || isNum(o.write1h))
  )
}

/**
 * A fetched table, checked field by field; undefined when it is not one this
 * version understands (another schema version, a missing provider, a bad price).
 */
export const parseTable = (text: string): PriceTable | undefined => {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return undefined
  }
  const t = data as Partial<PriceTable>
  if (t?.version !== 1 || typeof t.asOf !== 'string' || !Array.isArray(t.providers)) return undefined
  for (const p of t.providers) {
    if (typeof p?.id !== 'string' || typeof p.name !== 'string' || typeof p.short !== 'string') return undefined
    if (!Array.isArray(p.models) || p.models.length === 0) return undefined
    for (const m of p.models) {
      if (typeof m?.id !== 'string' || typeof m.label !== 'string' || !isTier(m)) return undefined
      if (m.long !== undefined && !(isTier(m.long) && isNum(m.long.above))) return undefined
    }
  }
  if (!t.providers.some(p => p.isClaude)) return undefined

  return t as PriceTable
}
