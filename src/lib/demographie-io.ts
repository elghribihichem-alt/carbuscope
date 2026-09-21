"use client"

// CarbuScope — Module Démographie (T37) : import/export du référentiel.
// Côté navigateur uniquement (Blob + DOMParser). Formats d'export : JSON, CSV,
// XLS (SheetJS), XML, PDF (jsPDF + autotable), Word (HTML .doc). Formats
// d'import (analysables) : JSON, CSV, XLS/XLSX, XML — PDF et Word restent des
// formats de restitution. Toutes les valeurs numériques acceptent la saisie
// FR (« 1 056 247 », « 88,8 », « 88 % »).

import { VEHICLE_CATEGORIES } from "@/lib/saas"

// ---- Types publics ----

export type ExportFormat = "json" | "csv" | "xls" | "xml" | "pdf" | "word"
export type ImportFormat = "json" | "csv" | "xls" | "xml"

export type ExportColumnType = "text" | "int" | "pct" | "float" | "km2" | "ans"

export interface ExportColumn {
  key: string
  label: string
  type: ExportColumnType
}

export type ExportValue = string | number | null
export type ExportRow = Record<string, ExportValue>

export const EXPORT_FORMATS: { value: ExportFormat; label: string; ext: string; hint: string }[] = [
  { value: "json", label: "JSON", ext: "json", hint: "Fichier structuré (API / réimport)" },
  { value: "csv", label: "CSV", ext: "csv", hint: "Tableau texte (Excel FR, séparateur ;)" },
  { value: "xls", label: "XLS", ext: "xlsx", hint: "Classeur Excel (SheetJS)" },
  { value: "xml", label: "XML", ext: "xml", hint: "Échange structuré (balises)" },
  { value: "pdf", label: "PDF", ext: "pdf", hint: "Document imprimable (jsPDF)" },
  { value: "word", label: "Word", ext: "doc", hint: "Document Word (.doc)" },
]

export const IMPORT_FORMATS: { value: ImportFormat; label: string; ext: string; hint: string }[] = [
  { value: "json", label: "JSON", ext: "json", hint: "Réimport d'un export JSON" },
  { value: "csv", label: "CSV", ext: "csv", hint: "Séparateur ; ou , " },
  { value: "xls", label: "XLS", ext: "xlsx", hint: "Excel .xlsx / .xls" },
  { value: "xml", label: "XML", ext: "xml", hint: "Élément <ligne> par record" },
]

export interface ParsedImport {
  format: ImportFormat
  headers: string[]
  rows: Record<string, ExportValue>[]
}

// ---- Helpers ----

const fmtIntFr = (v: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v)
const fmt1Fr = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })

/** « 52 400 » ou « 88,8 » ou « 88 % » → nombre (espaces, % et virgule acceptés). */
export function parseNumFr(raw: string): number {
  const t = raw.trim().replace(/\u00a0|\s/g, "").replace("%", "").replace(",", ".")
  if (t === "") return NaN
  const v = Number(t)
  return Number.isFinite(v) ? v : NaN
}

/** Clé d'en-tête normalisée : minuscules, sans accents, espaces fusionnés. */
const normKey = (s: string) => s
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, " ")
  .trim()

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

const stamp = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

/** Valeur selon le style : « display » = FR lisible (PDF/Word), « raw » =
 *  nombre brut (JSON/XLSX/XML), « csv » = entiers bruts, décimales à la virgule. */
function cellValue(v: ExportValue, type: ExportColumnType, style: "display" | "raw" | "csv"): string {
  if (v === null || v === undefined) return "—"
  if (typeof v === "string") return v
  switch (type) {
    case "int": return style === "display" ? fmtIntFr(v) : String(v)
    case "pct": return style === "display" ? `${fmt1Fr(v)} %` : style === "csv" ? String(v).replace(".", ",") : String(v)
    case "float": case "km2": case "ans":
      return style === "display"
        ? type === "km2" ? `${fmtIntFr(v)} km²` : type === "ans" ? `${fmt1Fr(v)} ans` : fmt1Fr(v)
        : style === "csv" ? String(v).replace(".", ",")
        : String(v)
    default: return String(v)
  }
}

