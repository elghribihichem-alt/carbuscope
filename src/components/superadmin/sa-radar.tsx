'use client'

// Super Administration — T54-B2 — volet « Opportunity Radar » : configuration
// du moteur de scoring d'opportunités (poids des 5 critères avec indicateur de
// somme vert/terracotta, seuils zone blanche/alerte, PATCH /api/radar/config —
// validation somme = 100 côté serveur, AuditEvent tracé) + édition des
// indicateurs dérivés des 24 gouvernorats (pouvoir d'achat et foncier, PATCH
// /api/radar/indicators, ligne par ligne, badge « est. » conservé). Les
// modifications sont visibles immédiatement côté enseigne après rechargement.

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  CheckCircle2,
  CircleAlert,
  Gauge,
  Landmark,
  Loader2,
  PencilLine,
  Radar,
  Save,
  TrendingUp,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Skeleton } from "@/components/shell/loading"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fmtDate, timeAgo } from "./sa-shared"

/* ============================== Types (DTO des routes) ============================== */

type RadarConfig = {
  weights: {
    parc: number
    purchasing: number
    trafic: number
    concurrence: number
    foncier: number
  }
  thresholds: { zoneBlanche: number; alert: number }
  updatedBy: string | null
  updatedAt: string
}

type PurchasingRow = {
  gouvernorat: string
  gdpPerCapita: number | null
  avgIncome: number | null
  index: number
  estimated: boolean
  updatedAt: string | null
  updatedBy: string | null
}

type LandRow = {
  gouvernorat: string
  pricePerM2: number | null
  availability: number
  urbanPressure: number
  estimated: boolean
  updatedAt: string | null
  updatedBy: string | null
}

const num = (v: number) => new Intl.NumberFormat("fr-FR").format(Math.round(v))
const fmt1 = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })

const WEIGHT_META: Array<{ key: keyof RadarConfig["weights"]; label: string; est?: boolean }> = [
  { key: "parc", label: "Parc véhicules" },
  { key: "purchasing", label: "Pouvoir d'achat", est: true },
  { key: "trafic", label: "Trafic routier" },
  { key: "concurrence", label: "Concurrence" },
  { key: "foncier", label: "Foncier", est: true },
]

/* ============================== Éditeur de poids ============================== */

