# Fleet Optimizer, built with Unmap

Open a Google Route Optimization request file, check which fields Unmap supports, solve it on
Unmap and review the plan: which vehicle takes which shipment, in what order, with the schedule and
the distances, on a live Unmap map. One of the [Unmap apps](https://unmap.dev/apps); live at
[apps.unmap.dev/fleet-optimizer](https://apps.unmap.dev/fleet-optimizer/).

Unmap is not affiliated with or endorsed by Google. Google Route Optimization is named only to say
which request files this app reads.

**Your file stays in your browser.** It is read on the page and sent only to `api.unmap.dev`, to
check it and to solve it. Nothing is stored.

## What it does

1. **Open a scenario.** A `.json` file with one `OptimizeToursRequest`, a `.zip` from Google's
   Fleet Routing App (`scenario.json` and, when you have it, `solution.json`), or one of three
   bundled samples.
2. **Check it.** The request is sent with `solvingMode: VALIDATE_ONLY`, which is free, and the
   report says whether it is ready, needs changes or is out of reach. Every refused field is
   listed with its path, Unmap's message and its error code. Fields Unmap accepts but ignores are
   listed as warnings.
3. **Remove what is not supported yet.** Fields refused with `FIELD_NOT_SUPPORTED_YET` can be
   removed in one step; the app checks the request again before solving. Everything else
   (`VALUE_NOT_SUPPORTED_YET`, `PLACE_ID_NOT_SUPPORTED`, malformed values) is blocking, and the
   report says what to change in the file. Once fields are removed, every result view and the
   downloaded `scenario.json` carry the removed paths. Your original file is never changed.
4. **Set the solve.** A timeout, the search mode, and road or straight-line travel. Straight line
   is forced, with a notice, when a stop is outside Canada, where road travel ends.
5. **Solve and review.** A map with one colour per vehicle, a timeline of each vehicle's day, the
   totals and cost components, and the shipments that were skipped with their reasons.
6. **Compare and download.** When the upload had Google's `solution.json`, the two plans sit side
   by side with no verdict, because they used different travel times. Download Unmap's response as
   JSON, or a ZIP the Fleet Routing App can open.

See [`FEATURES.md`](FEATURES.md) for the full list and [`DATA_SOURCES.md`](DATA_SOURCES.md) for
where everything on screen comes from.

## Run it

You need Node 24 (22.18+ works), pnpm and a free Unmap browser key from
[unmap.dev/dashboard](https://unmap.dev/dashboard). The key must allow `http://localhost:3208`.

```bash
cp .env.example .env.local      # then set NEXT_PUBLIC_UNMAP_KEY
pnpm install
pnpm dev                        # http://localhost:3208
```

Without a key the app shows how to get one and never calls the API.

| Variable | |
| --- | --- |
| `NEXT_PUBLIC_UNMAP_KEY` | your browser key (required) |
| `NEXT_PUBLIC_UNMAP_GATEWAY` | optional; defaults to `https://api.unmap.dev` |
| `BASE_PATH` | optional; the path the app is served under, empty for a site of its own |
| `NEXT_PUBLIC_MAX_SHIPMENTS`, `NEXT_PUBLIC_MAX_VEHICLES` | optional client caps on what the app will solve; unset means no cap |

| Command | |
| --- | --- |
| `pnpm dev` | development server on port 3208 |
| `pnpm build` | static export in `out/` |
| `pnpm test` | unit tests (Vitest) |
| `pnpm lint` / `pnpm typecheck` | |
| `pnpm run deploy` | build, then `wrangler deploy` to your Cloudflare account (edit `wrangler.jsonc` first) |

The key ships in the browser bundle. Restrict it to your origins (`http://localhost:3208` and your
domain) in the dashboard. Any static host works: `out/` is plain files.

### Limits

A clone solves with your own key, so your plan's limits apply: the API refuses a solve over your
plan's shipments, vehicles, locations or time, and the app shows its message. The two optional caps
above make the app refuse earlier, before any request, with the counts shown. The hosted build sets
them to 25 and 5, which are the Hobby plan's limits. A scenario over the caps can still be checked;
only solve is off.

## What each call costs

- **Check:** free. `VALIDATE_ONLY` solves nothing, fetches nothing and is never billed.
- **Solve:** billed for the shipments it performs, which the totals show as "Billable shipments".
  Skipped shipments are not billed.
- Opening a file, changing settings and downloading call nothing. The basemap is the Maps API.

## What it does not do

- **Edit the scenario.** Shipments and vehicles are changed in the file; the app changes only the
  solve settings.
- **Re-evaluate Google's plan on Unmap's travel times.** That needs injected solutions, which Unmap
  does not support yet.
- **Road travel outside Canada**, or place-ID geocoding. Place IDs are reported in the check; a
  stop outside Canada switches travel to straight line in the solve settings, with a notice.
- **Remove fields that change the problem itself.** Only `FIELD_NOT_SUPPORTED_YET` can be removed.
- **Save scenarios, accounts, CSV import, or PDF export.** Everything stays in the browser.

## Privacy

The file is read in your browser. It leaves the page only as the body of the check and the solve,
which go to `api.unmap.dev`; the app has no server of its own and stores nothing, neither the file
nor the result. The basemap tiles come from Unmap too.

## How it is built

```
app/page.tsx                   the one page; renders the app in the browser
components/fleet/              the app: load, report, settings, results, timeline, comparison
components/ui/  lib/map-*      Unmap registry components and shadcn primitives, copied in unmodified
lib/kit/                       the Unmap app kit (header, Built with Unmap panel, en/fr), copied in
lib/scenario/                  reading a file, the report, removing fields, settings (no React)
lib/plan/                      summary, comparison and export of a plan (no React)
hooks/                         the check and the solve, through @unmap/sdk
lib/manifest.ts                what the Built with Unmap panel lists
lib/text.ts                    this app's words in English and French
data/                          the three bundled sample scenarios
```

Layers run one way: components → hooks → `lib/` (plain TypeScript, unit-tested) → `@unmap/sdk`.
The only dependency beyond the Unmap packages is `fflate`, for reading and writing ZIP files.
Install the registry pieces in your own project with `npx @unmap/cli add map route-line marker-popup`.

## Copied code

`components/ui/`, `lib/map-*` and `lib/kit/` are copied in unmodified from the Unmap component
registry and app kit. In the Unmap monorepo the copied files are kept in step by `pnpm sync` and
`test/sync.test.ts`; in your own copy they are ordinary source you can edit.

## Licence

Code: MIT. The sample scenarios are written by Unmap and MIT with the code. Map data ©
OpenStreetMap contributors (ODbL), served by Unmap.
