// CarbuScope — Export CSV côté client pour les rapports (A.8)

import { ALERT_TYPE_LABELS, REPORT_TYPE_LABELS, type ReportDTO } from "@/lib/types"

/** Échappe une valeur pour le CSV (séparateur « ; », standard Excel fr) */
function csvEscape(v: string | number): string {
  const s = String(v ?? "")
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(csvEscape).join(";")
}

/** Télécharge un fichier CSV (BOM UTF-8 pour accents Excel) */
function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([`\ufeff${content}`], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function slugify(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "rapport"
}

/**
 * Extrait de données selon le type de rapport (gardé volontairement simple) :
 * CONCURRENCE → parts de marché · IMPLANTATION → stats gouvernorats
 * PERFORMANCE → KPIs réseau · VEILLE → dernières alertes
 */
async function fetchReportExcerpt(type: string): Promise<{ title: string; rows: (string | number)[][] }> {
  try {
    if (type === "CONCURRENCE") {
      const j = (await fetch("/api/stats/market-share").then((r) => r.json())) as {
        data?: { brand: string; stations: number; sharePct: number }[]
      }
      const rows = (j.data ?? []).map((r) => [r.brand, r.stations, `${r.sharePct} %`])
      return { title: "Parts de marché par enseigne", rows: [["Enseigne", "Stations", "Part de marché"], ...rows] }
    }
    if (type === "IMPLANTATION") {
      const j = (await fetch("/api/governorats").then((r) => r.json())) as {
        governorats?: { name: string; population: number; vehicles: number; stations: number }[]
      }
      const rows = (j.governorats ?? []).map((g) => [
        g.name,
        g.population,
        g.vehicles,
        `${g.stations}`,
      ])
      return {
        title: "Potentiel par gouvernorat (population, parc, stations)",
        rows: [["Gouvernorat", "Population", "Véhicules", "Stations"], ...rows],
      }
    }
    if (type === "PERFORMANCE") {
      const j = (await fetch("/api/stats/overview").then((r) => r.json())) as {
        totalNational?: number
        myStations?: number
        marketSharePct?: number
        toRenovate?: number
        underTension?: number
        avgTraffic?: number
        alerts?: { total?: number }
      }
      const rows: (string | number)[][] = [
        ["Indicateur", "Valeur"],
        ["Stations nationales", j.totalNational ?? 0],
        ["Stations de l'enseigne", j.myStations ?? 0],
        ["Part de marché", `${j.marketSharePct ?? 0} %`],
        ["Stations à rénover", j.toRenovate ?? 0],
        ["Stations sous tension", j.underTension ?? 0],
        ["Trafic moyen (véh/j)", j.avgTraffic ?? 0],
        ["Alertes actives", j.alerts?.total ?? 0],
      ]
      return { title: "Performance du réseau", rows }
    }
    // VEILLE (et valeur par défaut)
    const j = (await fetch("/api/alerts?limit=20").then((r) => r.json())) as {
      alerts?: { date: string; type: string; title: string; gouvernorat: string; severity: string }[]
    }
    const rows = (j.alerts ?? []).map((a) => [
      new Date(a.date).toLocaleDateString("fr-FR"),
      ALERT_TYPE_LABELS[a.type] ?? a.type,
      a.title,
      a.gouvernorat,
      a.severity,
    ])
    return { title: "Dernières alertes de veille", rows: [["Date", "Type", "Titre", "Gouvernorat", "Sévérité"], ...rows] }
  } catch {
    return { title: "Extrait de données indisponible", rows: [] }
  }
}

/** Construit et télécharge le CSV récapitulatif d'un rapport (métadonnées + extrait). */
export async function downloadReportCsv(report: ReportDTO): Promise<void> {
  const excerpt = await fetchReportExcerpt(report.type)
  const lines: string[] = [
    csvRow(["Rapport CarbuScope"]),
    csvRow(["Nom", report.name]),
    csvRow(["Type", REPORT_TYPE_LABELS[report.type] ?? report.type]),
    csvRow(["Période", report.period]),
    csvRow(["Périmètre", report.scope]),
    csvRow(["Format demandé", report.format]),
    csvRow(["Généré par", report.generatedBy]),
    csvRow(["Date de génération", new Date(report.createdAt).toLocaleString("fr-FR")]),
    csvRow(["Taille estimée", `${report.sizeKb} Ko`]),
    "",
  ]
  if (excerpt.rows.length > 0) {
    lines.push(csvRow([excerpt.title]))
    for (const row of excerpt.rows) lines.push(csvRow(row))
  }
  downloadCsv(`carbuscope-${slugify(report.type)}-${slugify(report.scope)}.csv`, lines.join("\r\n"))
}
