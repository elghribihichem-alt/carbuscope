'use client'

// D.2.7 — Prix & décrets (administration réglementaire) :
// publier un nouveau décret ministériel (prix pompe + marge détaillant),
// vérification visuelle avant publication (Δ vs décret en vigueur), trace au
// registre et notification automatique de toutes les enseignes (cloche du
// portail) — la plateforme devient la source officielle de la donnée prix.

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Banknote, Scale, Send, Loader2, RotateCcw, Fuel, Flame, Cylinder, CalendarClock,
  ScrollText, BellRing, CheckCircle2, TrendingUp, TrendingDown, Minus, Info, ShieldAlert, Trash2,
  type LucideIcon,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { KpiCard } from "@/components/shell/kpi-card"
import { TabSkeleton, ErrorState } from "@/components/shell/loading"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import type { FuelPricesResponse, FuelPriceDTO, FuelType } from "@/lib/types"
import { cn } from "@/lib/utils"

// ---------- Conventions (identiques à l'onglet B2B « Prix & marges ») ----------

const FUEL_META: Record<FuelType, {
  label: string
  unit: string
  chip: string
  ring: string
  icon: LucideIcon
}> = {
  ESSENCE: {
    label: "Essence",
    unit: "DT/L",
    chip: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    ring: "ring-emerald-400/60 dark:ring-emerald-600/60",
    icon: Fuel,
  },
  GAZOLE: {
    label: "Gazole",
    unit: "DT/L",
    chip: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400",
    ring: "ring-amber-400/60 dark:ring-amber-600/60",
    icon: Flame,
  },
  GPL: {
    label: "GPL",
    unit: "DT/kg",
    chip: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-400",
    ring: "ring-orange-400/60 dark:ring-orange-600/60",
    icon: Cylinder,
  },
}

const fmtPrice = (millimes: number) => (millimes / 1000).toFixed(3).replace(".", ",")
const fmtDateFr = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })

const todayIso = () => new Date().toISOString().slice(0, 10)

type DecreeResponse = {
  decree: FuelPriceDTO
  notifiedBrands: number
  prevPriceMillimes: number | null
}

// ---------- Onglet ----------