function WeightsEditor({
  config,
  onSaved,
}: {
  config: RadarConfig
  onSaved: (c: RadarConfig) => void
}) {
  const [draft, setDraft] = useState<RadarConfig["weights"]>(config.weights)
  const [zone, setZone] = useState(String(config.thresholds.zoneBlanche))
  const [alert, setAlert] = useState(String(config.thresholds.alert))
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Re-synchronise le brouillon si la configuration distante change.
  useEffect(() => {
    setDraft(config.weights)
    setZone(String(config.thresholds.zoneBlanche))
    setAlert(String(config.thresholds.alert))
    setDirty(false)
  }, [config])

  const sum =
    draft.parc + draft.purchasing + draft.trafic + draft.concurrence + draft.foncier
  const sumOk = Math.abs(sum - 100) <= 0.001
  const zoneN = Number(zone.replace(",", "."))
  const alertN = Number(alert.replace(",", "."))
  const thresholdsOk =
    Number.isFinite(zoneN) &&
    Number.isFinite(alertN) &&
    zoneN >= 0 &&
    zoneN <= 100 &&
    alertN >= 0 &&
    alertN <= 100 &&
    zoneN <= alertN

  const enregistrer = async () => {
    if (!sumOk) {
      toast.error("Somme des poids invalide", {
        description: `La somme actuelle est de ${fmt1(sum)} — ajustez les curseurs pour atteindre 100.`,
      })
      return
    }
    if (!thresholdsOk) {
      toast.error("Seuils invalides", {
        description: "Zone blanche et alerte doivent être compris entre 0 et 100 (zone blanche ≤ alerte).",
      })
      return
    }
    setBusy(true)
    try {
      const r = await fetch("/api/radar/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weightParc: draft.parc,
          weightPurchasing: draft.purchasing,
          weightTrafic: draft.trafic,
          weightConcurrence: draft.concurrence,
          weightFoncier: draft.foncier,
          zoneBlancheThreshold: zoneN,
          alertThreshold: alertN,
        }),
      })
      const body = (await r.json().catch(() => ({}))) as { config?: RadarConfig; error?: string }
      if (!r.ok || !body.config) {
        toast.error(body.error ?? "Enregistrement impossible — réessayez.")
        return
      }
      onSaved(body.config)
      toast.success("Moteur de scoring mis à jour", {
        description: `Poids ${fmt1(body.config.weights.parc)}/${fmt1(body.config.weights.purchasing)}/${fmt1(
          body.config.weights.trafic,
        )}/${fmt1(body.config.weights.concurrence)}/${fmt1(body.config.weights.foncier)} — seuils ${fmt1(
          body.config.thresholds.zoneBlanche,
        )}/${fmt1(body.config.thresholds.alert)}. Action journalisée (audit RADAR).`,
      })
    } catch {
      toast.error("Enregistrement impossible — vérifiez votre connexion.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
          Poids du moteur de scoring
        </CardTitle>
        <CardDescription>
          5 critères normalisés 0-100, pondérés par gouvernorat. La somme doit faire exactement 100.
          {" "}
          {config.updatedBy ? (
            <>
              Dernière modification : {fmtDate(config.updatedAt)} ({timeAgo(config.updatedAt)}) par{" "}
              <span className="font-medium">{config.updatedBy}</span>.
            </>
          ) : (
            <>Configuration par défaut (jamais modifiée).</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {WEIGHT_META.map(m => (
            <div key={m.key} className="min-w-0">
              <div className="flex min-w-0 items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1 text-xs font-medium">
                  <span className="truncate">{m.label}</span>
                  {m.est && (
                    <Badge
                      variant="outline"
                      className="h-4 shrink-0 border-amber-300 bg-amber-50 px-1 text-[9px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
                    >
                      est.
                    </Badge>
                  )}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums">{fmt1(draft[m.key])} %</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[draft[m.key]]}
                onValueChange={v => {
                  setDraft(d => ({ ...d, [m.key]: v[0] ?? 0 }))
                  setDirty(true)
                }}
                className="mt-1.5"
                aria-label={`Poids du critère ${m.label} en pour cent (somme courante ${fmt1(sum)})`}
              />
            </div>
          ))}
        </div>

        {/* Indicateur de somme : vert = 100, terracotta sinon. */}
        <div
          className={
            sumOk
              ? "flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
              : "flex items-center gap-2 rounded-lg border border-[#e6a084] bg-[#fdf1eb] px-3 py-2 text-sm text-[#b4552f] dark:border-[#7a4a38] dark:bg-[#312019] dark:text-[#e8a186]"
          }
          role="status"
        >
          {sumOk ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <CircleAlert className="h-4 w-4 shrink-0" aria-hidden />
          )}
          <span className="font-semibold tabular-nums">Somme des poids : {fmt1(sum)} / 100</span>
          {!sumOk && <span className="text-xs">— la sauvegarde est bloquée jusqu&apos;à 100.</span>}
        </div>

        {/* Seuils zone blanche / alerte. */}
        <div className="grid min-w-0 grid-cols-2 gap-3">
          <div className="min-w-0">
            <label htmlFor="radar-seuil-zone" className="text-xs font-medium text-muted-foreground">
              Seuil « zone blanche » (score &lt;)
            </label>
            <Input
              id="radar-seuil-zone"
              inputMode="decimal"
              value={zone}
              onChange={e => {
                setZone(e.target.value)
                setDirty(true)
              }}
              className="mt-1 h-11"
              aria-describedby="radar-seuil-zone-help"
            />
            <p id="radar-seuil-zone-help" className="mt-1 text-[10px] text-muted-foreground">
              Densité de stations sous le seuil des zones blanches + score ≥ ce seuil → alerte.
            </p>
          </div>
          <div className="min-w-0">
            <label htmlFor="radar-seuil-alerte" className="text-xs font-medium text-muted-foreground">
              Seuil « opportunité forte » (score ≥)
            </label>
            <Input
              id="radar-seuil-alerte"
              inputMode="decimal"
              value={alert}
              onChange={e => {
                setAlert(e.target.value)
                setDirty(true)
              }}
              className="mt-1 h-11"
              aria-describedby="radar-seuil-alerte-help"
            />
            <p id="radar-seuil-alerte-help" className="mt-1 text-[10px] text-muted-foreground">
              Score au-dessus de ce seuil → alerte « Opportunité forte » côté enseigne.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {dirty ? "Modifications non enregistrées." : "Aucune modification locale en attente."} Action
            auditable (module RADAR).
          </p>
          <Button className="h-11 min-h-11 gap-1.5" onClick={enregistrer} disabled={busy || !dirty}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Enregistrer
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/* ============================== Éditeurs d'indicateurs ============================== */

/** Champ numérique éditable en ligne (Input) + sauvegarde ligne par ligne. */
function EditableCell({
  value,
  onCommit,
  suffix,
  ariaLabel,
  width = "w-24",
}: {
  value: number | null
  onCommit: (v: number) => Promise<void>
  suffix?: string
  ariaLabel: string
  width?: string
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)

  // Pas d'effet de synchronisation : la valeur affichée est DÉRIVÉE de la prop
  // (source de vérité parente), le brouillon n'existe que pendant l'édition.
  if (!editing) {
    return (
      <button
        type="button"
        className={cnEditable}
        onClick={() => {
          setText(value == null ? "" : String(value))
          setEditing(true)
        }}
        aria-label={`${ariaLabel} — cliquer pour modifier (valeur actuelle ${value ?? "non renseignée"})`}
        title="Cliquer pour modifier"
      >
        <span className="truncate tabular-nums">{value == null ? "—" : fmt1(value)}{suffix ? ` ${suffix}` : ""}</span>
        <PencilLine className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    )
  }

  return (
    <span className="flex items-center justify-end gap-1">
      <Input
        autoFocus
        inputMode="decimal"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Escape") setEditing(false)
          if (e.key === "Enter") {
            const n = Number(text.replace(",", "."))
            if (Number.isFinite(n)) {
              setBusy(true)
              Promise.resolve(onCommit(n)).finally(() => {
                setBusy(false)
                setEditing(false)
              })
            } else {
              toast.error("Valeur numérique attendue.")
              setEditing(false)
            }
          }
        }}
        className="h-9 min-h-9 w-24 text-end tabular-nums"
        aria-label={ariaLabel}
        disabled={busy}
      />
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />}
    </span>
  )
}

