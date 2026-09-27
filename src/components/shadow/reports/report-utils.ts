// Shadow Market (T44-e) — utilitaires d'export & rédaction des rapports.
// Téléchargements Blob (CSV « ; » BOM UTF-8, Excel HTML .xls, JSON, GeoJSON)
// + générateurs de synthèses rédigées en français (client-side).

import type {
  ShadowGovLossDTO,
  ShadowOverviewResponse,
  ShadowPointDTO,
  ShadowReportsResponse,
} from "@/lib/types"
import { formatTnd, typologyLabel } from "../shadow-shared"

// ---------------------------------------------------------------------------
// Socle téléchargement
// ---------------------------------------------------------------------------

/** Échappe une valeur pour CSV « ; » (guillemets si séparateur présent). */
function csvEscape(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v)
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Déclenche le téléchargement navigateur d'un Blob. */
function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Horodatage compact pour les noms de fichiers : 2026-09-26. */
export function fileStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// 1 · Rapport mensuel — CSV (synthèse + top menaces + gouvernorats)
// ---------------------------------------------------------------------------

export function downloadMonthlyReportCsv(report: ShadowReportsResponse): void {
  const lines: string[] = []
  lines.push(`Rapport mensuel Shadow Market;${report.monthLabel}`)
  lines.push(`Généré le;${new Date(report.generatedAt).toLocaleString("fr-FR")}`)
  lines.push(`Points actifs;${report.summary.activePoints}`)
  lines.push(`Perte estimée (DT/mois);${report.summary.estLossTnd}`)
  lines.push(`Stations menacées;${report.summary.stationsThreatened}`)
  lines.push(`Nouveaux points;${report.summary.newPoints}`)
  lines.push(`Neutralisations;${report.summary.neutralized}`)
  lines.push(`En attente de validation;${report.summary.pendingValidation}`)
  lines.push(`Gouvernorat le plus touché;${report.summary.topGouvernorat}`)
  lines.push("")
  lines.push("TOP 10 MENACES (stations)")
  lines.push(
    [
      "Rang", "Code station", "Station", "Enseigne", "Gouvernorat", "Délégation",
      "Points", "Volume volé (L/j)", "Perte (DT/mois)", "Niveau", "Distance pire point (m)",
    ].map(csvEscape).join(";"),
  )
  report.topThreats.forEach((t, i) => {
    lines.push(
      [
        i + 1, t.code, t.name, t.brandName, t.gouvernorat, t.delegation,
        t.points, t.volumeStolenLJ, t.lossTnd, t.level,
        t.worstDistanceM === null ? "" : Math.round(t.worstDistanceM),
      ].map(csvEscape).join(";"),
    )
  })
  lines.push("")
  lines.push("PERTES PAR GOUVERNORAT")
  lines.push(["Gouvernorat", "Points", "Volume (L/j)", "Perte (DT/mois)", "Stations menacées", "Niveau"].map(csvEscape).join(";"))
  for (const g of report.govLosses) {
    lines.push([g.gouvernorat, g.points, g.volumeLJ, g.lossTnd, g.stationsThreatened, g.level].map(csvEscape).join(";"))
  }
  if (report.recommendations.length) {
    lines.push("")
    lines.push("RECOMMANDATIONS")
    report.recommendations.forEach((r, i) => lines.push(`${i + 1};${csvEscape(r)}`))
  }
  const csv = `\uFEFF${lines.join("\r\n")}`
  downloadBlob(`shadow-rapport-${report.month}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }))
}

// ---------------------------------------------------------------------------
// 2 · Points — CSV (export brut, séparateur « ; », BOM UTF-8)
// ---------------------------------------------------------------------------

export function downloadPointsCsv(points: ShadowPointDTO[]): void {
  const header = [
    "Code", "Typologie", "Statut", "Gouvernorat", "Délégation", "Cité",
    "Latitude", "Longitude", "Volume (L/j)", "Prix (millimes)", "Perte estimée (DT/mois)",
    "Station la plus proche", "Enseigne menacée", "Distance (m)", "Source", "Rapporteur",
    "Première observation", "Actif", "Notes",
  ]
  const rows = points.map(p => [
    p.code, typologyLabel(p.typologyCode), p.status, p.gouvernorat, p.delegation, p.cite ?? "",
    p.lat, p.lng, p.volumeLJ, p.priceMillimes ?? "", Math.round(p.lossTnd),
    p.nearestStation?.name ?? "", p.nearestStation?.brandName ?? "",
    p.nearestStation ? Math.round(p.nearestStation.distanceM) : "",
    p.source, p.reporter, new Date(p.firstSeenAt).toLocaleDateString("fr-FR"),
    p.active ? "Oui" : "Non", p.notes,
  ].map(csvEscape).join(";"))
  const csv = `\uFEFF${[header.join(";"), ...rows].join("\r\n")}`
  downloadBlob(`shadow-points-${fileStamp()}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }))
}