// ---- Export ----

export async function exportDemographie(options: {
  format: ExportFormat
  scope: "gouvernorats" | "delegations"
  title: string
  columns: ExportColumn[]
  rows: ExportRow[]
}): Promise<string> {
  const { format, scope, title, columns, rows } = options
  const base = `carbuscope-demographie-${scope}-${stamp()}`
  const meta = `CarbuScope — Super Administration · module Démographie · ${title} — généré le ${new Date().toLocaleString("fr-FR")}`

  switch (format) {
    case "json": {
      const payload = {
        source: "CarbuScope — module Démographie (INS 2024)",
        perimetre: scope,
        genereLe: new Date().toISOString(),
        colonnes: columns.map(c => c.label),
        lignes: rows.map(r => {
          const o: Record<string, ExportValue> = {}
          for (const c of columns) o[c.key] = r[c.key] ?? null
          return o
        }),
      }
      downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }), `${base}.json`)
      return `${base}.json`
    }

    case "csv": {
      const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
      const head = columns.map(c => esc(c.label)).join(";")
      const body = rows.map(r => columns.map(c => {
        const v = r[c.key] ?? null
        if (v === null) return ""
        return esc(cellValue(v, c.type, "csv"))
      }).join(";")).join("\n")
      // BOM UTF-8 : accents corrects à l'ouverture dans Excel
      downloadBlob(new Blob([`\uFEFF${head}\n${body}`], { type: "text/csv;charset=utf-8" }), `${base}.csv`)
      return `${base}.csv`
    }

    case "xls": {
      const XLSX = await import("xlsx")
      const aoa: (string | number)[][] = [
        columns.map(c => c.label),
        ...rows.map(r => columns.map(c => {
          const v = r[c.key] ?? null
          return v === null ? "" : typeof v === "number" ? v : String(v)
        })),
      ]
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws["!cols"] = columns.map(c => ({ wch: Math.max(12, c.label.length + 2) }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Demographie")
      XLSX.writeFile(wb, `${base}.xlsx`)
      return `${base}.xlsx`
    }

    case "xml": {
      const esc = (s: string) => s
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&apos;")
      const lines = rows.map(r => {
        const cells = columns.map(c => {
          const v = r[c.key] ?? null
          return `<${c.key}>${v === null ? "" : esc(typeof v === "number" ? cellValue(v, c.type, "raw") : v)}</${c.key}>`
        }).join("")
        return `<ligne>${cells}</ligne>`
      }).join("\n    ")
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<demographie source="CarbuScope" perimetre="${scope}" genereLe="${new Date().toISOString()}" lignes="${rows.length}">
  <titre>${esc(title)}</titre>
  <entetes>${columns.map(c => `<colonne cle="${c.key}">${esc(c.label)}</colonne>`).join("")}</entetes>
  <lignes>
    ${lines}
  </lignes>
</demographie>`
      downloadBlob(new Blob([xml], { type: "application/xml;charset=utf-8" }), `${base}.xml`)
      return `${base}.xml`
    }

    case "pdf": {
      const { jsPDF } = await import("jspdf")
      const autoTable = (await import("jspdf-autotable")).default
      const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait", unit: "mm", format: "a4" })
      doc.setFont("helvetica", "bold")
      doc.setFontSize(14)
      doc.setTextColor(6, 78, 59)
      doc.text(title, 14, 16)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(9)
      doc.setTextColor(100, 116, 139)
      doc.text(`CarbuScope — Super Administration · module Démographie · source INS 2024 · ${rows.length} ligne(s)`, 14, 22)
      doc.text(`Généré le ${new Date().toLocaleString("fr-FR")}`, 14, 26.5)
      autoTable(doc, {
        startY: 31,
        head: [columns.map(c => c.label)],
        body: rows.map(r => columns.map(c => {
          const v = r[c.key] ?? null
          return v === null ? "—" : typeof v === "number" ? cellValue(v, c.type, "display") : v
        })),
        styles: { fontSize: 7.5, cellPadding: 1.6, lineColor: [226, 232, 240], lineWidth: 0.15 },
        headStyles: { fillColor: [4, 120, 87], textColor: 255, fontStyle: "bold", fontSize: 7.5 },
        alternateRowStyles: { fillColor: [246, 247, 245] },
        margin: { left: 10, right: 10, top: 31 },
        didDrawPage: () => {
          const page = doc.getNumberOfPages()
          doc.setFontSize(7.5)
          doc.setTextColor(148, 163, 184)
          doc.text(
            `CarbuScope — module Démographie (page ${page})`,
            14, doc.internal.pageSize.getHeight() - 6,
          )
        },
      })
      doc.save(`${base}.pdf`)
      return `${base}.pdf`
    }

    case "word": {
      const th = columns.map(c => `<th style="background:#047857;color:#fff;padding:6px 8px;font-size:11px;text-align:${c.type === "text" ? "left" : "right"}">${c.label}</th>`).join("")
      const tr = rows.map(r => `<tr>${columns.map(c => {
        const v = r[c.key] ?? null
        const txt = v === null ? "—" : typeof v === "number" ? cellValue(v, c.type, "display") : v
        return `<td style="padding:5px 8px;font-size:11px;border:1px solid #e2e8f0;text-align:${c.type === "text" ? "left" : "right"}">${txt}</td>`
      }).join("")}</tr>`).join("")
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:Calibri,Arial,sans-serif">
<h2 style="color:#065f46;margin:0 0 2pt">${title}</h2>
<p style="color:#64748b;font-size:9pt;margin:0 0 10pt">${meta}</p>
<table style="border-collapse:collapse;border:1px solid #cbd5e1"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
</body></html>`
      downloadBlob(new Blob(["\ufeff", html], { type: "application/msword" }), `${base}.doc`)
      return `${base}.doc`
    }
  }
}

