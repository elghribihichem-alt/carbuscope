'use client'

// T51-c — Mobility Hub Operations / section « Gestion des services » (4 onglets) :
//   1. Vidanges effectuées      — prestations VIDANGE + saisie (Dialog)
//   2. Ventes pneus              — PNEUS_VENTE + PNEUS_MONTAGE combinés
//   3. Diagnostics émis          — DIAGNOSTIC (codes DTC dans le détail)
//   4. Conversions vers stations — HubConversion + actions Confirmer / Perdu
// Données : GET /api/mobility/services fan-out par TMP de l'enseigne
// (hook useServices), mutations POST creer-prestation /
// confirmer-conversion / perdre-conversion.

import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowRightLeft, BadgeCheck, Droplets, Gauge, Plus, ScanLine, Timer,
  TrendingUp, Wrench, XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { SERVICE_TYPE_LABELS, type HubConversionDTO, type HubDTO, type HubServiceRecordDTO } from '@/lib/t51-dto'
import {
  ConvStatusBadge, dateFr, formatDt, formatTnd, fmtNum, fmtPct, HintNote, LoadError,
  MobilityKpi, MobilitySkeleton, postMobility, SCROLLABLE, useServices, withinDays,
  type ServiceType, type ServicesResponse,
} from './hub-shared'

export interface HubServicesProps {
  brandSlug: string
  /** Réseau national (filtré ici sur l'enseigne connectée). */
  hubs: HubDTO[]
  hubsLoading: boolean
}

const PERIODS = [
  { key: '30', label: '30 derniers jours' },
  { key: '90', label: '90 derniers jours' },
  { key: '120', label: '120 derniers jours' },
  { key: 'tout', label: 'Tout l\'historique' },
] as const