export function BoDecrees() {
  const [data, setData] = useState<FuelPricesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Formulaire de publication
  const [fuel, setFuel] = useState<FuelType>("ESSENCE")
  const [price, setPrice] = useState("")
  const [margin, setMargin] = useState("")
  const [effectiveAt, setEffectiveAt] = useState(todayIso())
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [lastResult, setLastResult] = useState<DecreeResponse | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/prices", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: FuelPricesResponse) => { setData(j); setError(null) })
      .catch(e => {
        if (e instanceof DOMException && e.name === "AbortError") return
        setError("Impossible de charger le registre des décrets.")
      })
    return () => ac.abort()
  }, [reloadKey])

  const currentByFuel = useMemo(() => {
    const map: Partial<Record<FuelType, FuelPricesResponse["current"][number]>> = {}
    for (const c of data?.current ?? []) map[c.fuelType] = c
    return map
  }, [data])

  const current = currentByFuel[fuel]

  // Suppression d'un décret erroné (T24) — confirmation obligatoire, refus
  // serveur si dernier décret d'un carburant. Compte par carburant côté client
  // pour désactiver visuellement les boutons concernés.
  const countByFuel = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of data?.history ?? []) m.set(d.fuelType, (m.get(d.fuelType) ?? 0) + 1)
    return m
  }, [data])

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const deleteDecree = useCallback(async (d: FuelPriceDTO) => {
    setDeletingId(d.id)
    try {
      const r = await fetch(`/api/prices/${d.id}`, { method: "DELETE" })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
      toast.success("Décret retiré du registre", {
        description: j.fallbackPriceMillimes != null
          ? `Prix en vigueur recalculé sur le décret précédent : ${(j.fallbackPriceMillimes / 1000).toFixed(3).replace(".", ",")} DT.`
          : "Le registre chronologique a été mis à jour.",
      })
      setLastResult(null)
      setReloadKey(k => k + 1)
    } catch (e) {
      toast.error("Suppression refusée", { description: e instanceof Error ? e.message : "Erreur inattendue." })
    } finally {
      setDeletingId(null)
    }
  }, [])

  // Pré-remplissage intelligent au changement de carburant : prix proposé =
  // décret en vigueur + 25 millimes (révision typique), marge inchangée.
  const prefillFor = (f: FuelType) => {
    const c = currentByFuel[f]
    setFuel(f)
    setPrice(c ? String(c.priceMillimes + 25) : "")
    setMargin(c ? String(c.marginMillimes) : "")
  }

  // Pré-remplissage initial dès que les données arrivent.
  useEffect(() => {
    if (data && price === "" && margin === "") {
      const c = currentByFuel.ESSENCE
      if (c) { setPrice(String(c.priceMillimes + 25)); setMargin(String(c.marginMillimes)) }
    }
  }, [data, price, margin, currentByFuel])

  const priceNum = Number(price)
  const marginNum = Number(margin)
  const priceValid = Number.isInteger(priceNum) && priceNum >= 300 && priceNum <= 10_000
  const marginValid = Number.isInteger(marginNum) && marginNum >= 0 && marginNum <= 1_000
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(effectiveAt) && !Number.isNaN(new Date(effectiveAt).getTime())
  const formValid = priceValid && marginValid && dateValid

  const delta = current ? priceNum - current.priceMillimes : null
  const marginDelta = current ? marginNum - current.marginMillimes : null
  const deltaPct = current && delta !== null && current.priceMillimes > 0
    ? (delta / current.priceMillimes) * 100
    : null

  const publish = useCallback(async () => {
    if (!formValid || submitting) return
    setSubmitting(true)
    try {
      const r = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fuelType: fuel,
          priceMillimes: priceNum,
          marginMillimes: marginNum,
          effectiveAt,
          decreeNote: note.trim() || undefined,
        }),
      })
      const j = (await r.json()) as DecreeResponse & { error?: string }
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
      setLastResult(j)
      toast.success("Décret publié et enseignes notifiées", {
        description: `${FUEL_META[fuel].label} : ${fmtPrice(j.decree.priceMillimes)} ${FUEL_META[fuel].unit} — ${j.notifiedBrands} enseigne(s) notifiée(s) via la cloche du portail.`,
        duration: 6000,
      })
      setNote("")
      setReloadKey(k => k + 1)
    } catch (e) {
      toast.error("Publication refusée", {
        description: e instanceof Error ? e.message : "Erreur inconnue.",
      })
    } finally {
      setSubmitting(false)
    }
  }, [formValid, submitting, fuel, priceNum, marginNum, effectiveAt, note])

  const resetForm = () => {
    const c = currentByFuel[fuel]
    setPrice(c ? String(c.priceMillimes + 25) : "")
    setMargin(c ? String(c.marginMillimes) : "")
    setEffectiveAt(todayIso())
    setNote("")
  }

  if (error && !data) {
    return (
      <div className="p-1">
        <ErrorState message={error} retry={() => setReloadKey(k => k + 1)} />
      </div>
    )
  }
  if (!data) return <TabSkeleton title="Chargement du registre des décrets…" />

  // Registre chronologique inversé (plus récent d'abord) + badge « en vigueur » :
  // le décret courant d'un carburant est le plus récent de son historique.
  const historyDesc = [...data.history].sort(
    (a, b) => new Date(b.effectiveAt).getTime() - new Date(a.effectiveAt).getTime()
  )
  const currentKeys = new Set(
    data.current.map(c => `${c.fuelType}|${c.effectiveAt}`)
  )

  const DeltaIcon = delta === null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown

  return (
    <div className="space-y-4">
      {/* ---------- KPIs ---------- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="Décrets au registre"
          value={String(data.totals.decrees)}
          sub="Depuis 2021 — tous carburants"
          icon={ScrollText}
          tone="info"
        />
        <KpiCard
          label="Dernière publication"
          value={data.totals.lastChangeAt ? fmtDateFr(data.totals.lastChangeAt) : "—"}
          sub={data.totals.nextReviewLabel}
          icon={CalendarClock}
          tone="success"
        />
        <KpiCard
          label="Enseignes notifiées"
          value={lastResult ? String(lastResult.notifiedBrands) : "6"}
          sub={lastResult ? "Lors de la dernière publication" : "Par décret publié (cloche portail)"}
          icon={BellRing}
          tone="warning"
        />
        <KpiCard
          label="Carburants suivis"
          value="3"
          sub="Essence · Gazole · GPL"
          icon={Banknote}
          tone="danger"
        />
      </div>

      {/* ---------- Décrets en vigueur ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Scale className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            Décrets en vigueur
          </CardTitle>
          <CardDescription>
            Prix pompe identiques sur tout le territoire — dernière révision en vigueur par carburant.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(Object.keys(FUEL_META) as FuelType[]).map(f => {
            const c = currentByFuel[f]
            const Meta = FUEL_META[f]
            const Icon = Meta.icon
            const up = (c?.deltaMillimes ?? 0) > 0
            return (
              <button
                key={f}
                type="button"
                onClick={() => prefillFor(f)}
                aria-pressed={fuel === f}
                className={cn(
                  "group relative overflow-hidden rounded-xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60",
                  fuel === f && `border-transparent ring-2 ${Meta.ring}`
                )}
                aria-label={`Préparer un décret ${Meta.label} — prix actuel ${c ? fmtPrice(c.priceMillimes) : "inconnu"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className={cn("gap-1", Meta.chip)}>
                    <Icon className="h-3 w-3" aria-hidden /> {Meta.label}
                  </Badge>
                  {fuel === f && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                      Sélection
                    </span>
                  )}
                </div>
                <p className="mt-2 font-bold tabular-nums leading-none">
                  <span className="text-3xl">{c ? fmtPrice(c.priceMillimes) : "—"}</span>
                  <span className="ml-1.5 text-sm font-medium text-muted-foreground">{Meta.unit}</span>
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {c && (
                    <>
                      <span className={cn(
                        "inline-flex items-center gap-1 font-semibold",
                        up ? "text-red-600 dark:text-red-400" : (c.deltaMillimes ?? 0) < 0 ? "text-emerald-600 dark:text-emerald-400" : ""
                      )}>
                        {up ? "▲" : (c.deltaMillimes ?? 0) < 0 ? "▼" : "＝"}
                        {c.deltaMillimes !== null ? `${c.deltaMillimes > 0 ? "+" : ""}${c.deltaMillimes} m` : "premier"}
                      </span>
                      <span>depuis le {fmtDateFr(c.effectiveAt)}</span>
                      <span>· marge {fmtPrice(c.marginMillimes)} DT</span>
                    </>
                  )}
                </div>
                <p className="mt-2 text-[11px] leading-snug text-muted-foreground/80">
                  Cliquer pour préparer le prochain décret {Meta.label.toLowerCase()}.
                </p>
              </button>
            )
          })}
        </CardContent>
      </Card>

      {/* ---------- Publication d'un décret ---------- */}
      <Card className="border-emerald-200/70 dark:border-emerald-900/50">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Send className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            Publier un nouveau décret
          </CardTitle>
          <CardDescription>
            La publication met à jour l&apos;observatoire B2B, le mobile B2C et notifie chaque enseigne
            via la cloche de notification du portail.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
          {/* Formulaire */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Carburant concerné</Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(FUEL_META) as FuelType[]).map(f => {
                  const Meta = FUEL_META[f]
                  const Icon = Meta.icon
                  const active = fuel === f
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => prefillFor(f)}
                      aria-pressed={active}
                      className={cn(
                        "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60",
                        active
                          ? cn("border-transparent ring-2", Meta.ring, "bg-muted/60")
                          : "border-border bg-background hover:bg-muted/50"
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      {Meta.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="decree-price">
                  Nouveau prix pompe <span className="text-muted-foreground">(millimes)</span>
                </Label>
                <Input
                  id="decree-price"
                  inputMode="numeric"
                  value={price}
                  onChange={e => setPrice(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="2675"
                  aria-invalid={price !== "" && !priceValid}
                  aria-describedby="decree-price-hint"
                  className="tabular-nums"
                />
                <p id="decree-price-hint" className={cn(
                  "text-xs",
                  priceValid ? "text-muted-foreground" : "text-red-600 dark:text-red-400"
                )}>
                  {priceValid
                    ? `= ${fmtPrice(priceNum)} ${FUEL_META[fuel].unit} · entier entre 300 et 10 000`
                    : "Entier en millimes requis (300 – 10 000)."}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="decree-margin">
                  Marge détaillant <span className="text-muted-foreground">(millimes/L)</span>
                </Label>
                <Input
                  id="decree-margin"
                  inputMode="numeric"
                  value={margin}
                  onChange={e => setMargin(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="145"
                  aria-invalid={margin !== "" && !marginValid}
                  aria-describedby="decree-margin-hint"
                  className="tabular-nums"
                />
                <p id="decree-margin-hint" className={cn(
                  "text-xs",
                  marginValid ? "text-muted-foreground" : "text-red-600 dark:text-red-400"
                )}>
                  {marginValid
                    ? `= ${fmtPrice(marginNum)} DT par litre vendu`
                    : "Entier en millimes requis (0 – 1 000)."}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="decree-date">Date d&apos;application</Label>
                <Input
                  id="decree-date"
                  type="date"
                  value={effectiveAt}
                  onChange={e => setEffectiveAt(e.target.value)}
                  aria-invalid={!dateValid}
                />
                {!dateValid && (
                  <p className="text-xs text-red-600 dark:text-red-400">Date invalide.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="decree-note">Référence / contexte <span className="text-muted-foreground">(optionnel)</span></Label>
                <Input
                  id="decree-note"
                  value={note}
                  maxLength={200}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Révision trimestrielle — décret n° 2026-XX"
                  aria-describedby="decree-note-hint"
                />
                <p id="decree-note-hint" className="text-xs text-muted-foreground">
                  {200 - note.length} caractères restants.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                onClick={() => void publish()}
                disabled={!formValid || submitting}
                className="gap-2"
                size="lg"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                {submitting ? "Publication…" : "Publier & notifier les enseignes"}
              </Button>
              <Button variant="outline" size="lg" onClick={resetForm} className="gap-2">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Réinitialiser
              </Button>
            </div>
          </div>

          {/* Aperçu de contrôle (vérification avant publication) */}
          <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
              Contrôle avant publication
            </p>

            <div className="rounded-lg border bg-background p-3">
              <p className="text-xs text-muted-foreground">Décret en vigueur ({FUEL_META[fuel].label})</p>
              <p className="mt-1 text-lg font-bold tabular-nums leading-tight">
                {current ? fmtPrice(current.priceMillimes) : "—"}
                <span className="ml-1 text-xs font-medium text-muted-foreground">{FUEL_META[fuel].unit}</span>
              </p>
              {current && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  depuis le {fmtDateFr(current.effectiveAt)} · marge {fmtPrice(current.marginMillimes)} DT
                </p>
              )}
            </div>

            {priceValid && (
              <div
                role="status"
                className={cn(
                  "rounded-lg border p-3",
                  (delta ?? 0) > 0
                    ? "border-red-200 bg-red-50/70 dark:border-red-900 dark:bg-red-950/30"
                    : (delta ?? 0) < 0
                      ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30"
                      : "border-border bg-background"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Nouveau décret</p>
                  <DeltaIcon
                    className={cn(
                      "h-4 w-4",
                      (delta ?? 0) > 0 ? "text-red-600 dark:text-red-400" : (delta ?? 0) < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                    )}
                    aria-hidden
                  />
                </div>
                <p className="mt-1 text-2xl font-bold tabular-nums leading-none">
                  {fmtPrice(priceNum)}
                  <span className="ml-1.5 text-xs font-medium text-muted-foreground">{FUEL_META[fuel].unit}</span>
                </p>
                {current && delta !== null && (
                  <p className="mt-1.5 text-xs leading-relaxed">
                    <span className={cn(
                      "font-semibold",
                      delta > 0 ? "text-red-700 dark:text-red-400" : delta < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
                    )}>
                      {delta > 0 ? "+" : ""}{delta} millimes
                      {deltaPct !== null ? ` (${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1).replace(".", ",")} %)` : ""}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}vs décret en vigueur{marginDelta !== null && marginDelta !== 0
                        ? ` · marge ${marginDelta > 0 ? "+" : ""}${marginDelta} m` : ""}
                    </span>
                  </p>
                )}
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <p>
                Un décret ne modifie pas la marge/L : seuls le volume et les services restent des leviers
                d&apos;enseigne. La notification l&apos;explique à chaque enseigne.
              </p>
            </div>

            {lastResult && (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs leading-relaxed text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <p>
                  Dernière publication : {fmtPrice(lastResult.decree.priceMillimes)} {FUEL_META[lastResult.decree.fuelType].unit}
                  {" "}— {lastResult.notifiedBrands} enseigne(s) notifiée(s), horodatée {fmtDateFr(lastResult.decree.effectiveAt)}.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ---------- Registre des décrets ---------- */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <ScrollText className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                Registre des décrets
              </CardTitle>
              <CardDescription>
                Historique chronologique complet — {data.totals.decrees} décrets publiés depuis 2021.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setReloadKey(k => k + 1)}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Rafraîchir
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-96 pr-3">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur">
                <TableRow>
                  <TableHead className="w-[7rem]">Date</TableHead>
                  <TableHead className="w-[8rem]">Carburant</TableHead>
                  <TableHead className="text-right">Prix</TableHead>
                  <TableHead className="text-right">Δ</TableHead>
                  <TableHead className="text-right">Marge</TableHead>
                  <TableHead>Contexte</TableHead>
                  <TableHead className="w-[3.5rem] text-center">Purger</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyDesc.map(d => {
                  const prev = historyDesc
                    .slice(historyDesc.indexOf(d) + 1)
                    .reverse()
                    .find(x => x.fuelType === d.fuelType)
                  const deltaPrev = prev ? d.priceMillimes - prev.priceMillimes : null
                  const Meta = FUEL_META[d.fuelType as FuelType] ?? FUEL_META.ESSENCE
                  return (
                    <TableRow key={d.id} className={cn(currentKeys.has(`${d.fuelType}|${d.effectiveAt}`) && "bg-emerald-50/40 dark:bg-emerald-950/20")}>
                      <TableCell className="whitespace-nowrap text-xs tabular-nums">
                        {fmtDateFr(d.effectiveAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("gap-1 text-[11px]", Meta.chip)}>
                          {Meta.label}
                          {currentKeys.has(`${d.fuelType}|${d.effectiveAt}`) && (
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">· en vigueur</span>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums">
                        {fmtPrice(d.priceMillimes)}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right text-xs font-semibold tabular-nums",
                        deltaPrev === null
                          ? "text-muted-foreground"
                          : deltaPrev > 0
                            ? "text-red-600 dark:text-red-400"
                            : deltaPrev < 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground"
                      )}>
                        {deltaPrev === null ? "—" : `${deltaPrev > 0 ? "+" : ""}${deltaPrev} m`}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                        {fmtPrice(d.marginMillimes)} DT
                      </TableCell>
                      <TableCell className="max-w-[16rem] truncate text-xs text-muted-foreground" title={d.decreeNote ?? undefined}>
                        {d.decreeNote ?? "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {(countByFuel.get(d.fuelType) ?? 0) > 1 ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={deletingId === d.id}
                                aria-label={`Retirer le décret ${Meta.label} du ${fmtDateFr(d.effectiveAt)} (${fmtPrice(d.priceMillimes)} DT)`}
                                title="Retirer ce décret du registre (décret erroné)"
                                className="h-7 w-7 text-muted-foreground/70 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-red-500/40 dark:hover:bg-red-950 dark:hover:text-red-400"
                              >
                                {deletingId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Retirer ce décret du registre ?</AlertDialogTitle>
                                <AlertDialogDescription asChild>
                                  <div className="space-y-2 text-sm text-muted-foreground">
                                    <p>
                                      Décret <span className="font-semibold text-foreground">{Meta.label}</span> du{" "}
                                      <span className="font-semibold text-foreground">{fmtDateFr(d.effectiveAt)}</span> — prix{" "}
                                      <span className="font-semibold tabular-nums text-foreground">{fmtPrice(d.priceMillimes)} DT</span>, marge{" "}
                                      <span className="font-semibold tabular-nums text-foreground">{fmtPrice(d.marginMillimes)} DT/L</span>.
                                    </p>
                                    <p>
                                      Cette purge est irréversible. Si ce décret était le plus récent de son carburant,
                                      le prix en vigueur retombera sur le décret précédent — les enseignes ne sont PAS
                                      renotifiées (une publication de correction le fera proprement).
                                    </p>
                                  </div>
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500/50"
                                  onClick={() => void deleteDecree(d)}
                                >
                                  <Trash2 className="mr-1 h-4 w-4" aria-hidden />
                                  Retirer du registre
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : (
                          <span
                            className="inline-block h-3.5 w-3.5 text-muted-foreground/30"
                            title="Dernier décret de ce carburant — suppression interdite (référence de prix obligatoire)"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
