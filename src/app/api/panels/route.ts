import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// T63-b — Module « Panneaux publicitaires » (Portail enseigne > Publicité) :
// registre partagé des faces d'affichage proposées aux enseignes pour choisir
// leurs emplacements média (plan d'affichage / plan média).
//
//   GET /api/panels?gouvernorat=&format=&statut=&fluxMin=&prixMax=&search=
//     → { panels: PanelDTO[], total, stats }
//
// DTO : { id, code, nom, format, gouvernorat, delegation, axe, flux,
//         visibilite, illumination, prixSemaine, loueur, statut, reservePar }
//
// Droits : lecture OUVERTE (inventaire partagé, filtrage côté client pour la
// réactivité des curseurs) ; les filtres serveur restent disponibles pour les
// intégrations API. Les mutations vivent dans /api/panels/[id] (réservation).

const STATUTS = new Set(["DISPONIBLE", "RESERVE", "LOUE"])

function serializePanel(p: {
  id: string; code: string; nom: string; format: string; gouvernorat: string;
  delegation: string; axe: string; flux: number; visibilite: number;
  illumination: boolean; prixSemaine: number; loueur: string;
  statut: string; reservePar: string | null;
}) {
  return {
    id: p.id,
    code: p.code,
    nom: p.nom,
    format: p.format,
    gouvernorat: p.gouvernorat,
    delegation: p.delegation,
    axe: p.axe,
    flux: p.flux,
    visibilite: p.visibilite,
    illumination: p.illumination,
    prixSemaine: p.prixSemaine,
    loueur: p.loueur,
    statut: p.statut,
    reservePar: p.reservePar,
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const gouvernorat = (sp.get("gouvernorat") ?? "").trim()
  const format = (sp.get("format") ?? "").trim().toLowerCase()
  const statut = (sp.get("statut") ?? "").trim().toUpperCase()
  const fluxMin = Number(sp.get("fluxMin") ?? 0)
  const prixMax = Number(sp.get("prixMax") ?? 0)
  const search = (sp.get("search") ?? "").trim()

  const where: Record<string, unknown> = {}
  if (gouvernorat) where.gouvernorat = gouvernorat
  if (format) where.format = format
  if (STATUTS.has(statut)) where.statut = statut
  if (Number.isFinite(fluxMin) && fluxMin > 0) where.flux = { gte: Math.floor(fluxMin) }
  if (Number.isFinite(prixMax) && prixMax > 0) where.prixSemaine = { lte: Math.floor(prixMax) }

  const panels = await db.adPanel.findMany({
    where,
    orderBy: [{ gouvernorat: "asc" }, { flux: "desc" }],
  })

  // Recherche texte post-filtre (nom / axe / délégation / code — insensible
  // aux accents, même normalisation NFD que la Veille).
  const needle = search
    ? search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    : ""
  const filtered = needle
    ? panels.filter(p => {
        const hay = `${p.nom} ${p.axe} ${p.delegation} ${p.code} ${p.gouvernorat} ${p.loueur}`
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        return hay.includes(needle)
      })
    : panels

  // Statistiques transverses (calculées sur le périmètre AVANT recherche
  // texte — le client recalcule localement ce dont il a besoin).
  const all = panels.length ? panels : await db.adPanel.findMany({})
  const dispo = all.filter(p => p.statut === "DISPONIBLE")
  const stats = {
    total: all.length,
    disponibles: dispo.length,
    fluxMoyen: all.length ? Math.round(all.reduce((s, p) => s + p.flux, 0) / all.length) : 0,
    prixMedian: (() => {
      if (!all.length) return 0
      const sorted = [...all].map(p => p.prixSemaine).sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    })(),
    formats: [...new Set(all.map(p => p.format))].sort(),
    gouvernorats: [...new Set(all.map(p => p.gouvernorat))].sort(),
  }

  return NextResponse.json({
    panels: filtered.map(serializePanel),
    total: filtered.length,
    stats,
  })
}
