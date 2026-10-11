/** One API response: [model, input, output, cacheRead, cacheWrite] tokens. */
export type Request = [string, number, number, number, number]

/** Where the request history came from. */
export type Scan = {
  status: 'pending' | 'done' | 'partial' | 'failed'
  note?: string
}

/** USD per 1M tokens. `write`: 5-minute cache write, `write1h`: 1-hour; absent, billed at `input`. */
export type Tier = { input: number; cached: number; output: number; write?: number; write1h?: number }

/** One model's prices; `long` applies once a request's prompt is over `above` tokens. */
export type Price = Tier & { id: string; label: string; long?: Tier & { above: number } }

export type Provider = { id: string; name: string; short: string; models: Price[]; isClaude?: boolean }

/** The shape of prices.json. `version` changes only when old installs could not read it. */
export type PriceTable = { version: 1; asOf: string; providers: Provider[] }

/** The table in use and where it came from. */
export type Prices = {
  table: PriceTable
  source: 'built-in' | 'live'
  fetchedAt: number | null
  note?: string
}

declare module 'claude-code' {
  interface PluginState {
    'api-cost-compare': {
      requests: Request[]
      scan: Scan
      picks: Record<string, string>
      isCacheOn: boolean
      ttl: '5m' | '1h'
      ledgerUsd: number | null
      prices: Prices
    }
  }
}
