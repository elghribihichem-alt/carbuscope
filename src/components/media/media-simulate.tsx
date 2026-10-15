"use client"

// CarbuScope — T57 — Media Planner, volet « Simulation campagne » : le cœur
// du test P1 — l'utilisateur construit une campagne sur la SÉLECTION faite
// dans l'onglet Inventaire et voit l'estimation instantanée (formules du
// § 3.2 de docs/media-planner-proposition.md, volontairement transparentes
// et affichées). V1 HONNÊTE : estimation locale, AUCUNE persistance (ni base
// ni session) — le vrai builder P2 (scénarios A/B/C, optimiseur, validation
// en flux) viendra après arbitrage.
//   · Cadrage : nom, objectif (notoriété / trafic station / promotion),
//     durée en semaines (1-8), période clé (facteur ramadan/été/rentrée),
//     budget cible DT ;
//   · Résultats : budget total, contacts, portée nette (doublons 18 %),
//     fréquence, GRP (population INS des gouvernorats couverts), CPM ;
//   · Arbitrage : rapport budget/cible + part média PROPRIÉTAIRE (l'argument
//     « d'abord ce qu'on possède ») + répartition par gouvernorat ;
//   · Export CSV de la sélection (pattern inventaire).

import { useMemo, useState } from "react"
import {
  Calculator, Target, CalendarRange, Coins, Users, Repeat2, Gauge, Lightbulb,
  Download, Trash2, ArrowRight, Megaphone, TriangleAlert, ChevronDown, FlaskConical,
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
  type MediaPanelDTO, estimateCampaign, PERIODE_FACTEURS, formatTnd, formatNum,
  downloadPanelsCsv, RESEAU_LABELS,
} from "./media-shared"

export interface MediaSimulateProps {
  panels: MediaPanelDTO[]
  loading: boolean
  selectedIds: ReadonlySet<string>
  onToggleSelect: (p: MediaPanelDTO) => void
  onClearSelection: () => void
  onGoInventory: () => void
}

const OBJECTIFS: ReadonlyArray<{ id: string; label: string; hint: string }> = [
  { id: "NOTORIETE", label: "Notoriété enseigne", hint: "Maximiser la portée nette et la couverture géographique" },
  { id: "TRAFFIC_STATION", label: "Trafic en station", hint: "Affichage à proximité immédiate des stations (média propriétaire d'abord)" },
  { id: "PROMO_PRODUIT", label: "Promotion produit", hint: "Flux court et répétitif autour des points de vente" },
]

