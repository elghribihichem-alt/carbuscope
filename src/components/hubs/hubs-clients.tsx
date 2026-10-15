'use client'

// T55-C-a — Hubs > Base clients TMP. Orchestrateur des 4 sous-onglets (clé
// nav « hubs-clients », ids sidebar déjà en place) :
//   vehicules  → registre enrichi + fiche complète (Sheet)
//   historique → timeline par véhicule (fuseau interventions + conversions)
//   alertes    → vidanges dues & fidélité à échanger (dérivation V1)
//   fidelite   → programme 3 paliers + top 10 + répartition
// DTOs et hooks LOCAUX (hubs-clients-shared.tsx) — hubs-shared.tsx figé.

import { HubsClientsVehicules } from "./hubs-clients-vehicules"
import { HubsClientsHistorique } from "./hubs-clients-historique"
import { HubsClientsAlertes } from "./hubs-clients-alertes"
import { HubsClientsFidelite } from "./hubs-clients-fidelite"

type ClientsTab = "vehicules" | "historique" | "alertes" | "fidelite"

export function HubsClients({ tab }: { tab: string }) {
  const t = (["vehicules", "historique", "alertes", "fidelite"].includes(tab) ? tab : "vehicules") as ClientsTab

  if (t === "historique") return <HubsClientsHistorique />
  if (t === "alertes") return <HubsClientsAlertes />
  if (t === "fidelite") return <HubsClientsFidelite />
  return <HubsClientsVehicules />
}