// ---------------------------------------------------------------------------
// 3 · Points — Excel (table HTML dans un Blob .xls — compatible Excel/LibreOffice)
// ---------------------------------------------------------------------------

const esc = (v: string | number | null | undefined) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export function downloadPointsExcel(points: ShadowPointDTO[]): void {
  const head = `<tr>${[
    "Code", "Typologie", "Statut", "Gouvernorat", "Délégation", "Volume L/j",
    "Prix mill.", "Perte DT/mois", "Station la plus proche", "Distance (m)", "Source", "Rapporteur",
  ]
    .map(h => `<th style="background:#1c1917;color:#fff;padding:4px 6px;font-size:11px">${esc(h)}</th>`)
    .join("")}</tr>`
  const body = points
    .map(
      p => `<tr>${[
        p.code, typologyLabel(p.typologyCode), p.status, p.gouvernorat, p.delegation,
        p.volumeLJ, p.priceMillimes ?? "—", Math.round(p.lossTnd),
        p.nearestStation?.name ?? "—",
        p.nearestStation ? Math.round(p.nearestStation.distanceM) : "—",
        p.source, p.reporter,
      ]
        .map(v => `<td style="padding:3px 6px;font-size:11px;border:1px solid #d6d3d1">${esc(v)}</td>`)
        .join("")}</tr>`,
    )
    .join("")
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"/></head><body>
<table border="1">${head}${body}</table></body></html>`
  downloadBlob(
    `shadow-points-${fileStamp()}.xls`,
    new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" }),
  )
}

// ---------------------------------------------------------------------------
// 4 · JSON — photographie complète de la vue d'ensemble
// ---------------------------------------------------------------------------

export function downloadOverviewJson(overview: ShadowOverviewResponse): void {
  const json = JSON.stringify(overview, null, 2)
  downloadBlob(
    `shadow-overview-${fileStamp()}.json`,
    new Blob([json], { type: "application/json;charset=utf-8" }),
  )
}

// ---------------------------------------------------------------------------
// 5 · GeoJSON — FeatureCollection des points informels
// ---------------------------------------------------------------------------

export function downloadPointsGeoJson(points: ShadowPointDTO[]): void {
  const geo = {
    type: "FeatureCollection",
    name: `Shadow Market — points informels (${fileStamp()})`,
    features: points.map(p => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: {
        code: p.code,
        typology: p.typologyCode,
        typologyLabel: typologyLabel(p.typologyCode),
        volumeLJ: p.volumeLJ,
        lossTnd: Math.round(p.lossTnd),
        gouvernorat: p.gouvernorat,
        delegation: p.delegation,
        cite: p.cite,
        status: p.status,
        active: p.active,
        priceMillimes: p.priceMillimes,
        nearestStation: p.nearestStation?.name ?? null,
        nearestDistanceM: p.nearestStation ? Math.round(p.nearestStation.distanceM) : null,
        source: p.source,
        reporter: p.reporter,
        firstSeenAt: p.firstSeenAt,
      },
    })),
  }
  downloadBlob(
    `shadow-points-${fileStamp()}.geojson`,
    new Blob([JSON.stringify(geo, null, 2)], { type: "application/geo+json;charset=utf-8" }),
  )
}

// ---------------------------------------------------------------------------
// Rédaction — synthèses FR générées client-side
// ---------------------------------------------------------------------------

/** Synthèse nationale rédigée du rapport mensuel (2 paragraphes). */
export function monthlySynthesis(report: ShadowReportsResponse): string[] {
  const s = report.summary
  const p1 =
    `Au terme du recensement continu, ${s.activePoints.toLocaleString("fr-FR")} points de vente informels ` +
    `de carburant sont actifs sur le territoire (${report.monthLabel}). Le préjudice mensuel estimé pour ` +
    `le réseau formel atteint ${formatTnd(s.estLossTnd)}, réparti sur l'ensemble des enseignes — ` +
    `${s.stationsThreatened} stations sont directement menacées par la cannibalisation.`
  const p2 =
    `Le gouvernorat le plus touché est ${s.topGouvernorat || "— (données en constitution)"}. ` +
    `Ce mois, ${s.newPoints} nouveaux points ont été recensés et ${s.neutralized} neutralisés ` +
    `(disparitions constatées). ${s.pendingValidation} signalements restent en attente de validation ` +
    `par la plateforme avant intégration définitive aux analyses.`
  return [p1, p2]
}

