import type { AppManifest } from "@/lib/kit/provenance";

/**
 * What the "Built with Unmap" panel and the header say about Fleet Optimizer. Lists only what the
 * app really calls; a service is added here in the same change that starts calling it.
 */
export const MANIFEST: AppManifest = {
  slug: "fleet-optimizer",
  name: { en: "Fleet Optimizer", fr: "Optimiseur de flotte" },
  tagline: {
    en: "Open a Google Route Optimization request, check it, solve it with Unmap and see the plan.",
    fr: "Ouvrez une requête Google Route Optimization, vérifiez-la, résolvez-la avec Unmap et consultez le plan.",
  },
  services: [
    {
      name: "Optimize",
      role: {
        en: "Solves the scenario: assigns shipments to vehicles, orders each vehicle's visits and returns the schedule, the distances and the shipments it could not place.",
        fr: "Résout le scénario : affecte les envois aux véhicules, ordonne les visites de chaque véhicule et renvoie l'horaire, les distances et les envois qu'il n'a pas pu placer.",
      },
      calls: ["POST /optimize"],
      docs: "https://unmap.dev/docs/apis/optimize",
    },
    {
      name: "Maps",
      role: {
        en: "The basemap under the plan: vector tiles and the base style, with labels in the page's language.",
        fr: "La carte de base sous le plan : tuiles vectorielles et style de base, étiquettes dans la langue de la page.",
      },
      calls: ['<Map apiKey={key} style="base" lang={lang} />'],
      docs: "https://unmap.dev/docs/apis/maps",
    },
  ],
  items: ["map", "marker-popup", "route-line"],
  provenance: [
    {
      kind: "sample",
      label: {
        en: "The sample scenarios: vehicles, shipments, locations, time windows and loads",
        fr: "Les scénarios d'exemple : véhicules, envois, lieux, plages horaires et charges",
      },
      source: "Written by Unmap (the GMPRO conformance corpus)",
    },
    {
      kind: "live",
      label: { en: "Basemap, solved plan, distances and schedule", fr: "Carte de base, plan résolu, distances et horaire" },
      source: "Unmap",
      attribution: "© unmap © OpenStreetMap contributors",
    },
  ],
  source: "https://github.com/unmap-dev/fleet-optimizer",
};
