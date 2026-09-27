'use client'

// Shadow Market — Recensement, onglet « 📸 Galerie Photos » (T44-d).
// Toutes les photos terrain : grille responsive (aspect 4/3), overlay au
// survol (code, localisation, volume, date), clic → grande photo + fiche
// complète, filtres gouvernorat / typologie, export CSV des métadonnées.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Camera, FileDown } from "lucide-react"
import { toast } from "sonner"
import type { ShadowPointDTO, ShadowTypologyDTO } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ErrorState, TabSkeleton } from "@/components/shell/loading"
import { num } from "@/lib/chart"
import {
  SHADOW_COLORS, TypologyIcon, dateFr, formatLJ, formatMillimes, formatTnd, typologyLabel,
} from "../shadow-shared"
import { PointDetailDialog, csvEscape, downloadText, todayStamp } from "./recensement-shared"

export function TabGallery() {
  const [points, setPoints] = useState<ShadowPointDTO[] | null>(null)
  const [typologies, setTypologies] = useState<ShadowTypologyDTO[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [gouvernorat, setGouvernorat] = useState("all")
  const [typology, setTypology] = useState("all")
  const [detailCode, setDetailCode] = useState<string | null>(null)
  const [detailPoint, setDetailPoint] = useState<ShadowPointDTO | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/shadow/points?limit=1000", { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
        return res.json() as Promise<{ points: ShadowPointDTO[]; typologies: ShadowTypologyDTO[] }>
      })
      .then((json) => {
        setPoints((json.points ?? []).filter((p) => p.photoUrl != null))
        setTypologies(json.typologies ?? [])
        setError(null)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
  }, [reloadKey])

  const gouvernorats = useMemo(() => {
    const set = new Set<string>()
    for (const p of points ?? []) set.add(p.gouvernorat)
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"))
  }, [points])

  const typologyOptions = useMemo(() => {
    const set = new Set<string>()
    for (const p of points ?? []) set.add(p.typologyCode)
    return Array.from(set)
  }, [points])

  const filtered = useMemo(() => {
    if (points === null) return []
    let list = points
    if (gouvernorat !== "all") list = list.filter((p) => p.gouvernorat === gouvernorat)
    if (typology !== "all") list = list.filter((p) => p.typologyCode === typology)
    return list
  }, [points, gouvernorat, typology])

  const openDetail = useCallback((p: ShadowPointDTO) => {
    setDetailPoint(p)
    setDetailCode(p.code)
  }, [])

  const doExportCsv = useCallback(() => {
    if (filtered.length === 0) {
      toast.error("Aucune photo à exporter", { description: "Ajustez les filtres avant d'exporter." })
      return
    }
    const header = ["Code", "Typologie", "Gouvernorat", "Délégation", "Cité", "Volume L/j", "Prix millimes", "Perte DT/mois", "Date dernière vérif.", "Photo"]
    const rows = filtered.map((p) => [
      p.code, typologyLabel(p.typologyCode), p.gouvernorat, p.delegation, p.cite ?? "",
      p.volumeLJ, p.priceMillimes ?? "", Math.round(p.lossTnd), dateFr(p.lastCheckAt), p.photoUrl ?? "",
    ])
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(";")).join("\r\n")
    downloadText(csv, `carbuscope-shadow-photos-${todayStamp()}.csv`)
    toast.success("Export CSV généré", { description: `${filtered.length} métadonnées de photos exportées.` })
  }, [filtered])

  if (error !== null) {
    return <ErrorState message={error} retry={() => setReloadKey((k) => k + 1)} />
  }
  if (points === null) {
    return <TabSkeleton title="Chargement de la galerie photos…" />
  }

  return (
    <div className="space-y-4">
      {/* Barre de filtres */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <Camera className="h-3.5 w-3.5" aria-hidden />
              {num(filtered.length)} photo{filtered.length > 1 ? "s" : ""}
              <span className="font-normal text-muted-foreground">/ {num(points.length)} au total</span>
            </span>
            <div className="space-y-1">
              <Label className="sr-only">Gouvernorat</Label>
              <Select value={gouvernorat} onValueChange={setGouvernorat}>
                <SelectTrigger className="h-9 w-40" aria-label="Filtrer par gouvernorat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">Tous</SelectItem>
                  {gouvernorats.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTypology("all")}
              aria-pressed={typology === "all"}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                typology === "all"
                  ? "border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900"
                  : "border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              }`}
            >
              Toutes
            </button>
            {typologyOptions.map((code) => {
              const active = typology === code
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setTypology(active ? "all" : code)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? "border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900"
                      : "border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                  }`}
                >
                  <TypologyIcon code={code} className="h-3 w-3" aria-hidden />
                  {typologyLabel(code)}
                </button>
              )
            })}
          </div>

          <Button size="sm" variant="outline" onClick={doExportCsv}>
            <FileDown className="h-3.5 w-3.5" aria-hidden /> Export CSV
          </Button>
        </CardContent>
      </Card>

      {/* Grille */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Aucune photo ne correspond aux filtres.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => openDetail(p)}
              className="group relative overflow-hidden rounded-lg border border-stone-200 text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:border-stone-800"
              aria-label={`Voir la fiche du point ${p.code}`}
            >
              <div className="aspect-[4/3] w-full overflow-hidden bg-stone-100 dark:bg-stone-800">
                <img
                  src={p.photoUrl ?? ""}
                  alt={`Photo terrain — ${typologyLabel(p.typologyCode)}, ${p.delegation}`}
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              <div
                className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-stone-950/90 via-stone-950/30 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
              >
                <p className="font-mono text-[11px] font-semibold text-white">{p.code}</p>
                <p className="truncate text-[10px] text-stone-200">
                  {p.delegation} · {p.gouvernorat}
                </p>
                <p className="text-[10px] tabular-nums text-stone-300">
                  {formatLJ(p.volumeLJ)} · {dateFr(p.lastCheckAt)}
                </p>
              </div>
              <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-stone-950/70 px-1.5 py-0.5 backdrop-blur-sm">
                <TypologyIcon code={p.typologyCode} className="h-3 w-3 text-white" aria-hidden />
                <span className="max-w-24 truncate text-[9px] font-medium text-white">{typologyLabel(p.typologyCode)}</span>
              </div>
              <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                <span className="truncate text-[10px] text-muted-foreground">{p.cite ?? p.delegation}</span>
                <span className="shrink-0 text-[10px] font-semibold tabular-nums" style={{ color: SHADOW_COLORS.red }}>
                  {formatTnd(p.lossTnd)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Fiche détaillée (grande photo) */}
      <PointDetailDialog
        code={detailCode}
        initial={detailPoint}
        onClose={() => { setDetailCode(null); setDetailPoint(null) }}
      />
    </div>
  )
}
