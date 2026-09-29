'use client'

// Super Administration — Module Démographie (T45) : volet « Cités » — 3ᵉ
// niveau du découpage administratif (gouvernorat → délégation → cité). Tableau
// paginé et filtrable (recherche + filtres gouvernorat/délégation liés),
// édition en ligne au clic (population, urbain, parc par catégorie — pattern
// du volet Délégations), suppression en 2 clics, barre import/export
// (DemographieIoBar scope « cites ») et « Modèle d'import véhicules » — c'est
// l'alimentation en masse des véhicules 🚗 à la granularité cité.

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Building2, ChevronLeft, ChevronRight, FileDown, ListFilter, Loader2, MapPin, Search, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { VEHICLE_CATEGORIES, type DemographicCiteDTO } from "@/lib/saas"
import { downloadCitesVehiculesTemplate, type ExportColumn, type ExportRow } from "@/lib/demographie-io"
import { fmtDate, timeAgo } from "./sa-shared"
import { EditableCell } from "./sa-demographie"
import { DemographieIoBar } from "./sa-demographie-io"

const fmtInt = (v: number) => new Intl.NumberFormat("fr-FR").format(v)

/** Recherche insensible à la casse et aux accents. */
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

const PAGE_SIZE = 25

/** Colonnes d'export du volet Cités (l'identité gouvernorat+délégation+cité
 *  sert de clé à l'import ; « Source » et « Total » sont ignorés à l'import). */
export const CITES_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "gouvernorat", label: "Gouvernorat", type: "text" },
  { key: "delegation", label: "Délégation", type: "text" },
  { key: "cite", label: "Cité", type: "text" },
  { key: "population", label: "Population", type: "int" },
  { key: "urbanPct", label: "Urbain (%)", type: "pct" },
  { key: "vehiclesLight", label: "Véh. légères", type: "int" },
  { key: "vehiclesUtility", label: "Utilitaires", type: "int" },
  { key: "vehiclesHeavy", label: "Poids lourds", type: "int" },
  { key: "vehiclesBuses", label: "Autocars", type: "int" },
  { key: "vehiclesMotorcycles", label: "Deux-roues", type: "int" },
  { key: "source", label: "Source", type: "text" },
  { key: "updatedBy", label: "Modifié par", type: "text" },
  { key: "updatedAtLabel", label: "Modifié le", type: "text" },
]

/** Ligne d'export d'une cité (métadonnées pré-formatées). */
function mapCiteRow(r: DemographicCiteDTO): ExportRow {
  return {
    gouvernorat: r.gouvernorat,
    delegation: r.delegation,
    cite: r.cite,
    population: r.population,
    urbanPct: r.urbanPct,
    vehiclesLight: r.vehiclesLight,
    vehiclesUtility: r.vehiclesUtility,
    vehiclesHeavy: r.vehiclesHeavy,
    vehiclesBuses: r.vehiclesBuses,
    vehiclesMotorcycles: r.vehiclesMotorcycles,
    source: r.source,
    updatedBy: r.updatedBy ?? "",
    updatedAtLabel: r.updatedAt ? fmtDate(r.updatedAt) : "",
  }
}

const fleetTotal = (r: DemographicCiteDTO) =>
  VEHICLE_CATEGORIES.reduce((s, v) => s + ((r as unknown as Record<string, number | null>)[v.key] ?? 0), 0)

