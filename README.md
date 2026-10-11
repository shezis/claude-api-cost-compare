# API Cost Compare

**See what your Claude Code session would cost on the Claude, OpenAI, DeepSeek, GLM and Kimi APIs, live, as you work.**

A [Claude Code](https://claude.com/claude-code) mod that adds a `/api-cost` pane. It counts every token your session has used, including subagents and turns from before you opened it, and prices them at each provider's list rate. The comparison updates after every model call.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-d97757)

```
 What this session would cost on each API
 54 responses · 8.94M prompt tokens (96% cache hits) · 46.2K output
 Models used: claude-opus-5-5
 Claude Code's own /cost ledger: $4.98

 Claude API                                         $4.81
 ████████████████████████████████████████████████
 Model: [ As used (each model at its own rate) ▾ ]

 OpenAI API                             $1.98 2.4× cheaper
 ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░
 Model: [ GPT-6.1 Sol · $2 in / $10 out ▾ ]

 DeepSeek API                           $0.91 5.3× cheaper
 █████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
 Model: [ V4-Pro (peak) · $1.32 in / $3.96 out ▾ ]

 GLM API (Z.ai)                         $2.76 1.7× cheaper
 ███████████████████████████░░░░░░░░░░░░░░░░░░░░░
 Model: [ GLM-5.3 · $1.4 in / $4.4 out ▾ ]

 Kimi API (Moonshot)                    $4.86 1.0× pricier
 ████████████████████████████████████████████████
 Model: [ Kimi K3 · $3 in / $15 out ▾ ]

 [ Caching: on ] [ Cache writes: 1-hour ] [ Rescan ] [ Update prices ]
 Prices as of 2026-10-11 (live, fetched 3h ago)
```

## Features

- **Five providers, one view.** Claude, OpenAI, DeepSeek, Z.ai GLM and Moonshot Kimi, with a model picker for each.
- **Accurate Claude pricing.** "As used" prices every response at the rate of the model that actually answered, so mixed Opus/Sonnet/Haiku sessions come out right.
- **Cache-aware.** Cache hits, cache writes (5-minute or 1-hour) and long-context tiers are each billed at their own rate. Turn caching off to see what it saves you.
- **The whole session.** On load it reads your session transcript, including subagents, so the numbers include everything since the session started, not just since you opened the pane.
- **Always-on summary.** The status line shows `Claude API $4.81 · cheapest DeepSeek $0.91 · /api-cost`.
- **Prices stay current.** The price table updates from this repository once a day, so a merged price fix reaches every install without a new release.

## Requirements

- **Claude Code 2.1.286 or newer.** This is a *mod*, which uses Claude Code's function-hooks plugin API. That API is in early access and may change between releases.
- A terminal to run the one-time install. Once installed, the mod also works in the Claude desktop app's Code tab.

## Installation

### From the Claude Code prompt (recommended)

Start `claude` in a terminal and type:

```
/plugin install api-cost-compare --marketplace shezis/claude-api-cost-compare
```

1. **Add marketplace?** `github:shezis/claude-api-cost-compare`: press **`y`**.
2. **Choose a scope.** Press **Enter** for *User*, so it works in every project. Pick *Project* to enable it in the current repository only.
3. You'll see **`Installed api-cost-compare. Plugin is now active.`** It runs in that session right away, with no restart.

### From your shell

```bash
claude plugin marketplace add shezis/claude-api-cost-compare
```

```bash
claude plugin install api-cost-compare@claude-api-cost-compare
```

### Claude desktop app

Slash commands like `/plugin` aren't available in the desktop app's Code tab, so install once from a terminal using either method above, with the **User** scope. After that the mod loads in desktop sessions too, and the pane draws in the desktop UI.

## Usage

| Do this | What happens |
|---|---|
| `/api-cost` | Opens the pane (docked beside the transcript in fullscreen terminals and the desktop app). |
| Pick a model in any row | Re-prices the whole session on that model. |
| **`c`**: Caching | Toggles between real cache usage and "no caching", which bills every prompt token at full input price. |
| **`t`**: Cache writes | Switches Claude and Kimi K3 cache writes between the 1-hour (2× input) and 5-minute (1.25×) TTL. |
| **`r`**: Rescan | Re-reads the transcript from disk. |
| **`p`**: Update prices | Fetches the latest price table now, instead of waiting for the daily refresh. |

The hotkeys work while the pane has focus. Press Esc to return to the prompt.

## How costs are calculated

Every API response Claude Code receives reports four token counts: uncached input, cache reads, cache writes and output. The mod keeps each response separately, so per-request rules (like long-context tiers) apply correctly. For each provider it computes:

```
cost = input × input_price
     + cache_read × cached_price
     + cache_write × write_price      (5-minute or 1-hour rate; the input price where a provider doesn't charge for writes)
     + output × output_price
```

using the long-context tier for any request whose prompt is over that tier's threshold (for example Haiku 5.5 above 100K tokens, or OpenAI above 272K).

**Keep in mind:**
- **Token counts are Claude's.** OpenAI, DeepSeek, GLM and Kimi use different tokenizers, so the same text can come out 20–30% higher or lower. Treat the non-Claude figures as close estimates, not quotes.
- **List prices only.** Batch discounts, negotiated rates, Claude fast mode (2×) and regional pricing aren't included. DeepSeek's off-peak discount is offered as its own "(off-peak)" model in the picker.
- **"Claude Code's own /cost ledger"** is Claude Code's built-in figure. It also counts small background requests (titles, classifiers) that aren't part of the transcript, so it can read slightly higher than the Claude row.

## Prices

The current table, in USD per 1M tokens (input / cached input / output):

| Provider | Models in the picker |
|---|---|
| **Claude** | Fable 5.1 $10 / $0.25 / $50 · Opus 5.5 $4 / $0.20 / $20 · Sonnet 5.5 $2 / $0.20 / $10 · Haiku 5.5 $0.10 / $0.01 / $0.50 · plus older models |
| **OpenAI** | GPT-6.1 Sol $2 / $0.10 / $10 · GPT-6 Astra $10 / $1 / $50 · GPT-6 Luna $0.10 / $0.01 / $0.50 · GPT-5.6 Sol, Terra · GPT-5.5 · GPT-5.4 mini |
| **DeepSeek** | V4-Pro $1.32 / $0.044 / $3.96 · V4.1-Flash $0.30 / $0.006 / $1.20 (peak; off-peak is half) |
| **GLM (Z.ai)** | GLM-5.3 $1.40 / $0.26 / $4.40 · GLM-5 · GLM-5.3-FlashX · GLM-5.3-Flash · GLM-4.7 |
| **Kimi (Moonshot)** | Kimi K3 $3 / $0.30 / $15 · K2.7 Code · K2.6 · K2.7 Code HS |

[`prices.json`](prices.json) is the full table, with cache-write and long-context rates. Sources: the official pricing pages of [Anthropic](https://www.anthropic.com/pricing), [OpenAI](https://developers.openai.com/api/docs/pricing), [DeepSeek](https://api-docs.deepseek.com/quick_start/pricing), [Z.ai](https://docs.z.ai/guides/overview/pricing) and [Moonshot](https://platform.kimi.ai/docs/pricing/chat).

### Live price updates

Prices change often, so the mod doesn't rely only on the table it shipped with:

1. On session start, it loads the last price table it downloaded.
2. If that table is more than 24 hours old, it fetches [`prices.json`](prices.json) from this repository's `main` branch in the background.
3. If GitHub can't be reached, or the file is a format this version doesn't understand, it keeps the previous table or the built-in one.

The footer always tells you which table is in use: `(live, fetched 3h ago)` or `(built-in)`.

**Turn it off:** set *Fetch live prices* to off in Claude Code's config menu, or run `claude plugin configure api-cost-compare`. The mod then uses only the prices built into the installed version.

## Privacy

- **Your session data never leaves your machine.** The mod reads your local session transcript (`~/.claude/projects/…`) only to count tokens. It reads nothing else and writes no files of its own; the downloaded price table is cached in Claude Code's plugin store.
- **The only network request** is a plain `GET` of `prices.json` from `raw.githubusercontent.com`, at most about once a day. It carries no data about you or your session, and you can turn it off (see above).

## Updating and uninstalling

```bash
claude plugin update api-cost-compare@claude-api-cost-compare
```

```bash
claude plugin uninstall api-cost-compare
```

Price-only changes reach you automatically through live prices. `update` is only needed for new features.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/api-cost` isn't recognised | Check the plugin is installed and enabled with `claude plugin list`, then start a new session. |
| "Transcript too large to read; counting live responses only." | The session transcript is over 4 MB, the read limit for mods. Responses from now on are still counted live. |
| "Live prices unavailable" | GitHub couldn't be reached. The pane keeps working with the last table it had. |
| Numbers look stuck | Press **`r`** to rescan, or check `claude --debug` for lines starting with `api-cost-compare:`. |

## Contributing

Price corrections are the most valuable contribution. If a provider changes its prices, please open a PR. It's a two-step change:

1. Edit the table in [`hooks/prices.ts`](hooks/prices.ts) and bump `asOf`.
2. Run `node scripts/build-prices.mjs` (Node 22.18+) to regenerate `prices.json`, then commit both files with a link to the official pricing page.

Once merged, every install picks up the new prices within a day. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, tests and adding a provider.

## License

[MIT](LICENSE)

*Not affiliated with Anthropic, OpenAI, DeepSeek, Zhipu AI or Moonshot AI. Prices are provided for estimation only; always check the provider's own pricing page before making decisions.*
