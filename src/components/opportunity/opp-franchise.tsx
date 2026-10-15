'use client'

// T51-b — Radar d'Opportunités / sous-module « 🤝 Module franchise » :
// 1. Candidats potentiels (recherche, statuts, score, zone d'intérêt)
// 2. Contrat type (générateur paramétrable + aperçu + historique)
// 3. Kit de démarrage (5 catégories, switches activer/désactiver)
// 4. Suivi des franchisés actifs (KPIs 30/90 jours des TMP du réseau)

import { useMemo, useState } from "react"
import {
  Banknote, Briefcase, CheckCircle2, FileSignature, GraduationCap, Handshake, Headset, MonitorCog,
  PenLine, Percent, Search, Store, Wrench, type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { KpiCard } from "@/components/shell/kpi-card"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  CANDIDATE_STATUS_LABELS, HUB_STATUS_LABELS, KIT_CATEGORY_LABELS,
  type FranchiseCandidateDTO, type FranchiseContractDTO, type FranchiseKitItemDTO,
} from "@/lib/t51-dto"
import {
  OppEmpty, OppError, ScoreBadge, oppDateFr, oppDt, oppNum, oppPct, oppScrollList, useFranchise,
} from "./opp-shared"

export interface OppFranchiseProps {
  brandSlug: string
}

const CANDIDATE_STATUS_CLS: Record<string, string> = {
  NOUVEAU: "border-stone-300 bg-stone-100 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300",
  CONTACTE: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  EN_NEGOCIATION: "border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300",
  SIGNE: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  REFUSE: "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300",
}

