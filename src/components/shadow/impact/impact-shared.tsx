'use client'

// Shadow Market — Analyse d'Impact (T44-d) : socle partagé des 5 onglets.
// Sélecteur de station (top menaces + recherche + chips par enseigne),
// briques de tooltip Recharts, anneaux de distance. Couleurs et badges
// viennent de shadow-shared.tsx — aucune duplication.

import { useMemo, useState } from "react"
import { Search, Users } from "lucide-react"
import type { ShadowMapStationDTO, ShadowLevel } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { LEVEL_COLORS, SHADOW_COLORS, formatTnd } from "../shadow-shared"

// ---------------------------------------------------------------------------
// Constantes métier (modèle DG — miroir du backend)
// ---------------------------------------------------------------------------

export const MARGIN_TND_PER_L = 0.19
export const DAYS_PER_MONTH = 30.4
/** Volume journalier par véhicule captif (L/véh./j) — hypothèse pédagogique. */
export const LITERS_PER_VEHICLE = 8

// ---------------------------------------------------------------------------
// Anneaux de distance (rayons de cannibalisation)
// ---------------------------------------------------------------------------

export const RINGS: { label: string; short: string; color: string; maxM: number }[] = [
  { label: "< 500 m", short: "< 500 m", color: SHADOW_COLORS.red, maxM: 500 },
  { label: "500 m – 1 km", short: "0,5–1 km", color: SHADOW_COLORS.orange, maxM: 1000 },
  { label: "1 – 2 km", short: "1–2 km", color: SHADOW_COLORS.yellow, maxM: 2000 },
]

export function ringIndex(distanceM: number): number {
  if (distanceM < 500) return 0
  if (distanceM < 1000) return 1
  return 2
}

// ---------------------------------------------------------------------------
// Briques de tooltip Recharts (style « war room »)
// ---------------------------------------------------------------------------

export function TipShell({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-36 rounded-md border bg-popover px-3 py-2 text-xs shadow-md" style={{ borderColor: "var(--border)" }}>
      <p className="mb-1 font-medium text-popover-foreground">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

export function TipRow({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {color ? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden /> : null}
        {label}
      </span>
      <span className="font-semibold tabular-nums text-popover-foreground">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sélecteur de station (top menaces)
// ---------------------------------------------------------------------------

export function StationPicker({
  stations, selectedCode, onSelect, limit = 20, height = "max-h-[420px]",
}: {
  stations: ShadowMapStationDTO[]
  selectedCode: string | null
  onSelect: (code: string) => void
  limit?: number
  height?: string
}) {
  const [search, setSearch] = useState("")
  const [brandFilter, setBrandFilter] = useState("all")

  const byLoss = useMemo(() => [...stations].sort((a, b) => b.lossTnd - a.lossTnd), [stations])

  const brandChips = useMemo(() => {
    const map = new Map<string, { slug: string; name: string; color: string }>()
    for (const s of byLoss.slice(0, 60)) {
      if (!map.has(s.brandSlug)) map.set(s.brandSlug, { slug: s.brandSlug, name: s.brandName, color: s.brandColor })
    }
    return Array.from(map.values())
  }, [byLoss])

  const q = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    let list = byLoss
    if (brandFilter !== "all") list = list.filter((s) => s.brandSlug === brandFilter)
    if (q !== "") {
      list = list.filter((s) =>
        `${s.name} ${s.code} ${s.delegation} ${s.gouvernorat} ${s.brandName}`.toLowerCase().includes(q),
      )
    }
    return list.slice(0, limit)
  }, [byLoss, brandFilter, q, limit])

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="text-sm font-semibold">Station analysée</p>
          <p className="text-xs text-muted-foreground">
            Top {limit} stations menacées (perte décroissante){byLoss.length > 0 ? ` — ${byLoss[0].name} en tête` : ""}.
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom, code, délégation…"
            className="h-9 pl-8"
            aria-label="Rechercher une station"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setBrandFilter("all")}
            aria-pressed={brandFilter === "all"}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
              brandFilter === "all"
                ? "border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900"
                : "border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            }`}
          >
            Toutes
          </button>
          {brandChips.map((b) => {
            const active = brandFilter === b.slug
            return (
              <button
                key={b.slug}
                type="button"
                onClick={() => setBrandFilter(active ? "all" : b.slug)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  active
                    ? "border-transparent text-white"
                    : "border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                }`}
                style={active ? { backgroundColor: b.color } : undefined}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: active ? "rgba(255,255,255,0.85)" : b.color }}
                  aria-hidden
                />
                {b.name}
              </button>
            )
          })}
        </div>

        <div className={`${height} space-y-1 overflow-y-auto pr-1`}>
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Aucune station trouvée.</p>
          ) : (
            filtered.map((s) => {
              const selected = s.code === selectedCode
              const levelColor = LEVEL_COLORS[s.level as ShadowLevel] ?? SHADOW_COLORS.gray
              return (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => onSelect(s.code)}
                  aria-pressed={selected}
                  className={`flex w-full items-center gap-2.5 rounded-lg border p-2 text-left transition-colors ${
                    selected
                      ? "border-stone-900 bg-stone-100 ring-1 ring-stone-900/60 dark:border-stone-100 dark:bg-stone-800 dark:ring-stone-100/50"
                      : "border-stone-200 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900"
                  }`}
                >
                  <span
                    className="h-8 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: levelColor }}
                    aria-label={`Niveau ${s.level}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{s.name}</span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.brandColor }} aria-hidden />
                      {s.brandName} · {s.delegation} ({s.gouvernorat})
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs font-bold tabular-nums" style={{ color: SHADOW_COLORS.red }}>
                      {formatTnd(s.lossTnd)}
                    </span>
                    <span className="flex items-center justify-end gap-0.5 text-[10px] text-muted-foreground">
                      <Users className="h-2.5 w-2.5" aria-hidden />
                      {s.points} pt{s.points > 1 ? "s" : ""}
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>
      </CardContent>
    </Card>
  )
}