// ---- Import ----

/** Analyse un fichier importé (JSON / CSV / XLS / XML) en lignes clé → valeur. */
export async function parseImportFile(file: File): Promise<ParsedImport> {
  const name = file.name.toLowerCase()
  if (name.endsWith(".json")) return { format: "json", ...parseImportJson(await file.text()) }
  if (name.endsWith(".csv")) return { format: "csv", ...parseImportCsv(await file.text()) }
  if (name.endsWith(".xls") || name.endsWith(".xlsx")) return { format: "xls", ...(await parseImportXls(file)) }
  if (name.endsWith(".xml")) return { format: "xml", ...parseImportXml(await file.text()) }
  throw new Error("Format non reconnu — importez un fichier JSON, CSV, XLS ou XML.")
}

function parseImportJson(text: string): { headers: string[]; rows: Record<string, ExportValue>[] } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("JSON invalide — vérifiez le contenu du fichier.")
  }
  const rowsRaw = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { lignes?: unknown[] }).lignes)
      ? (parsed as { lignes: unknown[] }).lignes
      : null
  if (!rowsRaw) throw new Error("JSON inattendu — un tableau de lignes (ou { \"lignes\": […] }) est attendu.")
  const rows = rowsRaw.filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r))
  const headers = [...new Set(rows.flatMap(r => Object.keys(r)))]
  return { headers, rows: rows as Record<string, ExportValue>[] }
}

