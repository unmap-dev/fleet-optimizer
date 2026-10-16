# Features

What Fleet Optimizer does, which Unmap API does it, and what it deliberately does not do.

## Implemented

| Feature | How | Unmap |
| --- | --- | --- |
| Open a scenario | a `.json` request, or a `.zip` from the Fleet Routing App (`scenario.json`, optionally `solution.json`); a button or a drop anywhere on the page; read in the browser; a file or ZIP entry over the API's 4 MiB request limit is refused before it is read | none |
| Samples | three bundled scenarios: last-mile deliveries (Calgary), field service with breaks (Ottawa), pickup and delivery courier (Montréal) | none |
| Google's non-canonical durations | `{"seconds": "300"}` and `{seconds, nanos}` are converted to `"300s"` before the check, so the report does not fill with `INVALID_DURATION` | none |
| Add `solution.json` separately | for comparison; a response opened first waits for the request it answers | none |
| Check (free) | the request is sent with `solvingMode: VALIDATE_ONLY`; the report is ready, needs changes or out of reach | Optimize API (`POST /optimize`) |
| Compatibility report | every refused field with its path, Unmap's message and error code; warnings from `X-Unmap-Optimize-Warnings` for fields accepted but ignored | Optimize API |
| Remove unsupported fields | only `FIELD_NOT_SUPPORTED_YET` is removable; the paths, array elements and map keys included, are deleted from a copy and the copy is checked again | Optimize API |
| Blocking errors | `VALUE_NOT_SUPPORTED_YET`, `PLACE_ID_NOT_SUPPORTED` and malformed values stay blocking, with what to change in the file | none |
| Labelling | once fields are removed, the results, the comparison and the exported `scenario.json` carry the removed paths | none |
| Solve settings | timeout, search mode (`RETURN_FAST`, `CONSUME_ALL_AVAILABLE_TIME`), road or straight-line travel at a chosen speed; applied on top of the file | none |
| Travel outside Canada | straight line is forced, with a notice, when a stop lies outside Canada (an approximate bounding-box check) | none |
| Client caps | optional `NEXT_PUBLIC_MAX_SHIPMENTS` / `NEXT_PUBLIC_MAX_VEHICLES`; over a cap the check still runs and solve is off with the counts shown | none |
| Solve | the scenario is sent to `POST /optimize` | Optimize API |
| Map | one colour per vehicle, numbered stops, depots; road routes from `routePolyline`, straight-line ones as legs between stops; a tooltip per stop | Maps API, registry `map`, `route-line`, `marker-popup` |
| Timeline | one row per vehicle: visits, travel, waiting and breaks along a time axis (the one composed component) | none |
| Totals | total cost and each cost component, distance, duration, vehicles used, shipments served and skipped with reasons, billable shipments | none |
| Compare | with Google's `solution.json`, side by side, no verdict | none |
| Download | Unmap's response as JSON, or a ZIP the Fleet Routing App opens (`scenario.json` and `solution.json`) | none |
| API problems | `429` with the wait, a used-up monthly allowance, `503` and `504` with retry, mandatory shipments no vehicle can serve | none |
| Privacy notice and affiliation | always visible: the file stays in the browser and is sent only to api.unmap.dev; not affiliated with or endorsed by Google | none |
| English and French | the header switch; map labels follow | Maps `lang` |
| No-key state | the app explains how to get a key and never calls the API without one | none |
| Built with Unmap | the services, calls, components and data sources behind the page | none |

## Not goals

Editing shipments or vehicles, drag-to-reassign, CSV import, and PDF or matrix export belong to a
later workbench version. Also out: re-evaluating Google's plan on Unmap's travel times (needs
injected solutions), road travel outside Canada, place-ID geocoding, and saving scenarios on a
server.
