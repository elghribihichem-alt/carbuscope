'use client'

// T55 — socle partagé du module « Radar d'opportunités » : types DTO (import
// type — aucun code serveur embarqué), hook de chargement /api/radar/zones,
// atome d'en-tête de section et carte « feuille de route » honnête pour les
// volets livrés aux rounds B (formats, faisabilité, simulations).

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Radar, Info } from "lucide-react"
import type { RadarZonesResponse } from "@/lib/radar-scoring"
import type { ImplantationData } from "@/components/implantation/implantation-shared"
import type { BrandDTO, GovernoratRow, StationDTO } from "@/lib/types"

// ---------- Chargement ----------
// B1 — dédup mémoire : le bandeau du Radar et chaque section consomment le
// même endpoint ; une seule requête réseau par (enseigne, 30 s) est émise et
// les mounts concurrents partagent la promesse en vol. reload() invalide.
const RADAR_CACHE = new Map<string, { at: number; promise: Promise<RadarZonesResponse> }>()
const RADAR_TTL_MS = 30_000

function fetchRadarZones(brandSlug: string | null, force = false): Promise<RadarZonesResponse> {
  const key = brandSlug ?? "all"
  const hit = RADAR_CACHE.get(key)
  if (hit && !force && Date.now() - hit.at < RADAR_TTL_MS) return hit.promise
  const qs = brandSlug ? `?brand=${encodeURIComponent(brandSlug)}` : ""
  const promise = fetch(`/api/radar/zones${qs}`)
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((d: RadarZonesResponse) => d)
  // Une promesse rejetée ne doit pas rester cachée : on la purge au catch.
  promise.catch(() => RADAR_CACHE.delete(key))
  RADAR_CACHE.set(key, { at: Date.now(), promise })
  return promise
}

export function useRadarZones(brandSlug: string | null) {
  const [data, setData] = useState<RadarZonesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey(k => k + 1), [])

  useEffect(() => {
    let alive = true
    fetchRadarZones(brandSlug, reloadKey > 0)
      .then(d => { if (alive) { setData(d); setError(null) } })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : "Erreur inconnue") })
    return () => { alive = false }
  }, [brandSlug, reloadKey])

  return { data, error, reload }
}

// B1 — absorption de la branche « Implantation » : les outils isochrones,
// cannibalisation et comparateur consomment le trio gouvernorats / stations /
// enseignes. Chargement paresseux : la requête (≈ 2 200 stations) n'est émise
// QUE lorsque l'utilisateur ouvre l'un de ces sous-onglets.
export function useImplantationData(enabled: boolean) {
  const [data, setData] = useState<ImplantationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey(k => k + 1), [])

  useEffect(() => {
    if (!enabled) return // paresseux : zéro requête tant que l'onglet n'est pas ouvert
    let alive = true
    const ctrl = new AbortController()
    const get = async <T,>(path: string): Promise<T> => {
      const res = await fetch(path, { signal: ctrl.signal })
      if (!res.ok) throw new Error(`${path} → ${res.status}`)
      return res.json() as Promise<T>
    }
    Promise.all([
      get<{ governorats: GovernoratRow[] }>("/api/governorats"),
      get<{ stations: StationDTO[]; total: number }>("/api/stations?limit=2200"),
      get<{ brands: BrandDTO[] }>("/api/brands"),
    ])
      .then(([g, s, b]) => {
        if (alive) { setData({ governorats: g.governorats, stations: s.stations, brands: b.brands }); setError(null) }
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        if (alive) setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => { alive = false; ctrl.abort() }
  }, [enabled, reloadKey])

  return { data, error, reload }
}

// ---------- En-tête de section ----------
export function SectionHeader({
  title, description, badge, icon: Icon,
}: {
  title: string
  description: string
  badge?: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold tracking-tight md:text-xl">
          <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
          {title}
          {badge && (
            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
              {badge}
            </Badge>
          )}
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

// ---------- Carte « feuille de route » (volets des rounds B) ----------
// Convention d'honnêteté du projet : les volets non encore livrés affichent
// clairement leur statut et leur contenu prévu — aucune donnée simulée.
export function RoadmapCard({
  title, round, items,
}: {
  title: string
  round: string
  items: { label: string; detail: string }[]
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            <Radar className="h-4.5 w-4.5" aria-hidden />
          </div>
          <h3 className="text-base font-bold tracking-tight">{title}</h3>
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
            {round}
          </Badge>
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map(it => (
            <li key={it.label} className="rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-semibold">{it.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{it.detail}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Volet planifié au cycle T55 — livré progressivement sans casser les modules gelés. Les données affichées
          ailleurs dans le Radar sont réelles (scoring, trafic TMJ, parc ATTT, foncier, pouvoir d&apos;achat).
        </p>
      </CardContent>
    </Card>
  )
}