function parseImportCsv(text: string): { headers: string[]; rows: Record<string, ExportValue>[] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim() !== "")
  if (lines.length < 2) throw new Error("CSV vide ou incomplet — en-tête + lignes attendues.")
  const sep = [";", "\t", ","].map(s => ({ s, n: lines[0].split(s).length })).sort((a, b) => b.n - a.n)[0].s
  const split = (line: string): string[] => {
    const out: string[] = []
    let cur = ""
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i++ }
        else quoted = !quoted
      } else if (ch === sep && !quoted) {
        out.push(cur); cur = ""
      } else cur += ch
    }
    out.push(cur)
    return out.map(s => s.trim())
  }
  const headers = split(lines[0])
  const rows = lines.slice(1).map(line => {
    const cells = split(line)
    const row: Record<string, ExportValue> = {}
    headers.forEach((h, i) => { row[h] = cells[i] ?? "" })
    return row
  })
  return { headers, rows }
}

async function parseImportXls(file: File): Promise<{ headers: string[]; rows: Record<string, ExportValue>[] }> {
  const XLSX = await import("xlsx")
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: "array" })
  const sheetName = wb.SheetNames.find(n => normKey(n).includes("demograph")) ?? wb.SheetNames[0]
  if (!sheetName) throw new Error("Classeur vide — aucune feuille détectée.")
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, blankrows: false })
  if (aoa.length < 2) throw new Error("Feuille vide ou incomplète — en-tête + lignes attendues.")
  const headers = (aoa[0] ?? []).map(h => String(h ?? "").trim())
  const rows = aoa.slice(1).map(line => {
    const row: Record<string, ExportValue> = {}
    headers.forEach((h, i) => {
      const v = line[i]
      row[h] = v === undefined || v === null ? "" : typeof v === "number" ? v : String(v)
    })
    return row
  })
  return { headers, rows }
}

function parseImportXml(text: string): { headers: string[]; rows: Record<string, ExportValue>[] } {
  const doc = new DOMParser().parseFromString(text, "application/xml")
  if (doc.querySelector("parsererror")) throw new Error("XML invalide — vérifiez la structure du fichier.")
  const nodes = Array.from(doc.querySelectorAll("ligne"))
  if (nodes.length === 0) throw new Error("Aucun élément <ligne> trouvé dans le XML.")
  const headers: string[] = []
  const rows = nodes.map(node => {
    const row: Record<string, ExportValue> = {}
    for (const child of Array.from(node.children)) {
      const key = child.tagName
      if (!headers.includes(key)) headers.push(key)
      row[key] = child.textContent?.trim() ?? ""
    }
    return row
  })
  return { headers, rows }
}

// ---- Normalisation (en-têtes FR ou clés → champs API) ----

/** Alias d'en-têtes acceptés pour chaque champ importable (volet Gouvernorats). */
export const GOV_IMPORT_ALIASES: Record<string, string[]> = {
  name: ["gouvernorat", "nom", "name", "gouvernorat (nom)"],
  isoCode: ["code iso", "iso", "isocode", "code", "code iso (tn-xx)"],
  population: ["population", "habitants", "hab", "population (hab.)"],
  menPct: ["hommes (%)", "hommes", "part des hommes (%)", "menpct", "h (%)", "h"],
  womenPct: ["femmes (%)", "femmes", "part des femmes (%)", "womenpct", "f (%)", "f"],
  areaKm2: ["superficie (km²)", "superficie", "km²", "areakm2", "superficie km²"],
  urbanPct: ["urbain (%)", "urbain", "taux urbain (%)", "urbanpct", "taux d'urbanisation (%)", "taux d'urbanisation"],
  ruralPct: ["rural (%)", "rural", "taux rural (%)", "ruralpct", "taux de ruralité (%)", "taux de ruralité"],
  vehicles: ["véhicules", "parc automobile", "parc", "vehicles", "parc total", "véhicules (total)"],
  motorizationRate: ["motorisation (%)", "motorisation", "taux de motorisation (%)", "motorizationrate", "taux de motorisation"],
  avgFleetAge: ["âge du parc (ans)", "âge du parc", "âge moyen du parc (ans)", "âge moyen du parc", "age du parc (ans)", "avgfleetage", "âge moyen"],
}

