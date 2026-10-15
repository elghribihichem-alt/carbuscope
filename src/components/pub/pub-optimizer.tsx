"use client"

// CarbuScope — T60 (P3 « optimiseur de plan média ») — volet optimiseur du
// Simulateur publicitaire : l'enseigne donne son cadrage (objectif, durée,
// période, budget — ceux du simulateur, une seule source de vérité), pose
// des filtres optionnels (modes, gouvernorats) et laisse le SERVEUR
// construire le plan optimal (POST /api/pub/optimize — scoring glouton
// transparent, engagements minimums des régies, mix média par objectif).
//   · Résultats : 6 KPI (budget, contacts, portée, GRP, CPM, reste),
//     allocation par mode, zones, liste des supports retenus ;
//   · COMPARAISON avec la sélection manuelle courante (mêmes formules que
//     le simulateur — deltas en % visibles d'un coup d'œil) ;
//   · Actions : « Remplacer ma sélection » / « Ajouter à ma sélection » —
//     la campagne s'enregistre ensuite comme d'habitude depuis le
//     simulateur (aucune nouvelle chaîne d'enregistrement) ;
//   · Transparence : les étapes du calcul serveur sont listées (accordéon).
// Palette chaude émeraude/ambre/terracotta + zinc — AUCUN bleu/indigo.

import { useMemo, useState } from "react"
import {
  Sparkles, Loader2, TriangleAlert, Coins, Users, Target, Gauge, Calculator,
  ChevronDown, Lightbulb, CheckCheck, PlusCircle, RefreshCw, Filter, MapPin,
  Layers, Wand2,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  type PubSupportDTO, type PubOptimizeResponseDTO, PUB_MODES, pubModeMeta,
  PUB_PERIODE_FACTEURS, PUB_OBJECTIFS, estimatePubCampaign,
  formatTnd, formatNum,
} from "./pub-shared"

export interface PubOptimizerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Listing complet (filtres construits dessus, comparaison via ids). */
  supports: PubSupportDTO[]
  selectedIds: ReadonlySet<string>
  /** Cadrage du simulateur — l'optimiseur utilise EXACTEMENT ces paramètres. */
  objectif: string
  semaines: number
  periode: string
  budgetCible: number
  /** Application du plan à la sélection partagée listing ↔ simulateur. */
  onApplyPlan: (ids: string[], mode: "replace" | "add") => void
}