/** Recommandations « angle DG » orientées enseigne (client-side). */
export function brandRecommendations(
  brandName: string,
  lossTnd: number,
  sharePct: number,
  stationsThreatened: number,
  topThreat: { name: string; gouvernorat: string; delegation: string; points: number; lossTnd: number } | null,
): string[] {
  const out: string[] = []
  if (topThreat) {
    out.push(
      `Priorité absolue : la station ${topThreat.name} (${topThreat.gouvernorat} — ${topThreat.delegation}) concentre ` +
      `${topThreat.points} points informels à moins de 2 km, pour ${formatTnd(topThreat.lossTnd)} de perte mensuelle — ` +
      `programmer un signalement conjoint aux services de contrôle sur ce site.`,
    )
  }
  out.push(
    `${brandName} supporte ${sharePct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % du préjudice national ` +
    `(${formatTnd(lossTnd)}/mois sur ${stationsThreatened} stations menacées) : demander un rapport de passage hebdomadaire ` +
    `sur les stations classées « Critique » et « Modéré ».`,
  )
  out.push(
    "Mobiliser les contrôleurs terrain via l'application mobile (Recensement parallèle) pour photographier et géolocaliser " +
    "tout nouveau vendeur à moins de 500 m de vos stations — chaque signalement alimente le moteur d'alerte.",
  )
  return out
}

/** Synthèse rédigée « angle DG » : enseigne vs national. */
export function brandSynthesis(
  brandName: string,
  lossTnd: number,
  sharePct: number,
  stationsThreatened: number,
  points: number,
  nationalLossTnd: number,
  monthLabel: string,
): string[] {
  return [
    `${brandName} est directement concerné par le marché parallèle : ${formatTnd(lossTnd)} de marge estimée ` +
    `perdue chaque mois, soit ${sharePct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % du préjudice national ` +
    `(${formatTnd(nationalLossTnd)} — ${monthLabel}). ${stationsThreatened} de vos stations subissent une cannibalisation ` +
    `mesurable, imputable à ${points.toLocaleString("fr-FR")} points informels recensés à proximité de votre réseau.`,
    "Ce rapport isole vos stations et vos pertes : chaque chiffre ci-dessous ne concerne que votre enseigne, " +
    "les données nationales servent uniquement de repère. Les recommandations finales sont orientées décision " +
    "(surveillance renforcée, signalements, actions prix).",
  ]
}

/** Agrégat client-side des pertes d'une enseigne par gouvernorat. */
export function govLossesForBrandStations(
  stations: { gouvernorat: string; points: number; lossTnd: number }[],
): { gouvernorat: string; points: number; lossTnd: number; stations: number }[] {
  const map = new Map<string, { gouvernorat: string; points: number; lossTnd: number; stations: number }>()
  for (const s of stations) {
    const g = map.get(s.gouvernorat) ?? { gouvernorat: s.gouvernorat, points: 0, lossTnd: 0, stations: 0 }
    g.points += s.points
    g.lossTnd += s.lossTnd
    g.stations += 1
    map.set(s.gouvernorat, g)
  }
  return [...map.values()].sort((a, b) => b.lossTnd - a.lossTnd)
}

/** Barre horizontal top gouvernorats (utilisé par plusieurs rapports). */
export function topGov(govLosses: ShadowGovLossDTO[], n = 8): ShadowGovLossDTO[] {
  return [...govLosses].sort((a, b) => b.lossTnd - a.lossTnd).slice(0, n)
}

// ---------------------------------------------------------------------------
// 6 · CSV générique multi-sections (rapport personnalisé)
// ---------------------------------------------------------------------------

export function downloadTableCsv(
  filename: string,
  meta: [string, string | number][],
  sections: { title: string; header: string[]; rows: (string | number | null)[][] }[],
): void {
  const lines: string[] = []
  for (const [k, v] of meta) lines.push(`${csvEscape(k)};${csvEscape(v)}`)
  for (const s of sections) {
    lines.push("")
    lines.push(s.title.toUpperCase())
    if (s.header.length) lines.push(s.header.map(csvEscape).join(";"))
    for (const row of s.rows) lines.push(row.map(csvEscape).join(";"))
  }
  downloadBlob(filename, new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" }))
}
