'use client'

// Shadow Market — Recensement, onglet « 🔄 Mises à Jour » (T44-d).
// Timeline verticale du cycle de vie des points (apparition, disparition,
// réapparition, volume, prix…), filtres par type (chips) et gouvernorat,
// statistiques rapides du mois. Les points « disparus puis réapparus »
// sont mis en avant (icône Eye).

import { useEffect, useMemo, useState } from "react"
import { ArrowRight, CircleAlert, Eye, RefreshCw, Search } from "lucide-react"
import type { ShadowUpdateDTO } from "@/lib/types"
import { SHADOW_UPDATE_KIND_LABELS } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ErrorState, TabSkeleton } from "@/components/shell/loading"
import { num } from "@/lib/chart"
import {
  SHADOW_COLORS, ShadowKpiCard, TypologyIcon, UpdateKindIcon, dateFr, relDateFr, typologyLabel,
} from "../shadow-shared"
import { KIND_COLORS, normalizeFr } from "./recensement-shared"

const KIND_ORDER = ["APPARITION", "DISPARITION", "REAPPARITION", "VOLUME", "PRIX", "TYPE", "DEPLACEMENT", "STATUT"]

export function TabUpdates() {
  const [updates, setUpdates] = useState<ShadowUpdateDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [kinds, setKinds] = useState<string[]>([]) // chips multi-sélection
  const [gouvernorat, setGouvernorat] = useState("all")
  const [search, setSearch] = useState("")

  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/shadow/updates?limit=300", { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
        return res.json() as Promise<{ updates: ShadowUpdateDTO[]; total: number }>
      })
      .then((json) => {
        setUpdates(json.updates ?? [])
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
    for (const u of updates ?? []) if (u.gouvernorat) set.add(u.gouvernorat)
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"))
  }, [updates])

  // PointCodes ayant connu une disparition PUIS une réapparition.
  const resurrectedCodes = useMemo(() => {
    const byCode = new Map<string, Map<string, number>>() // code → kind → date max
    for (const u of updates ?? []) {
      const kindsMap = byCode.get(u.pointCode) ?? new Map<string, number>()
      const t = new Date(u.date).getTime()
      if ((kindsMap.get(u.kind) ?? 0) < t) kindsMap.set(u.kind, t)
      byCode.set(u.pointCode, kindsMap)
    }
    const codes = new Set<string>()
    for (const [code, kindsMap] of byCode) {
      const dis = kindsMap.get("DISPARITION")
      const re = kindsMap.get("REAPPARITION")
      if (dis != null && re != null && re > dis) codes.add(code)
    }
    return codes
  }, [updates])

  const q = normalizeFr(search.trim())

  const filtered = useMemo(() => {
    if (updates === null) return []
    let list = updates
    if (kinds.length > 0) list = list.filter((u) => kinds.includes(u.kind))
    if (gouvernorat !== "all") list = list.filter((u) => u.gouvernorat === gouvernorat)
    if (q !== "") list = list.filter((u) => normalizeFr(`${u.pointCode} ${u.author} ${u.oldValue ?? ""} ${u.newValue ?? ""}`).includes(q))
    return list
  }, [updates, kinds, gouvernorat, q])

  const monthStats = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    let apparitions = 0
    let disparitions = 0
    let reapparitions = 0
    for (const u of updates ?? []) {
      if (new Date(u.date).getTime() < monthStart) continue
      if (u.kind === "APPARITION") apparitions += 1
      else if (u.kind === "DISPARITION") disparitions += 1
      else if (u.kind === "REAPPARITION") reapparitions += 1
    }
    return { apparitions, disparitions, reapparitions }
  }, [updates])

  const toggleKind = (kind: string) => {
    setKinds((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]))
  }

  if (error !== null) {
    return <ErrorState message={error} retry={() => setReloadKey((k) => k + 1)} />
  }
  if (updates === null) {
    return <TabSkeleton title="Chargement de l'historique…" />
  }

  return (
    <div className="space-y-4">
      {/* Statistiques rapides */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ShadowKpiCard
          value={num(monthStats.apparitions)}
          label="Apparitions ce mois"
          sub="nouveaux points détectés"
          tone="red"
          icon={CircleAlert}
        />
        <ShadowKpiCard
          value={num(monthStats.disparitions)}
          label="Disparitions ce mois"
          sub="points neutralisés / fermés"
          tone="green"
          icon={Eye}
        />
        <ShadowKpiCard
          value={num(monthStats.reapparitions)}
          label="Réapparitions ce mois"
          sub="retours après disparition"
          tone="orange"
          icon={RefreshCw}
        />
        <ShadowKpiCard
          value={num(filtered.length)}
          label="Événements affichés"
          sub={`sur ${num(updates.length)} chargés (max 300)`}
          tone="neutral"
        />
      </div>

      {/* Filtres */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs text-muted-foreground">Types d&apos;événement :</Label>
            {KIND_ORDER.map((kind) => {
              const active = kinds.includes(kind)
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => toggleKind(kind)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active ? "border-transparent text-white" : "border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                  }`}
                  style={active ? { backgroundColor: KIND_COLORS[kind] ?? SHADOW_COLORS.gray } : undefined}
                >
                  <UpdateKindIcon kind={kind} className="h-3 w-3" aria-hidden />
                  {SHADOW_UPDATE_KIND_LABELS[kind] ?? kind}
                </button>
              )
            })}
            {kinds.length > 0 ? (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setKinds([])}>
                Tout effacer
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Gouvernorat</Label>
              <Select value={gouvernorat} onValueChange={setGouvernorat}>
                <SelectTrigger className="h-9 w-44" aria-label="Filtrer par gouvernorat">
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
            <div className="flex-1 space-y-1">
              <Label htmlFor="upd-search" className="text-[10px] text-muted-foreground">Recherche (point, auteur…)</Label>
              <div className="relative max-w-64">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="upd-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="SM-26-… / auteur"
                  className="h-9 pl-8"
                />
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Rafraîchir
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Aucun événement ne correspond aux filtres.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4">
            <ol className="relative max-h-[560px] space-y-1 overflow-y-auto pr-1">
              {filtered.map((u) => {
                const isResurrection = u.kind === "REAPPARITION" && resurrectedCodes.has(u.pointCode)
                const color = KIND_COLORS[u.kind] ?? SHADOW_COLORS.gray
                return (
                  <li
                    key={u.id}
                    className={`relative flex gap-3 rounded-lg border-l-2 py-2 pl-3 pr-2 transition-colors ${
                      isResurrection
                        ? "border-transparent bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-950/40 dark:ring-amber-800"
                        : "border-transparent hover:bg-stone-50 dark:hover:bg-stone-900"
                    }`}
                    style={{ borderLeftColor: color }}
                  >
                    <span
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: color }}
                      aria-hidden
                    >
                      <UpdateKindIcon kind={u.kind} className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-mono text-xs font-semibold tabular-nums">{u.pointCode}</span>
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <TypologyIcon code={u.pointTypology} className="h-3 w-3" aria-hidden />
                          {typologyLabel(u.pointTypology, u.pointTypology)}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ backgroundColor: `${color}22`, color }}
                        >
                          {SHADOW_UPDATE_KIND_LABELS[u.kind] ?? u.kind}
                        </span>
                        {isResurrection ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                            <Eye className="h-3 w-3" aria-hidden /> disparu puis réapparu
                          </span>
                        ) : null}
                      </div>
                      {u.oldValue || u.newValue ? (
                        <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs">
                          {u.oldValue ? (
                            <span className="text-muted-foreground line-through">{u.oldValue}</span>
                          ) : null}
                          {u.oldValue && u.newValue ? (
                            <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
                          ) : null}
                          {u.newValue ? (
                            <span className="font-medium text-stone-800 dark:text-stone-200">{u.newValue}</span>
                          ) : null}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {u.author} · {dateFr(u.date)} ({relDateFr(u.date)}){u.gouvernorat ? ` · ${u.gouvernorat}` : ""}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </Card>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Historique des 300 derniers événements (tri antichronologique). Chaque mutation terrain — volume, prix,
        typologie, déplacement, statut — est tracée avec son auteur et ses anciennes/nouvelles valeurs.
      </p>
    </div>
  )
}
