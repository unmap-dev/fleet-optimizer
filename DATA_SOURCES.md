# Data sources

Everything on screen, where it comes from, and how far to trust it.

| What | Source | Licence | Live? |
| --- | --- | --- | --- |
| The sample scenarios (`data/*.sample.json`) | Written by Unmap, copied from Unmap's GMPRO conformance corpus | MIT, with the code | No: bundled |
| Any file you open | your own file, read in your browser | yours | Sent only to `api.unmap.dev`, as the body of the check and the solve |
| The compatibility report | Unmap Optimize API, `solvingMode: VALIDATE_ONLY` | n/a | Live |
| The solved plan | Unmap Optimize API | n/a | Live |
| Google's `solution.json`, when you add one | your own file | yours | Not sent anywhere |
| Basemap | Unmap Maps API: OpenStreetMap | ODbL, © OpenStreetMap contributors | Live |

Nothing on screen is invented. Nothing is live except the API: the plan, the report and the map
come from Unmap, and the scenarios are samples, labelled as samples where they are seen.

## The samples

Three request bodies, written by Unmap for its Optimize docs and conformance tests and copied
from Unmap's GMPRO conformance corpus, byte for byte:

| File | Scenario |
| --- | --- |
| `last-mile-deliveries.sample.json` | a parcel round in Calgary, 12 shipments, 2 vans |
| `field-service-with-breaks.sample.json` | technicians in Ottawa, 9 jobs, 3 vehicles, with lunch breaks |
| `pickup-delivery-courier.sample.json` | a courier morning in Montréal, 6 shipments, 2 vehicles |

The coordinates, labels and numbers are Unmap's; the field names are the public Google Route
Optimization API's. All three fit the Hobby
plan's limits. The `.sample.json` names are what the public exporter accepts as sample data.

## Trademarks

Google Route Optimization and Fleet Routing App are named only to say which files the app reads.
Unmap is not affiliated with or endorsed by Google, and the app uses no Google logo, colour or
wordmark.
