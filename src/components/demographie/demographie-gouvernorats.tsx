'use client'

// CarbuScope — Module Démographie (T37) : tableau des 24 gouvernorats
// (vue « Gouvernorat »). Partagé entre la Super Administration (édition en
// ligne, complément automatique urbain↔rural et hommes↔femmes) et
// l'Observatoire B2B des utilisateurs autorisés (lecture, édition si accordée
// par le volet Paramétrage). Colonnes : identité + INS 2024 + parc historique.

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Loader2, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { DemographicGouvernoratDTO } from "@/lib/saas"
import { timeAgo } from "@/components/superadmin/sa-shared"

// ---- Helpers ----

const fmtInt = (v: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v)
const fmtPct = (v: number) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`
const fmt1 = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })

/** « 52 400 » ou « 78,5 » → nombre (espaces et virgule acceptés). */
function parseNumFr(raw: string): number {
  const t = raw.trim().replace(/\s/g, "").replace(",", ".")
  if (t === "") return NaN
  const v = Number(t)
  return Number.isFinite(v) ? v : NaN
}

/** Recherche insensible à la casse et aux accents. */
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

type GouvCellKind = "int" | "pct" | "km2" | "ans"

function displayValue(v: number, kind: GouvCellKind): string {
  switch (kind) {
    case "pct": return fmtPct(v)
    case "km2": return fmtInt(v)
    case "ans": return fmt1(v)
    default: return fmtInt(v)
  }
}

// ---- Cellule éditable en ligne (volet Gouvernorats) ----

function GouvEditableCell({ row, field, kind, required, ariaName, canEdit, onCommit }: {
  row: DemographicGouvernoratDTO
  field: string
  kind: GouvCellKind
  required: boolean
  ariaName: string
  canEdit: boolean
  onCommit: (row: DemographicGouvernoratDTO, patch: Record<string, number | null>) => void
}) {
  const value = (row as unknown as Record<string, number | null>)[field] ?? null
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const display = value === null ? "—" : displayValue(value, kind)

  if (!canEdit) {
    return (
      <span className={`block w-full px-2 text-right font-mono text-xs tabular-nums ${value === null ? "text-muted-foreground/50" : "text-foreground"}`}>
        {display}
      </span>
    )
  }

  const tryCommit = (fromBlur: boolean) => {
    const t = draft.trim()
    if (t === "") {
      setEditing(false)
      if (required) {
        if (!fromBlur) toast.error("Valeur requise — ce champ alimente les vues transversales")
        return
      }
      if (value !== null) onCommit(row, { [field]: null })
      return
    }
    const v = parseNumFr(t)
    let invalid = !Number.isFinite(v) || v < 0
    if (!invalid && kind === "int" && !Number.isInteger(v)) invalid = true
    if (!invalid && (kind === "pct") && v > 100) invalid = true
    if (!invalid && kind === "km2" && (v <= 0 || v > 100_000)) invalid = true
    if (!invalid && kind === "ans" && v > 50) invalid = true
    if (invalid) {
      if (fromBlur) { setEditing(false); return }
      toast.error(kind === "pct"
        ? "Nombre entre 0 et 100 attendu"
        : kind === "km2"
          ? "Superficie positive (km²) attendue"
          : kind === "ans"
            ? "Nombre entre 0 et 50 attendu"
            : "Nombre entier positif attendu")
      return
    }
    setEditing(false)
    const rounded = Math.round(v * 10) / 10
    if (rounded !== value) onCommit(row, { [field]: rounded })
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); tryCommit(false) }
          if (e.key === "Escape") { e.preventDefault(); setEditing(false) }
        }}
        onBlur={() => tryCommit(true)}
        inputMode={kind === "int" ? "numeric" : "decimal"}
        className="h-8 w-full min-w-0 rounded-md border border-emerald-400 bg-background px-2 text-right font-mono text-xs tabular-nums shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-emerald-600"
        aria-label={ariaName}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(value === null ? "" : String(value)); setEditing(true) }}
      className={`inline-flex h-8 w-full items-center justify-end rounded-md px-2 font-mono text-xs tabular-nums transition-colors hover:bg-emerald-100/80 hover:font-semibold dark:hover:bg-emerald-950/70 ${value === null ? "text-muted-foreground/50" : "text-foreground"}`}
      title="Cliquer pour modifier"
      aria-label={`${ariaName} : ${value === null ? "non renseigné" : display} — cliquer pour modifier`}
    >
      {display}
    </button>
  )
}

// ---- Panneau « Gouvernorats » ----

export function DemographieGouvernoratsPanel({ governorats, canEdit, onCommit, toolbar }: {
  governorats: DemographicGouvernoratDTO[]
  canEdit: boolean
  onCommit: (row: DemographicGouvernoratDTO, patch: Record<string, number | null>) => void
  /** Complément de barre d'outils (import/export) — reçoit les lignes filtrées. */
  toolbar?: (filtered: DemographicGouvernoratDTO[]) => React.ReactNode
}) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = norm(query.trim())
    if (!q) return governorats
    return governorats.filter(g => norm(g.name).includes(q) || norm(g.isoCode ?? "").includes(q))
  }, [governorats, query])

  const commitCell = (row: DemographicGouvernoratDTO, patch: Record<string, number | null>) => {
    const merged: Record<string, number | null> = { ...patch }
    // Compléments automatiques : urbain + rural = 100 %, hommes + femmes = 100 %
    if (patch.urbanPct !== undefined && patch.urbanPct !== null) merged.ruralPct = Math.round((100 - patch.urbanPct) * 10) / 10
    if (patch.ruralPct !== undefined && patch.ruralPct !== null) merged.urbanPct = Math.round((100 - patch.ruralPct) * 10) / 10
    if (patch.menPct !== undefined && patch.menPct !== null) merged.womenPct = Math.round((100 - patch.menPct) * 10) / 10
    if (patch.womenPct !== undefined && patch.womenPct !== null) merged.menPct = Math.round((100 - patch.womenPct) * 10) / 10
    // Les champs requis ne peuvent pas être effacés : retirés s'ils valent null
    for (const f of ["population", "vehicles", "motorizationRate", "avgFleetAge"]) {
      if (merged[f] === null) delete merged[f]
    }
    const entries = Object.entries(merged).filter(([k, v]) => (row as unknown as Record<string, number | null>)[k] !== v)
    if (entries.length === 0) return
    onCommit(row, Object.fromEntries(entries) as Record<string, number | null>)
  }

  if (governorats.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border bg-card p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Aucun gouvernorat chargé…
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher un gouvernorat ou un code ISO…"
            className="pl-8"
            aria-label="Rechercher un gouvernorat"
          />
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <span className="whitespace-nowrap text-xs text-muted-foreground" aria-live="polite">
            {filtered.length} / {governorats.length} gouvernorats
          </span>
          {toolbar?.(filtered)}
        </div>
      </div>

      <div
        className="max-h-[65vh] overflow-auto rounded-xl border"
        role="region"
        aria-label="Tableau démographique des gouvernorats (INS 2024)"
        tabIndex={0}
      >
        <Table className="table-fixed" style={{ width: 1140 }}>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 top-0 z-30 w-[168px] bg-background">Gouvernorat</TableHead>
              <TableHead className="sticky top-0 z-20 w-24 bg-background text-right">Population</TableHead>
              <TableHead className="sticky top-0 z-20 w-20 bg-background text-right" title="Part des hommes (%)">Hommes</TableHead>
              <TableHead className="sticky top-0 z-20 w-20 bg-background text-right" title="Part des femmes (%)">Femmes</TableHead>
              <TableHead className="sticky top-0 z-20 w-24 bg-background text-right" title="Superficie (km²)">Superficie</TableHead>
              <TableHead className="sticky top-0 z-20 w-20 bg-background text-right" title="Taux d'urbanisation (%)">Urbain</TableHead>
              <TableHead className="sticky top-0 z-20 w-20 bg-background text-right" title="Taux de ruralité (%)">Rural</TableHead>
              <TableHead className="sticky top-0 z-20 w-24 bg-background text-right" title="Parc automobile total (historique)">Véhicules</TableHead>
              <TableHead className="sticky top-0 z-20 w-24 bg-background text-right" title="Taux de motorisation (%)">Motorisation</TableHead>
              <TableHead className="sticky top-0 z-20 w-20 bg-background text-right" title="Âge moyen du parc (ans)">Âge parc</TableHead>
              <TableHead className="sticky top-0 z-20 w-20 bg-background text-right">Délégations</TableHead>
              <TableHead className="sticky top-0 z-20 w-28 bg-background text-right">Modifié</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="py-8 text-center text-sm text-muted-foreground">
                  Aucun gouvernorat ne correspond à la recherche.
                </TableCell>
              </TableRow>
            )}
            {filtered.map(row => (
              <TableRow key={row.id} className="group">
                <TableCell className="sticky left-0 z-10 bg-background group-hover:bg-muted/50">
                  <div className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1.5">
                      <span className="block truncate text-sm font-semibold" title={row.name}>{row.name}</span>
                      {row.estimated && (
                        <Badge variant="outline" className="shrink-0 border-amber-300 bg-amber-50 px-1 py-0 text-[9px] font-semibold text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          est.
                        </Badge>
                      )}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">{row.isoCode ?? "—"}</span>
                  </div>
                </TableCell>
                <TableCell className="p-1">
                  <GouvEditableCell row={row} field="population" kind="int" required ariaName={`Population — ${row.name}`} canEdit={canEdit} onCommit={commitCell} />
                </TableCell>
                <TableCell className="p-1">
                  <GouvEditableCell row={row} field="menPct" kind="pct" required={false} ariaName={`Part des hommes — ${row.name}`} canEdit={canEdit} onCommit={commitCell} />
                </TableCell>
                <TableCell className="p-1">
                  <GouvEditableCell row={row} field="womenPct" kind="pct" required={false} ariaName={`Part des femmes — ${row.name}`} canEdit={canEdit} onCommit={commitCell} />
                </TableCell>
                <TableCell className="p-1">
                  <GouvEditableCell row={row} field="areaKm2" kind="km2" required={false} ariaName={`Superficie — ${row.name}`} canEdit={canEdit} onCommit={commitCell} />
                </TableCell>
                <TableCell className="p-1">
                  <GouvEditableCell row={row} field="urbanPct" kind="pct" required={false} ariaName={`Taux urbain — ${row.name}`} canEdit={canEdit} onCommit={commitCell} />
                </TableCell>
                <TableCell className="p-1">
                  <GouvEditableCell row={row} field="ruralPct" kind="pct" required={false} ariaName={`Taux rural — ${row.name}`} canEdit={canEdit} onCommit={commitCell} />
                </TableCell>
                <TableCell className="p-1">
                  <GouvEditableCell row={row} field="vehicles" kind="int" required ariaName={`Parc automobile — ${row.name}`} canEdit={canEdit} onCommit={commitCell} />
                </TableCell>
                <TableCell className="p-1">
                  <GouvEditableCell row={row} field="motorizationRate" kind="pct" required ariaName={`Taux de motorisation — ${row.name}`} canEdit={canEdit} onCommit={commitCell} />
                </TableCell>
                <TableCell className="p-1">
                  <GouvEditableCell row={row} field="avgFleetAge" kind="ans" required ariaName={`Âge moyen du parc — ${row.name}`} canEdit={canEdit} onCommit={commitCell} />
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {row.delegationCount}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right text-[11px] text-muted-foreground">
                  {row.updatedAt ? (
                    <span title={`${row.updatedAt}${row.updatedBy ? ` — ${row.updatedBy}` : ""}`}>
                      {timeAgo(row.updatedAt)}
                    </span>
                  ) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

/** Colonnes d'export du volet Gouvernorats (partagées avec l'import). */
export const GOV_EXPORT_COLUMNS = [
  { key: "name", label: "Gouvernorat", type: "text" as const },
  { key: "isoCode", label: "Code ISO", type: "text" as const },
  { key: "population", label: "Population", type: "int" as const },
  { key: "menPct", label: "Hommes (%)", type: "pct" as const },
  { key: "womenPct", label: "Femmes (%)", type: "pct" as const },
  { key: "areaKm2", label: "Superficie (km²)", type: "km2" as const },
  { key: "urbanPct", label: "Urbain (%)", type: "pct" as const },
  { key: "ruralPct", label: "Rural (%)", type: "pct" as const },
  { key: "vehicles", label: "Véhicules", type: "int" as const },
  { key: "motorizationRate", label: "Motorisation (%)", type: "pct" as const },
  { key: "avgFleetAge", label: "Âge du parc (ans)", type: "ans" as const },
  { key: "delegationCount", label: "Délégations", type: "int" as const },
  { key: "estimatedLabel", label: "Estimation", type: "text" as const },
  { key: "updatedBy", label: "Modifié par", type: "text" as const },
  { key: "updatedAtLabel", label: "Modifié le", type: "text" as const },
]