export function HubServices({ brandSlug, hubs, hubsLoading }: HubServicesProps) {
  const [tab, setTab] = useState('vidanges')
  const [hubFilter, setHubFilter] = useState('tous')
  const [period, setPeriod] = useState<string>('90')

  const brandHubs = useMemo(() => hubs.filter(h => h.brandSlug === brandSlug), [hubs, brandSlug])
  const hubIds = useMemo(
    () => (hubsLoading ? null : brandHubs.map(h => h.id)),
    [hubsLoading, brandHubs],
  )
  const { data, error, loading, reload } = useServices({ hubIds })

  const days = period === 'tout' ? null : Number(period)

  // Prestations filtrées : TMP + période (+ types par onglet)
  const filteredRecords = useMemo(() => {
    const rows = data?.records ?? []
    return rows.filter(
      r => (hubFilter === 'tous' || r.hubId === hubFilter) && withinDays(r.performedAt, days),
    )
  }, [data, hubFilter, days])

  const filteredConversions = useMemo(() => {
    const rows = data?.conversions ?? []
    return rows.filter(
      c => (hubFilter === 'tous' || c.hubId === hubFilter) && withinDays(c.proposedAt, days),
    )
  }, [data, hubFilter, days])

  if (hubsLoading) return <MobilitySkeleton label="Chargement des services TMP…" />
  if (loading) return <MobilitySkeleton label="Chargement des prestations et conversions…" />
  if (error && !data) {
    return (
      <div className="space-y-4">
        <SectionIntro />
        <LoadError message={error} onRetry={reload} />
      </div>
    )
  }

  const hubSelect = (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={hubFilter} onValueChange={setHubFilter}>
        <SelectTrigger className="w-[230px]" aria-label="Filtrer par TMP">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="tous">Tous les TMP ({brandHubs.length})</SelectItem>
          {brandHubs.map(h => (
            <SelectItem key={h.id} value={h.id}>{h.code} — {h.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={period} onValueChange={setPeriod}>
        <SelectTrigger className="w-[180px]" aria-label="Période">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIODS.map(p => (
            <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <div className="space-y-4">
      <SectionIntro />

      {brandHubs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-muted-foreground dark:border-stone-700">
          Aucun TMP référencé pour {brandSlug} — aucune prestation à afficher.
        </p>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="vidanges">Vidanges effectuées</TabsTrigger>
            <TabsTrigger value="pneus">Ventes pneus</TabsTrigger>
            <TabsTrigger value="diagnostics">Diagnostics émis</TabsTrigger>
            <TabsTrigger value="conversions">Conversions vers stations</TabsTrigger>
          </TabsList>

          <TabsContent value="vidanges" className="mt-4 space-y-4">
            <TypeTab
              records={filteredRecords}
              types={['VIDANGE']}
              hubSelect={hubSelect}
              data={data}
              onReload={reload}
              brandHubs={brandHubs}
              defaultHub={hubFilter !== 'tous' ? hubFilter : undefined}
            />
          </TabsContent>
          <TabsContent value="pneus" className="mt-4 space-y-4">
            <TypeTab
              records={filteredRecords}
              types={['PNEUS_VENTE', 'PNEUS_MONTAGE']}
              hubSelect={hubSelect}
              data={data}
              onReload={reload}
              brandHubs={brandHubs}
              defaultHub={hubFilter !== 'tous' ? hubFilter : undefined}
            />
          </TabsContent>
          <TabsContent value="diagnostics" className="mt-4 space-y-4">
            <TypeTab
              records={filteredRecords}
              types={['DIAGNOSTIC']}
              hubSelect={hubSelect}
              data={data}
              onReload={reload}
              brandHubs={brandHubs}
              defaultHub={hubFilter !== 'tous' ? hubFilter : undefined}
            />
          </TabsContent>
          <TabsContent value="conversions" className="mt-4 space-y-4">
            <ConversionsTab conversions={filteredConversions} hubSelect={hubSelect} stats={data?.convStats} onReload={reload} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function SectionIntro() {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
        <Wrench className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        Gestion des services
      </h2>
      <p className="mt-0.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Registre des prestations réalisées aux TMP de l&apos;enseigne — vidanges express, ventes et montages de pneus,
        diagnostics électroniques — et suivi des clients orientés vers les stations-service classiques.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Onglets prestations (vidanges / pneus / diagnostics)
// ---------------------------------------------------------------------------

function TypeTab({
  records, types, hubSelect, data, onReload, brandHubs, defaultHub,
}: {
  records: HubServiceRecordDTO[]
  types: ServiceType[]
  hubSelect: ReactNode
  data: ServicesResponse | null
  onReload: () => void
  brandHubs: HubDTO[]
  defaultHub?: string
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const rows = useMemo(() => records.filter(r => types.includes(r.type as ServiceType)), [records, types])
  const ca = rows.reduce((s, r) => s + r.amount, 0)
  const avg = rows.length ? Math.round(ca / rows.length) : 0
  const avgDur = rows.length ? Math.round(rows.reduce((s, r) => s + r.durationMin, 0) / rows.length) : 0
  const isDiag = types[0] === 'DIAGNOSTIC'
  const isPneus = types[0] === 'PNEUS_VENTE'

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MobilityKpi value={fmtNum(rows.length)} label="Prestations (période)" icon={Wrench} tone="teal" />
        <MobilityKpi value={formatTnd(ca)} label="CA de la période" icon={TrendingUp} tone="amber" />
        <MobilityKpi value={formatDt(avg)} label="Panier moyen" icon={Gauge} tone="violet" />
        <MobilityKpi value={`${avgDur} min`} label="Durée moyenne" icon={Timer} tone="slate" />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <div className="min-w-0">
            <CardTitle className="text-base">
              {types.map(t => SERVICE_TYPE_LABELS[t]).join(' + ')} ({rows.length})
            </CardTitle>
            <CardDescription>
              {isDiag
                ? 'Chaque diagnostic électronique consigne les codes DTC relevés dans la colonne « détail ».'
                : isPneus
                  ? 'Ventes de pneumatiques et prestations de montage/équilibrage, tous TMP de l\'enseigne.'
                  : 'Vidanges express réalisées : huile, filtre et contrôles associés (détail).'}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hubSelect}
            <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Enregistrer {isDiag ? 'un diagnostic' : isPneus ? 'une prestation pneus' : 'une vidange'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <RecordTable rows={rows} monoDetail={isDiag} />
        </CardContent>
      </Card>

      {data && data.monthly.length > 0 && (
        <HintNote>
          Tendance enseigne (6 mois glissants) :{' '}
          {data.monthly.map(m => `${m.month} ${Math.round(m.ca / 1000)} K`).join(' · ')} —
          {' '}{fmtNum(data.records.length)} prestations cumulées sur la fenêtre analysée.
        </HintNote>
      )}

      <PrestationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        hubs={brandHubs}
        typeChoices={types}
        defaultHubId={defaultHub}
        onCreated={onReload}
      />
    </>
  )
}

function RecordTable({ rows, monoDetail }: { rows: HubServiceRecordDTO[]; monoDetail?: boolean }) {
  if (rows.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        Aucune prestation sur la période sélectionnée.
      </p>
    )
  }
  return (
    <div className={`overflow-x-auto ${SCROLLABLE}`}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Immatriculation</TableHead>
            <TableHead>TMP</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Montant</TableHead>
            <TableHead className="text-right">Durée</TableHead>
            <TableHead className="pr-4">Détail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r.id}>
              <TableCell className="pl-4 font-mono text-xs font-semibold tabular-nums">{r.plate}</TableCell>
              <TableCell className="font-mono text-[11px] text-muted-foreground">{r.hubCode ?? '—'}</TableCell>
              <TableCell className="text-xs">{dateFr(r.performedAt)}</TableCell>
              <TableCell className="text-right text-xs font-semibold tabular-nums">{formatDt(r.amount)}</TableCell>
              <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{r.durationMin} min</TableCell>
              <TableCell className="max-w-72 pr-4">
                <span className={`block truncate text-xs text-muted-foreground ${monoDetail ? 'font-mono' : ''}`} title={r.detail ?? undefined}>
                  {r.detail ?? '—'}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Onglet 4 — Conversions vers stations classiques
// ---------------------------------------------------------------------------

function ConversionsTab({
  conversions, hubSelect, stats, onReload,
}: {
  conversions: HubConversionDTO[]
  hubSelect: ReactNode
  stats: ServicesResponse['convStats'] | undefined
  onReload: () => void
}) {
  const [pending, setPending] = useState<string | null>(null)

  const act = async (conv: HubConversionDTO, action: 'confirmer-conversion' | 'perdre-conversion') => {
    setPending(conv.id)
    const res = await postMobility('/api/mobility/services', { action, conversionId: conv.id })
    setPending(null)
    if (res.ok) {
      toast.success(
        action === 'confirmer-conversion' ? 'Conversion confirmée' : 'Conversion marquée perdue',
        {
          description: `${conv.plate} → ${conv.targetStationName} · ${formatDt(conv.amount)}`,
        },
      )
      onReload()
    } else {
      toast.error('Action refusée', { description: res.error })
    }
  }

  const confirmRate = stats && stats.total > 0 ? Math.round((stats.confirmed / stats.total) * 100) : 0

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <MobilityKpi value={fmtNum(stats?.total ?? 0)} label="Conversions proposées" sub="fenêtre analysée" icon={ArrowRightLeft} tone="amber" />
        <MobilityKpi value={fmtNum(stats?.confirmed ?? 0)} label="Confirmées" sub={`taux de confirmation : ${fmtPct(confirmRate)}`} icon={BadgeCheck} tone="emerald" />
        <MobilityKpi value={fmtNum(stats?.proposed ?? 0)} label="En attente" sub="à relancer / confirmer" icon={Timer} tone="slate" />
        <MobilityKpi value={fmtNum(stats?.lost ?? 0)} label="Perdues" sub="client parti chez un tiers" icon={XCircle} tone="terracotta" />
        <MobilityKpi value={formatTnd(stats?.captured ?? 0)} label="CA capté (confirmées)" sub="réalisé dans les stations" icon={TrendingUp} tone="violet" />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Orientations client TMP → station classique ({conversions.length})</CardTitle>
            <CardDescription>
              Prestations hors périmètre du micro-hub (carburant, mécanique lourde…) : le client est orienté vers une
              station du réseau et la conversion est confirmée à son retour.
            </CardDescription>
          </div>
          {hubSelect}
        </CardHeader>
        <CardContent className="p-0">
          {conversions.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Aucune conversion sur la période sélectionnée.</p>
          ) : (
            <div className={`overflow-x-auto ${SCROLLABLE}`}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Immatriculation</TableHead>
                    <TableHead>Motif</TableHead>
                    <TableHead>Station cible</TableHead>
                    <TableHead>TMP</TableHead>
                    <TableHead>Proposée le</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="pr-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conversions.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="pl-4 font-mono text-xs font-semibold tabular-nums">{c.plate}</TableCell>
                      <TableCell className="max-w-56">
                        <span className="block truncate text-xs" title={c.reason}>{c.reason}</span>
                      </TableCell>
                      <TableCell className="max-w-52">
                        <p className="truncate text-xs font-medium">{c.targetStationName}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{c.targetStationCode}</p>
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">{c.hubCode ?? '—'}</TableCell>
                      <TableCell className="text-xs">{dateFr(c.proposedAt)}</TableCell>
                      <TableCell className="text-right text-xs font-semibold tabular-nums">{formatDt(c.amount)}</TableCell>
                      <TableCell>
                        <ConvStatusBadge status={c.status} />
                        {c.confirmedAt && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground">le {dateFr(c.confirmedAt)}</p>
                        )}
                      </TableCell>
                      <TableCell className="pr-4">
                        {c.status === 'PROPOSEE' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
                              disabled={pending === c.id}
                              onClick={() => { void act(c, 'confirmer-conversion') }}
                            >
                              <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Confirmer
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-300 dark:hover:bg-orange-950/60"
                              disabled={pending === c.id}
                              onClick={() => { void act(c, 'perdre-conversion') }}
                            >
                              <XCircle className="h-3.5 w-3.5" aria-hidden /> Perdu
                            </Button>
                          </div>
                        ) : (
                          <span className="block text-right text-[11px] text-muted-foreground">
                            {c.status === 'CONFIRMEE' ? 'capitalisée' : 'clôturée'}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

// ---------------------------------------------------------------------------
// Dialog « Enregistrer une prestation » (POST creer-prestation)
// ---------------------------------------------------------------------------

export function PrestationDialog({
  open, onOpenChange, hubs, typeChoices, defaultHubId, onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  hubs: HubDTO[]
  /** Types proposés dans le formulaire (un seul = champ masqué). */
  typeChoices: ServiceType[]
  defaultHubId?: string
  onCreated: () => void
}) {
  const [type, setType] = useState<ServiceType>(typeChoices[0] ?? 'VIDANGE')
  const [hubId, setHubId] = useState(defaultHubId ?? hubs[0]?.id ?? '')
  const [plate, setPlate] = useState('')
  const [amount, setAmount] = useState('')
  const [duration, setDuration] = useState('30')
  const [detail, setDetail] = useState('')
  const [pending, setPending] = useState(false)

  const reset = () => {
    setPlate('')
    setAmount('')
    setDuration('30')
    setDetail('')
  }

  const submit = async () => {
    const plateClean = plate.trim().toUpperCase()
    const amountNum = Number(amount.replace(',', '.'))
    const durationNum = Number(duration)
    if (!hubId) {
      toast.error('Formulaire incomplet', { description: 'Sélectionnez le TMP ayant réalisé la prestation.' })
      return
    }
    if (plateClean.length < 4) {
      toast.error('Immatriculation invalide', { description: 'Saisissez au moins 4 caractères (ex. 145 TUN 3200).' })
      return
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error('Montant invalide', { description: 'Le montant en dinars doit être supérieur à 0.' })
      return
    }
    setPending(true)
    const res = await postMobility('/api/mobility/services', {
      action: 'creer-prestation',
      hubId,
      type,
      plate: plateClean,
      amount: amountNum,
      durationMin: Number.isFinite(durationNum) && durationNum > 0 ? Math.round(durationNum) : undefined,
      detail: detail.trim() || undefined,
    })
    setPending(false)
    if (res.ok) {
      const vehicleUpdated = res.data?.vehicleUpdated === true
      toast.success('Prestation enregistrée', {
        description: vehicleUpdated
          ? `${SERVICE_TYPE_LABELS[type]} · ${plateClean} — fiche véhicule mise à jour (fidélité, prochaine échéance).`
          : `${SERVICE_TYPE_LABELS[type]} · ${plateClean} — immatriculation inconnue du TMP, prestation non rattachée à une fiche client.`,
      })
      reset()
      onOpenChange(false)
      onCreated()
    } else {
      toast.error('Enregistrement refusé', { description: res.error })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Droplets className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            Enregistrer une prestation
          </DialogTitle>
          <DialogDescription>
            La prestation est horodatée à l&apos;instant ; si l&apos;immatriculation existe dans la base clients du TMP, la
            fiche véhicule (dépenses, points fidélité, prochaine échéance) est mise à jour automatiquement.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {typeChoices.length > 1 && (
            <div className="grid gap-1.5">
              <Label htmlFor="presta-type">Type de prestation</Label>
              <Select value={type} onValueChange={v => setType(v as ServiceType)}>
                <SelectTrigger id="presta-type" aria-label="Type de prestation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeChoices.map(t => (
                    <SelectItem key={t} value={t}>{SERVICE_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="presta-hub">TMP réalisant la prestation</Label>
            <Select value={hubId} onValueChange={setHubId}>
              <SelectTrigger id="presta-hub" aria-label="TMP">
                <SelectValue placeholder="Sélectionner un TMP" />
              </SelectTrigger>
              <SelectContent>
                {hubs.map(h => (
                  <SelectItem key={h.id} value={h.id}>{h.code} — {h.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="presta-plate">Immatriculation</Label>
              <Input
                id="presta-plate"
                value={plate}
                onChange={e => setPlate(e.target.value)}
                placeholder="145 TUN 3200"
                className="font-mono uppercase"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="presta-amount">Montant (DT)</Label>
              <Input
                id="presta-amount"
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="89"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="presta-duration">Durée (minutes)</Label>
              <Input
                id="presta-duration"
                inputMode="numeric"
                value={duration}
                onChange={e => setDuration(e.target.value)}
                placeholder="30"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="presta-detail" className="text-xs text-muted-foreground">
                Détail {type === 'DIAGNOSTIC' ? '(codes DTC…)' : type === 'VIDANGE' ? '(huile, filtre…)' : '(références…)'}
              </Label>
              <Textarea
                id="presta-detail"
                value={detail}
                onChange={e => setDetail(e.target.value)}
                placeholder={type === 'DIAGNOSTIC' ? 'P0401 EGR, P0171 mélange pauvre' : type === 'VIDANGE' ? '5W-30 · filtre à huile OF-1203' : '4× 195/65 R15 Sailun Atrezzo Eco'}
                rows={2}
                className="text-xs"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Annuler
          </Button>
          <Button onClick={() => { void submit() }} disabled={pending} className="gap-1.5">
            {pending ? <><ScanLine className="h-3.5 w-3.5 animate-pulse" aria-hidden /> Enregistrement…</> : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
