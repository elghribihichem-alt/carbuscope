'use client'

// T55-C-a — Hubs > Base clients TMP : socle LOCAL partagé par les 4
// sous-onglets (vehicules / historique / alertes / fidelite). DTOs et hooks
// du contrat /api/hubs/vehicles(+[id]), badges d'alerte (dérivation V1
// documentée côté serveur), paliers du programme de fidélité et fiche
// véhicule complète (Sheet) : identité, hub, stats, timeline des
// interventions, conversions liées, carte fidélité.
// hubs-shared.tsx (figé) reste réutilisé pour useHubs et SectionHeader.

import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { num } from "@/lib/chart"
import { ArrowRight, Award, Bot, Car, CircleDot, Fuel } from "lucide-react"

// ---------- Types (contrat /api/hubs/vehicles) ----------
export interface VehicleAlert {
  type: string
  label: string
  sinceDays?: number
}

export interface VehicleRow {
  id: string
  plate: string
  brand: string
  model: string | null
  km: number
  loyaltyPoints: number
  lastVisit: string | null
  hub: { code: string; name: string; gouvernorat: string; brandSlug: string }
  interventionCount: number
  lastService: string | null
  conversionsCount: number
  alert: VehicleAlert | null
}

export interface VehiclesResponse {
  vehicles: VehicleRow[]
  meta: {
    total: number
    kmAvg: number
    loyaltyAvg: number
    loyaltyTotal: number
    alerts: { total: number; vidangeDue: number; loyaltyNear: number }
  }
  filters: { brand: string | null; hubId: string | null; q: string | null; alertes: boolean }
}

// ---------- Types (contrat /api/hubs/vehicles/[id]) ----------
export interface VehicleDetailResponse {
  vehicle: VehicleRow & {
    hub: { code: string; name: string; gouvernorat: string; delegation: string | null; brandSlug: string } | null
    interventions: { id: string; serviceType: string; detail: string | null; priceDt: number; durationMin: number | null; createdAt: string }[]
    conversions: { id: string; stationCode: string | null; detail: string; status: string; valueDt: number; createdAt: string }[]
    stats: {
      totalSpent: number
      convertedValue: number
      firstVisit: string | null
      visitsCount: number
      servicesCount: number
      conversionsCount: number
    }
  }
}

// ---------- Helpers locaux ----------
export const money = (v: number) => `${num(v)} DT`
export const dateFr = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso))

const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" })
/** « il y a 3 jours » — pattern veille-utils, recopié localement (hubs-shared figé). */
export function relativeDate(iso: string): string {
  const t = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(t)) return ""
  const min = Math.round(t / 60_000)
  if (min < 1) return "à l'instant"
  if (min < 60) return rtf.format(-min, "minute")
  const h = Math.round(min / 60)
  if (h < 24) return rtf.format(-h, "hour")
  const d = Math.round(h / 24)
  if (d < 31) return rtf.format(-d, "day")
  const mo = Math.round(d / 30)
  if (mo < 12) return rtf.format(-mo, "month")
  return rtf.format(-Math.round(mo / 12), "year")
}

// ---------- Programme de fidélité (catalogue statique V1 documenté) ----------
export interface FidelityTierDef {
  key: string
  label: string
  min: number
  max: number | null
  badge: string
  bar: string
  perk: string
}

export const FIDELITY_TIERS: FidelityTierDef[] = [
  {
    key: "MEMBRE", label: "Membre", min: 0, max: 99,
    badge: "border-stone-300 bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300",
    bar: "bg-stone-400 dark:bg-stone-600",
    perk: "Suivi des passages et rappels d'entretien",
  },
  {
    key: "ARGENT", label: "Argent", min: 100, max: 179,
    badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    bar: "bg-amber-500",
    perk: "Priorité atelier aux heures de pointe",
  },
  {
    key: "OR", label: "Or", min: 180, max: null,
    badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    bar: "bg-emerald-500",
    perk: "Statut fidélité maximal — récompenses échangeables",
  },
]

export type FidelityTier = FidelityTierDef

/** Palier fidélité d'un véhicule selon ses points réels. */
export function fidelityTier(points: number): FidelityTier {
  if (points >= 180) return FIDELITY_TIERS[2]
  if (points >= 100) return FIDELITY_TIERS[1]
  return FIDELITY_TIERS[0]
}