const cnEditable =
  "flex h-9 min-h-9 w-full items-center justify-end gap-1.5 rounded-md px-2 text-xs tabular-nums transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"

/** Colonne « est. » + traçabilité (updatedBy / updatedAt FR). */
function MetaCell({ estimated, updatedAt, updatedBy }: { estimated: boolean; updatedAt: string | null; updatedBy: string | null }) {
  return (
    <TableCell className="p-2">
      <div className="flex flex-col items-end gap-0.5">
        {estimated ? (
          <Badge variant="outline" className="border-amber-300 bg-amber-50 px-1.5 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
            est.
          </Badge>
        ) : (
          <span className="text-[10px] text-muted-foreground">réel</span>
        )}
        {updatedBy && updatedAt ? (
          <span className="max-w-[160px] truncate text-[10px] text-muted-foreground" title={`${fmtDate(updatedAt)} — ${updatedBy}`}>
            {updatedBy.split("@")[0]} · {timeAgo(updatedAt)}
          </span>
        ) : null}
      </div>
    </TableCell>
  )
}

function PurchasingEditor({
  rows,
  onSaved,
}: {
  rows: PurchasingRow[]
  onSaved: (row: PurchasingRow) => void
}) {
  const save = async (gouvernorat: string, field: "index" | "gdpPerCapita" | "avgIncome", value: number) => {
    try {
      const r = await fetch("/api/radar/indicators", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gouvernorat, kind: "purchasing", [field]: value }),
      })
      const body = (await r.json().catch(() => ({}))) as { indicator?: PurchasingRow; error?: string }
      if (!r.ok || !body.indicator) {
        toast.error(body.error ?? "Enregistrement impossible.")
        return
      }
      onSaved(body.indicator)
      toast.success(`Pouvoir d'achat mis à jour — ${gouvernorat}`, {
        description: `Indice ${fmt1(body.indicator.index)}/100 · action journalisée (audit RADAR).`,
      })
    } catch {
      toast.error("Enregistrement impossible — vérifiez votre connexion.")
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
          Pouvoir d&apos;achat — 24 gouvernorats
        </CardTitle>
        <CardDescription>
          Indice synthétique 0-100 alimentant le critère « pouvoir d&apos;achat » (poids configurable
          ci-dessus) + PIB/habitant et revenu moyen estimés en DT.
          Édition en ligne, sauvegarde ligne par ligne — les valeurs restent des estimations (badge « est. »).
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-96 overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <TableRow>
                <TableHead className="h-9 text-[11px]">Gouvernorat</TableHead>
                <TableHead className="h-9 text-end text-[11px]">Indice /100</TableHead>
                <TableHead className="hidden h-9 text-end text-[11px] sm:table-cell">PIB/hab. (DT/an)</TableHead>
                <TableHead className="hidden h-9 text-end text-[11px] sm:table-cell">Revenu (DT/mois)</TableHead>
                <TableHead className="h-9 text-end text-[11px]">Traçabilité</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.gouvernorat}>
                  <TableCell className="p-2 text-xs font-medium">{r.gouvernorat}</TableCell>
                  <TableCell className="p-2 text-end">
                    <EditableCell
                      value={r.index}
                      ariaLabel={`Indice pouvoir d'achat de ${r.gouvernorat}`}
                      onCommit={v => save(r.gouvernorat, "index", v)}
                    />
                  </TableCell>
                  <TableCell className="hidden p-2 text-end sm:table-cell">
                    <EditableCell
                      value={r.gdpPerCapita}
                      ariaLabel={`PIB par habitant de ${r.gouvernorat} en dinars par an`}
                      onCommit={v => save(r.gouvernorat, "gdpPerCapita", v)}
                    />
                  </TableCell>
                  <TableCell className="hidden p-2 text-end sm:table-cell">
                    <EditableCell
                      value={r.avgIncome}
                      ariaLabel={`Revenu moyen de ${r.gouvernorat} en dinars par mois`}
                      onCommit={v => save(r.gouvernorat, "avgIncome", v)}
                    />
                  </TableCell>
                  <MetaCell estimated={r.estimated} updatedAt={r.updatedAt} updatedBy={r.updatedBy} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function LandEditor({ rows, onSaved }: { rows: LandRow[]; onSaved: (row: LandRow) => void }) {
  const save = async (gouvernorat: string, field: "pricePerM2" | "availability" | "urbanPressure", value: number) => {
    try {
      const r = await fetch("/api/radar/indicators", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gouvernorat, kind: "land", [field]: value }),
      })
      const body = (await r.json().catch(() => ({}))) as { indicator?: LandRow; error?: string }
      if (!r.ok || !body.indicator) {
        toast.error(body.error ?? "Enregistrement impossible.")
        return
      }
      onSaved(body.indicator)
      toast.success(`Indicateur foncier mis à jour — ${gouvernorat}`, {
        description: `Disponibilité ${fmt1(body.indicator.availability)}/100 · action journalisée (audit RADAR).`,
      })
    } catch {
      toast.error("Enregistrement impossible — vérifiez votre connexion.")
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
          Foncier — 24 gouvernorats
        </CardTitle>
        <CardDescription>
          Prix du terrain estimé (DT/m²), disponibilité et pression urbaine 0-100 (critère « foncier »).
          Édition en ligne, sauvegarde ligne par ligne — les valeurs restent des estimations (badge « est. »).
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-96 overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <TableRow>
                <TableHead className="h-9 text-[11px]">Gouvernorat</TableHead>
                <TableHead className="h-9 text-end text-[11px]">Prix (DT/m²)</TableHead>
                <TableHead className="h-9 text-end text-[11px]">Disponibilité /100</TableHead>
                <TableHead className="hidden h-9 text-end text-[11px] sm:table-cell">Pression /100</TableHead>
                <TableHead className="h-9 text-end text-[11px]">Traçabilité</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.gouvernorat}>
                  <TableCell className="p-2 text-xs font-medium">{r.gouvernorat}</TableCell>
                  <TableCell className="p-2 text-end">
                    <EditableCell
                      value={r.pricePerM2}
                      ariaLabel={`Prix du mètre carré à ${r.gouvernorat} en dinars`}
                      onCommit={v => save(r.gouvernorat, "pricePerM2", v)}
                    />
                  </TableCell>
                  <TableCell className="p-2 text-end">
                    <EditableCell
                      value={r.availability}
                      ariaLabel={`Disponibilité foncière de ${r.gouvernorat} sur 100`}
                      onCommit={v => save(r.gouvernorat, "availability", v)}
                    />
                  </TableCell>
                  <TableCell className="hidden p-2 text-end sm:table-cell">
                    <EditableCell
                      value={r.urbanPressure}
                      ariaLabel={`Pression urbaine de ${r.gouvernorat} sur 100`}
                      onCommit={v => save(r.gouvernorat, "urbanPressure", v)}
                    />
                  </TableCell>
                  <MetaCell estimated={r.estimated} updatedAt={r.updatedAt} updatedBy={r.updatedBy} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

