'use client'

// T63-b — Module « Panneaux publicitaires » (Portail enseigne > Publicité) :
// l'inventaire des faces d'affichage (grand format 12×8, 4×3, DOOH, totems,
// abri-bus) proposé aux enseignes pour CHOISIR leurs emplacements média.
//
// Données : GET /api/panels (registre partagé, ~48 faces réelles plausibles :
// A1/A4/P7, grands axes, entrées de ville, abords de stations). Filtres côté
// client (curseurs réactifs). Réservation : PATCH /api/panels/[id]
// {action: reserver|liberer} — mise à jour OPTIMISTE + rollback, tracée dans
// le journal d'audit SA (module PORTAIL). Comparateur : sélection de faces →
// barre flottante → Sheet comparatif (flux, visibilité, prix, CPM) + export
// « Plan média » PDF (socle report-pdf.ts, accent prune).

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Banknote, Eye, Frame, Gauge, GitCompare, Lightbulb, Loader2, MapPin, Monitor,
  PanelTop, Percent, RefreshCw, Search, ServerCrash, Sparkles, Store, Ticket,
  TrendingUp, Users, X, Zap,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Slider } from "@/components/ui/slider"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { downloadPanelsPdf } from "./panels-pdf"

type Panel = {
  id: string
  code: string
  nom: string
  format: string
  gouvernorat: string
  delegation: string
  axe: string
  flux: number
  visibilite: number
  illumination: boolean
  prixSemaine: number
  loueur: string
  statut: string
  reservePar: string | null
}

type Stats = {
  total: number
  disponibles: number
  fluxMoyen: number
  prixMedian: number
  formats: string[]
  gouvernorats: string[]
}

// ---------------------------------------------------------------------------
// Catalogue des formats (libellés FR courts + icônes + spec indicatives)
// ---------------------------------------------------------------------------

type FormatDef = { id: string; label: string; short: string; icon: React.ComponentType<{ className?: string }> }

const FORMATS: FormatDef[] = [
  { id: "12x8", label: "Grand format routier 12×8 m", short: "12×8", icon: PanelTop },
  { id: "dohh", label: "Écran digital DOOH 4×3 m", short: "DOOH", icon: Monitor },
  { id: "4x3", label: "Panneau classique 4×3 m", short: "4×3", icon: Frame },
  { id: "totem", label: "Totem de station (2 faces)", short: "Totem", icon: Store },
  { id: "abri", label: "Abri-bus urbain (2 faces)", short: "Abri", icon: Ticket },
]

const formatDef = (id: string): FormatDef => FORMATS.find(f => f.id === id) ?? { id, label: id, short: id, icon: Frame }

/** CPM : coût pour 1 000 contacts hebdomadaires (flux × 7 jours). */
const cpm = (p: Panel): number => {
  const contacts = p.flux * 7
  return contacts > 0 ? (p.prixSemaine / contacts) * 1000 : 0
}

const fmtInt = (n: number): string => new Intl.NumberFormat("fr-FR").format(Math.round(n))
const fmtCpm = (n: number): string => n > 0 ? `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} DT` : "—"

// ---------------------------------------------------------------------------
// Statuts (badges dérivés)
// ---------------------------------------------------------------------------

function statutBadge(p: Panel, brandSlug: string): { label: string; cls: string } {
  if (p.statut === "LOUE") {
    return {
      label: "Engagé à l'année",
      cls: "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
    }
  }
  if (p.statut === "RESERVE" && p.reservePar === brandSlug) {
    return {
      label: "Réservé par nous",
      cls: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400",
    }
  }
  if (p.statut === "RESERVE") {
    return {
      label: "Réservé (concurrent)",
      cls: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    }
  }
  return {
    label: "Disponible",
    cls: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  }
}

const norm = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

// ---------------------------------------------------------------------------
// Composants de présentation
// ---------------------------------------------------------------------------