export function PubOptimizer({
  open, onOpenChange, supports, selectedIds, objectif, semaines, periode,
  budgetCible, onApplyPlan,
}: PubOptimizerProps) {
  // Filtres (persistent tant que le module est monté — vide = « tous »).
  const [modesFilter, setModesFilter] = useState<ReadonlySet<string>>(() => new Set())
  const [gouvFilter, setGouvFilter] = useState<ReadonlySet<string>>(() => new Set())
  const [computing, setComputing] = useState(false)
  const [result, setResult] = useState<PubOptimizeResponseDTO | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [showExplication, setShowExplication] = useState(false)

  const facteur = PUB_PERIODE_FACTEURS.find(f => f.id === periode)?.facteur ?? 1
  const objectifMeta = PUB_OBJECTIFS.find(o => o.id === objectif)

  /** Vivier réservable (DISPONIBLE) — repères des filtres. */
  const dispo = useMemo(() => supports.filter(p => p.statut === "DISPONIBLE"), [supports])
  const parModeDispo = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of dispo) m.set(p.mode, (m.get(p.mode) ?? 0) + 1)
    return m
  }, [dispo])
  const parGouvDispo = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of dispo) m.set(p.gouvernorat, (m.get(p.gouvernorat) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [dispo])

  /** Comparaison : estimation de la sélection manuelle courante (formules
   *  du simulateur — mêmes repères que le plan optimisé). */
  const selection = useMemo(
    () => supports.filter(p => selectedIds.has(p.id)),
    [supports, selectedIds],
  )
  const estSelection = useMemo(
    () => (selection.length > 0 ? estimatePubCampaign(selection, semaines, facteur) : null),
    [selection, semaines, facteur],
  )

  const calculer = async () => {
    if (computing) return
    setComputing(true)
    setErrorMsg(null)
    setResult(null)
    try {
      const r = await fetch("/api/pub/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectif,
          semaines,
          periode,
          budgetCible,
          modes: modesFilter.size > 0 ? [...modesFilter] : undefined,
          gouvernorats: gouvFilter.size > 0 ? [...gouvFilter] : undefined,
        }),
      })
      const body = (await r.json().catch(() => null)) as { plan?: PubOptimizeResponseDTO["plan"]; explication?: string[]; nbCandidats?: number; generatedAt?: string; error?: string } | null
      if (!r.ok || !body?.plan) {
        setErrorMsg(body?.error ?? "Calcul impossible — réessayez dans un instant.")
        return
      }
      setResult({
        plan: body.plan,
        explication: body.explication ?? [],
        nbCandidats: body.nbCandidats ?? body.plan.nbSupports,
        generatedAt: body.generatedAt ?? "",
      })
      toast.success(`Plan optimal calculé — ${body.plan.nbSupports} supports, reste ${formatTnd(body.plan.resteBudget)}.`)
    } catch {
      setErrorMsg("Service injoignable — vérifiez votre connexion, puis relancez le calcul.")
    } finally {
      setComputing(false)
    }
  }

  const resetFiltres = () => {
    setModesFilter(new Set())
    setGouvFilter(new Set())
  }

  const planCodes = result ? result.plan.supports.map(p => p.id) : []
  const dejaTousSelectionnes = result
    ? planCodes.every(id => selectedIds.has(id)) && planCodes.length > 0
    : false

  const appliquer = (mode: "replace" | "add") => {
    if (!result || planCodes.length === 0) return
    onApplyPlan(planCodes, mode)
    toast.success(
      mode === "replace"
        ? `Sélection remplacée par le plan optimisé (${planCodes.length} supports).`
        : `${planCodes.length} supports du plan ajoutés à votre sélection.`,
    )
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2 pr-6">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" aria-hidden>
              <Wand2 className="h-4 w-4" />
            </span>
            Optimiseur de plan média
          </SheetTitle>
          <SheetDescription>
            Le serveur construit le plan optimal sur les supports disponibles des
            régies, selon votre cadrage et vos filtres — vous gardez la main :
            appliquez le plan, puis ajustez et enregistrez depuis le simulateur.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          {/* ---- Cadrage utilisé (lecture seule — source : simulateur) ---- */}
          <Card className="min-w-0 border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/20">
            <CardContent className="space-y-2 p-3.5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> Cadrage appliqué (celui du simulateur)
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[11.5px]">{objectifMeta?.label ?? objectif}</Badge>
                <Badge variant="outline" className="text-[11.5px]">{semaines} semaine{semaines > 1 ? "s" : ""}</Badge>
                <Badge variant="outline" className="text-[11.5px]">
                  {PUB_PERIODE_FACTEURS.find(f => f.id === periode)?.label ?? periode} ×{facteur.toLocaleString("fr-FR")}
                </Badge>
                <Badge variant="outline" className="text-[11.5px] tabular-nums">Budget cible {formatTnd(budgetCible)}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* ---- Filtres (modes + zones) ---- */}
          <Card className="min-w-0">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <Filter className="h-4 w-4 text-muted-foreground" aria-hidden /> Filtres du vivier
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={resetFiltres}
                  disabled={modesFilter.size === 0 && gouvFilter.size === 0}
                >
                  <RefreshCw className="h-3 w-3" aria-hidden /> Réinitialiser
                </Button>
              </div>

              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Layers className="h-3.5 w-3.5" aria-hidden /> Modes — {dispo.length} supports disponibles au total :
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PUB_MODES.map(mode => {
                    const meta = pubModeMeta(mode)
                    const actif = modesFilter.has(mode)
                    return (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={actif}
                        onClick={() => setModesFilter(prev => {
                          const next = new Set(prev)
                          if (next.has(mode)) next.delete(mode)
                          else next.add(mode)
                          return next
                        })}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                          actif
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-border bg-background text-foreground hover:bg-muted",
                        )}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} aria-hidden />
                        {meta.label}
                        <span className={cn("tabular-nums", actif ? "opacity-90" : "text-muted-foreground")}>
                          {parModeDispo.get(mode) ?? 0}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" aria-hidden /> Gouvernorats —
                  {gouvFilter.size === 0 ? " tous" : ` ${gouvFilter.size} retenu${gouvFilter.size > 1 ? "s" : ""}`} :
                </p>
                <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pr-1">
                  {parGouvDispo.map(([gov, n]) => {
                    const actif = gouvFilter.has(gov)
                    return (
                      <button
                        key={gov}
                        type="button"
                        aria-pressed={actif}
                        onClick={() => setGouvFilter(prev => {
                          const next = new Set(prev)
                          if (next.has(gov)) next.delete(gov)
                          else next.add(gov)
                          return next
                        })}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                          actif
                            ? "border-amber-600 bg-amber-600 text-white"
                            : "border-border bg-background text-foreground hover:bg-muted",
                        )}
                      >
                        {gov}
                        <span className={cn("tabular-nums", actif ? "opacity-90" : "text-muted-foreground")}>{n}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11.5px] leading-snug text-muted-foreground">
                  Aucun filtre = vivier complet. Les supports occupés, réservés ou en
                  maintenance sont exclus de l&apos;optimisation par construction.
                </p>
              </div>

              <Button
                className="h-11 w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => void calculer()}
                disabled={computing}
              >
                {computing
                  ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Calcul du plan…</>
                  : <><Sparkles className="h-4 w-4" aria-hidden /> Calculer le plan optimal</>}
              </Button>
            </CardContent>
          </Card>

          {/* ---- Erreur ---- */}
          {errorMsg && (
            <Card className="border-[var(--c-terra)]/60">
              <CardContent className="flex items-start gap-2.5 p-4">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--c-terra)]" aria-hidden />
                <p className="text-[13px] leading-relaxed text-[var(--c-terra)]">{errorMsg}</p>
              </CardContent>
            </Card>
          )}

          {/* ---- Calcul en cours ---- */}
          {computing && (
            <div className="space-y-2.5">
              <Skeleton className="h-16 rounded-xl" />
              <div className="grid grid-cols-3 gap-2.5">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
              </div>
              <Skeleton className="h-40 rounded-xl" />
            </div>
          )}

          {/* ---- Résultat ---- */}
          {result && !computing && (
            <div className="space-y-4">
              {/* KPIs du plan */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <KpiOpt label="Budget estimé" value={formatTnd(result.plan.budgetEstime)} icon={Coins} tone={result.plan.budgetEstime > budgetCible ? "terra" : "emerald"} />
                <KpiOpt label="Contacts campagne" value={formatNum(result.plan.contactsBruts)} icon={Users} />
                <KpiOpt label="Portée nette" value={formatNum(result.plan.porteeNette)} icon={Target} />
                <KpiOpt label="Fréquence" value={`${result.plan.frequence.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}×`} icon={Calculator} />
                <KpiOpt label="GRP" value={result.plan.grp > 0 ? result.plan.grp.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—"} icon={Gauge} />
                <KpiOpt label="CPM" value={result.plan.cpm > 0 ? `${result.plan.cpm.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} DT` : "—"} icon={Calculator} />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <Badge variant="secondary" className="gap-1 text-[11.5px]">
                  <CheckCheck className="h-3 w-3" aria-hidden /> {result.plan.nbSupports} supports retenus
                </Badge>
                <Badge variant="outline" className={cn(
                  "text-[11.5px] tabular-nums",
                  result.plan.resteBudget >= 0 ? "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400" : "border-[var(--c-terra)]/60 text-[var(--c-terra)]",
                )}>
                  Reste {formatTnd(result.plan.resteBudget)} / cible {formatTnd(budgetCible)}
                </Badge>
                <Badge variant="outline" className="text-[11.5px]">Vivier : {result.nbCandidats} dispo.</Badge>
              </div>

              {/* Engagements minimums régie (transparence coût réel) */}
              {result.plan.coutEffectifTotal > result.plan.budgetEstime * 1.02 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-[12px] leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> Engagements minimums des régies
                  </p>
                  <p className="mt-1">
                    Budget prorata du simulateur : <strong>{formatTnd(result.plan.budgetEstime)}</strong> — coût
                    régie réel avec engagements minimums : <strong>{formatTnd(result.plan.coutEffectifTotal)}</strong>
                    {result.plan.engagesLongs.length > 0 && (
                      <> ({result.plan.engagesLongs.length} support{result.plan.engagesLongs.length > 1 ? "s" : ""} exige{result.plan.engagesLongs.length > 1 ? "nt" : ""} plus que {semaines} semaine{semaines > 1 ? "s" : ""} : {result.plan.engagesLongs.slice(0, 4).map(e => `${e.code} (${e.dureeMinMois} mois)`).join(", ")}{result.plan.engagesLongs.length > 4 ? "…" : ""})</>
                    )}
                  </p>
                </div>
              )}

              {/* Comparaison avec la sélection courante */}
              {estSelection && selection.length > 0 && (
                <Card className="min-w-0">
                  <CardContent className="space-y-2.5 p-4">
                    <h3 className="text-sm font-bold">Plan optimisé vs votre sélection ({selection.length} supports)</h3>
                    <ComparaisonTable
                      lignes={[
                        { label: "Supports", plan: result.plan.nbSupports, sel: selection.length, unit: "" },
                        { label: "Budget estimé", plan: result.plan.budgetEstime, sel: estSelection.budget, unit: "DT" },
                        { label: "Contacts", plan: result.plan.contactsBruts, sel: estSelection.contactsBruts, unit: "" },
                        { label: "Portée nette", plan: result.plan.porteeNette, sel: estSelection.porteeNette, unit: "" },
                        { label: "CPM (DT)", plan: result.plan.cpm, sel: estSelection.cpm, unit: "DT", inverser: true },
                      ]}
                    />
                    <p className="text-[11.5px] leading-snug text-muted-foreground">
                      Mêmes formules que le simulateur des deux côtés — le delta mesure le
                      gain (ou l&apos;écart) du plan serveur sur votre sélection manuelle.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Allocation par mode */}
              {result.plan.parMode.length > 0 && (
                <Card className="min-w-0">
                  <CardContent className="space-y-2.5 p-4">
                    <h3 className="flex items-center gap-2 text-sm font-bold">
                      <Layers className="h-4 w-4 text-muted-foreground" aria-hidden /> Mix par mode du plan
                    </h3>
                    {result.plan.parMode.map(m => {
                      const meta = pubModeMeta(m.mode)
                      const total = result.plan.parMode.reduce((s, x) => s + x.budgetMensuel, 0)
                      const pct = total > 0 ? (m.budgetMensuel / total) * 100 : 0
                      return (
                        <div key={m.mode}>
                          <div className="mb-0.5 flex items-baseline justify-between text-[11.5px]">
                            <span className="flex items-center gap-1.5 font-medium">
                              <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} aria-hidden />
                              {meta.label} · {m.nb} support{m.nb > 1 ? "s" : ""}
                            </span>
                            <span className="tabular-nums text-muted-foreground">
                              {formatTnd(m.budgetMensuel)} · {formatNum(m.contactsJ)} contacts/j
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: meta.color }} />
                          </div>
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              )}

              {/* Zones du plan */}
              {result.plan.parGouv.length > 0 && (
                <Card className="min-w-0">
                  <CardContent className="space-y-2 p-4">
                    <h3 className="flex items-center gap-2 text-sm font-bold">
                      <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden /> Couverture du plan
                      <Badge variant="secondary" className="ml-auto text-[11px]">{result.plan.parGouv.length}</Badge>
                    </h3>
                    <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                      {result.plan.parGouv.map(g => (
                        <div key={g.gouvernorat} className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2.5 py-1.5 text-[12.5px]">
                          <span className="min-w-0 truncate font-medium">{g.gouvernorat}</span>
                          <span className="flex shrink-0 items-center gap-2 tabular-nums text-muted-foreground">
                            <span>{g.nb} support{g.nb > 1 ? "s" : ""}</span>
                            <span className="hidden sm:inline">{formatNum(g.contactsJ)} contacts/j</span>
                            <span className="font-medium text-foreground">{formatTnd(g.budgetMensuel)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Supports retenus */}
              <Card className="min-w-0">
                <CardContent className="space-y-2 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold">
                    <Target className="h-4 w-4 text-muted-foreground" aria-hidden /> Supports retenus
                    <Badge variant="secondary" className="ml-auto text-[11px]">{result.plan.supports.length}</Badge>
                  </h3>
                  <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                    {result.plan.supports.map(p => (
                      <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5 text-[12px]">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: pubModeMeta(p.mode).color }} aria-hidden />
                          <span className="shrink-0 font-semibold tabular-nums">{p.code}</span>
                          <span className="min-w-0 truncate text-muted-foreground">{p.lieu}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          <span className="hidden sm:inline">{p.regie} · </span>
                          {formatTnd(p.coutMensuel)} · {formatNum(p.contactsJ)}/j
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="h-11 flex-1 gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => appliquer("replace")}
                >
                  <CheckCheck className="h-4 w-4" aria-hidden /> Remplacer ma sélection ({result.plan.nbSupports})
                </Button>
                <Button
                  variant="outline"
                  className="h-11 flex-1 gap-2"
                  onClick={() => appliquer("add")}
                  disabled={dejaTousSelectionnes}
                >
                  <PlusCircle className="h-4 w-4" aria-hidden /> Ajouter à ma sélection
                </Button>
              </div>
              <p className="text-[11.5px] leading-snug text-muted-foreground">
                Une fois le plan appliqué, vérifiez le cadrage dans le simulateur puis
                « Enregistrer la campagne » — l&apos;estimation sera recalculée serveur
                comme d&apos;habitude.
              </p>

              {/* Explication du calcul (transparence) */}
              <Card className="min-w-0">
                <button
                  type="button"
                  onClick={() => setShowExplication(s => !s)}
                  aria-expanded={showExplication}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
                >
                  <span className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
                    <span className="text-sm font-semibold">Comment le plan a été construit</span>
                  </span>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", showExplication ? "" : "-rotate-90")} aria-hidden />
                </button>
                {showExplication && (
                  <ul className="m-0 list-disc space-y-1 border-t px-8 py-3.5 pl-9 text-[12.5px] leading-relaxed text-muted-foreground">
                    {result.explication.map((e, i) => <li key={i}>{e}</li>)}
                    <li>
                      <strong className="text-foreground">Score</strong> = contacts/j × affinité de mode (objectif) × poids
                      de zone × bonus environnement/éclairage × (0,7 + 0,006 × visibilité) ÷ coût effectif.
                    </li>
                  </ul>
                )}
              </Card>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** KPI compact du plan optimisé. */
function KpiOpt({ icon: Icon, label, value, tone }: {
  icon: typeof Coins; label: string; value: string; tone?: "emerald" | "terra"
}) {
  return (
    <Card className={cn(
      "min-w-0",
      tone === "emerald" && "border-emerald-200 dark:border-emerald-900",
      tone === "terra" && "border-[var(--c-terra)]/60",
    )}>
      <CardContent className="p-2.5">
        <div className="flex items-center gap-1.5">
          <div className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
            tone === "emerald" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
              : tone === "terra" ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400"
                : "bg-muted text-muted-foreground",
          )} aria-hidden>
            <Icon className="h-3 w-3" />
          </div>
          <p className="min-w-0 truncate text-[10.5px] text-muted-foreground">{label}</p>
        </div>
        <p className="mt-1 truncate text-[15px] font-bold leading-tight tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

/** Table de comparaison plan optimisé / sélection manuelle (deltas %). */
function ComparaisonTable({ lignes }: {
  lignes: Array<{ label: string; plan: number; sel: number; unit: string; inverser?: boolean }>
}) {
  const fmt = (v: number, unit: string) =>
    unit === "DT" ? formatTnd(v) : formatNum(v)
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-muted/50 text-left">
            <th scope="col" className="px-2.5 py-1.5 font-semibold text-muted-foreground">Indicateur</th>
            <th scope="col" className="px-2.5 py-1.5 text-right font-semibold text-muted-foreground">Plan optimisé</th>
            <th scope="col" className="px-2.5 py-1.5 text-right font-semibold text-muted-foreground">Sélection</th>
            <th scope="col" className="px-2.5 py-1.5 text-right font-semibold text-muted-foreground">Delta</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map(l => {
            const delta = l.sel > 0 ? ((l.plan - l.sel) / l.sel) * 100 : null
            const favorable = delta === null ? false : l.inverser ? delta < 0 : delta > 0
            return (
              <tr key={l.label} className="border-t">
                <td className="px-2.5 py-1.5 font-medium">{l.label}</td>
                <td className="px-2.5 py-1.5 text-right tabular-nums">{fmt(l.plan, l.unit)}</td>
                <td className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">{fmt(l.sel, l.unit)}</td>
                <td className={cn(
                  "px-2.5 py-1.5 text-right font-semibold tabular-nums",
                  delta === null ? "text-muted-foreground"
                    : favorable ? "text-emerald-700 dark:text-emerald-400"
                      : delta === 0 ? "text-muted-foreground" : "text-[var(--c-terra)]",
                )}>
                  {delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
