"use client"

// CarbuScope — T58 — Publicité, sous-menu 1 « Listing des supports » :
// le TEST étendu demandé par l'utilisateur — « onglets : Cartographie - RFR
// - Metro - Urbain et dans chaque onglet on insère des données fictives des
// supports publicitaires par mode ». Chaque onglet présente les supports
// des RÉGIES EXTERNES (le terrain avant de lancer une campagne) :
//   · KPIs (supports visibles, disponibles, contacts/j, coût moyen, CPM) ;
//   · FILTRES RÉTRACTABLES (pattern T56/T57) : recherche débouncée,
//     gouvernorat, régie, type de support, statut, coût max ;
//   · TABLE IMBRIQUÉE PAR RÉGIE : rangée régie repliable (agrégats) →
//     rangées support → fiche attributs complète (5 blocs) ;
//   · CARTE OSM (fond OpenStreetMap par défaut — convention T57) :
//     marqueurs ∝ contacts, popup riche + sélection, plein écran ;
//   · SÉLECTION pour le simulateur : cases + panier flottant → onglet
//     « Simulateur publicitaire ».
// Onglets de mode pilotés par nav["pub-mode"] (pattern onglets dans la page).
// Données : GET /api/pub/supports (référentiel commun des régies).

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import {
  Layers, MapPin, ChevronDown, ChevronRight, SlidersHorizontal, RotateCcw,
  Maximize2, Minimize2, Search, Eye, Contact, Wallet, Gauge, Download,
  Trash2, Calculator, Map as MapIcon, TrainFront, TramFront, Building2,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/store/app-store"
import {
  type PubSupportDTO, pubModeMeta, pubSupportMeta, pubSupportLabel, formatTnd,
  formatNum, formatDateFr, PUB_MODES, PUB_STATUT_META, PUB_ETAT_META,
  PUB_ORIENTATION_LABELS, PUB_ECLAIRAGE_LABELS, PUB_ENVIRONNEMENT_LABELS,
  downloadPubSupportsCsv,
} from "./pub-shared"

const PubMapDyn = dynamic(() => import("./pub-map").then(m => m.PubMap), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center bg-muted/30 text-sm text-muted-foreground">Chargement de la carte…</div>,
})

// Normalisation recherche sans accents (pattern shadow-osm-tab).
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()

const STATUT_TONE: Record<string, string> = {
  DISPONIBLE: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  RESERVE: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  OCCUPE: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400",
  MAINTENANCE: "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
}

const MODE_ICONS: Record<string, typeof MapIcon> = {
  CARTOGRAPHIE: MapIcon,
  RFR: TrainFront,
  METRO: TramFront,
  URBAIN: Building2,
}

export interface PubListingProps {
  supports: PubSupportDTO[]
  loading: boolean
  error: string | null
  selectedIds: ReadonlySet<string>
  onToggleSelect: (p: PubSupportDTO) => void
  onClearSelection: () => void
  onSimulate: () => void
}

