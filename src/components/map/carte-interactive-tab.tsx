'use client'

// Module A.3 — Carte interactive : exploration spatiale multi-couches
// Filtres rapides (enseigne, service, statut, horaires), fiche station,
// outils d'analyse spatiale (mesure, rayon de chalandise, polygone, export).

import * as React from "react"
import { useEffect, useMemo, useState, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Search, RotateCcw, MapPin, Users } from "lucide-react"
import { TunisiaMap, SERVICE_ICONS } from "./tunisia-map"
import { useAppStore } from "@/store/app-store"
import type { StationDTO, BrandDTO, ServiceDTO } from "@/lib/types"
import { SERVICE_LABELS } from "@/lib/types"
import { TabSkeleton } from "@/components/shell/loading"

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Ouverte" },
  { value: "RENOVATION", label: "En rénovation" },
  { value: "PROJECT", label: "En projet" },
  { value: "CLOSED", label: "Fermée" },
]

const HOURS_OPTIONS = [
  { value: "ALL", label: "Tous les horaires" },
  { value: "24h", label: "24h/24" },
  { value: "7j", label: "7j/7" },
]

const GOVS = ["Tunis", "Ariana", "Ben Arous", "Manouba", "Nabeul", "Bizerte", "Sfax", "Sousse", "Monastir", "Mahdia", "Kairouan", "Zaghouan", "Béja", "Jendouba", "Le Kef", "Siliana", "Sidi Bouzid", "Kasserine", "Gabès", "Médenine", "Tataouine", "Gafsa", "Tozeur", "Kébili"]

export function CarteInteractiveTab() {
  const { brandSlug, focusStationCode, setFocusStation } = useAppStore()

  const [brands, setBrands] = useState<BrandDTO[]>([])
  const [services, setServices] = useState<ServiceDTO[]>([])
  const [stations, setStations] = useState<StationDTO[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filtres
  const [brandSel, setBrandSel] = useState<string[]>([])
  const [serviceSel, setServiceSel] = useState<string[]>([])
  const [statusSel, setStatusSel] = useState<string[]>([])
  const [hours, setHours] = useState("ALL")
  const [gov, setGov] = useState("ALL")
  const [search, setSearch] = useState("")

  useEffect(() => {
    Promise.all([
      fetch("/api/brands").then(r => r.json()),
      fetch("/api/services").then(r => r.json()),
    ]).then(([b, s]) => {
      setBrands(b.brands ?? [])
      setServices(s.services ?? [])
    }).catch(() => {})
  }, [])

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (brandSel.length) p.set("brand", brandSel.join(","))
    if (serviceSel.length) p.set("services", serviceSel.join(","))
    if (statusSel.length) p.set("status", statusSel.join(","))
    if (hours !== "ALL") p.set("hours", hours)
    if (gov !== "ALL") p.set("gouvernorat", gov)
    if (search.trim()) p.set("search", search.trim())
    p.set("limit", "2200")
    return p.toString()
  }, [brandSel, serviceSel, statusSel, hours, gov, search])

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true)
      fetch(`/api/stations?${query}`)
        .then(r => r.json())
        .then(d => { setStations(d.stations ?? []); setTotal(d.total ?? 0) })
        .catch(() => setStations([]))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])

  const resetFilters = useCallback(() => {
    setBrandSel([]); setServiceSel([]); setStatusSel([]); setHours("ALL"); setGov("ALL"); setSearch("")
  }, [])

  const activeFilters =
    brandSel.length + serviceSel.length + statusSel.length + (hours !== "ALL" ? 1 : 0) + (gov !== "ALL" ? 1 : 0) + (search ? 1 : 0)

  return (
    <div className="grid flex-1 gap-0 lg:grid-cols-[270px_1fr]">
      {/* ---------- Panneau de filtres ---------- */}
      <aside className="border-b bg-muted/20 lg:border-b-0 lg:border-r">
        <ScrollArea className="h-auto lg:h-[calc(100vh-106px)] lg:sticky lg:top-[106px]">
          <div className="space-y-5 p-4">
            <div>
              <label htmlFor="recherche-station" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Search className="h-3.5 w-3.5" /> Recherche
              </label>
              <Input id="recherche-station" placeholder="Nom, ville, enseigne…" value={search}
                onChange={e => setSearch(e.target.value)} className="h-9 text-sm" />
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Enseigne {brandSel.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{brandSel.length}</Badge>}
              </p>
              <div className="space-y-1.5">
                {brands.map(b => (
                  <label key={b.slug} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent">
                    <Checkbox checked={brandSel.includes(b.slug)} onCheckedChange={() => toggle(brandSel, b.slug, setBrandSel)} />
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
                    <span className="flex-1 truncate">{b.name}</span>
                    <span className="text-[11px] text-muted-foreground">{b.stationCount}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Services</p>
              <div className="grid grid-cols-1 gap-1.5">
                {services.map(s => (
                  <label key={s.slug} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent">
                    <Checkbox checked={serviceSel.includes(s.slug)} onCheckedChange={() => toggle(serviceSel, s.slug, setServiceSel)} />
                    {(() => { const Icon = SERVICE_ICONS[s.slug]; return Icon ? <Icon className="h-3.5 w-3.5 text-muted-foreground" /> : null })()}
                    <span className="flex-1 truncate">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Statut</p>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_OPTIONS.map(s => (
                  <button key={s.value} onClick={() => toggle(statusSel, s.value, setStatusSel)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${statusSel.includes(s.value) ? "border-emerald-600 bg-emerald-600 text-white" : "hover:bg-accent"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Horaires</p>
              <Select value={hours} onValueChange={setHours}>
                <SelectTrigger className="h-9 text-sm" aria-label="Filtrer par horaires"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HOURS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gouvernorat</p>
              <Select value={gov} onValueChange={setGov}>
                <SelectTrigger className="h-9 text-sm" aria-label="Filtrer par gouvernorat"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Toute la Tunisie</SelectItem>
                  {GOVS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                <span className="font-semibold text-foreground">{total.toLocaleString("fr-FR")}</span> stations
              </p>
              {activeFilters > 0 && (
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={resetFilters}>
                  <RotateCcw className="h-3 w-3" /> Réinitialiser ({activeFilters})
                </Button>
              )}
            </div>

            <p className="flex items-center gap-1.5 rounded-lg border bg-background p-2 text-[11px] leading-relaxed text-muted-foreground">
              <Users className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              Molette : zoom · Glisser : déplacer · Double-clic : zoom rapide
            </p>
          </div>
        </ScrollArea>
      </aside>

      {/* ---------- Carte ---------- */}
      <div className="relative flex flex-col p-3 md:p-4">
        {loading && stations.length === 0 ? (
          <div className="flex-1"><TabSkeleton title="Chargement de la carte…" /></div>
        ) : (
          <TunisiaMap
            stations={stations}
            ownBrandSlug={brandSlug}
            tools
            showLayerControl
            className="h-[calc(100vh-150px)] min-h-[520px] w-full"
            focusCode={focusStationCode}
            onSelect={() => { if (focusStationCode) setFocusStation(null) }}
          />
        )}
      </div>
    </div>
  )
}