/* ============================== Volet SA « Opportunity Radar » ============================== */

export function SaRadar() {
  const [config, setConfig] = useState<RadarConfig | null>(null)
  const [purchasing, setPurchasing] = useState<PurchasingRow[] | null>(null)
  const [land, setLand] = useState<LandRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    const get = async <T,>(path: string): Promise<T> => {
      const r = await fetch(path, { signal: ctrl.signal })
      if (!r.ok) throw new Error(`${path} → ${r.status}`)
      return r.json() as Promise<T>
    }
    Promise.all([
      get<{ config: RadarConfig }>("/api/radar/config"),
      get<{ purchasing: PurchasingRow[]; land: LandRow[] }>("/api/radar/indicators"),
    ])
      .then(([c, i]) => {
        setConfig(c.config)
        setPurchasing(i.purchasing)
        setLand(i.land)
        setError(null)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
  }, [reloadKey])

  const stats = useMemo(() => {
    if (!purchasing || !land) return null
    return {
      purchasingEdited: purchasing.filter(p => p.updatedBy).length,
      landEdited: land.filter(l => l.updatedBy).length,
    }
  }, [purchasing, land])

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="font-semibold text-red-700 dark:text-red-400">Impossible de charger le volet Radar</p>
            <p className="mt-1 text-sm text-red-600/90 dark:text-red-400/80">{error}</p>
          </div>
          <Button variant="outline" className="h-11 min-h-11" onClick={() => setReloadKey(k => k + 1)}>
            Réessayer
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!config || !purchasing || !land) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement du volet Opportunity Radar…">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="min-w-0 space-y-4">
      {/* Bandeau d'introduction du volet. */}
      <Card className="overflow-hidden border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-amber-50/60 dark:border-emerald-900/60 dark:from-emerald-950/25 dark:via-transparent dark:to-amber-950/25">
        <CardContent className="flex flex-col gap-3 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 shadow-sm dark:bg-emerald-950 dark:text-emerald-400"
              aria-hidden
            >
              <Radar className="h-5.5 w-5.5" />
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold leading-tight">Opportunity Radar — configuration</h2>
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                  Moteur de scoring
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Poids des 5 critères d&apos;opportunité d&apos;implantation, seuils d&apos;alerte et indicateurs
                dérivés (pouvoir d&apos;achat, foncier) pour les 24 gouvernorats. Les enseignes voient le
                classement recalculé après rechargement.
              </p>
            </div>
          </div>
          {stats && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1 text-[11px]">
                {purchasing.length} pouvoirs d&apos;achat · {stats.purchasingEdited} édités
              </Badge>
              <Badge variant="outline" className="gap-1 text-[11px]">
                {land.length} indicateurs fonciers · {stats.landEdited} édités
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Éditeur de poids + seuils. */}
      <WeightsEditor config={config} onSaved={setConfig} />

      {/* Éditeurs d'indicateurs (2 tables 24 lignes, onglets). */}
      <Tabs defaultValue="purchasing">
        <TabsList className="grid h-auto w-full grid-cols-2 p-1 sm:max-w-md">
          <TabsTrigger value="purchasing" className="min-h-11 gap-1.5 text-xs sm:text-[13px]">
            Pouvoir d&apos;achat
          </TabsTrigger>
          <TabsTrigger value="land" className="min-h-11 gap-1.5 text-xs sm:text-[13px]">
            Foncier
          </TabsTrigger>
        </TabsList>
        <TabsContent value="purchasing" className="mt-3">
          <PurchasingEditor
            rows={purchasing}
            onSaved={maj => setPurchasing(p => p?.map(x => (x.gouvernorat === maj.gouvernorat ? { ...x, ...maj } : x)) ?? p)}
          />
        </TabsContent>
        <TabsContent value="land" className="mt-3">
          <LandEditor
            rows={land}
            onSaved={maj => setLand(p => p?.map(x => (x.gouvernorat === maj.gouvernorat ? { ...x, ...maj } : x)) ?? p)}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