export function PubListing({
  supports, loading, error, selectedIds, onToggleSelect, onClearSelection, onSimulate,
}: PubListingProps) {
  // Onglet de mode piloté par le store (clé « pub-mode ») — survit au
  // changement de sous-menu (listing ↔ simulateur ↔ rapports).
  const setNav = useAppStore(s => s.setNav)
  const mode = useAppStore(s => s.nav["pub-mode"]) ?? "CARTOGRAPHIE"

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-11 rounded-xl" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[72px] rounded-xl" />)}
        </div>
        <Skeleton className="h-[420px] rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-[var(--c-terra)]/60">
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <p className="text-sm font-semibold text-[var(--c-terra)]">Impossible de charger le listing des supports</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" className="h-11" onClick={() => window.location.reload()}>Réessayer</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="min-w-0 space-y-4">
      {/* ---- 4 onglets de mode (Cartographie · RFR · Metro · Urbain) ---- */}
      <Tabs value={mode} onValueChange={v => setNav("pub-mode", v)} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-4 gap-1 p-1">
          {PUB_MODES.map(m => {
            const meta = pubModeMeta(m)
            const Icon = MODE_ICONS[m] ?? meta.icon
            const nb = supports.filter(s => s.mode === m).length
            return (
              <TabsTrigger
                key={m}
                value={m}
                className="min-w-0 gap-1.5 px-2 py-2 text-xs sm:text-[13px]"
                title={meta.description}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{meta.label}</span>
                <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-[10px] leading-none">{nb}</Badge>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {PUB_MODES.map(m => (
          <TabsContent key={m} value={m} className="mt-0 space-y-4">
            <ModeListing
              mode={m}
              supports={supports.filter(s => s.mode === m)}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              onClearSelection={onClearSelection}
              onSimulate={onSimulate}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Listing d'un mode : filtres + KPIs + carte + table imbriquée par régie
// ---------------------------------------------------------------------------
function ModeListing({
  mode, supports, selectedIds, onToggleSelect, onClearSelection, onSimulate,
}: {
  mode: string
  supports: PubSupportDTO[]
  selectedIds: ReadonlySet<string>
  onToggleSelect: (p: PubSupportDTO) => void
  onClearSelection: () => void
  onSimulate: () => void
}) {
  const meta = pubModeMeta(mode)

  // ---- Filtres (rétractables) ----
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [queryInput, setQueryInput] = useState("")
  const [query, setQuery] = useState("")
  const [govF, setGovF] = useState("TOUS")
  const [regieF, setRegieF] = useState("TOUS")
  const [typeF, setTypeF] = useState("TOUS")
  const [statutF, setStatutF] = useState("TOUS")
  const [coutMax, setCoutMax] = useState(0) // 0 = aucune limite

  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput.trim()), 250)
    return () => clearTimeout(t)
  }, [queryInput])

  // ---- Options de filtres dérivées des données du mode ----
  const govs = useMemo(() => [...new Set(supports.map(p => p.gouvernorat))].sort((a, b) => a.localeCompare(b, "fr")), [supports])
  const regies = useMemo(() => [...new Set(supports.map(p => p.regie))].sort((a, b) => a.localeCompare(b, "fr")), [supports])
  const types = useMemo(() => [...new Set(supports.map(p => p.supportType))].sort((a, b) => pubSupportLabel(a).localeCompare(pubSupportLabel(b), "fr")), [supports])
  const coutPlafond = useMemo(() => {
    const max = supports.reduce((m, p) => Math.max(m, p.coutMensuel), 0)
    return Math.ceil(max / 100) * 100
  }, [supports])

  const filtered = useMemo(() => {
    const q = fold(query)
    return supports.filter(p => {
      if (q) {
        const hay = fold(`${p.code} ${p.name} ${p.lieu} ${p.delegation} ${p.gouvernorat} ${p.regie}`)
        if (!hay.includes(q)) return false
      }
      if (govF !== "TOUS" && p.gouvernorat !== govF) return false
      if (regieF !== "TOUS" && p.regie !== regieF) return false
      if (typeF !== "TOUS" && p.supportType !== typeF) return false
      if (statutF !== "TOUS" && p.statut !== statutF) return false
      if (coutMax > 0 && p.coutMensuel > coutMax) return false
      return true
    })
  }, [supports, query, govF, regieF, typeF, statutF, coutMax])

  const activeFilters =
    (govF !== "TOUS" ? 1 : 0) + (regieF !== "TOUS" ? 1 : 0) + (typeF !== "TOUS" ? 1 : 0) +
    (statutF !== "TOUS" ? 1 : 0) + (coutMax > 0 ? 1 : 0) + (query ? 1 : 0)

  const resetFilters = useCallback(() => {
    setGovF("TOUS"); setRegieF("TOUS"); setTypeF("TOUS"); setStatutF("TOUS")
    setCoutMax(0); setQueryInput(""); setQuery("")
  }, [])

  // ---- KPIs (jeu filtré) ----
  const kpis = useMemo(() => {
    const dispo = filtered.filter(p => p.statut === "DISPONIBLE").length
    const contacts = filtered.reduce((s, p) => s + p.contactsJ, 0)
    const couts = filtered.reduce((s, p) => s + p.coutMensuel, 0)
    const cpms = filtered.filter(p => p.cpm !== null && p.cpm > 0)
    const cpmMoy = cpms.length ? cpms.reduce((s, p) => s + (p.cpm ?? 0), 0) / cpms.length : 0
    return { dispo, contacts, coutMoy: filtered.length ? couts / filtered.length : 0, cpmMoy }
  }, [filtered])

  // ---- Table imbriquée : groupes régie + lignes détail ----
  const groups = useMemo(() => {
    const m = new Map<string, PubSupportDTO[]>()
    for (const p of filtered) {
      const arr = m.get(p.regie) ?? []
      arr.push(p)
      m.set(p.regie, arr)
    }
    return [...m.entries()].map(([regie, ps]) => ({ regie, ps }))
  }, [filtered])

  const [openRegies, setOpenRegies] = useState<Set<string>>(() => new Set())
  const [openSupports, setOpenSupports] = useState<Set<string>>(() => new Set())
  const toggleSet = useCallback((set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    setter(next)
  }, [])

  // ---- Carte : focus + plein écran (pattern media-inventory T57) ----
  const [basemap, setBasemap] = useState<"osm" | "satellite" | "noir">("osm")
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number } | null>(null)
  const fsRef = useRef<HTMLDivElement>(null)
  const [isFs, setIsFs] = useState(false)
  const [fsOverlay, setFsOverlay] = useState(false)
  const [resizeKey, setResizeKey] = useState(0)

  useEffect(() => {
    const onChange = () => {
      const active = document.fullscreenElement === fsRef.current
      setIsFs(active)
      if (active || !document.fullscreenElement) setResizeKey(k => k + 1)
    }
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    const el = fsRef.current
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else if (el?.requestFullscreen) {
        await el.requestFullscreen()
      } else {
        setFsOverlay(f => !f)
        setResizeKey(k => k + 1)
      }
    } catch {
      setFsOverlay(f => !f)
      setResizeKey(k => k + 1)
    }
  }, [])

  const fullscreenActive = isFs || fsOverlay

  useEffect(() => {
    if (!fsOverlay) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setFsOverlay(false); setResizeKey(k => k + 1) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [fsOverlay])

  const fitSignature = useMemo(() => `${filtered.length}:${filtered.slice(0, 4).map(p => p.id).join(",")}`, [filtered])

  // ---- Panier de sélection (mini-simulation) ----
  const selected = useMemo(() => supports.filter(p => selectedIds.has(p.id)), [supports, selectedIds])
  const panier = useMemo(() => {
    const budgetMensuel = selected.reduce((s, p) => s + p.coutMensuel, 0)
    const contactsJ = selected.reduce((s, p) => s + p.contactsJ, 0)
    const cpm = contactsJ > 0 ? budgetMensuel / ((contactsJ * 30.4) / 1000) : 0
    return { budgetMensuel, contactsJ, cpm }
  }, [selected])

  const onExportCsv = useCallback(() => {
    if (selected.length === 0) return
    downloadPubSupportsCsv(selected, "selection")
    toast(`Export CSV : ${selected.length} support${selected.length > 1 ? "s" : ""} sélectionné${selected.length > 1 ? "s" : ""}.`)
  }, [selected])

  // ---------------------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------------------
  const filtersPanel = (
    <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <div className="flex min-w-0 flex-col gap-1.5 md:col-span-2">
        <Label htmlFor={`pub-q-${mode}`} className="text-xs text-muted-foreground">Recherche (code, repère, lieu, régie)</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id={`pub-q-${mode}`}
            value={queryInput}
            onChange={e => setQueryInput(e.target.value)}
            placeholder="ex. « RN9 », « abribus », « Métro Média »…"
            className="h-9 pl-8"
          />
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Gouvernorat</Label>
        <Select value={govF} onValueChange={setGovF}>
          <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="TOUS">Tous ({supports.length})</SelectItem>
            {govs.map(g => (
              <SelectItem key={g} value={g}>{g} ({supports.filter(p => p.gouvernorat === g).length})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Régie</Label>
        <Select value={regieF} onValueChange={setRegieF}>
          <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="TOUS">Toutes ({regies.length})</SelectItem>
            {regies.map(r => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Type de support</Label>
        <Select value={typeF} onValueChange={setTypeF}>
          <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="TOUS">Tous les types</SelectItem>
            {types.map(ty => (
              <SelectItem key={ty} value={ty}>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: pubSupportMeta(ty).color }} aria-hidden />
                  {pubSupportLabel(ty)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Statut</Label>
        <Select value={statutF} onValueChange={setStatutF}>
          <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["TOUS", "DISPONIBLE", "RESERVE", "OCCUPE", "MAINTENANCE"].map(s => (
              <SelectItem key={s} value={s}>{s === "TOUS" ? "Tous les statuts" : PUB_STATUT_META[s]?.label ?? s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5 md:col-span-2 xl:col-span-3 2xl:col-span-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Coût mensuel maximum</Label>
          <span className="text-xs font-medium tabular-nums text-foreground">
            {coutMax > 0 ? `≤ ${formatTnd(coutMax)}/mois` : "aucune limite"}
          </span>
        </div>
        <Slider
          value={[coutMax]}
          min={0}
          max={coutPlafond}
          step={50}
          onValueChange={v => setCoutMax(v[0] ?? 0)}
          aria-label="Coût mensuel maximum"
        />
      </div>
    </div>
  )

  return (
    <div className="min-w-0 space-y-4">
      {/* ---- En-tête du mode ---- */}
      <Card className="min-w-0 border-l-4" style={{ borderLeftColor: meta.color }}>
        <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
              aria-hidden
            >
              <meta.icon className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold leading-tight">Supports {meta.label}</h3>
              <p className="mt-0.5 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">{meta.description}</p>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 text-[11px]">
            {supports.length} supports · {regies.length} régies · {govs.length} gouvernorats
          </Badge>
        </CardContent>
      </Card>

      {/* ---- KPIs du jeu filtré ---- */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard icon={Layers} label="Supports visibles" value={`${formatNum(filtered.length)} / ${formatNum(supports.length)}`} />
        <KpiCard icon={Eye} label="Disponibles" value={formatNum(kpis.dispo)} tone="emerald" />
        <KpiCard icon={Contact} label="Contacts / jour" value={formatNum(kpis.contacts)} />
        <KpiCard icon={Wallet} label="Coût mensuel moyen" value={formatTnd(kpis.coutMoy)} />
        <KpiCard icon={Gauge} label="CPM moyen" value={kpis.cpmMoy > 0 ? `${kpis.cpmMoy.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} DT` : "—"} />
      </div>

      {/* ---- Filtres rétractables ---- */}
      <Card className="min-w-0">
        <button
          type="button"
          onClick={() => setFiltersOpen(o => !o)}
          aria-expanded={filtersOpen}
          aria-controls={`pub-filters-${mode}`}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-sm font-semibold">Filtres</span>
            {activeFilters > 0 && (
              <Badge variant="secondary" className="text-[11px]">{activeFilters} actif{activeFilters > 1 ? "s" : ""}</Badge>
            )}
          </span>
          <span className="flex items-center gap-2">
            {activeFilters > 0 && (
              <span
                role="button"
                tabIndex={0}
                onClick={e => { e.stopPropagation(); resetFilters() }}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); resetFilters() } }}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" aria-hidden /> Réinitialiser
              </span>
            )}
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", filtersOpen ? "" : "-rotate-90")} aria-hidden />
          </span>
        </button>
        <div id={`pub-filters-${mode}`} className={cn("grid transition-all duration-200", filtersOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
          <div className="overflow-hidden">
            <div className="border-t px-4 py-3.5">{filtersPanel}</div>
          </div>
        </div>
      </Card>

      {/* ---- Carte + table imbriquée ---- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Carte — d'abord sur mobile, colonne droite sur desktop. */}
        <Card className="min-w-0 order-first xl:order-last xl:col-span-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
            <span className="flex min-w-0 items-center gap-2">
              <MapIcon className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />
              <span className="truncate text-sm font-semibold">Carte {meta.label}</span>
              <Badge variant="secondary" className="text-[11px]">{formatNum(filtered.length)}</Badge>
            </span>
            <span className="flex items-center gap-1.5">
              <Select value={basemap} onValueChange={v => setBasemap(v as typeof basemap)}>
                <SelectTrigger className="h-8 w-[130px] text-xs" aria-label="Fond de carte"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="osm">Plan OSM</SelectItem>
                  <SelectItem value="satellite">Satellite</SelectItem>
                  <SelectItem value="noir">Nuit</SelectItem>
                </SelectContent>
              </Select>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={() => void toggleFullscreen()}>
                    {fullscreenActive ? <Minimize2 className="h-3.5 w-3.5" aria-hidden /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden />}
                    <span className="hidden sm:inline">{fullscreenActive ? "Quitter" : "Plein écran"}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{fullscreenActive ? "Échap pour quitter" : "Carte en plein écran (fond OSM)"}</TooltipContent>
              </Tooltip>
            </span>
          </div>
          <div
            ref={fsRef}
            className={cn(
              "cs-pub-fs relative overflow-hidden",
              fullscreenActive
                ? fsOverlay
                  ? "fixed inset-3 z-[70] rounded-xl border bg-[var(--c-paper)] p-1.5 shadow-2xl"
                  : "h-full"
                : "h-[340px] rounded-b-lg sm:h-[420px] xl:h-[560px]",
            )}
          >
            <div className="h-full w-full">
              <PubMapDyn
                supports={filtered}
                selectedIds={selectedIds}
                basemap={basemap}
                focus={focus}
                resizeKey={resizeKey}
                fitSignature={fitSignature}
                onToggleSelect={onToggleSelect}
              />
            </div>
          </div>
        </Card>

        {/* Table imbriquée par régie */}
        <Card className="min-w-0 xl:col-span-7">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
            <span className="flex min-w-0 items-center gap-2">
              <ChevronRight className="h-4 w-4 shrink-0 -rotate-90 text-muted-foreground" aria-hidden />
              <span className="truncate text-sm font-semibold">Listing — table imbriquée par régie</span>
            </span>
            <Badge variant="outline" className="text-[11px]">
              {groups.length} régie{groups.length > 1 ? "s" : ""} · {filtered.length} supports
            </Badge>
          </div>
          <div className="max-h-[560px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-[var(--c-paper)] dark:bg-zinc-900">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-9" aria-label="Sélection" />
                  <TableHead className="min-w-[190px]">Support</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead className="hidden lg:table-cell">Lieu</TableHead>
                  <TableHead className="hidden sm:table-cell text-right">Flux/j</TableHead>
                  <TableHead className="text-right">Contacts/j</TableHead>
                  <TableHead className="text-right">Coût/mois</TableHead>
                  <TableHead className="hidden xl:table-cell text-right">CPM</TableHead>
                  <TableHead className="hidden sm:table-cell">Statut</TableHead>
                  <TableHead className="w-14" aria-label="Actions" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                      Aucun support ne correspond aux filtres — <button type="button" className="font-medium underline underline-offset-2" onClick={resetFilters}>réinitialiser</button>.
                    </TableCell>
                  </TableRow>
                )}
                {groups.map(({ regie, ps }) => {
                  const open = openRegies.has(regie)
                  const gContacts = ps.reduce((s, p) => s + p.contactsJ, 0)
                  const gCout = ps.reduce((s, p) => s + p.coutMensuel, 0)
                  const gDispo = ps.filter(p => p.statut === "DISPONIBLE").length
                  const gSel = ps.filter(p => selectedIds.has(p.id)).length
                  return (
                    <NestedGroup
                      key={regie}
                      regie={regie}
                      supports={ps}
                      open={open}
                      onToggle={() => toggleSet(openRegies, regie, setOpenRegies)}
                      aggregates={{ contacts: gContacts, cout: gCout, dispo: gDispo, sel: gSel }}
                      openSupports={openSupports}
                      onToggleSupport={(id: string) => toggleSet(openSupports, id, setOpenSupports)}
                      selectedIds={selectedIds}
                      onToggleSelect={onToggleSelect}
                      onLocate={p => setFocus({ lat: p.lat, lng: p.lng })}
                    />
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <p className="border-t px-4 py-2 text-[11.5px] text-muted-foreground">
            Cliquez sur une régie pour l&apos;ouvrir, sur une rangée pour déplier la fiche attributs complète, sur <MapPin className="inline h-3 w-3" aria-hidden /> pour survoler la carte.
          </p>
        </Card>
      </div>

      {/* ---- Panier de sélection (mini-simulation) ---- */}
      {selected.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3">
          <div className="pointer-events-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-emerald-300 bg-[var(--c-paper)]/97 px-4 py-2.5 shadow-2xl backdrop-blur dark:border-emerald-800 dark:bg-zinc-900/95">
            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              <Badge className="bg-emerald-600 text-white">{selected.length}</Badge>
              support{selected.length > 1 ? "s" : ""} sélectionné{selected.length > 1 ? "s" : ""}
            </span>
            <span className="hidden items-center gap-1.5 text-[12.5px] text-muted-foreground sm:flex">
              <Wallet className="h-3.5 w-3.5" aria-hidden /> {formatTnd(panier.budgetMensuel)}/mois
            </span>
            <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
              <Contact className="h-3.5 w-3.5" aria-hidden /> {formatNum(panier.contactsJ)} contacts/j
            </span>
            <span className="hidden items-center gap-1.5 text-[12.5px] text-muted-foreground md:flex">
              <Gauge className="h-3.5 w-3.5" aria-hidden /> CPM {panier.cpm > 0 ? panier.cpm.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—"} DT
            </span>
            <span className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={onExportCsv} aria-label="Exporter la sélection en CSV">
                    <Download className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Exporter la sélection (CSV)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={onClearSelection} aria-label="Vider la sélection">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Vider la sélection</TooltipContent>
              </Tooltip>
              <Button size="sm" className="h-9 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700" onClick={onSimulate}>
                <Calculator className="h-3.5 w-3.5" aria-hidden />
                Simuler la campagne
              </Button>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rangée de groupe (régie) — 1er niveau d'imbrication
// ---------------------------------------------------------------------------
function NestedGroup({
  regie, supports, open, onToggle, aggregates, openSupports, onToggleSupport,
  selectedIds, onToggleSelect, onLocate,
}: {
  regie: string
  supports: PubSupportDTO[]
  open: boolean
  onToggle: () => void
  aggregates: { contacts: number; cout: number; dispo: number; sel: number }
  openSupports: ReadonlySet<string>
  onToggleSupport: (id: string) => void
  selectedIds: ReadonlySet<string>
  onToggleSelect: (p: PubSupportDTO) => void
  onLocate: (p: PubSupportDTO) => void
}) {
  return (
    <>
      <TableRow
        className="cursor-pointer select-none bg-muted/45 font-medium hover:bg-muted/70"
        onClick={onToggle}
        aria-expanded={open}
      >
        <TableCell colSpan={10}>
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden />
              <span className="truncate text-[13.5px] font-semibold">{regie}</span>
              <Badge variant="secondary" className="text-[11px]">{supports.length}</Badge>
              {aggregates.sel > 0 && (
                <Badge className="bg-emerald-600 text-[11px] text-white">{aggregates.sel} sélectionné{aggregates.sel > 1 ? "s" : ""}</Badge>
              )}
            </span>
            <span className="ml-auto flex items-center gap-3 text-[11.5px] tabular-nums text-muted-foreground">
              <span className="hidden sm:inline">{aggregates.dispo} dispo</span>
              <span className="hidden sm:inline">{formatNum(aggregates.contacts)} contacts/j</span>
              <span>{formatTnd(aggregates.cout)}/mois</span>
            </span>
          </span>
        </TableCell>
      </TableRow>
      {open && supports.map(p => (
        <NestedSupport
          key={p.id}
          support={p}
          open={openSupports.has(p.id)}
          onToggle={() => onToggleSupport(p.id)}
          selected={selectedIds.has(p.id)}
          onToggleSelect={() => onToggleSelect(p)}
          onLocate={() => onLocate(p)}
        />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Rangée support (2e niveau) + fiche attributs complète (3e niveau replié)
// ---------------------------------------------------------------------------
function NestedSupport({
  support: p, open, onToggle, selected, onToggleSelect, onLocate,
}: {
  support: PubSupportDTO
  open: boolean
  onToggle: () => void
  selected: boolean
  onToggleSelect: () => void
  onLocate: () => void
}) {
  const meta = pubSupportMeta(p.supportType)
  return (
    <>
      <TableRow
        className={cn("cursor-pointer transition-colors", selected ? "bg-emerald-50/60 dark:bg-emerald-950/30" : "hover:bg-muted/50")}
        onClick={onToggle}
        aria-expanded={open}
      >
        <TableCell className="pl-7" onClick={e => e.stopPropagation()}>
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect()}
            aria-label={`Sélectionner ${p.code} pour la campagne`}
            className="data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:text-white"
          />
        </TableCell>
        <TableCell className="max-w-[230px]">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium leading-snug">{p.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{p.code} · {p.format}</p>
          </div>
        </TableCell>
        <TableCell className="hidden md:table-cell">
          <TypeBadge type={p.supportType} />
        </TableCell>
        <TableCell className="hidden max-w-[170px] lg:table-cell">
          <p className="truncate text-[12px] leading-snug">{p.delegation}</p>
          <p className="truncate text-[11px] text-muted-foreground">{p.lieu}</p>
        </TableCell>
        <TableCell className="hidden text-right tabular-nums text-[12.5px] text-muted-foreground sm:table-cell">
          {p.traficVehJ > 0 ? `${formatNum(p.traficVehJ)} véh.` : `${formatNum(p.fluxPietonsJ)} pié.`}
        </TableCell>
        <TableCell className="text-right tabular-nums text-[12.5px] font-medium">{formatNum(p.contactsJ)}</TableCell>
        <TableCell className="text-right tabular-nums text-[12.5px]">{formatTnd(p.coutMensuel)}</TableCell>
        <TableCell className="hidden text-right tabular-nums text-[12px] text-muted-foreground xl:table-cell">
          {p.cpm !== null ? `${p.cpm.toLocaleString("fr-FR")} DT` : "—"}
        </TableCell>
        <TableCell className="hidden sm:table-cell">
          <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUT_TONE[p.statut])}>
            {PUB_STATUT_META[p.statut]?.label ?? p.statut}
          </span>
        </TableCell>
        <TableCell onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" onClick={onLocate} aria-label={`Voir ${p.code} sur la carte`}>
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Survoler sur la carte</TooltipContent>
            </Tooltip>
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open ? "" : "-rotate-90")} aria-hidden />
          </div>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-muted/25 hover:bg-muted/25">
          <TableCell colSpan={10} className="px-7 py-3">
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
              <DetailBlock titre="Identification" items={[
                ["Code", p.code],
                ["Repère", p.name],
                ["Mode", pubModeMeta(p.mode).label],
                ["Régie", p.regie],
              ]} />
              <DetailBlock titre="Support" items={[
                ["Type", pubSupportLabel(p.supportType)],
                ["Format", p.format],
                ["Surface", `${p.surfaceM2.toLocaleString("fr-FR")} m²`],
                ["Orientation", PUB_ORIENTATION_LABELS[p.orientation] ?? p.orientation],
                ["Éclairage", PUB_ECLAIRAGE_LABELS[p.eclairage] ?? p.eclairage],
              ]} />
              <DetailBlock titre="Emplacement" items={[
                ["Gouvernorat", p.gouvernorat],
                ["Délégation", p.delegation],
                ["Lieu / axe", p.lieu],
                ["Environnement", PUB_ENVIRONNEMENT_LABELS[p.environnement] ?? p.environnement],
                ["Coordonnées", `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`],
              ]} />
              <DetailBlock titre="Audience" items={[
                ["Visibilité", `${p.visibilite} / 100`],
                ["Trafic véhicules", p.traficVehJ > 0 ? `${formatNum(p.traficVehJ)} véh./j` : "—"],
                ["Flux piétons", `${formatNum(p.fluxPietonsJ)} pié./j`],
                ["Contacts estimés", `${formatNum(p.contactsJ)} / jour`],
              ]} />
              <DetailBlock titre="Commercial" items={[
                ["Coût mensuel", formatTnd(p.coutMensuel)],
                ["Coût hebdomadaire", formatTnd(p.coutMensuel / 4.345)],
                ["CPM", p.cpm !== null ? `${p.cpm.toLocaleString("fr-FR")} DT` : "—"],
                ["Engagement minimum", `${p.dureeMinMois} mois`],
                ["Statut", PUB_STATUT_META[p.statut]?.label ?? p.statut],
                ["État", PUB_ETAT_META[p.etat]?.label ?? p.etat],
                ["Dernier contrôle", formatDateFr(p.dernierControle)],
              ]} />
              {p.notes && (
                <div className="sm:col-span-2 xl:col-span-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Notes terrain</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/90">{p.notes}</p>
                </div>
              )}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant={selected ? "outline" : "default"}
                className={cn("h-8 gap-1.5 text-xs", !selected && "bg-emerald-600 text-white hover:bg-emerald-700")}
                onClick={onToggleSelect}
              >
                {selected ? "Retirer de la sélection" : "Sélectionner pour la campagne"}
              </Button>
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground" style={{ borderColor: meta.color }}>
                <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} aria-hidden />
                {pubSupportLabel(p.supportType)}
              </span>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

/** Badge type de support (couleur chaude — jamais bleue). */
function TypeBadge({ type }: { type: string }) {
  const meta = pubSupportMeta(type)
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium" style={{ borderColor: `${meta.color}66` }}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} aria-hidden />
      <span className="truncate">{meta.label}</span>
    </span>
  )
}

/** Bloc de fiche attributs (3e niveau de la table imbriquée). */
function DetailBlock({ titre, items }: { titre: string; items: ReadonlyArray<[string, string]> }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titre}</p>
      <dl className="mt-1 space-y-0.5">
        {items.map(([k, v]) => (
          <div key={k} className="flex min-w-0 items-baseline justify-between gap-3 text-[12.5px] leading-snug">
            <dt className="shrink-0 text-muted-foreground">{k}</dt>
            <dd className="min-w-0 truncate text-right font-medium" title={v}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Petite carte KPI (compacte). */
function KpiCard({ icon: Icon, label, value, tone }: {
  icon: typeof Layers; label: string; value: string; tone?: "emerald"
}) {
  return (
    <Card className={cn("min-w-0", tone === "emerald" && "border-emerald-200 dark:border-emerald-900")}>
      <CardContent className="flex items-center gap-2.5 p-3">
        <div className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          tone === "emerald"
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
            : "bg-muted text-muted-foreground",
        )} aria-hidden>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[11px] text-muted-foreground">{label}</p>
          <p className="truncate text-[15px] font-bold leading-tight tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
