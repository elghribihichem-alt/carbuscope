'use client'

// T55-C-b — Hubs > Paramètres TMP. Orchestrateur des 4 sous-onglets (clé nav
// « hubs-parametres », ids sidebar déjà câblés) :
//   tarifs      → grille de référence nationale (lecture) + écarts MESURÉS par
//                 hub (CA moyen/intervention vs référence, ±15 %).
//   catalogue   → références pneus V1 statiques + rotations réelles mesurées.
//   templates   → structure des comptes rendus diagnostic (aperçu rendu).
//   maintenance → seuils d'entretien des équipements (grille indicative).
// Coordonnateur : hubs-parametres-tarifs/-catalogue/-templates/-maintenance.

import { HubsParametresTarifs } from "./hubs-parametres-tarifs"
import { HubsParametresCatalogue } from "./hubs-parametres-catalogue"
import { HubsParametresTemplates } from "./hubs-parametres-templates"
import { HubsParametresMaintenance } from "./hubs-parametres-maintenance"

type ParametresTab = "tarifs" | "catalogue" | "templates" | "maintenance"

export function HubsParametres({ tab }: { tab: string }) {
  const t = (["tarifs", "catalogue", "templates", "maintenance"].includes(tab) ? tab : "tarifs") as ParametresTab

  if (t === "catalogue") return <HubsParametresCatalogue />
  if (t === "templates") return <HubsParametresTemplates />
  if (t === "maintenance") return <HubsParametresMaintenance />
  return <HubsParametresTarifs />
}