const CONTRACT_STATUS: Record<string, { label: string; cls: string }> = {
  BROUILLON: { label: "Brouillon", cls: "border-stone-300 bg-stone-100 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300" },
  ENVOYE: { label: "Envoyé", cls: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  SIGNE: { label: "Signé", cls: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
}

const HUB_STATUS_CLS: Record<string, string> = {
  EN_CONSTRUCTION: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  PILOTE: "border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300",
  OPERATIONNEL: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  SUSPENDU: "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300",
}

const KIT_ICONS: Record<string, LucideIcon> = {
  ENSEIGNE: Store,
  FORMATION: GraduationCap,
  LOGICIEL: MonitorCog,
  EQUIPEMENT: Wrench,
  SUPPORT: Headset,
}

/* ======================= Onglet 1 — Candidats potentiels ======================= */

function CandidatesTab({
  candidates, busy, onUpdateStatus,
}: {
  candidates: FranchiseCandidateDTO[]
  busy: boolean
  onUpdateStatus: (id: string, status: string) => Promise<boolean>
}) {
  const [q, setQ] = useState("")
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return candidates
    return candidates.filter(c =>
      [c.name, c.profile, c.city, c.gouvernorat, c.zoneLabel ?? "", c.experience]
        .some(v => v.toLowerCase().includes(needle))
    )
  }, [candidates, q])

  const setStatus = async (c: FranchiseCandidateDTO, status: string) => {
    const ok = await onUpdateStatus(c.id, status)
    if (ok) toast.success(`${c.name} → ${CANDIDATE_STATUS_LABELS[status] ?? status}.`)
    else toast.error("Mise à jour impossible — réessayez.")
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Rechercher un candidat, un profil, une zone…"
              className="pl-8"
              aria-label="Rechercher un candidat"
            />
          </div>
          <Badge variant="secondary" className="h-6 px-2.5 tabular-nums">
            {filtered.length} candidat{filtered.length > 1 ? "s" : ""}
          </Badge>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <OppEmpty icon={Briefcase} title="Aucun candidat trouvé">
          {q ? `Aucun candidat ne correspond à « ${q} ».` : "Aucun entrepreneur n'a encore manifesté d'intérêt."}
        </OppEmpty>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(c => (
            <Card key={c.id} className="flex flex-col transition-shadow hover:shadow-md">
              <CardContent className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{c.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {c.city} · {c.gouvernorat}
                    </p>
                  </div>
                  <ScoreBadge score={c.score} />
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div className="rounded-md bg-muted/50 px-2 py-1.5">
                    <p className="uppercase tracking-wide text-muted-foreground">Capital</p>
                    <p className="font-semibold tabular-nums">{oppDt(c.capital)}</p>
                  </div>
                  <div className="rounded-md bg-muted/50 px-2 py-1.5">
                    <p className="uppercase tracking-wide text-muted-foreground">Expérience</p>
                    <p className="font-semibold">{c.experience}</p>
                  </div>
                </div>

                <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">{c.profile}.</span>{" "}
                  Zone d&apos;intérêt : {c.zoneLabel ?? "à définir"}.
                </p>

                <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
                  <Badge variant="outline" className={cn("px-2", CANDIDATE_STATUS_CLS[c.status] ?? "")}>
                    {CANDIDATE_STATUS_LABELS[c.status] ?? c.status}
                  </Badge>
                  <Select
                    value={c.status}
                    onValueChange={v => void setStatus(c, v)}
                    disabled={busy}
                  >
                    <SelectTrigger className="h-8 w-[170px] text-xs" aria-label={`Changer le statut de ${c.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CANDIDATE_STATUS_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

/* ======================= Onglet 2 — Contrat type ======================= */

function ContractTab({
  candidates, contracts, busy, onGenerate,
}: {
  candidates: FranchiseCandidateDTO[]
  contracts: FranchiseContractDTO[]
  busy: boolean
  onGenerate: (p: { candidateId: string; entryFee?: number; royaltyPct?: number; durationYears?: number }) => Promise<FranchiseContractDTO | null>
}) {
  const sorted = useMemo(() => [...candidates].sort((a, b) => b.score - a.score), [candidates])
  const [candidateId, setCandidateId] = useState<string>("")
  const [entryFee, setEntryFee] = useState("35000")
  const [royaltyPct, setRoyaltyPct] = useState("2.2")
  const [durationYears, setDurationYears] = useState("7")
  const [preview, setPreview] = useState<FranchiseContractDTO | null>(null)
  const [generating, setGenerating] = useState(false)

  const candidate = candidates.find(c => c.id === candidateId) ?? sorted[0]

  const generate = async () => {
    if (!candidate) return
    setGenerating(true)
    const fee = Number(entryFee.replace(",", "."))
    const royalty = Number(royaltyPct.replace(",", "."))
    const years = Number(durationYears)
    const contract = await onGenerate({
      candidateId: candidate.id,
      entryFee: Number.isFinite(fee) && fee > 0 ? fee : undefined,
      royaltyPct: Number.isFinite(royalty) && royalty > 0 ? royalty : undefined,
      durationYears: Number.isFinite(years) && years >= 3 ? years : undefined,
    })
    setGenerating(false)
    if (contract) {
      setPreview(contract)
      toast.success(`Contrat ${contract.reference} généré — ${candidate.name} passe en négociation.`)
    } else {
      toast.error("La génération du contrat a échoué — réessayez.")
    }
  }

  const paragraphs = (preview?.content ?? "").split("\n\n").filter(Boolean)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileSignature className="h-4 w-4 text-amber-700 dark:text-amber-500" aria-hidden />
              Générateur de contrat type
            </CardTitle>
            <CardDescription>Contrat « Mobility Point » — droit d&apos;entrée, redevance et durée paramétrables.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="opp-fr-candidate">Candidat</Label>
              <Select value={candidate?.id ?? ""} onValueChange={setCandidateId}>
                <SelectTrigger id="opp-fr-candidate" aria-label="Candidat du contrat">
                  <SelectValue placeholder="Candidat" />
                </SelectTrigger>
                <SelectContent>
                  {sorted.slice(0, 30).map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} — {c.score}/100 · {CANDIDATE_STATUS_LABELS[c.status] ?? c.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="opp-fr-fee">Droit d&apos;entrée (DT)</Label>
                <Input id="opp-fr-fee" inputMode="numeric" value={entryFee} onChange={e => setEntryFee(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="opp-fr-royalty">Redevance (%)</Label>
                <Input id="opp-fr-royalty" inputMode="decimal" value={royaltyPct} onChange={e => setRoyaltyPct(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="opp-fr-years">Durée (ans)</Label>
                <Input id="opp-fr-years" inputMode="numeric" value={durationYears} onChange={e => setDurationYears(e.target.value)} />
              </div>
            </div>
            {candidate && (
              <p className="rounded-lg bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                Zone visée : {candidate.zoneLabel ?? "à définir"} · capital {oppDt(candidate.capital)} ·
                le contrat passe automatiquement le candidat en « En négociation ».
              </p>
            )}
            <Button onClick={() => void generate()} disabled={generating || busy || !candidate} className="w-full gap-2">
              <PenLine className="h-4 w-4" aria-hidden />
              {generating ? "Génération…" : "Générer le contrat"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Aperçu du contrat</CardTitle>
            <CardDescription>
              {preview ? `${preview.reference} — ${preview.candidateName}` : "Générez un contrat pour l'afficher ici."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {preview ? (
              <div className={cn(oppScrollList, "max-h-[28rem] rounded-lg border bg-stone-50 p-4 dark:bg-stone-900/50")}>
                {paragraphs.map((p, i) => (
                  <p key={i} className="mb-3 text-xs leading-relaxed text-stone-800 dark:text-stone-200">
                    {p}
                  </p>
                ))}
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                Aucun contrat généré dans cette session.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Contrats existants ({contracts.length})</CardTitle>
          <CardDescription>Référence, candidat, paramètres et statut de chaque contrat de l&apos;enseigne.</CardDescription>
        </CardHeader>
        <CardContent>
          {contracts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun contrat enregistré.</p>
          ) : (
            <div className={cn(oppScrollList, "max-h-[28rem]")}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Référence</TableHead>
                    <TableHead>Candidat</TableHead>
                    <TableHead className="text-right">Droit d&apos;entrée</TableHead>
                    <TableHead className="text-right">Redevance</TableHead>
                    <TableHead className="text-right">Durée</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Créé le</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contracts.map(k => {
                    const meta = CONTRACT_STATUS[k.status] ?? { label: k.status, cls: "border-stone-300 bg-stone-100 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300" }
                    return (
                      <TableRow key={k.id} className="cursor-pointer" onClick={() => setPreview(k)}>
                        <TableCell className="py-2 font-mono text-xs font-semibold">{k.reference}</TableCell>
                        <TableCell className="text-sm">{k.candidateName}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{oppNum(k.entryFee)} DT</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{oppPct(k.royaltyPct, 1)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{k.durationYears} ans</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("px-2", meta.cls)}>{meta.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{oppDateFr(k.createdAt)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* ======================= Onglet 3 — Kit de démarrage ======================= */

function KitTab({
  kit, busy, onToggle,
}: {
  kit: FranchiseKitItemDTO[]
  busy: boolean
  onToggle: (itemId: string, active: boolean) => Promise<boolean>
}) {
  const byCategory = useMemo(() => {
    const m = new Map<string, FranchiseKitItemDTO[]>()
    for (const item of kit) {
      const arr = m.get(item.category)
      if (arr) arr.push(item)
      else m.set(item.category, [item])
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [kit])

  if (kit.length === 0) {
    return <OppEmpty icon={Store} title="Kit de démarrage vide">Aucun élément de kit n'est configuré pour cette enseigne.</OppEmpty>
  }

  const toggle = async (item: FranchiseKitItemDTO, active: boolean) => {
    const ok = await onToggle(item.id, active)
    if (!ok) toast.error(`Impossible de ${active ? "activer" : "désactiver"} « ${item.label} ».`)
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {byCategory.map(([cat, items]) => {
        const Icon = KIT_ICONS[cat] ?? Store
        const activeCount = items.filter(i => i.active).length
        return (
          <Card key={cat} className="flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  {KIT_CATEGORY_LABELS[cat] ?? cat}
                </span>
                <Badge variant="secondary" className="h-5 px-1.5 tabular-nums">
                  {activeCount}/{items.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 space-y-2">
              {items.map(item => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className={cn("text-sm font-medium", !item.active && "text-muted-foreground")}>{item.label}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{item.description}</p>
                  </div>
                  <Switch
                    checked={item.active}
                    disabled={busy}
                    onCheckedChange={c => void toggle(item, c === true)}
                    aria-label={`${item.active ? "Désactiver" : "Activer"} ${item.label}`}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

/* ======================= Onglet 4 — Suivi des franchisés ======================= */

function roiTone(roi: number): string {
  if (roi >= 20) return "text-emerald-600 dark:text-emerald-400"
  if (roi >= 10) return "text-amber-600 dark:text-amber-400"
  return "text-orange-700 dark:text-orange-400"
}

function rateTone(rate: number): string {
  if (rate >= 60) return "text-emerald-600 dark:text-emerald-400"
  if (rate >= 35) return "text-amber-600 dark:text-amber-400"
  return "text-orange-700 dark:text-orange-400"
}

function FranchisesTab({ franchises }: { franchises: NonNullable<ReturnType<typeof useFranchise>["data"]>["franchises"] }) {
  const totalCa = franchises.reduce((s, f) => s + f.ca30, 0)
  const avgRate = franchises.length
    ? Math.round(franchises.reduce((s, f) => s + f.conversionRate, 0) / franchises.length)
    : 0
  const bestRoi = franchises.reduce((m, f) => Math.max(m, f.roiPct), 0)
  const totalConversions = franchises.reduce((s, f) => s + f.conversions90, 0)

  if (franchises.length === 0) {
    return <OppEmpty icon={Handshake} title="Aucun franchisé actif">Les TMP signés apparaîtront ici avec leurs KPIs 30/90 jours.</OppEmpty>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="CA réseau 30 jours" value={oppDt(totalCa)} icon={Banknote} tone="success" sub={`${franchises.length} points TMP`} />
        <KpiCard label="Conversions 90 jours" value={oppNum(totalConversions)} icon={CheckCircle2} sub="vers les stations de l'enseigne" />
        <KpiCard label="Taux de conversion moyen" value={`${avgRate} %`} icon={Percent} tone="info" sub="conversions confirmées / proposées" />
        <KpiCard label="Meilleur ROI annualisé" value={`${bestRoi} %`} icon={MonitorCog} tone="warning" sub="meilleur point du réseau" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tableau de bord des franchisés actifs</CardTitle>
          <CardDescription>Chiffre d&apos;affaires, conversions, ROI et note sur les 30/90 derniers jours.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className={cn(oppScrollList, "max-h-[28rem] overflow-x-auto")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code TMP</TableHead>
                  <TableHead>Franchisé</TableHead>
                  <TableHead className="text-right">CA 30 j</TableHead>
                  <TableHead className="text-right">Services 30 j</TableHead>
                  <TableHead className="text-right">Convers. 90 j</TableHead>
                  <TableHead className="text-right">Taux</TableHead>
                  <TableHead className="text-right">CA capté</TableHead>
                  <TableHead className="text-right">ROI</TableHead>
                  <TableHead className="text-right">Note</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {franchises.map(f => (
                  <TableRow key={f.hubId}>
                    <TableCell className="py-2 font-mono text-xs font-semibold">{f.code}</TableCell>
                    <TableCell className="py-2">
                      <p className="text-sm font-medium">{f.franchisee}</p>
                      <p className="text-[11px] text-muted-foreground">{f.name} · {f.gouvernorat}</p>
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">{oppDt(f.ca30)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{oppNum(f.services30)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{oppNum(f.conversions90)}</TableCell>
                    <TableCell className={cn("text-right text-sm font-semibold tabular-nums", rateTone(f.conversionRate))}>
                      {f.conversionRate} %
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{oppDt(f.caCaptured)}</TableCell>
                    <TableCell className={cn("text-right text-sm font-bold tabular-nums", roiTone(f.roiPct))}>
                      {f.roiPct} %
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <span className="text-amber-500" aria-hidden>★</span>
                        {f.rating.toFixed(1).replace(".", ",")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("px-2", HUB_STATUS_CLS[f.status] ?? "")}>
                        {HUB_STATUS_LABELS[f.status] ?? f.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ======================= Sous-module Franchise ======================= */

export function OppFranchise({ brandSlug }: OppFranchiseProps) {
  const [tab, setTab] = useState("candidats")
  const { data, error, reload, busy, updateCandidate, generateContract, toggleKitItem } = useFranchise(brandSlug)

  if (error) return <OppError message={error} onRetry={reload} />
  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement du module franchise…">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[84px] rounded-xl" />
          ))}
        </div>
        <Card>
          <CardContent className="space-y-2 p-6">
            <Skeleton className="h-5 w-48" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  const activeCandidates = data.candidates.filter(c => c.status !== "REFUSE").length
  const signedContracts = data.contracts.filter(k => k.status === "SIGNE").length
  const activeKit = data.kit.filter(k => k.active).length
  const ca30 = data.franchises.reduce((s, f) => s + f.ca30, 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Candidats actifs" value={activeCandidates} icon={Briefcase} tone="info" sub={`${data.candidates.length} au total · hors refusés`} />
        <KpiCard label="Contrats signés" value={signedContracts} icon={FileSignature} tone="success" sub={`${data.contracts.length} contrats enregistrés`} />
        <KpiCard label="Kit de démarrage" value={`${activeKit}/${data.kit.length}`} icon={Store} sub="éléments fournis au franchisé" />
        <KpiCard label="CA franchisés 30 j" value={oppDt(ca30)} icon={Handshake} tone="warning" sub={`${data.franchises.length} points de service`} />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 sm:w-auto">
          <TabsTrigger value="candidats">Candidats potentiels</TabsTrigger>
          <TabsTrigger value="contrat">Contrat type</TabsTrigger>
          <TabsTrigger value="kit">Kit de démarrage</TabsTrigger>
          <TabsTrigger value="suivi">Suivi franchisés</TabsTrigger>
        </TabsList>
        <TabsContent value="candidats" className="mt-0 space-y-4">
          <CandidatesTab candidates={data.candidates} busy={busy} onUpdateStatus={updateCandidate} />
        </TabsContent>
        <TabsContent value="contrat" className="mt-0 space-y-4">
          <ContractTab candidates={data.candidates} contracts={data.contracts} busy={busy} onGenerate={generateContract} />
        </TabsContent>
        <TabsContent value="kit" className="mt-0 space-y-4">
          <KitTab kit={data.kit} busy={busy} onToggle={toggleKitItem} />
        </TabsContent>
        <TabsContent value="suivi" className="mt-0 space-y-4">
          <FranchisesTab franchises={data.franchises} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