function KpiCard({ icon: Icon, value, label, sub, tone }: {
  icon: React.ComponentType<{ className?: string }>
  value: string
  label: string
  sub: string
  tone: "prune" | "emerald" | "amber" | "terra"
}) {
  const toneCls = {
    prune: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    terra: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  }[tone]
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", toneCls)} aria-hidden>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight tabular-nums">{value}</p>
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="truncate text-[11px] text-muted-foreground/80">{sub}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function VisBar({ value }: { value: number }) {
  const tone = value >= 80 ? "emerald" : value >= 60 ? "amber" : "terra"
  return (
    <div className="flex items-center gap-2" title={`Score de visibilité ${value}/100`}>
      <Progress value={value} className="h-1.5 w-14" aria-label={`Visibilité ${value} sur 100`} />
      <span className="text-[11px] tabular-nums text-muted-foreground">{value}/100</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export function PortalPanels({ brandSlug, brandName }: { brandSlug: string; brandName: string }) {
  const [panels, setPanels] = useState<Panel[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  // Filtres (réactivité locale — le registre complet est déjà chargé)
  const [q, setQ] = useState("")
  const [gov, setGov] = useState("tous")
  const [fmt, setFmt] = useState("tous")
  const [statutFiltre, setStatutFiltre] = useState<"TOUS" | "DISPONIBLE" | "NOS" | "AUTRES">("TOUS")
  const [fluxMin, setFluxMin] = useState(0)
  const [prixMax, setPrixMax] = useState(1500)
  const [tri, setTri] = useState("flux")
  const [compare, setCompare] = useState<string[]>([])
  const [detail, setDetail] = useState<Panel | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  // ---- Chargement initial + actualisation manuelle ----
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const r = await fetch("/api/panels", { signal })
      const data = (await r.json().catch(() => null)) as { panels?: Panel[]; stats?: Stats; error?: string } | null
      if (!r.ok || !data?.panels) throw new Error(data?.error ?? "Réponse invalide du serveur.")
      setPanels(data.panels)
      setStats(data.stats ?? null)
      setErreur(null)
    } catch (e) {
      if ((e as Error).name === "AbortError") return
      setErreur((e as Error).message || "Impossible de charger le registre des panneaux.")
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    const t = setTimeout(() => { void load(ac.signal) }, 0)
    return () => { clearTimeout(t); ac.abort() }
  }, [load])

  // Changement d'enseigne → rechargement (clé de montage gérée par le parent).
  useEffect(() => { setCompare([]); setDetail(null) }, [brandSlug])

  // ---- Filtres + tri (calculs locaux) ----
  const visibles = useMemo(() => {
    const needle = q.trim() ? norm(q.trim()) : ""
    const out = panels.filter(p => {
      if (gov !== "tous" && p.gouvernorat !== gov) return false
      if (fmt !== "tous" && p.format !== fmt) return false
      if (p.flux < fluxMin) return false
      if (p.prixSemaine > prixMax) return false
      if (statutFiltre === "DISPONIBLE" && p.statut !== "DISPONIBLE") return false
      if (statutFiltre === "NOS" && !(p.statut === "RESERVE" && p.reservePar === brandSlug)) return false
      if (statutFiltre === "AUTRES" && (p.statut === "DISPONIBLE" || (p.statut === "RESERVE" && p.reservePar === brandSlug))) return false
      if (needle) {
        const hay = norm(`${p.nom} ${p.axe} ${p.delegation} ${p.code} ${p.gouvernorat} ${p.loueur}`)
        if (!hay.includes(needle)) return false
      }
      return true
    })
    switch (tri) {
      case "visibilite": out.sort((a, b) => b.visibilite - a.visibilite); break
      case "prix": out.sort((a, b) => a.prixSemaine - b.prixSemaine); break
      case "cpm": out.sort((a, b) => cpm(a) - cpm(b)); break
      default: out.sort((a, b) => b.flux - a.flux)
    }
    return out
  }, [panels, q, gov, fmt, statutFiltre, fluxMin, prixMax, tri, brandSlug])

  const nosReservations = useMemo(
    () => panels.filter(p => p.statut === "RESERVE" && p.reservePar === brandSlug),
    [panels, brandSlug],
  )

  const compareItems = useMemo(
    () => compare.map(id => panels.find(p => p.id === id)).filter((p): p is Panel => Boolean(p)),
    [compare, panels],
  )

  const filtresActifs =
    (q.trim() ? 1 : 0) + (gov !== "tous" ? 1 : 0) + (fmt !== "tous" ? 1 : 0) +
    (statutFiltre !== "TOUS" ? 1 : 0) + (fluxMin > 0 ? 1 : 0) + (prixMax < 1500 ? 1 : 0)

  const resetFiltres = () => {
    setQ(""); setGov("tous"); setFmt("tous"); setStatutFiltre("TOUS")
    setFluxMin(0); setPrixMax(1500); setTri("flux")
  }

  // ---- Réservation / libération (optimiste + rollback) ----
  const patchPanel = async (p: Panel, action: "reserver" | "liberer") => {
    const precedent = panels
    const local: Panel =
      action === "reserver"
        ? { ...p, statut: "RESERVE", reservePar: brandSlug }
        : { ...p, statut: "DISPONIBLE", reservePar: null }
    setPanels(prev => prev.map(x => (x.id === p.id ? local : x)))
    setBusy(p.id)
    try {
      const r = await fetch(`/api/panels/${encodeURIComponent(p.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = (await r.json().catch(() => null)) as { panel?: Panel; error?: string } | null
      if (!r.ok || !data?.panel) throw new Error(data?.error ?? "Échec de l'enregistrement serveur.")
      setPanels(prev => prev.map(x => (x.id === p.id ? data.panel! : x)))
      if (detail?.id === p.id) setDetail(data.panel)
      if (action === "reserver") {
        toast.success(`Emplacement ${p.code} réservé`, {
          description: `${p.nom} · ${p.prixSemaine} DT/semaine — visible par toute votre équipe.`,
        })
      } else {
        toast.info(`Emplacement ${p.code} libéré`, { description: `${p.nom} — redevient disponible pour tous.` })
      }
    } catch (e) {
      setPanels(precedent)
      toast.error(action === "reserver" ? "Réservation annulée — serveur injoignable" : "Libération annulée — serveur injoignable", {
        description: (e as Error).message || "Réessayez.",
      })
    } finally {
      setBusy(null)
    }
  }

  const toggleCompare = (p: Panel) => {
    setCompare(prev => {
      if (prev.includes(p.id)) return prev.filter(id => id !== p.id)
      if (prev.length >= 3) {
        toast.info("Comparateur plein", { description: "Retirez une face avant d'en ajouter une autre (3 maximum)." })
        return prev
      }
      return [...prev, p.id]
    })
  }

  const doPdf = (scope: "shortlist" | "resultats") => {
    const items = scope === "shortlist" ? compareItems : visibles
    if (items.length === 0) {
      toast.info("Rien à exporter", { description: "Sélectionnez des faces ou élargissez vos filtres." })
      return
    }
    setPdfLoading(true)
    try {
      const res = downloadPanelsPdf({
        panels: items,
        myBrandName: brandName,
        mineCount: scope === "shortlist"
          ? items.filter(p => p.statut === "RESERVE" && p.reservePar === brandSlug).length
          : nosReservations.length,
        filtersLabel: scope === "shortlist"
          ? "Sélection du comparateur"
          : filtresActifs > 0
            ? `${filtresActifs} filtre${filtresActifs > 1 ? "s" : ""} actif${filtresActifs > 1 ? "s" : ""}${gov !== "tous" ? ` · ${gov}` : ""}${fmt !== "tous" ? ` · format ${formatDef(fmt).short}` : ""}`
            : "Registre complet",
      })
      if (res) {
        toast.success("Plan média généré", { description: `${res.filename} · ${res.kb} Ko · ${items.length} faces.` })
      }
    } finally {
      setPdfLoading(false)
    }
  }

  // =========================================================================
  // RENDU
  // =========================================================================

  if (chargement) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement du registre des panneaux">
        <div className="h-28 animate-pulse rounded-xl bg-muted/50" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/40" />)}
        </div>
        <div className="h-24 animate-pulse rounded-xl bg-muted/30" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-52 animate-pulse rounded-xl bg-muted/30" style={{ animationDelay: `${i * 90}ms` }} />)}
        </div>
      </div>
    )
  }

  if (erreur) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center">
          <ServerCrash className="h-8 w-8 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Impossible de charger le registre des panneaux</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{erreur}</p>
          </div>
          <Button variant="outline" onClick={() => { setChargement(true); void load(new AbortController().signal) }}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  const statutChips: { key: typeof statutFiltre; label: string; count: number }[] = [
    { key: "TOUS", label: "Tous", count: panels.length },
    { key: "DISPONIBLE", label: "Disponibles", count: panels.filter(p => p.statut === "DISPONIBLE").length },
    { key: "NOS", label: "Nos réservations", count: nosReservations.length },
    { key: "AUTRES", label: "Engagés / concurrents", count: panels.filter(p => p.statut === "LOUE" || (p.statut === "RESERVE" && p.reservePar !== brandSlug)).length },
  ]

  return (
    <div className="space-y-4">
      {/* ---- En-tête du module (accent prune, motif radar/hubs) ---- */}
      <Card className="overflow-hidden border-purple-200 bg-gradient-to-br from-purple-50/70 via-white to-amber-50/60 dark:border-purple-900/60 dark:from-purple-950/25 dark:via-transparent dark:to-amber-950/20">
        <CardContent className="flex flex-col gap-4 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-700 shadow-sm dark:bg-purple-950 dark:text-purple-400"
              aria-hidden
            >
              <PanelTop className="h-5.5 w-5.5" />
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold leading-tight">Panneaux publicitaires</h2>
                <Badge variant="outline" className="border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400">
                  Plan média
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Choisissez les bons emplacements d&apos;affichage pour vos campagnes : inventaire national de faces
                (grands formats, DOOH, totems, abri-bus), flux, visibilité et tarifs hebdomadaires. Réservez en
                ligne — chaque décision est persistée et visible par toute votre équipe.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1 text-[11px]">
              <MapPin className="h-3 w-3" aria-hidden /> {stats ? stats.gouvernorats.length : 0} gouvernorats
            </Badge>
            <Badge variant="outline" className="gap-1 text-[11px]">
              <Sparkles className="h-3 w-3" aria-hidden /> 5 formats
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setChargement(true); void load(new AbortController().signal) }}
              title="Recharger le registre depuis le serveur"
            >
              <RefreshCw className="h-4 w-4" aria-hidden /> Actualiser
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---- KPIs du registre ---- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={PanelTop} value={fmtInt(stats?.total ?? panels.length)} label="Faces au registre" sub="inventaire national partagé" tone="prune" />
        <KpiCard icon={Zap} value={fmtInt(stats?.disponibles ?? 0)} label="Disponibles maintenant" sub="réserver en 1 clic" tone="emerald" />
        <KpiCard icon={TrendingUp} value={`${fmtInt(stats?.fluxMoyen ?? 0)} véh/j`} label="Flux moyen" sub="contacts estimés par face" tone="amber" />
        <KpiCard icon={Banknote} value={`${fmtInt(stats?.prixMedian ?? 0)} DT`} label="Tarif médian / semaine" sub="HT, régie incluse" tone="terra" />
      </div>

      {/* ---- Filtres ---- */}
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Gauge className="h-4 w-4 text-purple-700 dark:text-purple-400" aria-hidden />
              Explorer l&apos;inventaire
              <span className="text-xs font-normal text-muted-foreground">
                {visibles.length} face{visibles.length > 1 ? "s" : ""} sur {panels.length}
              </span>
            </p>
            <div className="flex items-center gap-2">
              <Select value={tri} onValueChange={setTri}>
                <SelectTrigger className="h-9 w-[180px]" aria-label="Trier par">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flux">Trier : flux décroissant</SelectItem>
                  <SelectItem value="visibilite">Trier : visibilité</SelectItem>
                  <SelectItem value="prix">Trier : prix croissant</SelectItem>
                  <SelectItem value="cpm">Trier : CPM (efficacité)</SelectItem>
                </SelectContent>
              </Select>
              {filtresActifs > 0 && (
                <Button variant="ghost" size="sm" onClick={resetFiltres}>
                  <X className="h-4 w-4" aria-hidden /> Réinitialiser ({filtresActifs})
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="pan-search">Recherche</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="pan-search"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Code, axe, ville, régie…"
                  className="ps-8"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Gouvernorat</Label>
              <Select value={gov} onValueChange={setGov}>
                <SelectTrigger className="w-full" aria-label="Filtrer par gouvernorat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="tous">Tous les gouvernorats</SelectItem>
                  {(stats?.gouvernorats ?? []).map(g => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Format</Label>
              <Select value={fmt} onValueChange={setFmt}>
                <SelectTrigger className="w-full" aria-label="Filtrer par format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tous">Tous les formats</SelectItem>
                  {FORMATS.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      <span className="flex items-center gap-2"><f.icon className="h-3.5 w-3.5" aria-hidden /> {f.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pan-flux">Flux minimum — {fmtInt(fluxMin)} véh/j</Label>
              <Slider
                id="pan-flux"
                value={[fluxMin]}
                min={0}
                max={30000}
                step={500}
                onValueChange={v => setFluxMin(v[0] ?? 0)}
                aria-label="Flux minimum"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0</span><span>15 000</span><span>30 000</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pan-prix">Budget maximum — {fmtInt(prixMax)} DT/semaine</Label>
              <Slider
                id="pan-prix"
                value={[prixMax]}
                min={50}
                max={1500}
                step={25}
                onValueChange={v => setPrixMax(v[0] ?? 1500)}
                aria-label="Budget maximum par semaine"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>50</span><span>775</span><span>1 500</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Disponibilité</Label>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par disponibilité">
                {statutChips.map(f => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setStatutFiltre(f.key)}
                    aria-pressed={statutFiltre === f.key}
                    title={f.count === 0 ? "Aucune face dans ce statut" : `${f.count} face${f.count > 1 ? "s" : ""}`}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      statutFiltre === f.key
                        ? "border-purple-400 bg-purple-100 text-purple-800 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-300"
                        : "border-border bg-background text-muted-foreground hover:bg-muted/60",
                      f.count === 0 && f.key !== "TOUS" && "opacity-50",
                    )}
                  >
                    {f.label} <span className="tabular-nums opacity-70">{f.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---- Grille des faces ---- */}
      {visibles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted" aria-hidden>
              <Search className="h-6 w-6 text-muted-foreground" />
            </span>
            <p className="font-semibold">Aucune face ne correspond à vos critères</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Élargissez le budget, baissez le flux minimum ou changez de gouvernorat — le registre couvre
              {" "}{stats?.gouvernorats.length ?? 0} gouvernorats.
            </p>
            <Button variant="outline" size="sm" onClick={resetFiltres}>
              <X className="h-4 w-4" aria-hidden /> Réinitialiser les filtres
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibles.map(p => {
            const f = formatDef(p.format)
            const st = statutBadge(p, brandSlug)
            const isMine = p.statut === "RESERVE" && p.reservePar === brandSlug
            const inCompare = compare.includes(p.id)
            return (
              <Card
                key={p.id}
                className={cn(
                  "group transition-shadow hover:shadow-md",
                  inCompare && "border-purple-300 ring-1 ring-purple-200 dark:border-purple-800 dark:ring-purple-900",
                )}
              >
                <CardContent className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="gap-1 border-purple-200 bg-purple-50 text-[11px] text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400">
                        <f.icon className="h-3 w-3" aria-hidden /> {f.short}
                      </Badge>
                      <Badge variant="outline" className={cn("text-[11px]", st.cls)}>{st.label}</Badge>
                      {p.illumination && (
                        <Badge variant="outline" className="gap-1 text-[11px] text-amber-700 dark:text-amber-400" title="Face éclairée la nuit">
                          <Lightbulb className="h-3 w-3" aria-hidden /> Éclairée
                        </Badge>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">{p.code}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDetail(p)}
                    className="min-w-0 text-start"
                    title="Voir la fiche détaillée"
                  >
                    <p className="truncate text-sm font-semibold leading-snug group-hover:underline group-hover:underline-offset-2">{p.nom}</p>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                      {p.gouvernorat} · {p.delegation} — {p.axe}
                    </p>
                  </button>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div>
                      <p className="flex items-center gap-1 text-muted-foreground"><TrendingUp className="h-3 w-3" aria-hidden /> Flux</p>
                      <p className="font-semibold tabular-nums">{fmtInt(p.flux)} <span className="font-normal text-muted-foreground">véh/j</span></p>
                    </div>
                    <div>
                      <p className="flex items-center gap-1 text-muted-foreground"><Eye className="h-3 w-3" aria-hidden /> Visibilité</p>
                      <VisBar value={p.visibilite} />
                    </div>
                    <div>
                      <p className="flex items-center gap-1 text-muted-foreground"><Banknote className="h-3 w-3" aria-hidden /> Tarif</p>
                      <p className="font-semibold tabular-nums">{p.prixSemaine} <span className="font-normal text-muted-foreground">DT/sem</span></p>
                    </div>
                    <div>
                      <p className="flex items-center gap-1 text-muted-foreground"><Percent className="h-3 w-3" aria-hidden /> CPM</p>
                      <p className="font-semibold tabular-nums">{fmtCpm(cpm(p))}<span className="font-normal text-muted-foreground"> /1 000 contacts</span></p>
                    </div>
                  </div>

                  <div className="mt-auto flex items-center gap-2 pt-1">
                    <Button
                      variant={inCompare ? "secondary" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => toggleCompare(p)}
                      aria-pressed={inCompare}
                    >
                      <GitCompare className="h-3.5 w-3.5" aria-hidden />
                      {inCompare ? "Au comparateur ✓" : "Comparer"}
                    </Button>
                    {isMine ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={busy === p.id}
                        onClick={() => void patchPanel(p, "liberer")}
                      >
                        {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
                        Libérer
                      </Button>
                    ) : p.statut === "DISPONIBLE" ? (
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={busy === p.id}
                        onClick={() => void patchPanel(p, "reserver")}
                      >
                        {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Zap className="h-3.5 w-3.5" aria-hidden />}
                        Réserver
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" className="flex-1" disabled title="Face engagée ou réservée par une autre enseigne">
                        Indisponible
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ---- Barre du comparateur (flottante, sélection > 0) ---- */}
      {compareItems.length > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-purple-200 bg-background/95 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur dark:border-purple-900"
          role="region"
          aria-label="Comparateur de panneaux"
        >
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400" aria-hidden>
              <GitCompare className="h-4 w-4" />
            </span>
            <p className="min-w-0 flex-1 text-sm font-medium">
              {compareItems.length} face{compareItems.length > 1 ? "s" : ""} sélectionnée{compareItems.length > 1 ? "s" : ""} —{" "}
              <span className="tabular-nums text-muted-foreground">
                budget {fmtInt(compareItems.reduce((s, p) => s + p.prixSemaine, 0))} DT/sem · flux cumulé {fmtInt(compareItems.reduce((s, p) => s + p.flux, 0))} véh/j
              </span>
            </p>
            <Button variant="outline" size="sm" onClick={() => setCompare([])}>
              <X className="h-4 w-4" aria-hidden /> Vider
            </Button>
            <Button size="sm" onClick={() => setCompareOpen(true)}>
              <Gauge className="h-4 w-4" aria-hidden /> Comparer ({compareItems.length})
            </Button>
          </div>
        </div>
      )}

      {/* ---- Sheet : fiche détaillée d'une face ---- */}
      <Sheet open={detail !== null} onOpenChange={o => { if (!o) setDetail(null) }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle className="flex flex-wrap items-center gap-2 pr-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-400" aria-hidden>
                    {(() => { const F = formatDef(detail.format).icon; return <F className="h-4.5 w-4.5" /> })()}
                  </span>
                  {detail.nom}
                </SheetTitle>
                <SheetDescription>
                  {detail.code} · {formatDef(detail.format).label} — {detail.gouvernorat}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-8">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={statutBadge(detail, brandSlug).cls}>
                    {statutBadge(detail, brandSlug).label}
                  </Badge>
                  {detail.illumination && (
                    <Badge variant="outline" className="gap-1 text-amber-700 dark:text-amber-400">
                      <Lightbulb className="h-3 w-3" aria-hidden /> Éclairage nocturne
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[11px]">Régie : {detail.loueur}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-[11px] text-muted-foreground">Flux journalier</p>
                    <p className="text-lg font-bold tabular-nums">{fmtInt(detail.flux)} <span className="text-xs font-normal">véh/j</span></p>
                    <p className="text-[11px] text-muted-foreground">≈ {fmtInt(detail.flux * 7)} contacts/semaine</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-[11px] text-muted-foreground">Tarif hebdomadaire</p>
                    <p className="text-lg font-bold tabular-nums">{detail.prixSemaine} <span className="text-xs font-normal">DT HT</span></p>
                    <p className="text-[11px] text-muted-foreground">CPM {fmtCpm(cpm(detail))}</p>
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Eye className="h-3.5 w-3.5" aria-hidden /> Visibilité {detail.visibilite}/100
                  </p>
                  <Progress value={detail.visibilite} className="h-2" />
                  <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                    Angle d&apos;approche, distance de lecture et obstacles — évalués par la régie lors du référencement.
                  </p>
                </div>

                <div className="space-y-1.5 text-sm">
                  <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span>{detail.delegation}, {detail.gouvernorat}</span></p>
                  <p className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span>Axe : {detail.axe}</span></p>
                  <p className="flex items-start gap-2"><Store className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span>Régie publicitaire : {detail.loueur}</span></p>
                </div>

                <Separator />

                <div className="flex flex-wrap gap-2">
                  {detail.statut === "RESERVE" && detail.reservePar === brandSlug ? (
                    <Button variant="outline" className="flex-1" disabled={busy === detail.id} onClick={() => void patchPanel(detail, "liberer")}>
                      {busy === detail.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
                      Libérer cet emplacement
                    </Button>
                  ) : detail.statut === "DISPONIBLE" ? (
                    <Button className="flex-1" disabled={busy === detail.id} onClick={() => void patchPanel(detail, "reserver")}>
                      {busy === detail.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />}
                      Réserver pour {brandName}
                    </Button>
                  ) : (
                    <p className="flex-1 rounded-lg bg-muted/50 p-3 text-center text-xs text-muted-foreground">
                      Face {detail.statut === "LOUE" ? "engagée à l'année" : "réservée par une autre enseigne"} —
                      contactez la régie {detail.loueur}.
                    </p>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => { if (!compare.includes(detail.id)) toggleCompare(detail) }}
                    disabled={compare.includes(detail.id)}
                  >
                    <GitCompare className="h-4 w-4" aria-hidden />
                    {compare.includes(detail.id) ? "Au comparateur" : "Comparer"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ---- Sheet : comparateur ---- */}
      <Sheet open={compareOpen} onOpenChange={setCompareOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <GitCompare className="h-5 w-5 text-purple-700 dark:text-purple-400" aria-hidden />
              Comparateur — {compareItems.length} face{compareItems.length > 1 ? "s" : ""}
            </SheetTitle>
            <SheetDescription>
              Flux, visibilité, tarif et CPM côte à côte — puis exportez votre plan média.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-8">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-start text-xs text-muted-foreground">
                    <th scope="col" className="p-2.5 text-start font-medium">Critère</th>
                    {compareItems.map(p => (
                      <th key={p.id} scope="col" className="p-2.5 text-start font-medium">
                        <span className="block max-w-[150px] truncate font-semibold text-foreground" title={p.nom}>{p.nom}</span>
                        <span className="block text-[10px] font-normal text-muted-foreground">{p.code} · {formatDef(p.format).short}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-2.5 text-xs font-medium text-muted-foreground">Statut</td>
                    {compareItems.map(p => (
                      <td key={p.id} className="p-2.5">
                        <Badge variant="outline" className={cn("text-[11px]", statutBadge(p, brandSlug).cls)}>
                          {statutBadge(p, brandSlug).label}
                        </Badge>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="p-2.5 text-xs font-medium text-muted-foreground">Emplacement</td>
                    {compareItems.map(p => (
                      <td key={p.id} className="p-2.5 text-xs">{p.gouvernorat} · {p.delegation}</td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="p-2.5 text-xs font-medium text-muted-foreground">Flux (véh/j)</td>
                    {compareItems.map(p => (
                      <td key={p.id} className="p-2.5 font-semibold tabular-nums">{fmtInt(p.flux)}</td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="p-2.5 text-xs font-medium text-muted-foreground">Visibilité</td>
                    {compareItems.map(p => (
                      <td key={p.id} className="p-2.5"><VisBar value={p.visibilite} /></td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="p-2.5 text-xs font-medium text-muted-foreground">Tarif (DT/sem)</td>
                    {compareItems.map(p => (
                      <td key={p.id} className="p-2.5 font-semibold tabular-nums">{p.prixSemaine}</td>
                    ))}
                  </tr>
                  <tr className="border-b">
                    <td className="p-2.5 text-xs font-medium text-muted-foreground">CPM (/1 000 contacts)</td>
                    {compareItems.map(p => (
                      <td key={p.id} className="p-2.5 font-semibold tabular-nums">{fmtCpm(cpm(p))}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-2.5 text-xs font-medium text-muted-foreground">Éclairage</td>
                    {compareItems.map(p => (
                      <td key={p.id} className="p-2.5 text-xs">
                        {p.illumination ? "Éclairée (24 h)" : "Jour uniquement"}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-muted-foreground">Budget total</p>
                <p className="text-lg font-bold tabular-nums">{fmtInt(compareItems.reduce((s, p) => s + p.prixSemaine, 0))} DT<span className="text-xs font-normal">/sem</span></p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-muted-foreground">Flux cumulé</p>
                <p className="text-lg font-bold tabular-nums">{fmtInt(compareItems.reduce((s, p) => s + p.flux, 0))}<span className="text-xs font-normal"> véh/j</span></p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-[11px] text-muted-foreground">Contacts / semaine</p>
                <p className="text-lg font-bold tabular-nums">{fmtInt(compareItems.reduce((s, p) => s + p.flux * 7, 0))}</p>
              </div>
            </div>

            <p className="rounded-lg bg-purple-50/60 p-3 text-xs leading-relaxed text-purple-900 dark:bg-purple-950/40 dark:text-purple-200">
              <Sparkles className="me-1 inline h-3.5 w-3.5" aria-hidden />
              Meilleur CPM de la sélection :{" "}
              <strong>
                {compareItems.length
                  ? `${compareItems.reduce((m, p) => (cpm(p) < cpm(m) ? p : m), compareItems[0]).code} (${fmtCpm(cpm(compareItems.reduce((m, p) => (cpm(p) < cpm(m) ? p : m), compareItems[0])))})`
                  : "—"}
              </strong>{" "}
              — le CPM (coût pour mille contacts) mesure l&apos;efficacité brute du placement.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button className="flex-1" disabled={pdfLoading || compareItems.length === 0} onClick={() => doPdf("shortlist")}>
                {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <span className="font-semibold">PDF</span>}
                Plan média — sélection
              </Button>
              <Button variant="outline" onClick={() => { setCompareOpen(false); setCompare([]) }}>
                <X className="h-4 w-4" aria-hidden /> Vider
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ---- Export du registre filtré ---- */}
      <div className="flex justify-end pb-2">
        <Button variant="outline" size="sm" disabled={pdfLoading || visibles.length === 0} onClick={() => doPdf("resultats")}>
          {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <span className="font-semibold">PDF</span>}
          Plan média — {visibles.length} face{visibles.length > 1 ? "s" : ""} filtrée{visibles.length > 1 ? "s" : ""}
        </Button>
      </div>
    </div>
  )
}