export function SaDemographieCites({ cites, actor, onRefresh }: {
  cites: DemographicCiteDTO[]
  actor: string
  onRefresh: () => void | Promise<void>
}) {
  // Copie locale (éditions optimistes avec rollback), resynchronisée sur
  // rafraîchissement du référentiel (pattern du volet Paramétrage).
  const [rows, setRows] = useState<DemographicCiteDTO[]>(cites)
  useEffect(() => { setRows(cites) }, [cites])

  const [query, setQuery] = useState("")
  const [govFilter, setGovFilter] = useState("TOUS")
  const [delegFilter, setDelegFilter] = useState("TOUS")
  const [pageState, setPageState] = useState(0)
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null)
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (deleteTimer.current) clearTimeout(deleteTimer.current) }, [])

  // ---- Filtres liés gouvernorat → délégation ----

  const governorats = useMemo(() => [...new Set(rows.map(r => r.gouvernorat))].sort(), [rows])
  const delegations = useMemo(() => {
    const pool = govFilter === "TOUS" ? rows : rows.filter(r => r.gouvernorat === govFilter)
    return [...new Set(pool.map(r => r.delegation))].sort()
  }, [rows, govFilter])

  const filtered = useMemo(() => {
    const q = norm(query.trim())
    return rows.filter(r => {
      if (govFilter !== "TOUS" && r.gouvernorat !== govFilter) return false
      if (delegFilter !== "TOUS" && r.delegation !== delegFilter) return false
      if (!q) return true
      return norm(r.cite).includes(q) || norm(r.delegation).includes(q) || norm(r.gouvernorat).includes(q)
    })
  }, [rows, query, govFilter, delegFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const page = Math.min(pageState, pageCount - 1)
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  const stats = useMemo(() => {
    const coveredDelegs = new Set(rows.map(r => `${r.gouvernorat}|${r.delegation}`)).size
    const parc = rows.reduce((s, r) => s + fleetTotal(r), 0)
    return { coveredDelegs, parc }
  }, [rows])

  /** Lignes d'export = vue filtrée courante (toutes pages). */
  const exportRows = useMemo(() => filtered.map(mapCiteRow), [filtered])

  // ---- Écritures (optimiste + rollback + audit serveur) ----

  const saveCite = (row: DemographicCiteDTO, patch: Record<string, number | null>) => {
    const prevRow = row
    const optimistic: DemographicCiteDTO = { ...row, ...patch, updatedAt: new Date().toISOString(), updatedBy: actor }
    setRows(rs => rs.map(r => (r.id === row.id ? optimistic : r)))
    fetch("/api/super/demographie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "maj-cite", id: row.id, values: patch, actor }),
    })
      .then(async r => {
        const j = await r.json().catch(() => null)
        if (!r.ok || !j?.cite) throw new Error(j?.error ?? "Échec de l'enregistrement")
        setRows(rs => rs.map(x => (x.id === row.id ? j.cite : x)))
        toast.success(`${row.cite} — mis(e) à jour`)
      })
      .catch(e => {
        setRows(rs => rs.map(x => (x.id === row.id ? prevRow : x)))
        toast.error(e instanceof Error ? e.message : "Erreur inconnue")
      })
  }

  const commitCite = (row: DemographicCiteDTO, field: string, value: number | null) => {
    const current = (row as unknown as Record<string, number | null>)[field] ?? null
    if (current === value) return
    saveCite(row, { [field]: value })
  }

  const removeCite = (row: DemographicCiteDTO) => {
    if (deleteArmed !== row.id) {
      setDeleteArmed(row.id)
      if (deleteTimer.current) clearTimeout(deleteTimer.current)
      deleteTimer.current = setTimeout(() => setDeleteArmed(null), 4000)
      return
    }
    if (deleteTimer.current) clearTimeout(deleteTimer.current)
    setDeleteArmed(null)
    const prevRows = rows
    setRows(rs => rs.filter(r => r.id !== row.id))
    fetch("/api/super/demographie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suppr-cite", id: row.id, actor }),
    })
      .then(async r => {
        const j = await r.json().catch(() => null)
        if (!r.ok || !j?.deleted) throw new Error(j?.error ?? "Échec de la suppression")
        toast.success(`Cité supprimée — ${j.cite}`)
        void onRefresh()
      })
      .catch(e => {
        setRows(prevRows)
        toast.error(e instanceof Error ? e.message : "Erreur inconnue")
      })
  }

  const filtering = query.trim() !== "" || govFilter !== "TOUS" || delegFilter !== "TOUS"

  // ---- Rendu ----

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground/40" aria-hidden />
          <p className="text-sm font-semibold">Aucune cité dans le référentiel</p>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Le 3ᵉ niveau du découpage (gouvernorat → délégation → cité) est encore vide — exécutez le seed
            <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">prisma/seed-cites.ts</code> ou importez
            vos cités depuis le bouton « Modèle d&apos;import véhicules » puis « Importer ».
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-emerald-600" aria-hidden /> Volet Cités — 3ᵉ niveau du découpage
        </CardTitle>
        <CardDescription>
          Une ligne par cité : population, urbanisation et parc automobile par catégorie — édition en ligne au clic
          (Entrée enregistre, Échap annule, vide efface). L&apos;import en masse (JSON, CSV, XLS, XML) crée ou met à
          jour les cités : c&apos;est l&apos;alimentation en masse des véhicules à la granularité cité.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Chiffres clés du volet */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Cités référencées", value: fmtInt(rows.length) },
            { label: "Délégations couvertes", value: `${stats.coveredDelegs} / 277` },
            { label: "Gouvernorats couverts", value: `${governorats.length} / 24` },
            { label: "Parc cumulé (cités)", value: `${fmtInt(stats.parc)} véh.` },
          ].map(s => (
            <div key={s.label} className="rounded-lg border bg-muted/30 p-2.5 text-center">
              <p className="text-lg font-bold leading-none tabular-nums text-emerald-700 dark:text-emerald-400">{s.value}</p>
              <p className="mt-1 text-[10.5px] leading-tight text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Barre de filtres + import/export */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={e => { setQuery(e.target.value); setPageState(0) }}
              placeholder="Rechercher une cité, une délégation ou un gouvernorat…"
              className="pl-8"
              aria-label="Rechercher une cité, une délégation ou un gouvernorat"
            />
          </div>
          <Select value={govFilter} onValueChange={v => { setGovFilter(v); setDelegFilter("TOUS"); setPageState(0) }}>
            <SelectTrigger className="lg:w-44" aria-label="Filtrer par gouvernorat">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="TOUS">Tous les gouvernorats</SelectItem>
              {governorats.map(g => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={delegFilter} onValueChange={v => { setDelegFilter(v); setPageState(0) }}>
            <SelectTrigger className="lg:w-48" aria-label="Filtrer par délégation">
              <ListFilter className="mr-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="TOUS">{govFilter === "TOUS" ? "Toutes les délégations" : `Toutes — ${govFilter}`}</SelectItem>
              {delegations.map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                downloadCitesVehiculesTemplate()
                toast.success("Modèle d'import téléchargé", {
                  description: "modele-import-cites-vehicules.csv — 3 lignes d'exemple, commentaires inclus.",
                })
              }}
              title="Télécharger un modèle CSV d'import des véhicules par cité (3 lignes d'exemple)"
            >
              <FileDown className="h-3.5 w-3.5" aria-hidden /> Modèle d&apos;import véhicules
            </Button>
            <DemographieIoBar
              scope="cites"
              title="Cités de Tunisie — parc automobile par cité"
              columns={CITES_EXPORT_COLUMNS}
              rows={exportRows}
              actor={actor}
              onRefresh={onRefresh}
            />
          </div>
        </div>

        {/* Tableau des cités */}
        <div
          className="max-h-[65vh] overflow-auto rounded-xl border"
          role="region"
          aria-label="Tableau démographique des cités"
          tabIndex={0}
        >
          <Table className="table-fixed" style={{ width: 1416 }}>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 top-0 z-30 w-32 bg-background">Gouvernorat</TableHead>
                <TableHead className="sticky left-32 top-0 z-30 w-40 bg-background">Délégation</TableHead>
                <TableHead className="sticky left-[288px] top-0 z-30 w-44 bg-background">Cité</TableHead>
                <TableHead className="sticky top-0 z-20 w-24 bg-background text-right">Population</TableHead>
                <TableHead className="sticky top-0 z-20 w-20 bg-background text-right" title="Taux d'urbanisation (%)">Urbain</TableHead>
                <TableHead className="sticky top-0 z-20 w-24 bg-background text-right" title="Voitures légères">Véh. légères</TableHead>
                <TableHead className="sticky top-0 z-20 w-24 bg-background text-right" title="Utilitaires & pick-up">Utilitaires</TableHead>
                <TableHead className="sticky top-0 z-20 w-24 bg-background text-right">Poids lourds</TableHead>
                <TableHead className="sticky top-0 z-20 w-24 bg-background text-right" title="Autocars & bus">Autocars</TableHead>
                <TableHead className="sticky top-0 z-20 w-24 bg-background text-right" title="Deux-roues motorisés">Deux-roues</TableHead>
                <TableHead className="sticky top-0 z-20 w-24 bg-background text-right" title="Somme des 5 catégories">Total véh.</TableHead>
                <TableHead className="sticky top-0 z-20 w-24 bg-background">Source</TableHead>
                <TableHead className="sticky top-0 z-20 w-24 bg-background text-right">Modifié</TableHead>
                <TableHead className="sticky top-0 z-20 w-14 bg-background" aria-label="Supprimer la cité"><span className="sr-only">Supprimer</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={14} className="py-8 text-center text-sm text-muted-foreground">
                    Aucune cité ne correspond aux filtres.
                  </TableCell>
                </TableRow>
              )}
              {pageRows.map(row => (
                <TableRow key={row.id} className="group">
                  <TableCell className="sticky left-0 z-10 bg-background text-xs text-muted-foreground group-hover:bg-muted/50">
                    <span className="block truncate" title={row.gouvernorat}>{row.gouvernorat}</span>
                  </TableCell>
                  <TableCell className="sticky left-32 z-10 bg-background text-xs text-muted-foreground group-hover:bg-muted/50">
                    <span className="block truncate" title={row.delegation}>{row.delegation}</span>
                  </TableCell>
                  <TableCell className="sticky left-[288px] z-10 bg-background group-hover:bg-muted/50">
                    <span className="block truncate text-sm font-medium" title={row.cite}>{row.cite}</span>
                  </TableCell>
                  <TableCell className="p-1">
                    <EditableCell row={row} field="population" kind="int" ariaName={`Population — ${row.cite}`} onCommit={commitCite} />
                  </TableCell>
                  <TableCell className="p-1">
                    <EditableCell row={row} field="urbanPct" kind="pct" ariaName={`Taux urbain — ${row.cite}`} onCommit={commitCite} />
                  </TableCell>
                  <TableCell className="p-1">
                    <EditableCell row={row} field="vehiclesLight" kind="int" ariaName={`Voitures légères — ${row.cite}`} onCommit={commitCite} />
                  </TableCell>
                  <TableCell className="p-1">
                    <EditableCell row={row} field="vehiclesUtility" kind="int" ariaName={`Utilitaires — ${row.cite}`} onCommit={commitCite} />
                  </TableCell>
                  <TableCell className="p-1">
                    <EditableCell row={row} field="vehiclesHeavy" kind="int" ariaName={`Poids lourds — ${row.cite}`} onCommit={commitCite} />
                  </TableCell>
                  <TableCell className="p-1">
                    <EditableCell row={row} field="vehiclesBuses" kind="int" ariaName={`Autocars & bus — ${row.cite}`} onCommit={commitCite} />
                  </TableCell>
                  <TableCell className="p-1">
                    <EditableCell row={row} field="vehiclesMotorcycles" kind="int" ariaName={`Deux-roues motorisés — ${row.cite}`} onCommit={commitCite} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                    {fleetTotal(row) > 0 ? fmtInt(fleetTotal(row)) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={row.source === "Import SA"
                        ? "border-violet-300 bg-violet-50 text-[10px] text-violet-700 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-300"
                        : "border-emerald-300/70 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"}
                      title={row.source === "Import SA" ? "Valeurs importées par la Super Administration" : "Chiffres de référence INS 2024"}
                    >
                      {row.source}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-[11px] text-muted-foreground">
                    {row.updatedAt ? (
                      <span title={`${fmtDate(row.updatedAt)}${row.updatedBy ? ` — ${row.updatedBy}` : ""}`}>
                        {timeAgo(row.updatedAt)}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="p-1 text-center">
                    <button
                      type="button"
                      onClick={() => removeCite(row)}
                      title={deleteArmed === row.id ? "Confirmer : supprimer définitivement cette cité" : "Supprimer la cité (2 clics)"}
                      aria-label={deleteArmed === row.id ? `Confirmer la suppression de ${row.cite}` : `Supprimer ${row.cite}`}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${deleteArmed === row.id
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "text-muted-foreground/60 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950"}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {filtered.length === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} sur{" "}
            {fmtInt(filtered.length)} cité{filtered.length > 1 ? "s" : ""}
            {filtering ? " (vue filtrée)" : ""}
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPageState(page - 1)} aria-label="Page précédente">
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Précédent
            </Button>
            <span className="px-1.5 text-xs tabular-nums text-muted-foreground">
              Page {page + 1} / {pageCount}
            </span>
            <Button variant="outline" size="sm" disabled={page >= pageCount - 1} onClick={() => setPageState(page + 1)} aria-label="Page suivante">
              Suivant <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/** Skeleton du volet Cités pendant le chargement du référentiel. */
export function SaDemographieCitesSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement des cités…
      </CardContent>
    </Card>
  )
}
