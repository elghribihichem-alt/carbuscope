"use client"

// CarbuScope — T58 — Publicité, sous-menu 2 « Simulateur publicitaire » :
// le tenant construit une campagne publicitaire pour son enseigne sur la
// SÉLECTION faite dans le listing des supports (régies externes) et voit
// l'estimation instantanée + TOUTES les données possibles :
//   · Cadrage : nom, objectif (notoriété / trafic station / promotion /
//     lancement), durée en semaines (1-8), période clé (facteur
//     ramadan/été/rentrée), budget cible DT ;
//   · Résultats : budget total, contacts, portée nette (doublons 18 %),
//     fréquence, GRP (population INS des gouvernorats couverts), CPM ;
//   · Arbitrage : budget vs cible, répartition PAR MODE (carto/RFR/metro/
//     urbain — budget et contacts), répartition PAR RÉGIE, couverture par
//     gouvernorat, chips supports retirables ;
//   · ENREGISTREMENT : « Enregistrer la campagne » → POST /api/pub/campaigns
//     (estimation recalculée serveur + snapshot supports) → la campagne
//     apparaît dans le volet « Rapports » ;
//   · Transparence : les formules sont affichées (accordéon) ;
//   · T60 (P3) — OPTIMISEUR : « Optimiser mon plan » ouvre le volet
//     pub-optimizer (POST /api/pub/optimize — plan serveur selon le cadrage
//     + filtres, comparable à la sélection, applicable en 1 clic).
// V1 : les campagnes enregistrées sont des simulations (statut SIMULEE).

