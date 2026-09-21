'use client'

// Module A.3 — Carte interactive : exploration spatiale multi-couches
// Filtres en accordéon (T27) : recherche, enseignes (saisie semi-automatique),
// services, statut/horaires, gouvernorat, note & trafic. Fiche station,
// outils d'analyse spatiale (mesure, rayon de chalandise, polygone, export).

import * as React from "react"
import { useEffect, useMemo, useState, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion"
import { Search, RotateCcw, MapPin, Users, GitCompareArrows, Trash2, X, Star, Gauge } from "lucide-react"
import { toast } from "sonner"
import { TunisiaMap, SERVICE_ICONS } from "./tunisia-map"
import { BrandAutocomplete } from "./brand-autocomplete"
import { StationDetailDialog } from "@/components/stations/station-detail-dialog"
import { StationCompareDialog, MAX_COMPARE_STATIONS } from "@/components/stations/station-compare-dialog"
import { useAppStore } from "@/store/app-store"
import type { StationDTO, BrandDTO, ServiceDTO } from "@/lib/types"
import { SERVICE_LABELS } from "@/lib/types"
import { TabSkeleton } from "@/components/shell/loading"
import { cn } from "@/lib/utils"

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
  const [detailId, setDetailId] = useState<string | null>(null)

  // Comparateur de stations (épingle depuis les popups de la carte)
  const [compareCodes, setCompareCodes] = useState<string[]>([])
  const [compareOpen, setCompareOpen] = useState(false)

  const [brands, setBrands] = useState<BrandDTO[]>([])
  const [services, setServices] = useState<ServiceDTO[]>([])
  const [stations, setStations] = useState<StationDTO[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Filtres serveur
  const [brandSel, setBrandSel] = useState<string[]>([])
  const [serviceSel, setServiceSel] = useState<string[]>([])
  const [statusSel, setStatusSel] = useState<string[]>([])
  const [hours, setHours] = useState("ALL")
  const [gov, setGov] = useState("ALL")
  const [search, setSearch] = useState("")

  // Filtres locaux (post-requête) : note minimale & trafic minimum
  const [ratingMin, setRatingMin] = useState(0)
  const [trafficMin, setTrafficMin] = useState(0)

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

  // Application locale des filtres note / trafic
  const shownStations = useMemo(() => {
    if (ratingMin === 0 && trafficMin === 0) return stations
    return stations.filter(s => (s.rating ?? 0) >= ratingMin && (s.traffic ?? 0) >= trafficMin)
  }, [stations, ratingMin, trafficMin])

  const localActive = (ratingMin > 0 ? 1 : 0) + (trafficMin > 0 ? 1 : 0)

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])

  const toggleBrand = useCallback((slug: string) => {
    setBrandSel((arr) => arr.includes(slug) ? arr.filter(x => x !== slug) : [...arr, slug])
  }, [])

  // ---- Comparateur ----
  const toggleCompare = useCallback((s: StationDTO) => {
    const has = compareCodes.includes(s.code)
    if (!has && compareCodes.length >= MAX_COMPARE_STATIONS) {
      toast.error("Comparateur plein", {
        description: `Maximum ${MAX_COMPARE_STATIONS} stations — retirez-en une avant d'en épingler une autre.`,
      })
      return
    }
    setCompareCodes(has ? compareCodes.filter(c => c !== s.code) : [...compareCodes, s.code])
    if (has) {
      toast.info(`${s.name} retirée du comparateur.`)
    } else {
      toast.success(`${s.name} épinglée (${compareCodes.length + 1}/${MAX_COMPARE_STATIONS}).`, {
        description: "Épinglez au moins une autre station puis cliquez sur « Comparer ».",
      })
    }
  }, [compareCodes])

  const compareStations = useMemo(() => {
    const byCode = new Map(stations.map(s => [s.code, s]))
    return compareCodes.map(c => byCode.get(c)).filter(Boolean) as StationDTO[]
  }, [stations, compareCodes])

  const clearCompare = useCallback(() => {
    setCompareCodes([])
    setCompareOpen(false)
  }, [])

  const resetFilters = useCallback(() => {
    setBrandSel([]); setServiceSel([]); setStatusSel([]); setHours("ALL"); setGov("ALL"); setSearch("")
    setRatingMin(0); setTrafficMin(0)
  }, [])

  const activeFilters =
    brandSel.length + serviceSel.length + statusSel.length + (hours !== "ALL" ? 1 : 0) + (gov !== "ALL" ? 1 : 0) + (search ? 1 : 0) + localActive

  return (
    <div className="grid flex-1 gap-0 lg:grid-cols-[280px_1fr]">
      {/* ---------- Panneau de filtres (accordéon) ---------- */}
      <aside className="border-b bg-muted/20 lg:border-b-0 lg:border-r">
        <ScrollArea
          className="h-auto lg:sticky lg:h-[calc(100vh-var(--cs-header-h,57px)-55px)]"
          style={{ top: "calc(var(--cs-header-h, 57px) + 49px)" }}
        >
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> Filtres
              </p>
              {activeFilters > 0 && (
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={resetFilters}>
                  <RotateCcw className="h-3 w-3" /> Réinitialiser ({activeFilters})
                </Button>
              )}
            </div>

            <Accordion type="multiple" defaultValue={["recherche", "enseignes"]} className="w-full">
              {/* --- Recherche libre --- */}
              <AccordionItem value="recherche" className="border-none">
                <AccordionTrigger className="rounded-md px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-accent hover:no-underline [&[data-state=open]>svg]:text-primary">
                  <span className="flex items-center gap-1.5"><Search className="h-3.5 w-3.5" /> Recherche</span>
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-3 pt-1">
                  <Input id="recherche-station" placeholder="Nom, ville, enseigne…" value={search}
                    onChange={e => setSearch(e.target.value)} className="h-9 text-sm" />
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Recherche plein texte sur les 1 814 stations du réseau.
                  </p>
                </AccordionContent>
              </AccordionItem>

              {/* --- Enseignes : saisie semi-automatique + cases --- */}
              <AccordionItem value="enseignes" className="border-none">
                <AccordionTrigger className="rounded-md px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-accent hover:no-underline [&[data-state=open]>svg]:text-primary">
                  <span className="flex items-center gap-1.5">
                    Enseignes
                    {brandSel.length > 0 && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{brandSel.length}</Badge>}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 px-2 pb-3 pt-1">
                  <BrandAutocomplete brands={brands} selected={brandSel} onToggle={toggleBrand} />
                  <div className="space-y-1.5 border-t pt-2">
                    {brands.map(b => (
                      <label key={b.slug} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent">
                        <Checkbox checked={brandSel.includes(b.slug)} onCheckedChange={() => toggle(brandSel, b.slug, setBrandSel)} />
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
                        <span className="flex-1 truncate">{b.name}</span>
                        <span className="text-[11px] text-muted-foreground">{b.stationCount}</span>
                      </label>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* --- Services --- */}
              <AccordionItem value="services" className="border-none">
                <AccordionTrigger className="rounded-md px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-accent hover:no-underline [&[data-state=open]>svg]:text-primary">
                  <span className="flex items-center gap-1.5">
                    Services
                    {serviceSel.length > 0 && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{serviceSel.length}</Badge>}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-3 pt-1">
                  <div className="grid grid-cols-1 gap-1.5">
                    {services.map(s => (
                      <label key={s.slug} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent">
                        <Checkbox checked={serviceSel.includes(s.slug)} onCheckedChange={() => toggle(serviceSel, s.slug, setServiceSel)} />
                        {(() => { const Icon = SERVICE_ICONS[s.slug]; return Icon ? <Icon className="h-3.5 w-3.5 text-muted-foreground" /> : null })()}
                        <span className="flex-1 truncate">{s.name}</span>
                      </label>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* --- Statut & horaires --- */}
              <AccordionItem value="statut" className="border-none">
                <AccordionTrigger className="rounded-md px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-accent hover:no-underline [&[data-state=open]>svg]:text-primary">
                  <span className="flex items-center gap-1.5">
                    Statut & horaires
                    {statusSel.length > 0 && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{statusSel.length}</Badge>}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 px-2 pb-3 pt-1">
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_OPTIONS.map(s => (
                      <button key={s.value} onClick={() => toggle(statusSel, s.value, setStatusSel)}
                        className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors",
                          statusSel.includes(s.value)
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "hover:bg-accent")}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <Select value={hours} onValueChange={setHours}>
                    <SelectTrigger className="h-9 text-sm" aria-label="Filtrer par horaires"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {HOURS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </AccordionContent>
              </AccordionItem>

              {/* --- Gouvernorat --- */}
              <AccordionItem value="gouvernorat" className="border-none">
                <AccordionTrigger className="rounded-md px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-accent hover:no-underline [&[data-state=open]>svg]:text-primary">
                  <span className="flex items-center gap-1.5">
                    Gouvernorat
                    {gov !== "ALL" && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">1</Badge>}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-3 pt-1">
                  <Select value={gov} onValueChange={setGov}>
                    <SelectTrigger className="h-9 text-sm" aria-label="Filtrer par gouvernorat"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Toute la Tunisie</SelectItem>
                      {GOVS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </AccordionContent>
              </AccordionItem>

              {/* --- Note & trafic (nouveaux filtres) --- */}
              <AccordionItem value="performance" className="border-none">
                <AccordionTrigger className="rounded-md px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-accent hover:no-underline [&[data-state=open]>svg]:text-primary">
                  <span className="flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5" /> Note & trafic
                    {localActive > 0 && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{localActive}</Badge>}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 px-2 pb-3 pt-1">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 font-medium"><Star className="h-3.5 w-3.5 text-amber-500" /> Note minimale</span>
                      <span className="tabular-nums text-muted-foreground">
                        {ratingMin === 0 ? "toutes" : `${ratingMin.toFixed(1)} / 5`}
                      </span>
                    </div>
                    <Slider
                      value={[ratingMin]} min={0} max={5} step={0.5}
                      onValueChange={([v]) => setRatingMin(v)}
                      aria-label="Note minimale"
                    />
                    <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                      <span>Toutes</span><span>3.0</span><span>4.0</span><span>5.0</span>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 font-medium"><Gauge className="h-3.5 w-3.5 text-emerald-600" /> Trafic minimum</span>
                      <span className="tabular-nums text-muted-foreground">
                        {trafficMin === 0 ? "tous" : `${trafficMin.toLocaleString("fr-FR")} véh/j`}
                      </span>
                    </div>
                    <Slider
                      value={[trafficMin]} min={0} max={3000} step={100}
                      onValueChange={([v]) => setTrafficMin(v)}
                      aria-label="Trafic minimum"
                    />
                    <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                      <span>Tous</span><span>1 000</span><span>2 000</span><span>3 000+</span>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="flex items-center justify-between border-t pt-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                <span className="font-semibold text-foreground">{shownStations.length.toLocaleString("fr-FR")}</span>
                <span>/ {total.toLocaleString("fr-FR")} stations</span>
              </p>
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
            stations={shownStations}
            ownBrandSlug={brandSlug}
            tools
            showLayerControl
            className="h-[calc(100vh-150px)] min-h-[520px] w-full"
            focusCode={focusStationCode}
            onSelect={() => { if (focusStationCode) setFocusStation(null) }}
            onViewDetail={(s) => setDetailId(s.id)}
            onCompare={toggleCompare}
            compareCodes={compareCodes}
          />
        )}

        {/* Barre de comparaison — stations épinglées depuis les popups.
            Sticky : reste visible en bas de l'écran même quand le bas de la carte
            est sous la ligne de flottaison (viewports courts). */}
        {compareStations.length > 0 && (
          <div
            role="region"
            aria-label="Comparateur de stations"
            className="sticky bottom-4 z-30 mx-auto mt-[-72px] w-[min(94%,680px)] pb-1 animate-in fade-in slide-in-from-bottom-3 duration-300"
          >
            <div className="flex items-center gap-2 rounded-xl border border-emerald-600/25 bg-background/92 p-2 shadow-xl shadow-emerald-950/10 backdrop-blur">
              <span className="ml-1 flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                <GitCompareArrows className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Comparateur</span>
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
                {compareStations.map(s => (
                  <span
                    key={s.code}
                    className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-2 pr-1 text-xs transition-colors hover:bg-muted"
                  >
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: s.brandColor }} aria-hidden />
                    <span className="max-w-[130px] truncate">{s.name}</span>
                    <button
                      onClick={() => toggleCompare(s)}
                      aria-label={`Retirer ${s.name} du comparateur`}
                      className="flex h-4.5 w-4.5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  </span>
                ))}
                {compareStations.length < 2 && (
                  <span className="shrink-0 text-[11px] italic text-muted-foreground">
                    Épinglez au moins 2 stations (clic sur un marqueur → « Comparer »)
                  </span>
                )}
              </div>
              <span className="shrink-0 rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-emerald-700 dark:text-emerald-400" aria-hidden>
                {compareStations.length}/{MAX_COMPARE_STATIONS}
              </span>
              <Button
                size="sm"
                disabled={compareStations.length < 2}
                className="h-8 shrink-0 gap-1.5"
                onClick={() => setCompareOpen(true)}
              >
                <GitCompareArrows className="h-3.5 w-3.5" aria-hidden />
                Comparer
              </Button>
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={clearCompare}
                aria-label="Vider le comparateur"
                title="Vider le comparateur"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Fiche détaillée d'une station (depuis la popup carte) */}
      <StationDetailDialog
        stationId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={() => {
          setDetailId(null)
          toast.info("L'édition d'une station se fait depuis l'onglet « Mes stations ».")
        }}
        onLocate={(code) => { setDetailId(null); setFocusStation(code) }}
        onCompare={toggleCompare}
        isStationPinned={(st) => compareCodes.includes(st.code)}
      />

      {/* Comparateur de stations (épinglées depuis la carte) */}
      <StationCompareDialog
        open={compareOpen}
        stations={compareStations}
        onClose={() => setCompareOpen(false)}
        onOpenDetail={(id) => { setCompareOpen(false); setDetailId(id) }}
        onLocate={(code) => { setCompareOpen(false); setFocusStation(code) }}
      />
    </div>
  )
}
