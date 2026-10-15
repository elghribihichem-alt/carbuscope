'use client'

// T55-C-a — Hubs > Gestion des services. Orchestrateur des 4 sous-onglets
// (clé nav « hubs-services », ids sidebar déjà en place) :
//   vidanges / pneus / diagnostics → registre réel des interventions
//   (/api/hubs/interventions — gabarit partagé paramétré par type) ;
//   conversions → registre des orientations TMP → station + actions de
//   qualification (/api/hubs/conversions, GET + PATCH audité).
// DTOs et hooks définis LOCALEMENT dans les sous-fichiers (hubs-shared.tsx
// est figé — seuls useHubs / SectionHeader / badges y sont réutilisés).

import { HubsServicesRegistry } from "./hubs-services-registry"
import { HubsServicesConversions } from "./hubs-services-conversions"

type ServicesTab = "vidanges" | "pneus" | "diagnostics" | "conversions"

export function HubsServices({ tab }: { tab: string }) {
  const t = (["vidanges", "pneus", "diagnostics", "conversions"].includes(tab) ? tab : "vidanges") as ServicesTab

  if (t === "conversions") return <HubsServicesConversions />
  return <HubsServicesRegistry type={t} />
}
