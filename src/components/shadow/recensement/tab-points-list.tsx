'use client'

// Shadow Market — Recensement, onglet « 📝 Liste des Points » (T44-d).
// Tableau CRUD filtré (statut, typologie, gouvernorat, recherche, inactifs),
// pagination serveur 25/page, fiche détaillée, édition volume/prix/notes et
// disparition (suppression douce), export CSV des points filtrés.

import { useCallback, useEffect, useState } from "react"
import {
  Ban, ChevronLeft, ChevronRight, FileDown, List, Pencil, Search, SearchX, X,
} from "lucide-react"
import { toast } from "sonner"
import type { ShadowPointDTO, ShadowTypologyDTO } from "@/lib/types"
import { SHADOW_STATUS_LABELS } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip"
import { ErrorState, TabSkeleton } from "@/components/shell/loading"
import {
  SHADOW_COLORS, ShadowStatusBadge, TypologyIcon, formatMillimes, formatTnd, relDateFr, typologyLabel,
} from "../shadow-shared"
import { PointDetailDialog, buildPointsCsv, downloadText, normalizeFr, todayStamp } from "./recensement-shared"

const PAGE_SIZE = 25

type ListResponse = { points: ShadowPointDTO[]; total: number; typologies: ShadowTypologyDTO[] }