/** Alias d'en-têtes acceptés pour chaque champ importable (volet Délégations). */
export const DELEG_IMPORT_ALIASES: Record<string, string[]> = {
  gouvernorat: ["gouvernorat"],
  delegation: ["délégation", "delegation", "nom", "name", "délégation (nom)"],
  population: ["population", "habitants", "hab", "population (hab.)"],
  urbanPct: ["urbain (%)", "urbain", "taux urbain (%)", "urbanpct", "taux d'urbanisation (%)"],
  ruralPct: ["rural (%)", "rural", "taux rural (%)", "ruralpct", "taux de ruralité (%)"],
  ...Object.fromEntries(VEHICLE_CATEGORIES.flatMap(v => {
    const base = [v.key, v.label.toLowerCase(), v.short.toLowerCase()]
    switch (v.key) {
      case "vehiclesLight": return [[v.key, [...base, "voitures", "voitures légères"]]]
      case "vehiclesUtility": return [[v.key, [...base, "utilitaires et pick-up", "pick-up"]]]
      case "vehiclesHeavy": return [[v.key, [...base, "pl"]]] 
      case "vehiclesBuses": return [[v.key, [...base, "bus", "autocars et bus"]]]
      case "vehiclesMotorcycles": return [[v.key, [...base, "motocyclettes", "motos", "deux roues"]]]
      default: return [[v.key, base]]
    }
  })),
}

/** Champs numériques (identité = texte, autres = nombres). */
export const GOV_NUMERIC_FIELDS = new Set(["population", "menPct", "womenPct", "areaKm2", "urbanPct", "ruralPct", "vehicles", "motorizationRate", "avgFleetAge"])
export const DELEG_NUMERIC_FIELDS = new Set(["population", "urbanPct", "ruralPct", ...VEHICLE_CATEGORIES.map(v => v.key)])

/** En-têtes volontairement ignorés à l'import (métadonnées d'export). */
const IMPORT_IGNORED_HEADERS = new Set([
  "delegations", "delegation count", "estimation", "est.", "modifie par", "modifie le",
  "derniere modification", "source", "genere le", "genere", "ligne", "code iso (tn-xx)",
])

/** Convertit les lignes analysées en lignes normalisées (clés API). Renvoie
 *  aussi les en-têtes non reconnus pour un retour utilisateur honnête. */
export function normalizeImportRows(
  scope: "gouvernorats" | "delegations",
  parsed: ParsedImport,
): { rows: Record<string, ExportValue>[]; unknownHeaders: string[] } {
  const aliases = scope === "gouvernorats" ? GOV_IMPORT_ALIASES : DELEG_IMPORT_ALIASES
  const numeric = scope === "gouvernorats" ? GOV_NUMERIC_FIELDS : DELEG_NUMERIC_FIELDS
  const map = new Map<string, string>()
  for (const [field, names] of Object.entries(aliases)) {
    for (const n of names) map.set(normKey(n), field)
  }
  const known = new Set(Object.keys(aliases))
  const unknownHeaders: string[] = []
  for (const h of parsed.headers) {
    const nk = normKey(h)
    if (map.has(nk)) continue
    if (!h || nk === "" || IMPORT_IGNORED_HEADERS.has(nk)) continue
    unknownHeaders.push(h)
  }
  const rows = parsed.rows.map(raw => {
    const row: Record<string, ExportValue> = {}
    for (const [header, value] of Object.entries(raw)) {
      const field = map.get(normKey(header))
      if (!field || !known.has(field)) continue
      if (row[field] !== undefined) continue
      if (value === null) { row[field] = null; continue }
      if (typeof value === "number") { row[field] = value; continue }
      const s = String(value).trim()
      if (s === "" || s === "—" || s === "-") { row[field] = null; continue }
      if (numeric.has(field)) {
        const n = parseNumFr(s)
        row[field] = Number.isFinite(n) ? n : s // laissé tel quel → rejet serveur avec message FR
      } else {
        row[field] = s
      }
    }
    return row
  }).filter(r => Object.values(r).some(v => v !== null && v !== ""))
  return { rows, unknownHeaders }
}