import { useMemo, useState } from "react"
import {
  Calculator, Target, CalendarRange, Coins, Users, Repeat2, Gauge, Lightbulb,
  Download, Trash2, ArrowRight, Megaphone, TriangleAlert, ChevronDown,
  FlaskConical, CircleCheck, Loader2, Layers, Sparkles,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import {
  type PubSupportDTO, estimatePubCampaign, PUB_PERIODE_FACTEURS, PUB_OBJECTIFS,
  pubModeMeta, formatTnd, formatNum, downloadPubSupportsCsv,
} from "./pub-shared"
import { PubOptimizer } from "./pub-optimizer"

export interface PubSimulateProps {
  supports: PubSupportDTO[]
  loading: boolean
  selectedIds: ReadonlySet<string>
  onToggleSelect: (p: PubSupportDTO) => void
  onClearSelection: () => void
  onGoListing: () => void
  onGoReports: () => void
  /** T60 : application du plan optimisé à la sélection partagée. */
  onApplyPlan: (ids: string[], mode: "replace" | "add") => void
}

export function PubSimulate({
  supports, loading, selectedIds, onToggleSelect, onClearSelection, onGoListing, onGoReports, onApplyPlan,
}: PubSimulateProps) {
  const [nom, setNom] = useState("Campagne — test simulateur")
  const [objectif, setObjectif] = useState("NOTORIETE")
  const [semaines, setSemaines] = useState(4)
  const [periode, setPeriode] = useState("normale")
  const [budgetCible, setBudgetCible] = useState(8000)
  const [showFormules, setShowFormules] = useState(false)
  const [saving, setSaving] = useState(false)
  const [optimizerOpen, setOptimizerOpen] = useState(false)

  const selected = useMemo(() => supports.filter(p => selectedIds.has(p.id)), [supports, selectedIds])
  const facteur = PUB_PERIODE_FACTEURS.find(f => f.id === periode)?.facteur ?? 1
  const est = useMemo(() => estimatePubCampaign(selected, semaines, facteur), [selected, semaines, facteur])

  // ---- Répartition par mode (l'argument mix média) ----
  const parMode = useMemo(() => {
    const m = new Map<string, { budget: number; contacts: number; nb: number }>()
    for (const p of selected) {
      const cur = m.get(p.mode) ?? { budget: 0, contacts: 0, nb: 0 }
      cur.budget += p.coutMensuel
      cur.contacts += p.contactsJ
      cur.nb += 1
      m.set(p.mode, cur)
    }
    return [...m.entries()].map(([mode, v]) => ({ mode, ...v })).sort((a, b) => b.budget - a.budget)
  }, [selected])

  // ---- Répartition par régie ----
  const parRegie = useMemo(() => {
    const m = new Map<string, { budget: number; contacts: number; nb: number }>()
    for (const p of selected) {
      const cur = m.get(p.regie) ?? { budget: 0, contacts: 0, nb: 0 }
      cur.budget += p.coutMensuel
      cur.contacts += p.contactsJ
      cur.nb += 1
      m.set(p.regie, cur)
    }
    return [...m.entries()].map(([regie, v]) => ({ regie, ...v })).sort((a, b) => b.budget - a.budget)
  }, [selected])

  // ---- Couverture par gouvernorat ----
  const parGov = useMemo(() => {
    const m = new Map<string, { nb: number; budget: number; contacts: number }>()
    for (const p of selected) {
      const cur = m.get(p.gouvernorat) ?? { nb: 0, budget: 0, contacts: 0 }
      cur.budget += p.coutMensuel
      cur.contacts += p.contactsJ
      cur.nb += 1
      m.set(p.gouvernorat, cur)
    }
    return [...m.entries()].map(([gov, v]) => ({ gov, ...v })).sort((a, b) => b.contacts - a.contacts)
  }, [selected])

  const depassement = est.budget > budgetCible
  const objectifMeta = PUB_OBJECTIFS.find(o => o.id === objectif)

  // ---- Enregistrement de la campagne (POST /api/pub/campaigns) ----
  const onEnregistrer = async () => {
    if (selected.length === 0 || saving) return
    if (nom.trim().length < 3) {
      toast("Donnez un nom d'au moins 3 caractères à la campagne.")
      return
    }
    setSaving(true)
    try {
      const r = await fetch("/api/pub/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: nom.trim(),
          objectif,
          semaines,
          periode,
          budgetCible,
          supportCodes: selected.map(p => p.code),
        }),
      })
      const body = (await r.json().catch(() => null)) as { error?: string; campaign?: { nom?: string } } | null
      if (!r.ok) {
        toast(body?.error ?? "Enregistrement impossible — réessayez dans un instant.")
        return
      }
      toast(`Campagne « ${body?.campaign?.nom ?? nom.trim()} » enregistrée — consultez le volet Rapports.`)
      onGoReports()
    } catch {
      toast("Service injoignable — vérifiez votre connexion, puis réessayez.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-[320px] rounded-xl lg:col-span-1" /><Skeleton className="h-[320px] rounded-xl lg:col-span-2" /></div>
  }

  // ---- État vide : orienter vers le listing ----
  if (selected.length === 0) {
    return (
      <>
      <Card className="min-w-0">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" aria-hidden>
            <Calculator className="h-7 w-7" />
          </div>
          <div className="max-w-md">
            <h2 className="text-base font-bold">Aucun support sélectionné</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Le simulateur se construit sur votre sélection : choisissez des panneaux, habillages,
              écrans ou mobilier dans le « Listing des supports » (cases à cocher ou bouton dans la
              popup de la carte), puis revenez ici — l&apos;estimation est instantanée et
              l&apos;enregistrement alimente le volet Rapports.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="h-11 gap-2 bg-emerald-600 text-white hover:bg-emerald-700" onClick={onGoListing}>
              <Megaphone className="h-4 w-4" aria-hidden /> Choisir des supports dans le listing
            </Button>
            <Button variant="outline" className="h-11 gap-2" onClick={() => setOptimizerOpen(true)}>
              <Sparkles className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden />
              Optimiser automatiquement mon plan
            </Button>
          </div>
        </CardContent>
      </Card>
      <PubOptimizer
        open={optimizerOpen}
        onOpenChange={setOptimizerOpen}
        supports={supports}
        selectedIds={selectedIds}
        objectif={objectif}
        semaines={semaines}
        periode={periode}
        budgetCible={budgetCible}
        onApplyPlan={onApplyPlan}
      />
    </>
  )
}

  const budgetMensuel = selected.reduce((s, p) => s + p.coutMensuel, 0)

  return (
    <div className="min-w-0 space-y-4">
      {/* ---- Cadrage de la campagne ---- */}
      <Card className="min-w-0">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <FlaskConical className="h-4.5 w-4.5 text-emerald-700 dark:text-emerald-400" aria-hidden />
              Cadrage de la campagne
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="hidden text-[11px] sm:inline-flex">Simulateur publicitaire — campagnes enregistrables</Badge>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-emerald-300 text-xs text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                onClick={() => setOptimizerOpen(true)}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> Optimiser mon plan
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="pubcamp-nom" className="text-xs text-muted-foreground">Nom de la campagne</Label>
              <Input id="pubcamp-nom" value={nom} onChange={e => setNom(e.target.value)} className="h-9" maxLength={80} />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Objectif</Label>
              <Select value={objectif} onValueChange={setObjectif}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PUB_OBJECTIFS.map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {objectifMeta && <p className="text-[11px] leading-snug text-muted-foreground">{objectifMeta.hint}</p>}
            </div>
            <div className="flex min-w-0 flex-col gap-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Durée de diffusion</Label>
                <span className="text-xs font-medium tabular-nums">{semaines} semaine{semaines > 1 ? "s" : ""}</span>
              </div>
              <Slider value={[semaines]} min={1} max={8} step={1} onValueChange={v => setSemaines(v[0] ?? 1)} aria-label="Durée de diffusion en semaines" />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Période clé (facteur d&apos;audience)</Label>
              <div className="flex flex-wrap gap-1.5">
                {PUB_PERIODE_FACTEURS.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    title={f.hint}
                    onClick={() => setPeriode(f.id)}
                    aria-pressed={periode === f.id}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                      periode === f.id
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-border bg-background text-foreground hover:bg-muted",
                    )}
                  >
                    {f.label} <span className="opacity-75">×{f.facteur.toLocaleString("fr-FR")}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="pubcamp-budget" className="text-xs text-muted-foreground">Budget cible (DT)</Label>
              <Input
                id="pubcamp-budget"
                type="number"
                min={0}
                step={500}
                value={budgetCible}
                onChange={e => setBudgetCible(Math.max(0, Number(e.target.value) || 0))}
                className="h-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---- Estimation instantanée ---- */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <KpiBig icon={Coins} label="Budget total" value={formatTnd(est.budget)} tone={depassement ? "terra" : "emerald"} />
        <KpiBig icon={Users} label="Contacts campagne" value={formatNum(est.contactsBruts)} />
        <KpiBig icon={Target} label="Portée nette" value={formatNum(est.porteeNette)} />
        <KpiBig icon={Repeat2} label="Fréquence moyenne" value={est.frequence > 0 ? `${est.frequence.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}×` : "—"} />
        <KpiBig icon={Gauge} label="GRP (zones couvertes)" value={est.grp > 0 ? est.grp.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—"} />
        <KpiBig icon={Calculator} label="CPM campagne" value={est.cpm > 0 ? `${est.cpm.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} DT` : "—"} />
      </div>

      {/* ---- Arbitrage : budget / mix par mode / régies / zones ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="min-w-0">
          <CardContent className="space-y-3 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold"><Coins className="h-4 w-4 text-muted-foreground" aria-hidden /> Arbitrage budgétaire</h3>
            <div>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="text-muted-foreground">Budget estimé vs cible</span>
                <span className="font-semibold tabular-nums">{formatTnd(est.budget)} / {formatTnd(budgetCible)}</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all", depassement ? "bg-[var(--c-terra)]" : "bg-emerald-600")}
                  style={{ width: `${Math.min(100, budgetCible > 0 ? (est.budget / budgetCible) * 100 : 0)}%` }}
                />
              </div>
              <p className={cn("mt-1.5 flex items-center gap-1.5 text-[12px] font-medium", depassement ? "text-[var(--c-terra)]" : "text-emerald-700 dark:text-emerald-400")}>
                {depassement
                  ? <><TriangleAlert className="h-3.5 w-3.5" aria-hidden /> Dépassement de {formatTnd(est.budget - budgetCible)} — retirez des supports ou réduisez la durée.</>
                  : <><Target className="h-3.5 w-3.5" aria-hidden /> Marge disponible : {formatTnd(budgetCible - est.budget)} — vous pouvez densifier la couverture.</>}
              </p>
            </div>
            <div className="space-y-2 border-t pt-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Layers className="h-3.5 w-3.5" aria-hidden /> Mix par mode — budget mensuel & contacts/j :
              </p>
              {parMode.map(m => {
                const meta = pubModeMeta(m.mode)
                const pctBudget = budgetMensuel > 0 ? (m.budget / budgetMensuel) * 100 : 0
                const pctContacts = est.contactsBruts > 0 ? (m.contacts / selected.reduce((s, p) => s + p.contactsJ, 0)) * 100 : 0
                return (
                  <div key={m.mode}>
                    <div className="mb-0.5 flex items-baseline justify-between text-[11.5px]">
                      <span className="flex items-center gap-1.5 font-medium">
                        <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} aria-hidden />
                        {meta.label} · {m.nb} support{m.nb > 1 ? "s" : ""}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatTnd(m.budget)} · {formatNum(m.contacts)} contacts/j
                      </span>
                    </div>
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pctBudget}%`, backgroundColor: meta.color }}
                        title={`Budget ${pctBudget.toFixed(0)} % · contacts ${pctContacts.toFixed(0)} %`}
                      />
                    </div>
                  </div>
                )
              })}
              <p className="text-[11.5px] leading-snug text-muted-foreground">
                Comparez les parts : un bon plan équilibre les contacts du transport (flux captif)
                et la couverture grand format (visibilité routière).
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent className="space-y-3 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden />
              Couverture par gouvernorat
              <Badge variant="secondary" className="ml-auto text-[11px]">{parGov.length}</Badge>
            </h3>
            <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {parGov.map(g => (
                <div key={g.gov} className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2.5 py-1.5 text-[12.5px]">
                  <span className="min-w-0 truncate font-medium">{g.gov}</span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums text-muted-foreground">
                    <span>{g.nb} support{g.nb > 1 ? "s" : ""}</span>
                    <span className="hidden sm:inline">{formatNum(g.contacts)} contacts/j</span>
                    <span className="font-medium text-foreground">{formatTnd(g.budget)}</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t pt-3">
              <h4 className="mb-1.5 text-xs font-semibold text-muted-foreground">Répartition par régie</h4>
              <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                {parRegie.map(r => (
                  <div key={r.regie} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="min-w-0 truncate">{r.regie}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {r.nb} · {formatTnd(r.budget)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent className="space-y-3 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Megaphone className="h-4 w-4 text-muted-foreground" aria-hidden />
              Supports de la campagne
              <Badge variant="secondary" className="ml-auto text-[11px]">{selected.length}</Badge>
            </h3>
            <div className="flex max-h-52 flex-wrap gap-1.5 overflow-y-auto pr-1">
              {selected.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onToggleSelect(p)}
                  title={`${p.code} — ${pubModeMeta(p.mode).label} — ${p.regie} — clic pour retirer`}
                  className="group inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-[12px] font-medium hover:border-[var(--c-terra)] hover:text-[var(--c-terra)]"
                >
                  <span className="truncate">{p.code}</span>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: pubModeMeta(p.mode).color }} aria-hidden />
                  <Trash2 className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                </button>
              ))}
            </div>
            <div className="space-y-2 border-t pt-3">
              <Button
                className="h-11 w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => void onEnregistrer()}
                disabled={saving}
              >
                {saving
                  ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Enregistrement…</>
                  : <><CircleCheck className="h-4 w-4" aria-hidden /> Enregistrer la campagne</>}
              </Button>
              <p className="text-[11.5px] leading-snug text-muted-foreground">
                L&apos;estimation est recalculée côté serveur puis archivée avec le snapshot des
                supports — le rapport complet devient consultable dans le volet « Rapports ».
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { downloadPubSupportsCsv(selected, "campagne"); toast(`Export CSV : ${selected.length} supports de la campagne « ${nom} ».`) }}>
                  <Download className="h-3.5 w-3.5" aria-hidden /> Exporter (CSV)
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-[var(--c-terra)]" onClick={onClearSelection}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Vider la sélection
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onGoListing}>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden /> Compléter le listing
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---- T60 : volet optimiseur (plan serveur appliquable à la sélection) ---- */}
      <PubOptimizer
        open={optimizerOpen}
        onOpenChange={setOptimizerOpen}
        supports={supports}
        selectedIds={selectedIds}
        objectif={objectif}
        semaines={semaines}
        periode={periode}
        budgetCible={budgetCible}
        onApplyPlan={onApplyPlan}
      />

      {/* ---- Transparence : les formules (différenciateur) ---- */}
      <Card className="min-w-0">
        <button
          type="button"
          onClick={() => setShowFormules(s => !s)}
          aria-expanded={showFormules}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
            <span className="text-sm font-semibold">Comment ces chiffres sont calculés</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", showFormules ? "" : "-rotate-90")} aria-hidden />
        </button>
        {showFormules && (
          <div className="border-t px-4 py-3.5 text-[12.5px] leading-relaxed text-muted-foreground">
            <ul className="m-0 list-disc space-y-1 pl-5">
              <li><strong className="text-foreground">Budget</strong> = Σ (tarif mensuel régie ÷ 4,345) × semaines — prorata hebdomadaire.</li>
              <li><strong className="text-foreground">Contacts</strong> = Σ contacts/jour × 7 × semaines × facteur de période (ramadan ×1,25 · été ×1,15 · rentrée ×1,1).</li>
              <li><strong className="text-foreground">Portée nette</strong> = contacts × (1 − 0,18 × part de doublons inter-supports, plafonnée à 18 % dès 5 supports).</li>
              <li><strong className="text-foreground">Fréquence</strong> = contacts ÷ portée nette. <strong className="text-foreground">GRP</strong> = portée nette ÷ population INS 2024 des gouvernorats couverts × 100.</li>
              <li><strong className="text-foreground">CPM</strong> = budget ÷ (contacts ÷ 1 000).</li>
              <li>Les contacts/jour du référentiel croisent le trafic des axes ou le flux piétonnier des stations/lieux avec la visibilité notée et le type de support (détail dans chaque fiche attributs).</li>
            </ul>
            <p className="mt-2 rounded-md bg-amber-50/70 p-2.5 text-[12px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Simulateur V1 (test, données fictives des régies) : les ordres de grandeur sont
              défendables, la précision viendra du moteur P2 (croisement trafic par segment,
              comptages horodatés des réseaux de transport). À valider par votre équipe média.
            </p>
          </div>
        )}
      </Card>
    </div>
  )
}

/** Carte KPI de l'estimation. */
function KpiBig({ icon: Icon, label, value, tone }: {
  icon: typeof Coins; label: string; value: string; tone?: "emerald" | "terra"
}) {
  return (
    <Card className={cn(
      "min-w-0",
      tone === "emerald" && "border-emerald-200 dark:border-emerald-900",
      tone === "terra" && "border-[var(--c-terra)]/60",
    )}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            tone === "emerald" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
              : tone === "terra" ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400"
                : "bg-muted text-muted-foreground",
          )} aria-hidden>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <p className="min-w-0 truncate text-[11px] text-muted-foreground">{label}</p>
        </div>
        <p className="mt-1.5 truncate text-[16px] font-bold leading-tight tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}