/** Récompenses échangeables (catalogue statique V1 — documenté, non débité). */
export const FIDELITY_REWARDS = [
  { threshold: 200, label: "Vidange express offerte", detail: "huile + filtre, encaissée au TMP partenaire" },
  { threshold: 250, label: "−10 % sur une monte de pneus", detail: "2 pneus minimum, dimensions du catalogue" },
] as const

// ---------- Badges ----------
export const SERVICE_META = {
  VIDANGE: { label: "Vidange", icon: Fuel, badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  PNEUS: { label: "Pneus", icon: CircleDot, badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" },
  DIAGNOSTIC: { label: "Diagnostic", icon: Bot, badge: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400" },
} as const

export const CONVERSION_STATUS_META = {
  ORIENTE: { label: "Orienté", badge: "border-stone-300 bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300" },
  CONVERTI: { label: "Converti", badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  PERDU: { label: "Perdu", badge: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400" },
} as const

/** Badge d'alerte dérivée (V1 : 180 j / 15 000 km / 180 points — documenté). */
export function VehicleAlertBadge({ alert }: { alert: VehicleAlert | null }) {
  if (!alert) return <span className="text-xs text-muted-foreground">—</span>
  if (alert.type === "VIDANGE_DUE") {
    return (
      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
        {alert.label}{alert.sinceDays != null ? ` · depuis ${num(alert.sinceDays)} j` : ""}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
      Fidélité Or · {alert.label}
    </Badge>
  )
}

// ---------- Hooks locaux ----------
export function useVehicles(params: { brand?: string | null; hubId?: string | null; q?: string; alertes?: boolean; limit?: number }) {
  const [data, setData] = useState<VehiclesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey(k => k + 1), [])
  useEffect(() => {
    let alive = true
    const qs = new URLSearchParams()
    if (params.brand) qs.set("brand", params.brand)
    if (params.hubId) qs.set("hubId", params.hubId)
    if (params.q) qs.set("q", params.q)
    if (params.alertes) qs.set("alertes", "true")
    qs.set("limit", String(params.limit ?? 500))
    fetch(`/api/hubs/vehicles?${qs.toString()}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: VehiclesResponse) => { if (alive) { setData(d); setError(null) } })
      .catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [params.brand, params.hubId, params.q, params.alertes, params.limit, reloadKey])
  return { data, error, reload }
}

export function useVehicleDetail(id: string | null) {
  const [data, setData] = useState<VehicleDetailResponse | null>(null)
  useEffect(() => {
    if (!id) return
    let alive = true
    fetch(`/api/hubs/vehicles/${id}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: VehicleDetailResponse) => { if (alive) setData(d) })
      .catch(() => { if (alive) setData(null) })
    return () => { alive = false }
  }, [id])
  // Dérivation (règle react-hooks/set-state-in-effect) : la fiche affichée
  // correspond toujours à l'identifiant courant.
  return data && id && data.vehicle.id === id ? data : null
}

/* ================================================================== */
/*  Fiche véhicule complète (Sheet — partagée vehicules/alertes)       */
/* ================================================================== */
export function VehicleDetailSheet({ vehicleId, onClose }: { vehicleId: string | null; onClose: () => void }) {
  const detail = useVehicleDetail(vehicleId)
  const v = detail?.vehicle

  return (
    <Sheet open={vehicleId !== null} onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {vehicleId && (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2 text-base">
                <Car className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <span className="tabular-nums">{v?.plate ?? "…"}</span>
                {v && <VehicleAlertBadge alert={v.alert ?? null} />}
              </SheetTitle>
              <SheetDescription>
                {v
                  ? `${v.brand}${v.model ? ` ${v.model}` : ""} · ${num(v.km)} km · ${v.hub ? `${v.hub.code} — ${v.hub.name}` : "hub inconnu"}`
                  : "Chargement de la fiche véhicule…"}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4 pb-6">
              {!detail || !v ? (
                <div className="space-y-2 pt-2">
                  {[...Array(4)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}
                </div>
              ) : (
                <>
                  {/* Stats du véhicule */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Dépenses totales", value: money(v.stats.totalSpent) },
                      { label: "Visites", value: num(v.stats.visitsCount) },
                      { label: "Première visite", value: v.stats.firstVisit ? dateFr(v.stats.firstVisit) : "—" },
                      { label: "Services", value: num(v.stats.servicesCount) },
                      { label: "Conversions", value: num(v.stats.conversionsCount) },
                      { label: "CA converti", value: v.stats.convertedValue > 0 ? money(v.stats.convertedValue) : "—" },
                    ].map(k => (
                      <div key={k.label} className="rounded-lg border p-2 text-center">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
                        <p className="mt-0.5 text-sm font-bold tabular-nums leading-tight">{k.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Carte fidélité */}
                  <div className="rounded-lg border bg-gradient-to-br from-amber-50 to-stone-100 p-3 dark:from-amber-950/60 dark:to-stone-900">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Carte fidélité TMP</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Award className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
                      <p className="text-lg font-bold tabular-nums">{num(v.loyaltyPoints)} pts</p>
                      <Badge variant="outline" className={fidelityTier(v.loyaltyPoints).badge}>
                        {fidelityTier(v.loyaltyPoints).label}
                      </Badge>
                      {v.loyaltyPoints >= 180 && (
                        <span className="text-[11px] text-emerald-700 dark:text-emerald-400">récompense atteinte</span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      {fidelityTier(v.loyaltyPoints).perk} · vidange offerte dès 200 pts, −10 % pneus dès 250 pts
                      (catalogue V1).
                    </p>
                  </div>

                  {/* Timeline des interventions (la plus récente en tête) */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Historique des interventions ({num(v.interventions.length)})
                    </p>
                    {v.interventions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Aucune intervention enregistrée pour ce véhicule.</p>
                    ) : (
                      <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                        {v.interventions.map(i => {
                          const sm = SERVICE_META[i.serviceType as keyof typeof SERVICE_META] ?? SERVICE_META.DIAGNOSTIC
                          const Icon = sm.icon
                          return (
                            <li key={i.id} className="flex items-start gap-2.5 rounded-md border px-2.5 py-2">
                              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${sm.badge}`}>
                                <Icon className="h-3.5 w-3.5" aria-hidden />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-semibold">{sm.label}</p>
                                  <span className="shrink-0 text-xs font-semibold tabular-nums">{money(i.priceDt)}</span>
                                </div>
                                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                  {i.detail ?? "—"} · {dateFr(i.createdAt)} · {relativeDate(i.createdAt)}
                                </p>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Conversions liées */}
                  {v.conversions.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Conversions vers stations ({num(v.conversions.length)})
                      </p>
                      <ul className="space-y-1.5">
                        {v.conversions.map(c => {
                          const cm = CONVERSION_STATUS_META[c.status as keyof typeof CONVERSION_STATUS_META] ?? CONVERSION_STATUS_META.ORIENTE
                          return (
                            <li key={c.id} className="flex items-start gap-2.5 rounded-md border px-2.5 py-2">
                              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400">
                                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                  <p className="text-xs font-semibold">{c.detail}</p>
                                  <Badge variant="outline" className={`shrink-0 ${cm.badge}`}>{cm.label}</Badge>
                                </div>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  {c.stationCode ? `→ station ${c.stationCode} · ` : ""}{dateFr(c.createdAt)}
                                  {c.valueDt > 0 ? ` · ${money(c.valueDt)}` : ""}
                                </p>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}

                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Fiche calculée sur l&apos;historique réel du véhicule (interventions + conversions) · seuils
                    d&apos;alerte V1 : 180 jours / 15 000 km sans vidange / 180 points de fidélité.
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

/* ---------- Carte véhicule compacte (réutilisée par « alertes ») ---------- */
export function VehicleMiniCard({ vehicle, onClick }: { vehicle: VehicleRow; onClick: () => void }) {
  return (
    <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tabular-nums">{vehicle.plate}</p>
            <p className="text-[11px] text-muted-foreground">
              {vehicle.brand}{vehicle.model ? ` ${vehicle.model}` : ""} · {num(vehicle.km)} km
            </p>
          </div>
          <VehicleAlertBadge alert={vehicle.alert} />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="tabular-nums">{vehicle.hub.code} · {vehicle.hub.gouvernorat}</span>
          <span className="tabular-nums">{num(vehicle.loyaltyPoints)} pts fidélité</span>
          <span>{vehicle.lastVisit ? relativeDate(vehicle.lastVisit) : "jamais revenu"}</span>
        </div>
      </CardContent>
    </Card>
  )
}
