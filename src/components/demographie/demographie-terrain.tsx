'use client'

// CarbuScope — Onglet « Démographie » de l'Observatoire B2B (T37) : vue du
// module démographique pour les utilisateurs AUTORISÉS par la Super
// Administration (volet Paramétrage). Niveau GOUVERNORATS → tableau des 24
// gouvernorats ; niveau DELEGATIONS → également les 277 délégations. Édition
// en ligne si accordée (canEdit) — mêmes validations serveur et même audit
// que la Super Administration, via /api/demographie (lecture + écriture).

import { Fragment, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Eye, Info, Loader2, Lock, PencilLine, Search, Table2, Users } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAppStore } from "@/store/app-store"
import { DEMO_ACCOUNTS_MAP } from "@/lib/demo-accounts"
import { type DemographicAccessLevel, type DemographicDelegationDTO, type DemographicGouvernoratDTO } from "@/lib/saas"
import { fmtDate, timeAgo } from "@/components/superadmin/sa-shared"
import { DemographieGouvernoratsPanel } from "./demographie-gouvernorats"
import { EditableCell } from "@/components/superadmin/sa-demographie"

const fmtInt = (v: number) => new Intl.NumberFormat("fr-FR").format(v)
const fmtPct = (v: number) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`

/** Recherche insensible à la casse et aux accents. */
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

interface TerrainPage {
  access: { level: DemographicAccessLevel; canEdit: boolean }
  governorats: DemographicGouvernoratDTO[]
  delegations: DemographicDelegationDTO[]
}

/** Cellules de lecture seule d'une délégation (accès sans édition). */
function DelegationStaticCells({ row }: { row: DemographicDelegationDTO }) {
  const cells: { v: number | null; pct?: boolean }[] = [
    { v: row.urbanPct, pct: true },
    { v: row.ruralPct, pct: true },
    { v: row.population },
    { v: row.vehiclesLight },
    { v: row.vehiclesUtility },
    { v: row.vehiclesHeavy },
    { v: row.vehiclesBuses },
    { v: row.vehiclesMotorcycles },
  ]
  return (
    <>
      {cells.map((c, i) => (
        <TableCell key={i} className="text-right font-mono text-xs tabular-nums">
          <span className={c.v === null ? "text-muted-foreground/50" : ""}>
            {c.v === null ? "—" : c.pct ? fmtPct(c.v) : fmtInt(c.v)}
          </span>
        </TableCell>
      ))}
    </>
  )
}

export function DemographieTerrain() {
  const userId = useAppStore(s => s.userId)
  const email = userId ? DEMO_ACCOUNTS_MAP[userId]?.email ?? null : null

  const [page, setPage] = useState<TerrainPage | null>(null)
  const [denied, setDenied] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Onglet Délégations (niveau DELEGATIONS uniquement)
  const [query, setQuery] = useState("")
  const [govFilter, setGovFilter] = useState("TOUS")

  useEffect(() => {
    let alive = true
    if (!email) return // compte sans e-mail démo → rendu « accès refusé » dérivé
    fetch(`/api/demographie?email=${encodeURIComponent(email)}`)
      .then(async r => {
        const j = await r.json().catch(() => null)
        if (!r.ok || !j) throw new Error(j?.error ?? "Impossible de charger le module Démographie")
        if (j.access === null) {
          if (alive) { setDenied(true); setPage(null) }
          return
        }
        if (alive) { setDenied(false); setLoadError(null); setPage({ access: j.access, governorats: j.governorats ?? [], delegations: j.delegations ?? [] }) }
      })
      .catch(e => { if (alive) setLoadError(e instanceof Error ? e.message : "Erreur inconnue") })
    return () => { alive = false }
  }, [email])

  // ---- Délégations visibles (niveau DELEGATIONS) ----

  const groups = useMemo(() => {
    if (!page || page.access.level !== "DELEGATIONS") return []
    const q = norm(query.trim())
    return page.governorats
      .filter(g => govFilter === "TOUS" || govFilter === g.name)
      .map(gov => ({ gov, rows: page.delegations.filter(d => d.gouvernorat === gov.name) }))
      .map(({ gov, rows }) => {
        if (!q) return { gov, rows }
        if (norm(gov.name).includes(q)) return { gov, rows }
        return { gov, rows: rows.filter(r => norm(r.delegation).includes(q)) }
      })
      .filter(({ rows }) => rows.length > 0)
  }, [page, query, govFilter])

  const visibleRows = useMemo(() => groups.reduce((n, g) => n + g.rows.length, 0), [groups])

  // ---- Écritures (si canEdit) : POST /api/demographie, optimiste + rollback ----

  const saveDelegation = (row: DemographicDelegationDTO, patch: Record<string, number | null>) => {
    if (!page || !email) return
    const prevRow = row
    const optimistic: DemographicDelegationDTO = { ...row, ...patch, updatedAt: new Date().toISOString(), updatedBy: email }
    setPage(p => p ? { ...p, delegations: p.delegations.map(r => (r.id === row.id ? optimistic : r)) } : p)
    fetch("/api/demographie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, action: "maj-delegation", id: row.id, values: patch }),
    })
      .then(async r => {
        const j = await r.json().catch(() => null)
        if (!r.ok || !j?.delegation) throw new Error(j?.error ?? "Échec de l'enregistrement")
        setPage(p => p ? { ...p, delegations: p.delegations.map(x => (x.id === row.id ? j.delegation : x)) } : p)
        toast.success(`${row.delegation} — mis à jour`)
      })
      .catch(e => {
        setPage(p => p ? { ...p, delegations: p.delegations.map(x => (x.id === row.id ? prevRow : x)) } : p)
        toast.error(e instanceof Error ? e.message : "Erreur inconnue")
      })
  }

  const commitDelegation = (row: DemographicDelegationDTO, field: string, value: number | null) => {
    const patch: Record<string, number | null> = { [field]: value }
    if (field === "urbanPct" && value !== null) patch.ruralPct = Math.round((100 - value) * 10) / 10
    if (field === "ruralPct" && value !== null) patch.urbanPct = Math.round((100 - value) * 10) / 10
    const entries = Object.entries(patch).filter(([k, v]) => (row as unknown as Record<string, number | null>)[k] !== v)
    if (entries.length === 0) return
    saveDelegation(row, Object.fromEntries(entries) as Record<string, number | null>)
  }

  const saveGouvernorat = (row: DemographicGouvernoratDTO, patch: Record<string, number | null>) => {
    if (!page || !email) return
    const prevRow = row
    const optimistic: DemographicGouvernoratDTO = { ...row, ...patch, updatedAt: new Date().toISOString(), updatedBy: email }
    setPage(p => p ? { ...p, governorats: p.governorats.map(g => (g.id === row.id ? optimistic : g)) } : p)
    fetch("/api/demographie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, action: "maj-gouvernorat", id: row.id, values: patch }),
    })
      .then(async r => {
        const j = await r.json().catch(() => null)
        if (!r.ok || !j?.governorat) throw new Error(j?.error ?? "Échec de l'enregistrement")
        setPage(p => p ? { ...p, governorats: p.governorats.map(g => (g.id === row.id ? j.governorat : g)) } : p)
        toast.success(`${row.name} — mis à jour`)
      })
      .catch(e => {
        setPage(p => p ? { ...p, governorats: p.governorats.map(g => (g.id === row.id ? prevRow : g)) } : p)
        toast.error(e instanceof Error ? e.message : "Erreur inconnue")
      })
  }

  // ---- Rendu ----

  if (loadError) {
    return (
      <Alert variant="destructive" className="m-4 md:m-6">
        <Info aria-hidden />
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    )
  }

  if (denied || !email) {
    return (
      <div className="p-4 md:p-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Lock className="h-6 w-6" aria-hidden />
            </span>
            <p className="text-sm font-semibold">Aucun accès au module Démographie</p>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              La visibilité de ce module est paramétrée par la Super Administration de CarbuScope
              (volet « Paramétrage »). Contactez votre administrateur si vous y avez droit.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!page) {
    return (
      <div className="p-4 md:p-6">
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement du module Démographie…
          </CardContent>
        </Card>
      </div>
    )
  }

  const canEdit = page.access.canEdit

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* En-tête du module */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              <Users className="h-5.5 w-5.5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight">Démographie — statistiques territoriales</h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Population, urbanisation et parc automobile de la Tunisie (source INS 2024) —
                {page.access.level === "DELEGATIONS"
                  ? ` ${page.governorats.length} gouvernorats et ${page.delegations.length} délégations.`
                  : ` ${page.governorats.length} gouvernorats.`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5 border-emerald-300 bg-emerald-50 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
              <Eye className="h-3.5 w-3.5" aria-hidden />
              {page.access.level === "DELEGATIONS" ? "Gouvernorats + délégations" : "Gouvernorats"}
            </Badge>
            <Badge variant="outline" className={`gap-1.5 text-[11px] font-medium ${canEdit
              ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
              : "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"}`}>
              {canEdit ? <PencilLine className="h-3.5 w-3.5" aria-hidden /> : <Lock className="h-3.5 w-3.5" aria-hidden />}
              {canEdit ? "Édition autorisée" : "Lecture seule"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Gouvernorats (vue gouvernorat) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Table2 className="h-4 w-4 text-emerald-600" aria-hidden /> Gouvernorats
          </CardTitle>
          <CardDescription>
            Référence INS 2024 : population, parts hommes/femmes, superficie, urbanisation et parc
            automobile{canEdit ? " — cliquez sur une cellule pour la modifier (urbain + rural = 100 %)" : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DemographieGouvernoratsPanel governorats={page.governorats} canEdit={canEdit} onCommit={saveGouvernorat} />
        </CardContent>
      </Card>

      {/* Délégations (niveau DELEGATIONS) */}
      {page.access.level === "DELEGATIONS" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-emerald-600" aria-hidden /> Délégations
            </CardTitle>
            <CardDescription>
              Une ligne par délégation : population, taux urbain/rural et parc automobile par
              catégorie{canEdit ? " — édition en ligne au clic" : " (valeurs alimentées par la Super Administration)"}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Rechercher une délégation ou un gouvernorat…"
                  className="pl-8"
                  aria-label="Rechercher une délégation ou un gouvernorat"
                />
              </div>
              <Select value={govFilter} onValueChange={setGovFilter}>
                <SelectTrigger className="sm:w-56" aria-label="Filtrer par gouvernorat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="TOUS">Tous les gouvernorats</SelectItem>
                  {page.governorats.map(g => (
                    <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="whitespace-nowrap text-xs text-muted-foreground" aria-live="polite">
                {visibleRows} / {page.delegations.length} délégations
              </span>
            </div>

            <div
              className="max-h-[65vh] overflow-auto rounded-xl border"
              role="region"
              aria-label="Tableau démographique des délégations"
              tabIndex={0}
            >
              <Table className="table-fixed" style={{ width: 1168 }}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 top-0 z-30 w-32 bg-background">Gouvernorat</TableHead>
                    <TableHead className="sticky left-32 top-0 z-30 w-44 bg-background">Délégation</TableHead>
                    <TableHead className="sticky top-0 z-20 w-20 bg-background text-right" title="Taux d'urbanisation (%)">Urbain</TableHead>
                    <TableHead className="sticky top-0 z-20 w-20 bg-background text-right" title="Taux de ruralité (%)">Rural</TableHead>
                    <TableHead className="sticky top-0 z-20 w-28 bg-background text-right">Population</TableHead>
                    <TableHead className="sticky top-0 z-20 w-24 bg-background text-right" title="Voitures légères">Véh. légères</TableHead>
                    <TableHead className="sticky top-0 z-20 w-24 bg-background text-right" title="Utilitaires & pick-up">Utilitaires</TableHead>
                    <TableHead className="sticky top-0 z-20 w-24 bg-background text-right">Poids lourds</TableHead>
                    <TableHead className="sticky top-0 z-20 w-24 bg-background text-right" title="Autocars & bus">Autocars</TableHead>
                    <TableHead className="sticky top-0 z-20 w-24 bg-background text-right" title="Deux-roues motorisés">Deux-roues</TableHead>
                    <TableHead className="sticky top-0 z-20 w-28 bg-background text-right">Modifié</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
                        Aucune délégation ne correspond à la recherche.
                      </TableCell>
                    </TableRow>
                  )}
                  {groups.map(({ gov, rows }) => (
                    <Fragment key={gov.id}>
                      <TableRow className="bg-emerald-50/70 hover:bg-emerald-100/70 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40">
                        <TableCell colSpan={11} className="py-2">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <Badge variant="outline" className="border-emerald-300 bg-emerald-100/80 font-mono text-[10px] text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                              {gov.isoCode ?? "—"}
                            </Badge>
                            <span className="text-sm font-semibold">{gov.name}</span>
                            <span className="text-[11px] leading-relaxed text-muted-foreground">
                              {fmtInt(gov.population)} hab. · H {gov.menPct !== null ? fmtPct(gov.menPct) : "—"} / F {gov.womenPct !== null ? fmtPct(gov.womenPct) : "—"} · urbain {gov.urbanPct !== null ? fmtPct(gov.urbanPct) : "—"} · {rows.length} délégation{rows.length > 1 ? "s" : ""}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                      {rows.map(row => (
                        <TableRow key={row.id} className="group">
                          <TableCell className="sticky left-0 z-10 bg-background text-xs text-muted-foreground group-hover:bg-muted/50">
                            <span className="block truncate" title={row.gouvernorat}>{row.gouvernorat}</span>
                          </TableCell>
                          <TableCell className="sticky left-32 z-10 bg-background group-hover:bg-muted/50">
                            <span className="block truncate text-sm font-medium" title={row.delegation}>{row.delegation}</span>
                          </TableCell>
                          {canEdit ? (
                            <>
                              <TableCell className="p-1">
                                <EditableCell row={row} field="urbanPct" kind="pct" ariaName={`Taux urbain — ${row.delegation}`} onCommit={commitDelegation} />
                              </TableCell>
                              <TableCell className="p-1">
                                <EditableCell row={row} field="ruralPct" kind="pct" ariaName={`Taux rural — ${row.delegation}`} onCommit={commitDelegation} />
                              </TableCell>
                              <TableCell className="p-1">
                                <EditableCell row={row} field="population" kind="int" ariaName={`Population — ${row.delegation}`} onCommit={commitDelegation} />
                              </TableCell>
                              <TableCell className="p-1">
                                <EditableCell row={row} field="vehiclesLight" kind="int" ariaName={`Voitures légères — ${row.delegation}`} onCommit={commitDelegation} />
                              </TableCell>
                              <TableCell className="p-1">
                                <EditableCell row={row} field="vehiclesUtility" kind="int" ariaName={`Utilitaires — ${row.delegation}`} onCommit={commitDelegation} />
                              </TableCell>
                              <TableCell className="p-1">
                                <EditableCell row={row} field="vehiclesHeavy" kind="int" ariaName={`Poids lourds — ${row.delegation}`} onCommit={commitDelegation} />
                              </TableCell>
                              <TableCell className="p-1">
                                <EditableCell row={row} field="vehiclesBuses" kind="int" ariaName={`Autocars & bus — ${row.delegation}`} onCommit={commitDelegation} />
                              </TableCell>
                              <TableCell className="p-1">
                                <EditableCell row={row} field="vehiclesMotorcycles" kind="int" ariaName={`Deux-roues motorisés — ${row.delegation}`} onCommit={commitDelegation} />
                              </TableCell>
                            </>
                          ) : (
                            <DelegationStaticCells row={row} />
                          )}
                          <TableCell className="whitespace-nowrap text-right text-[11px] text-muted-foreground">
                            {row.updatedAt ? (
                              <span title={`${fmtDate(row.updatedAt)}${row.updatedBy ? ` — ${row.updatedBy}` : ""}`}>
                                {timeAgo(row.updatedAt)}
                              </span>
                            ) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Alert>
        <Info aria-hidden />
        <AlertDescription>
          Référence : Institut National de la Statistique (recensement 2024) — les valeurs marquées
          « est. » sont des estimations. Ce module est administré par la Super Administration de
          CarbuScope ; votre niveau de visibilité et vos droits d&apos;édition y sont paramétrés.
        </AlertDescription>
      </Alert>
    </div>
  )
}
