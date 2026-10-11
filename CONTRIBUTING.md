# Contributing

Thanks for helping! The most useful contributions are **price corrections**, followed by new providers and models.

## Updating prices

1. Edit [`hooks/prices.ts`](hooks/prices.ts): change the rates, and set `asOf` to today's date (`YYYY-MM-DD`).
2. Regenerate the live table:
   ```bash
   node scripts/build-prices.mjs
   ```
   (Node 22.18 or newer; it runs the `.ts` file directly.)
3. Commit **both** `hooks/prices.ts` and `prices.json`, and link the official pricing page in the PR description.

CI fails if `prices.json` doesn't match `hooks/prices.ts`. Once merged to `main`, every install picks up the new table within 24 hours.

**Price conventions.** All rates are USD per 1M tokens, at list price.

| Field | Meaning |
|---|---|
| `input` | Uncached input (a cache miss). |
| `cached` | A cache hit. |
| `output` | Output tokens, including reasoning/thinking tokens. |
| `write` / `write1h` | 5-minute / 1-hour cache write. Leave both out when the provider bills writes as normal input. |
| `long` | A higher tier that applies once a request's whole prompt (input + cache read + cache write) is over `above` tokens. |

Keep the model `id` the provider's API model name. A suffix like `@off` marks a pricing variant of the same model, such as off-peak.

## Adding a provider

Add an entry to `providers` in `hooks/prices.ts` with a unique `id`, a `name` for the pane, a `short` name for the status line, and at least one model. The first model is the default pick. Then regenerate `prices.json` as above.

The `version` field in `prices.json` must stay `1` unless the format changes in a way older installs can't read. Older installs reject a table with another version and keep their own prices.

## Development setup

Run Claude Code with the mod loaded from your checkout:

```bash
claude --plugin-dir .
```

In an interactive session, saving a file reloads the mod. Run with `--debug` to see why a hook was skipped.

Check your changes before opening a PR:

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

```bash
node scripts/build-prices.mjs --check
```

For editor types, load the mod once (`claude --plugin-dir .`). Claude Code then writes the API declarations into `.claude-plugin/types/`, which `tsconfig.json` extends. That folder is git-ignored.

## Project layout

| Path | What it is |
|---|---|
| `.claude-plugin/plugin.json` | The mod's manifest, including the `livePrices` option. |
| `.claude-plugin/marketplace.json` | Makes this repo installable with `/plugin install … --marketplace shezis/claude-api-cost-compare`. |
| `hooks/register.tsx` | The hooks: token tracking, transcript scan, live prices, the pane. |
| `hooks/prices.ts` | The built-in price table and the `prices.json` validator. |
| `prices.json` | The live table installs fetch daily (generated; don't edit by hand). |
| `types/index.d.ts` | The mod's state contract and price types. |
| `tests/` | `claude plugin test` suites. |
| `scripts/build-prices.mjs` | Generates and checks `prices.json`. |

## Releasing

Bump `version` in `.claude-plugin/plugin.json`. Users get it with `claude plugin update api-cost-compare@claude-api-cost-compare`. Price-only changes don't need a release.