export function TabPointsList({ focusCode }: { focusCode?: string | null }) {
  // ---- Données ----
  const [data, setData] = useState<ListResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // ---- Filtres ----
  const [status, setStatus] = useState("all")
  const [typology, setTypology] = useState("all")
  const [gouvernorat, setGouvernorat] = useState("all")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [includeInactive, setIncludeInactive] = useState(false)
  const [page, setPage] = useState(0)

  // ---- Dialogs ----
  const [detailCode, setDetailCode] = useState<string | null>(focusCode ?? null)
  const [detailPoint, setDetailPoint] = useState<ShadowPointDTO | null>(null)
  const [editPoint, setEditPoint] = useState<ShadowPointDTO | null>(null)
  const [disablePoint, setDisablePoint] = useState<ShadowPointDTO | null>(null)

  // Recherche débouncée (300 ms).
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(t)
  }, [search])

  // ---- Chargement paginé + filtres serveur ----
  useEffect(() => {
    const ctrl = new AbortController()
    const params = new URLSearchParams()
    params.set("limit", String(PAGE_SIZE))
    params.set("offset", String(page * PAGE_SIZE))
    if (status !== "all") params.set("status", status)
    if (typology !== "all") params.set("typology", typology)
    if (gouvernorat !== "all") params.set("gouvernorat", gouvernorat)
    if (debouncedSearch !== "") params.set("search", debouncedSearch)
    if (!includeInactive) params.set("active", "true")
    fetch(`/api/shadow/points?${params.toString()}`, { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
        return res.json() as Promise<ListResponse>
      })
      .then((json) => {
        setData(json)
        setError(null)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
  }, [status, typology, gouvernorat, debouncedSearch, includeInactive, page, reloadKey])

  const points = data?.points ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)

  const openDetail = useCallback((p: ShadowPointDTO) => {
    setDetailPoint(p)
    setDetailCode(p.code)
  }, [])

  // ---- Mise à jour d'une ligne après mutation ----
  const applyPoint = useCallback((updated: ShadowPointDTO) => {
    setData((prev) =>
      prev ? { ...prev, points: prev.points.map((p) => (p.id === updated.id ? updated : p)) } : prev,
    )
    setDetailPoint((prev) => (prev && prev.id === updated.id ? updated : prev))
  }, [])

  const removePointRow = useCallback((id: string) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            points: includeInactive ? prev.points.map((p) => (p.id === id ? { ...p, active: false } : p)) : prev.points.filter((p) => p.id !== id),
            total: includeInactive ? prev.total : Math.max(0, prev.total - 1),
          }
        : prev,
    )
  }, [includeInactive])

  // ---- Export CSV des points filtrés ----
  const doExportCsv = useCallback(() => {
    const ctrl = new AbortController()
    const params = new URLSearchParams()
    params.set("limit", "2000")
    if (status !== "all") params.set("status", status)
    if (typology !== "all") params.set("typology", typology)
    if (gouvernorat !== "all") params.set("gouvernorat", gouvernorat)
    if (debouncedSearch !== "") params.set("search", debouncedSearch)
    if (!includeInactive) params.set("active", "true")
    fetch(`/api/shadow/points?${params.toString()}`, { signal: ctrl.signal })
      .then((res) => (res.ok ? (res.json() as Promise<ListResponse>) : Promise.reject(new Error(`Erreur ${res.status}`))))
      .then((json) => {
        const rows = json.points ?? []
        if (rows.length === 0) {
          toast.error("Aucun point à exporter", { description: "Ajustez les filtres avant d'exporter." })
          return
        }
        downloadText(buildPointsCsv(rows), `carbuscope-shadow-points-${todayStamp()}.csv`)
        toast.success("Export CSV généré", { description: `${rows.length} points exportés (séparateur « ; », UTF-8).` })
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        toast.error("Export impossible", { description: e instanceof Error ? e.message : "Erreur inconnue" })
      })
  }, [status, typology, gouvernorat, debouncedSearch, includeInactive])

  const resetFilters = useCallback(() => {
    setStatus("all")
    setTypology("all")
    setGouvernorat("all")
    setSearch("")
    setDebouncedSearch("")
    setIncludeInactive(false)
    setPage(0)
  }, [])

  if (error !== null) {
    return <ErrorState message={error} retry={() => setReloadKey((k) => k + 1)} />
  }
  if (data === null) {
    return <TabSkeleton title="Chargement des points recensés…" />
  }

  return (
    <div className="space-y-4">
      {/* ---- Barre de filtres ---- */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
          <div className="relative flex-1 lg:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              placeholder="Code, cité, notes, rapporteur…"
              className="pl-8"
              aria-label="Recherche parmi les points"
            />
            {search !== "" ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Effacer la recherche"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:w-auto">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Statut</Label>
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0) }}>
                <SelectTrigger className="h-9 w-full lg:w-36" aria-label="Filtrer par statut">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {Object.entries(SHADOW_STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Typologie</Label>
              <Select value={typology} onValueChange={(v) => { setTypology(v); setPage(0) }}>
                <SelectTrigger className="h-9 w-full lg:w-44" aria-label="Filtrer par typologie">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {(data.typologies ?? []).map((t) => (
                    <SelectItem key={t.code} value={t.code}>{typologyLabel(t.code)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Gouvernorat</Label>
              <GovSelect value={gouvernorat} onValue={(v) => { setGouvernorat(v); setPage(0) }} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="incl-inactifs"
              checked={includeInactive}
              onCheckedChange={(c) => { setIncludeInactive(c); setPage(0) }}
              aria-label="Inclure les points inactifs"
            />
            <Label htmlFor="incl-inactifs" className="text-xs text-muted-foreground">Inclure inactifs</Label>
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <Button size="sm" variant="outline" onClick={resetFilters}>
              <SearchX className="h-3.5 w-3.5" aria-hidden /> Réinitialiser
            </Button>
            <Button size="sm" variant="outline" onClick={doExportCsv}>
              <FileDown className="h-3.5 w-3.5" aria-hidden /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---- Tableau ---- */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Code</TableHead>
                  <TableHead>Typologie</TableHead>
                  <TableHead>Localisation</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                  <TableHead className="text-right">Prix</TableHead>
                  <TableHead className="text-right">Perte / mois</TableHead>
                  <TableHead>Station proche</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Actif</TableHead>
                  <TableHead>Vérif.</TableHead>
                  <TableHead className="pr-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {points.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-28 text-center text-sm text-muted-foreground">
                      Aucun point ne correspond aux filtres.
                    </TableCell>
                  </TableRow>
                ) : (
                  points.map((p) => (
                    <TableRow key={p.id} className={p.active ? "" : "opacity-60"}>
                      <TableCell className="pl-4 font-mono text-xs font-semibold tabular-nums">{p.code}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5 text-xs">
                          <TypologyIcon code={p.typologyCode} className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{typologyLabel(p.typologyCode)}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="max-w-44 truncate text-left text-xs hover:underline" onClick={() => openDetail(p)}>
                                {p.delegation} · {p.gouvernorat}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{p.cite ?? "Cité non renseignée"}</p>
                              <p className="text-[11px] tabular-nums text-muted-foreground">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{p.volumeLJ.toLocaleString("fr-FR")} L/j</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{formatMillimes(p.priceMillimes)}</TableCell>
                      <TableCell className="text-right text-xs font-semibold tabular-nums" style={{ color: SHADOW_COLORS.red }}>
                        {formatTnd(p.lossTnd)}
                      </TableCell>
                      <TableCell>
                        {p.nearestStation ? (
                          <span className="flex max-w-40 flex-col text-[11px] leading-tight">
                            <span className="truncate">{p.nearestStation.name}</span>
                            <span className="tabular-nums text-muted-foreground">{p.nearestStation.distanceM.toLocaleString("fr-FR")} m</span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell><ShadowStatusBadge status={p.status} /></TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5 text-[11px]">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: p.active ? SHADOW_COLORS.green : SHADOW_COLORS.gray }}
                            aria-label={p.active ? "Point actif" : "Point disparu"}
                          />
                          {p.active ? "actif" : "inactif"}
                        </span>
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground">{relDateFr(p.lastCheckAt)}</TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openDetail(p)} aria-label={`Voir la fiche de ${p.code}`}>
                            <List className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditPoint(p)} aria-label={`Modifier ${p.code}`}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                          {p.active ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700"
                              onClick={() => setDisablePoint(p)}
                              aria-label={`Marquer ${p.code} comme disparu`}
                            >
                              <Ban className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 px-4 py-2.5 dark:border-stone-800">
            <p className="text-xs text-muted-foreground">
              {total.toLocaleString("fr-FR")} point{total > 1 ? "s" : ""} · page {safePage + 1} / {pageCount}
            </p>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Préc.
              </Button>
              <Button size="sm" variant="outline" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
                Suiv. <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fiche détaillée */}
      <PointDetailDialog
        code={detailCode}
        initial={detailPoint}
        onClose={() => { setDetailCode(null); setDetailPoint(null) }}
        onEdit={(p) => { setDetailCode(null); setDetailPoint(null); setEditPoint(p) }}
      />

      {/* Éditeur volume / prix / notes */}
      <EditPointDialog
        point={editPoint}
        onClose={() => setEditPoint(null)}
        onSaved={(p) => { applyPoint(p); setReloadKey((k) => k + 1) }}
      />

      {/* Confirmation disparition */}
      <DisablePointDialog
        point={disablePoint}
        onClose={() => setDisablePoint(null)}
        onDone={(id) => { removePointRow(id); setReloadKey((k) => k + 1) }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sélecteur gouvernorat (options issues d'un mini-référentiel embarqué)
// ---------------------------------------------------------------------------

const ALL_GOV = [
  "Ariana", "Béja", "Ben Arous", "Bizerte", "Gabès", "Gafsa", "Jendouba", "Kairouan",
  "Kasserine", "Kébili", "Le Kef", "Mahdia", "Manouba", "Médenine", "Monastir", "Nabeul",
  "Sfax", "Sidi Bouzid", "Siliana", "Sousse", "Tataouine", "Tozeur", "Tunis", "Zaghouan",
]

function GovSelect({ value, onValue }: { value: string; onValue: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onValue}>
      <SelectTrigger className="h-9 w-full lg:w-40" aria-label="Filtrer par gouvernorat">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value="all">Tous</SelectItem>
        {ALL_GOV.map((g) => (
          <SelectItem key={g} value={g}>{g}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ---------------------------------------------------------------------------
// Éditeur inline (volume / prix / notes)
// ---------------------------------------------------------------------------

function EditPointDialog({
  point, onClose, onSaved,
}: {
  point: ShadowPointDTO | null
  onClose: () => void
  onSaved: (p: ShadowPointDTO) => void
}) {
  const [volume, setVolume] = useState("0")
  const [price, setPrice] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (point === null) return
    setVolume(String(point.volumeLJ))
    setPrice(point.priceMillimes != null ? String(point.priceMillimes) : "")
    setNotes(point.notes)
  }, [point])

  const submit = async () => {
    if (point === null) return
    const v = Number(volume)
    if (!Number.isFinite(v) || v < 0) {
      toast.error("Volume invalide", { description: "Saisissez un volume en L/j." })
      return
    }
    const pr = price.trim() === "" ? null : Number(price)
    if (pr != null && (!Number.isFinite(pr) || pr < 0 || pr > 5000)) {
      toast.error("Prix invalide", { description: "Millimes/L entre 0 et 5 000." })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/shadow/points/${encodeURIComponent(point.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volumeLJ: v, priceMillimes: pr, notes: notes.slice(0, 500) }),
      })
      const json = (await res.json()) as { point?: ShadowPointDTO; error?: string }
      if (!res.ok || !json.point) throw new Error(json.error ?? `Erreur ${res.status}`)
      onSaved(json.point)
      toast.success(`${point.code} mis à jour`, { description: "Volume, prix et notes enregistrés (tracés dans l'historique)." })
      onClose()
    } catch (e) {
      toast.error("Mise à jour impossible", { description: e instanceof Error ? e.message : "Erreur inconnue" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={point !== null} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Modifier {point?.code ?? ""}</DialogTitle>
        </DialogHeader>
        {point ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {typologyLabel(point.typologyCode)} · {point.delegation} ({point.gouvernorat}) — toute correction est tracée
              (événements VOLUME / PRIX).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ed-vol" className="text-xs">Volume (L/j)</Label>
                <Input id="ed-vol" type="number" min={0} max={100000} value={volume} onChange={(e) => setVolume(e.target.value)} className="tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-price" className="text-xs">Prix (millimes/L)</Label>
                <Input id="ed-price" type="number" min={0} max={5000} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="non renseigné" className="tabular-nums" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-notes" className="text-xs">Notes terrain</Label>
              <Textarea id="ed-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="text-xs" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
              <Button onClick={submit} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Confirmation de disparition (suppression douce)
// ---------------------------------------------------------------------------

function DisablePointDialog({
  point, onClose, onDone,
}: {
  point: ShadowPointDTO | null
  onClose: () => void
  onDone: (id: string) => void
}) {
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (point === null) return
    setSaving(true)
    try {
      const res = await fetch(`/api/shadow/points/${encodeURIComponent(point.id)}`, { method: "DELETE" })
      const json = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`)
      onDone(point.id)
      toast.success(`${point.code} marqué disparu`, {
        description: "Suppression douce : le point passe inactif, un événement DISPARITION est tracé.",
      })
      onClose()
    } catch (e) {
      toast.error("Action impossible", { description: e instanceof Error ? e.message : "Erreur inconnue" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={point !== null} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Ban className="h-4 w-4" style={{ color: SHADOW_COLORS.red }} aria-hidden />
            Marquer {point?.code ?? ""} comme disparu ?
          </DialogTitle>
        </DialogHeader>
        {point ? (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Le point {point.code} ({typologyLabel(point.typologyCode)}, {point.delegation}) sera passé
              « inactif » — suppression douce conservant l&apos;historique. Un événement DISPARITION sera
              enregistré. Cette action n&apos;efface aucune donnée.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
              <Button variant="destructive" onClick={submit} disabled={saving}>
                {saving ? "Traitement…" : "Confirmer la disparition"}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
