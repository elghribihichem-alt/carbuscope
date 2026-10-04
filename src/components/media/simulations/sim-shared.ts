// CarbuScope — T60-f — socle partagé du volet Simulations (liste + assistant).
// Types purs, helpers de calcul prorata et aplatissage des faces — aucun JSX,
// consommé par sim-wizard / sim-report / sim-share / media-simulations.

import type {
  PanelNestedDTO,
  SimulationSelectionDTO,
} from "@/lib/media/shared"

/** Face aplatie prête à sélectionner (uniquement les accès FULL — les faces
 *  agrégées ne sont jamais sélectionnables : le moteur n'accepte que du FULL). */
export interface FlatFace {
  faceId: string
  code: string
  panelName: string
  ville: string
  governorat: string
  format: string
  technologie: string
  status: string
  prixSemaine: number
  odv: number
  audience: number
}

/** Aplatit la liste imbriquée panneaux→faces en lignes FULL sélectionnables. */
export function flattenFaces(panels: PanelNestedDTO[] | undefined | null): FlatFace[] {
  const out: FlatFace[] = []
  for (const p of panels ?? []) {
    for (const f of p.faces ?? []) {
      if (f.access !== "FULL") continue
      out.push({
        faceId: f.id,
        code: f.code,
        panelName: p.name,
        ville: p.ville,
        governorat: p.governorat,
        format: p.format,
        technologie: p.technology,
        status: f.status,
        prixSemaine: f.prixSemaine,
        odv: f.odvJournalieres,
        audience: f.audienceJournaliere,
      })
    }
  }
  return out.sort((a, b) => a.code.localeCompare(b.code))
}

/** Nombre de jours de campagne (repli 30 j si dates absentes), borné 1..730. */
export function periodDays(startISO: string | null, endISO: string | null): number {
  if (!startISO || !endISO) return 30
  const d =
    Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 86_400_000) + 1
  return Math.max(1, Math.min(730, d))
}

/** Prix campagne pré-rempli : prorata semaine — prixSemaine × ceil(jours/7). */
export function prorataPrix(prixSemaine: number, days: number): number {
  return Math.round((prixSemaine || 0) * Math.ceil(Math.max(1, days) / 7))
}

/** ISO → valeur d'input type="date" (yyyy-mm-dd), "" si absent. */
export function dateInputValue(iso: string | null | undefined): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : ""
}

/** Total estimé : somme des lignes (prix × (1 − remise ligne)) × (1 − remise globale). */
export function estimateTotal(
  rows: SimulationSelectionDTO[],
  remiseGlobale: number,
): number {
  const g = 1 - Math.min(90, Math.max(0, remiseGlobale)) / 100
  return Math.round(
    rows.reduce((sum, r) => sum + (r.prixUnitaire || 0) * (1 - (r.remise || 0) / 100), 0) * g,
  )
}

/** Compteurs live de la sélection : faces, formats distincts, villes couvertes. */
export function selectionStats(rows: SimulationSelectionDTO[], facesById: Map<string, FlatFace>): {
  faces: number
  formats: number
  villes: number
} {
  const formats = new Set<string>()
  const villes = new Set<string>()
  for (const r of rows) {
    const f = facesById.get(r.faceId)
    if (!f) continue
    formats.add(f.format)
    villes.add(f.ville)
  }
  return { faces: rows.length, formats: formats.size, villes: villes.size }
}

/** Clamp numérique robuste (repli 0 si NaN). */
export function clampNum(raw: string, min: number, max: number): number {
  const n = Number(raw.replace(",", "."))
  if (!Number.isFinite(n)) return 0
  return Math.min(max, Math.max(min, n))
}

/** Libellés des 5 étapes de l'assistant (clés de dictionnaire local). */
export const WIZARD_STEPS: ReadonlyArray<{ n: number; key: string }> = [
  { n: 1, key: "step.1" },
  { n: 2, key: "step.2" },
  { n: 3, key: "step.3" },
  { n: 4, key: "step.4" },
  { n: 5, key: "step.5" },
]

/** Palette du module (émeraude / ambre / terracotta / zinc) pour recharts. */
export const SIM_PALETTE = ["#059669", "#d97706", "#b0563b", "#52525b", "#047857", "#b45309", "#c2410c", "#3f3f46"]