export function MediaSimulate({
  panels, loading, selectedIds, onToggleSelect, onClearSelection, onGoInventory,
}: MediaSimulateProps) {
  const [nom, setNom] = useState("Campagne test — P1")
  const [objectif, setObjectif] = useState("NOTORIETE")
  const [semaines, setSemaines] = useState(4)
  const [periode, setPeriode] = useState("normale")
  const [budgetCible, setBudgetCible] = useState(5000)
  const [showFormules, setShowFormules] = useState(false)

  const selected = useMemo(() => panels.filter(p => selectedIds.has(p.id)), [panels, selectedIds])
  const facteur = PERIODE_FACTEURS.find(f => f.id === periode)?.facteur ?? 1
  const est = useMemo(() => estimateCampaign(selected, semaines, facteur), [selected, semaines, facteur])

  const parGov = useMemo(() => {
    const m = new Map<string, MediaPanelDTO[]>()
    for (const p of selected) {
      const arr = m.get(p.gouvernorat) ?? []
      arr.push(p)
      m.set(p.gouvernorat, arr)
    }
    return [...m.entries()]
      .map(([gov, ps]) => ({
        gov,
        nb: ps.length,
        budget: ps.reduce((s, p) => s + p.coutMensuel, 0),
        contacts: ps.reduce((s, p) => s + p.contactsJ, 0),
      }))
      .sort((a, b) => b.contacts - a.contacts)
  }, [selected])

  const depassement = est.budget > budgetCible
  const objectifMeta = OBJECTIFS.find(o => o.id === objectif)

  if (loading) {
    return <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-[320px] rounded-xl lg:col-span-1" /><Skeleton className="h-[320px] rounded-xl lg:col-span-2" /></div>
  }

  // ---- État vide : orienter vers l'inventaire ----
  if (selected.length === 0) {
    return (
      <Card className="min-w-0">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" aria-hidden>
            <Calculator className="h-7 w-7" />
          </div>
          <div className="max-w-md">
            <h2 className="text-base font-bold">Aucun support sélectionné</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              La simulation se construit sur votre sélection : choisissez des panneaux, totems et écrans
              dans l&apos;onglet « Inventaire panneaux » (cases à cocher ou bouton dans la popup de la carte),
              puis revenez ici — l&apos;estimation est instantanée.
            </p>
          </div>
          <Button className="h-11 gap-2 bg-emerald-600 text-white hover:bg-emerald-700" onClick={onGoInventory}>
            <Megaphone className="h-4 w-4" aria-hidden /> Choisir des supports dans l&apos;inventaire
          </Button>
        </CardContent>
      </Card>
    )
  }

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
            <Badge variant="secondary" className="text-[11px]">Estimateur V1 — test local, non persisté</Badge>
          </div>

          <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="camp-nom" className="text-xs text-muted-foreground">Nom de la campagne</Label>
              <Input id="camp-nom" value={nom} onChange={e => setNom(e.target.value)} className="h-9" maxLength={60} />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Objectif</Label>
              <Select value={objectif} onValueChange={setObjectif}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OBJECTIFS.map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
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
                {PERIODE_FACTEURS.map(f => (
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
              <Label htmlFor="camp-budget" className="text-xs text-muted-foreground">Budget cible (DT)</Label>
              <Input
                id="camp-budget"
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
        <KpiBig icon={Gauge} label="GRP (zones couvertes)" value={est.grp > 0 ? `${est.grp.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}` : "—"} />
        <KpiBig icon={Calculator} label="CPM campagne" value={est.cpm > 0 ? `${est.cpm.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} DT` : "—"} />
      </div>

      {/* ---- Arbitrage : budget / média propriétaire / zones ---- */}
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
                  ? <><TriangleAlert className="h-3.5 w-3.5" aria-hidden /> Dépassement de {formatTnd(est.budget - budgetCible)} — retirez des supports externes ou réduisez la durée.</>
                  : <><Target className="h-3.5 w-3.5" aria-hidden /> Marge disponible : {formatTnd(budgetCible - est.budget)} — vous pouvez densifier la couverture.</>}
              </p>
            </div>
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">Part du média propriétaire (coût d&apos;exploitation, pas de location) :</p>
              <PartBar label="Budget" pct={est.partProprietaireBudget} />
              <PartBar label="Contacts" pct={est.partProprietaireContacts} />
              <p className="text-[11.5px] leading-snug text-muted-foreground">
                {est.partProprietaireContacts > est.partProprietaireBudget
                  ? "Votre plan est efficace : les contacts propriétaires pèsent plus que leur coût — l'argument « d'abord ce qu'on possède »."
                  : "Les supports externes dominent le budget — vérifiez qu'aucun écran/totem de station n'est disponible à proximité."}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent className="space-y-3 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold"><CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden /> Couverture par gouvernorat</h3>
            <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
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
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent className="space-y-3 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Megaphone className="h-4 w-4 text-muted-foreground" aria-hidden />
              Supports de la campagne
              <Badge variant="secondary" className="ml-auto text-[11px]">{selected.length}</Badge>
            </h3>
            <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto pr-1">
              {selected.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onToggleSelect(p)}
                  title={`${p.code} — ${RESEAU_LABELS[p.reseau] ?? p.reseau} — clic pour retirer`}
                  className="group inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-[12px] font-medium hover:border-[var(--c-terra)] hover:text-[var(--c-terra)]"
                >
                  <span className="truncate">{p.code}</span>
                  <span className="shrink-0 text-[10.5px] text-muted-foreground group-hover:text-[var(--c-terra)]">
                    {p.reseau === "PROPRIETAIRE" ? "prop." : "ext."}
                  </span>
                  <Trash2 className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 border-t pt-3">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { downloadPanelsCsv(selected); toast(`Export CSV : ${selected.length} supports de la campagne « ${nom} ».`) }}>
                <Download className="h-3.5 w-3.5" aria-hidden /> Exporter (CSV)
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-[var(--c-terra)]" onClick={onClearSelection}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Vider la sélection
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onGoInventory}>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden /> Compléter l&apos;inventaire
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

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
              <li><strong className="text-foreground">Budget</strong> = Σ (coût mensuel ÷ 4,345) × semaines — prorata hebdomadaire.</li>
              <li><strong className="text-foreground">Contacts</strong> = Σ contacts/jour × 7 × semaines × facteur de période (ramadan ×1,25 · été ×1,15 · rentrée ×1,1).</li>
              <li><strong className="text-foreground">Portée nette</strong> = contacts × (1 − 0,18 × part de doublons inter-supports, plafonnée à 18 % dès 5 supports).</li>
              <li><strong className="text-foreground">Fréquence</strong> = contacts ÷ portée nette. <strong className="text-foreground">GRP</strong> = portée nette ÷ population INS 2024 des gouvernorats couverts × 100.</li>
              <li><strong className="text-foreground">CPM</strong> = budget ÷ (contacts ÷ 1 000).</li>
              <li>Les contacts/jour du référentiel croisent le trafic réel des axes, la visibilité notée et le type de support (détail dans chaque fiche attributs).</li>
            </ul>
            <p className="mt-2 rounded-md bg-amber-50/70 p-2.5 text-[12px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Estimateur V1 (test) : les ordres de grandeur sont défendables, la précision viendra du moteur P2
              (croisement trafic CarbuScope par segment, comptages DOOH horodatés). À valider par votre équipe média.
            </p>
          </div>
        )}
      </Card>
    </div>
  )
}

/** Barre « part média propriétaire » (émeraude) vs externe (terracotta). */
function PartBar({ label, pct }: { label: string; pct: number }) {
  const p = Math.max(0, Math.min(1, pct)) * 100
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between text-[11.5px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">
          {p.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} % propriétaire
        </span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-terracotta/70">
        <div className="h-full bg-emerald-600" style={{ width: `${p}%` }} />
      </div>
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
