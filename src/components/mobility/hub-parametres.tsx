'use client'

// T51-c — Mobility Hub Operations / section « Paramètres TMP » (4 onglets) :
//   1. Tarification services — grille tarifaire éditable (POST maj-prix)
//   2. Catalogue pneus — 16 pneus groupés par marque (POST maj-tire)
//   3. Templates rapports diagnostic — systèmes + points (POST maj-template)
//   4. Alertes maintenance équipement — statut OK/Vigilance/Alerte
//      + bouton « Maintenance réalisée » (POST maj-equipement) + seuils du réglage.
// Données : GET /api/mobility/settings?brand= (hook useHubSettings).

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BadgeCheck, CalendarClock, Check, CircleDot, Cog, Coins, Gauge, Info, Save,
  ScanLine, Settings, Store, Timer, Wrench,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  PRICE_SERVICE_LABELS, TIRE_SEASON_LABELS, type HubDiagnosticTemplateDTO, type HubEquipmentDTO,
  type HubPriceItemDTO, type HubSettingDTO, type HubTireProductDTO, type HubDTO,
} from '@/lib/t51-dto'
import {
  dateFr, EquipStatusBadge, fmtNum, formatDt, HintNote, LoadError, MobilityKpi,
  MobilitySkeleton, postMobility, SCROLLABLE, useHubSettings,
} from './hub-shared'

export interface HubParametresProps {
  brandSlug: string
  /** Réseau national (information seule : nombre de TMP de l'enseigne). */
  hubs: HubDTO[]
  hubsLoading: boolean
}

export function HubParametres({ brandSlug, hubs, hubsLoading }: HubParametresProps) {
  const [tab, setTab] = useState('tarifs')
  const { data, error, loading, reload } = useHubSettings(brandSlug)

  if (hubsLoading || loading) return <MobilitySkeleton label="Chargement des paramètres TMP…" />
  if (error && !data) {
    return (
      <div className="space-y-4">
        <SectionIntro brandSlug={brandSlug} hubCount={hubs.filter(h => h.brandSlug === brandSlug).length} />
        <LoadError message={error} onRetry={reload} />
      </div>
    )
  }

  const brandHubCount = hubs.filter(h => h.brandSlug === brandSlug).length

  return (
    <div className="space-y-4">
      <SectionIntro brandSlug={brandSlug} hubCount={brandHubCount} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="tarifs">Tarification services</TabsTrigger>
          <TabsTrigger value="pneus">Catalogue pneus</TabsTrigger>
          <TabsTrigger value="templates">Templates rapports diagnostic</TabsTrigger>
          <TabsTrigger value="equipements">Alertes maintenance équipement</TabsTrigger>
        </TabsList>

        <TabsContent value="tarifs" className="mt-4 space-y-4">
          <TarifsTab prices={data?.prices ?? []} onReload={reload} />
        </TabsContent>
        <TabsContent value="pneus" className="mt-4 space-y-4">
          <PneusTab tires={data?.tires ?? []} onReload={reload} />
        </TabsContent>
        <TabsContent value="templates" className="mt-4 space-y-4">
          <TemplatesTab templates={data?.templates ?? []} onReload={reload} />
        </TabsContent>
        <TabsContent value="equipements" className="mt-4 space-y-4">
          <EquipementsTab equipment={data?.equipment ?? []} setting={data?.setting ?? null} onReload={reload} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SectionIntro({ brandSlug, hubCount }: { brandSlug: string; hubCount: number }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
        <Settings className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        Paramètres TMP
      </h2>
      <p className="mt-0.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Référentiel opérationnel des {hubCount} micro-hubs {brandSlug} : grille tarifaire des prestations, catalogue
        pneumatiques, modèles de rapports de diagnostic et plan de maintenance des équipements. Chaque modification est
        journalisée (audit module MOBILITY).
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Onglet 1 — Tarification services (maj-prix)
// ---------------------------------------------------------------------------

interface PriceEdit { price: string; durationMin: string; active: boolean }

function TarifsTab({ prices, onReload }: { prices: HubPriceItemDTO[]; onReload: () => void }) {
  const [edits, setEdits] = useState<Record<string, PriceEdit>>({})
  const [pendingId, setPendingId] = useState<string | null>(null)

  const editOf = (item: HubPriceItemDTO): PriceEdit =>
    edits[item.id] ?? { price: String(item.price), durationMin: String(item.durationMin), active: item.active }

  const isDirty = (item: HubPriceItemDTO) => {
    const e = editOf(item)
    return Number(e.price) !== item.price || Number(e.durationMin) !== item.durationMin || e.active !== item.active
  }

  const save = async (item: HubPriceItemDTO) => {
    const e = editOf(item)
    const price = Number(e.price.replace(',', '.'))
    const durationMin = Number(e.durationMin)
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(durationMin) || durationMin <= 0) {
      toast.error('Valeurs invalides', { description: 'Montant (DT) ≥ 0 et durée (min) > 0 requis.' })
      return
    }
    setPendingId(item.id)
    const res = await postMobility('/api/mobility/settings', {
      action: 'maj-prix', itemId: item.id, price, durationMin: Math.round(durationMin), active: e.active,
    })
    setPendingId(null)
    if (res.ok) {
      toast.success('Tarif enregistré', {
        description: `${item.label} — ${formatDt(price)} · ${Math.round(durationMin)} min · ${e.active ? 'actif' : 'inactif'}.`,
      })
      onReload()
    } else {
      toast.error('Enregistrement refusé', { description: res.error })
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Grille tarifaire de l&apos;enseigne ({prices.length} prestations)</CardTitle>
        <CardDescription>
          Tarifs de référence appliqués par les TMP de l&apos;enseigne (montant en dinars, durée indicative en minutes).
          Modifiez les champs puis enregistrez ligne par ligne.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {prices.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Aucune ligne tarifaire paramétrée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs text-muted-foreground dark:border-stone-800">
                  <th className="py-2.5 pl-4 pr-2 font-medium">Prestation</th>
                  <th className="px-2 font-medium">Référence</th>
                  <th className="px-2 font-medium">Montant (DT)</th>
                  <th className="px-2 font-medium">Durée (min)</th>
                  <th className="px-2 font-medium">Active</th>
                  <th className="py-2.5 pr-4 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {prices.map(item => {
                  const e = editOf(item)
                  const dirty = isDirty(item)
                  const pending = pendingId === item.id
                  return (
                    <tr key={item.id} className="border-b border-stone-100 last:border-0 dark:border-stone-800/60">
                      <td className="py-2.5 pl-4 pr-2">
                        <p className="text-xs font-semibold">{item.label}</p>
                        <p className="text-[10px] text-muted-foreground">
                          maj {dateFr(item.updatedAt)} {item.brandSlug ? `· ${item.brandSlug}` : ''}
                        </p>
                      </td>
                      <td className="px-2">
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {PRICE_SERVICE_LABELS[item.serviceType] ?? item.serviceType}
                        </Badge>
                      </td>
                      <td className="px-2">
                        <Input
                          value={e.price}
                          onChange={ev => setEdits(m => ({ ...m, [item.id]: { ...e, price: ev.target.value } }))}
                          inputMode="decimal"
                          aria-label={`Montant de ${item.label}`}
                          className="h-8 w-24 tabular-nums"
                        />
                      </td>
                      <td className="px-2">
                        <Input
                          value={e.durationMin}
                          onChange={ev => setEdits(m => ({ ...m, [item.id]: { ...e, durationMin: ev.target.value } }))}
                          inputMode="numeric"
                          aria-label={`Durée de ${item.label}`}
                          className="h-8 w-20 tabular-nums"
                        />
                      </td>
                      <td className="px-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={e.active}
                            onCheckedChange={checked => setEdits(m => ({ ...m, [item.id]: { ...e, active: checked } }))}
                            aria-label={`Activer ${item.label}`}
                          />
                          <span className="text-[10px] text-muted-foreground">{e.active ? 'active' : 'inactive'}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        <Button
                          size="sm"
                          variant={dirty ? 'default' : 'outline'}
                          className="h-7 gap-1.5"
                          disabled={!dirty || pending}
                          onClick={() => { void save(item) }}
                        >
                          <Save className="h-3.5 w-3.5" aria-hidden />
                          {pending ? 'Enregistrement…' : 'Enregistrer'}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Onglet 2 — Catalogue pneus (maj-tire)
// ---------------------------------------------------------------------------

const SEASON_BADGES: Record<string, string> = {
  ETE: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  HIVER: 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-300',
  TOUTES_SAISONS: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
}

interface TireEdit { price: string; active: boolean }

function PneusTab({ tires, onReload }: { tires: HubTireProductDTO[]; onReload: () => void }) {
  const [season, setSeason] = useState('toutes')
  const [sizeQuery, setSizeQuery] = useState('')
  const [edits, setEdits] = useState<Record<string, TireEdit>>({})
  const [pendingId, setPendingId] = useState<string | null>(null)

  const filtered = useMemo(
    () =>
      tires.filter(
        t =>
          (season === 'toutes' || t.season === season) &&
          (sizeQuery.trim() === '' || t.size.toLowerCase().includes(sizeQuery.trim().toLowerCase())),
      ),
    [tires, season, sizeQuery],
  )
  const groups = useMemo(() => {
    const m = new Map<string, HubTireProductDTO[]>()
    for (const t of filtered) m.set(t.brand, [...(m.get(t.brand) ?? []), t])
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  const editOf = (t: HubTireProductDTO): TireEdit =>
    edits[t.id] ?? { price: String(t.price), active: t.active }

  const isDirty = (t: HubTireProductDTO) => {
    const e = editOf(t)
    return Number(e.price) !== t.price || e.active !== t.active
  }

  const save = async (t: HubTireProductDTO) => {
    const e = editOf(t)
    const price = Number(e.price.replace(',', '.'))
    if (!Number.isFinite(price) || price < 0) {
      toast.error('Prix invalide', { description: 'Saisissez un prix en dinars ≥ 0.' })
      return
    }
    setPendingId(t.id)
    const res = await postMobility('/api/mobility/settings', {
      action: 'maj-tire', productId: t.id, price, active: e.active,
    })
    setPendingId(null)
    if (res.ok) {
      toast.success('Pneu mis à jour', {
        description: `${t.brand} ${t.model} ${t.size} — ${formatDt(price)} · ${e.active ? 'actif' : 'inactif'}.`,
      })
      onReload()
    } else {
      toast.error('Mise à jour refusée', { description: res.error })
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Catalogue pneumatiques ({filtered.length}/{tires.length} références)</CardTitle>
            <CardDescription>
              Catalogue national des pneus proposés par les TMP (vente + montage). Filtrez par saison ou dimension,
              ajustez les prix et l&apos;état d&apos;offre.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={sizeQuery}
              onChange={e => setSizeQuery(e.target.value)}
              placeholder="Dimension (ex. 195/65)…"
              className="h-9 w-44"
              aria-label="Filtrer par dimension"
            />
            <Select value={season} onValueChange={setSeason}>
              <SelectTrigger className="w-[170px]" aria-label="Filtrer par saison">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="toutes">Toutes saisons</SelectItem>
                <SelectItem value="ETE">Été</SelectItem>
                <SelectItem value="HIVER">Hiver</SelectItem>
                <SelectItem value="TOUTES_SAISONS">Toutes saisons (pneu)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {groups.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Aucun pneu ne correspond aux filtres.</p>
          ) : (
            groups.map(([brand, rows]) => (
              <div key={brand}>
                <p className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <CircleDot className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {brand}
                  <Badge variant="secondary" className="text-[10px] tabular-nums">{rows.length}</Badge>
                </p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {rows.map(t => {
                    const e = editOf(t)
                    const dirty = isDirty(t)
                    const pending = pendingId === t.id
                    return (
                      <Card key={t.id} className="border-stone-200/80 dark:border-stone-800">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-bold">{t.model}</p>
                              <p className="font-mono text-[10px] text-muted-foreground">{t.ref}</p>
                            </div>
                            <Badge variant="outline" className={`whitespace-nowrap text-[10px] ${SEASON_BADGES[t.season] ?? ''}`}>
                              {TIRE_SEASON_LABELS[t.season] ?? t.season}
                            </Badge>
                          </div>
                          <p className="mt-2 font-mono text-xs font-semibold tabular-nums">{t.size}</p>
                          <p className="text-[11px] text-muted-foreground">Dispo réseau : {fmtNum(t.stockHint)}</p>
                          <div className="mt-3 flex items-end gap-2">
                            <div className="grid flex-1 gap-1">
                              <Label htmlFor={`tire-${t.id}`} className="text-[10px] text-muted-foreground">Prix (DT)</Label>
                              <Input
                                id={`tire-${t.id}`}
                                value={e.price}
                                onChange={ev => setEdits(m => ({ ...m, [t.id]: { ...e, price: ev.target.value } }))}
                                inputMode="decimal"
                                className="h-8 tabular-nums"
                              />
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <Label className="text-[10px] text-muted-foreground">Offre</Label>
                              <Switch
                                checked={e.active}
                                onCheckedChange={checked => setEdits(m => ({ ...m, [t.id]: { ...e, active: checked } }))}
                                aria-label={`Activer ${t.brand} ${t.model}`}
                              />
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant={dirty ? 'default' : 'outline'}
                            className="mt-2.5 h-7 w-full gap-1.5"
                            disabled={!dirty || pending}
                            onClick={() => { void save(t) }}
                          >
                            <Save className="h-3.5 w-3.5" aria-hidden />
                            {pending ? 'Enregistrement…' : 'Enregistrer le prix'}
                          </Button>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  )
}

// ---------------------------------------------------------------------------
// Onglet 3 — Templates rapports diagnostic (maj-template)
// ---------------------------------------------------------------------------

function TemplatesTab({
  templates, onReload,
}: {
  templates: HubDiagnosticTemplateDTO[]
  onReload: () => void
}) {
  const [pendingId, setPendingId] = useState<string | null>(null)

  const toggle = async (templateId: string, active: boolean, label: string) => {
    setPendingId(templateId)
    const res = await postMobility('/api/mobility/settings', { action: 'maj-template', templateId, active })
    setPendingId(null)
    if (res.ok) {
      toast.success(active ? 'Template activé' : 'Template désactivé', { description: label })
      onReload()
    } else {
      toast.error('Action refusée', { description: res.error })
    }
  }

  if (templates.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-muted-foreground dark:border-stone-700">
        Aucun template de rapport diagnostic paramétré pour cette enseigne.
      </p>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {templates.map(tpl => {
        const pointsCount = tpl.systems.reduce((s, sys) => s + sys.points.length, 0)
        return (
          <motion.div key={tpl.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="flex h-full flex-col border-stone-200/80 dark:border-stone-800">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-sm">{tpl.name}</CardTitle>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {tpl.code} · {tpl.systems.length} systèmes · {pointsCount} points de contrôle
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={tpl.active}
                      disabled={pendingId === tpl.id}
                      onCheckedChange={checked => { void toggle(tpl.id, checked, `${tpl.code} — ${tpl.name}`) }}
                      aria-label={`Activer ${tpl.name}`}
                    />
                  </div>
                </div>
                <CardDescription className="sr-only">
                  {tpl.active ? 'Template actif' : 'Template inactif'} — {tpl.name}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <Accordion type="multiple" defaultValue={tpl.systems.map((_, i) => `sys-${tpl.id}-${i}`)}>
                  {tpl.systems.map((sys, i) => (
                    <AccordionItem key={`${tpl.id}-${i}`} value={`sys-${tpl.id}-${i}`}>
                      <AccordionTrigger className="py-2 text-left text-xs font-semibold hover:no-underline">
                        {sys.systeme}
                        <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[9px] tabular-nums">
                          {sys.points.length}
                        </Badge>
                      </AccordionTrigger>
                      <AccordionContent className="pb-2">
                        <ul className="space-y-1">
                          {sys.points.map((pt, j) => (
                            <li key={j} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                              <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                              {pt}
                            </li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
                <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <ScanLine className="h-3 w-3" aria-hidden />
                  Dernière mise à jour : {dateFr(tpl.updatedAt)} · {tpl.active ? 'actif' : 'inactif'}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Onglet 4 — Alertes maintenance équipement (maj-equipement) + seuils
// ---------------------------------------------------------------------------

function daysUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

function EquipementsTab({
  equipment, setting, onReload,
}: {
  equipment: HubEquipmentDTO[]
  setting: HubSettingDTO | null
  onReload: () => void
}) {
  const [filter, setFilter] = useState('tous')
  const [pendingId, setPendingId] = useState<string | null>(null)

  const filtered = useMemo(
    () => (filter === 'tous' ? equipment : equipment.filter(e => e.status === filter)),
    [equipment, filter],
  )
  const byHub = useMemo(() => {
    const m = new Map<string, HubEquipmentDTO[]>()
    for (const e of filtered) {
      const key = e.hubCode ?? e.hubId
      m.set(key, [...(m.get(key) ?? []), e])
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  const counts = useMemo(
    () => ({
      alerte: equipment.filter(e => e.status === 'ALERTE').length,
      vigilance: equipment.filter(e => e.status === 'VIGILANCE').length,
      ok: equipment.filter(e => e.status === 'OK').length,
    }),
    [equipment],
  )

  const maintain = async (e: HubEquipmentDTO) => {
    setPendingId(e.id)
    const res = await postMobility('/api/mobility/settings', { action: 'maj-equipement', equipmentId: e.id })
    setPendingId(null)
    if (res.ok) {
      toast.success('Maintenance enregistrée', {
        description: `${e.name} (${e.hubCode ?? 'TMP'}) — statut réinitialisé à OK, prochaine échéance recalculée.`,
      })
      onReload()
    } else {
      toast.error('Action refusée', { description: res.error })
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MobilityKpi value={fmtNum(counts.alerte)} label="Équipements en alerte" sub="maintenance dépassée" icon={Wrench} tone="terracotta" />
        <MobilityKpi value={fmtNum(counts.vigilance)} label="En vigilance" sub="échéance < 45 jours" icon={CalendarClock} tone="amber" />
        <MobilityKpi value={fmtNum(counts.ok)} label="OK" sub="à jour" icon={BadgeCheck} tone="emerald" />
        <MobilityKpi value={fmtNum(equipment.length)} label="Équipements suivis" sub={`${byHub.length} TMP`} icon={Cog} tone="slate" />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Parc d&apos;équipements des TMP ({filtered.length}/{equipment.length})</CardTitle>
            <CardDescription>
              Ponts élévateurs, bancs diagnostic, démonte-pneus, compresseurs — statut de maintenance et heures de
              fonctionnement. « Maintenance réalisée » réinitialise le statut et replanifie la prochaine échéance selon
              le seuil de l&apos;enseigne.
            </CardDescription>
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[170px]" aria-label="Filtrer par statut">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tous">Tous ({equipment.length})</SelectItem>
              <SelectItem value="ALERTE">Alerte ({counts.alerte})</SelectItem>
              <SelectItem value="VIGILANCE">Vigilance ({counts.vigilance})</SelectItem>
              <SelectItem value="OK">OK ({counts.ok})</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-5">
          {byHub.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Aucun équipement ne correspond au filtre.</p>
          ) : (
            <div className={SCROLLABLE}>
              {byHub.map(([hubCode, rows]) => (
                <div key={hubCode} className="mb-4 last:mb-0">
                  <p className="mb-2 flex items-center gap-2 text-sm font-bold">
                    <Store className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    <span className="font-mono">{hubCode}</span>
                  </p>
                  <div className="grid gap-2.5 md:grid-cols-2">
                    {rows.map(e => {
                      const days = e.nextMaintenanceAt ? daysUntil(e.nextMaintenanceAt) : null
                      const pending = pendingId === e.id
                      return (
                        <Card key={e.id} className="border-stone-200/80 dark:border-stone-800">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-bold">{e.name}</p>
                                <p className="truncate text-[10px] text-muted-foreground">{e.model}</p>
                              </div>
                              <EquipStatusBadge status={e.status} />
                            </div>
                            <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px]">
                              <span className="flex items-center justify-between rounded-md bg-stone-100/70 px-2 py-1.5 dark:bg-stone-800/70">
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <CalendarClock className="h-3 w-3" aria-hidden /> Prochaine
                                </span>
                                <b className={`tabular-nums ${days != null && days < 0 ? 'text-orange-700 dark:text-orange-400' : ''}`}>
                                  {e.nextMaintenanceAt ? dateFr(e.nextMaintenanceAt) : '—'}
                                </b>
                              </span>
                              <span className="flex items-center justify-between rounded-md bg-stone-100/70 px-2 py-1.5 dark:bg-stone-800/70">
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <Timer className="h-3 w-3" aria-hidden /> Fonctionnement
                                </span>
                                <b className="tabular-nums">{fmtNum(e.operatingHours)} h</b>
                              </span>
                              <span className="col-span-2 flex items-center justify-between rounded-md bg-stone-100/70 px-2 py-1.5 dark:bg-stone-800/70">
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <Gauge className="h-3 w-3" aria-hidden /> Dernière maintenance
                                </span>
                                <b className="tabular-nums">
                                  {e.lastMaintenanceAt ? dateFr(e.lastMaintenanceAt) : '—'}
                                  {days != null && days < 0 ? ` · dépassée de ${Math.abs(days)} j` : days != null && days <= 45 ? ` · dans ${days} j` : ''}
                                </b>
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-2.5 h-7 w-full gap-1.5"
                              disabled={pending}
                              onClick={() => { void maintain(e) }}
                            >
                              <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                              {pending ? 'Enregistrement…' : 'Maintenance réalisée'}
                            </Button>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seuils du réglage de l'enseigne */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
            Seuils automatiques de l&apos;enseigne
          </CardTitle>
          <CardDescription>
            Paramétrage Mobility Hub Operations appliqué au calcul des alertes (modifiable dans la console Super Admin —
            action « maj-reglage »).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MobilityKpi
            value={setting ? `${fmtNum(setting.vehicleAlertDays)} j` : '—'}
            label="Échéance véhicule"
            sub="fenêtre d'alerte entretien"
            icon={CalendarClock}
            tone="teal"
          />
          <MobilityKpi
            value={setting ? `${fmtNum(setting.vehicleAlertKm)} km` : '—'}
            label="Seuil kilométrique"
            sub="entre deux entretiens"
            icon={Gauge}
            tone="violet"
          />
          <MobilityKpi
            value={setting ? `${fmtNum(setting.equipmentAlertDays)} j` : '—'}
            label="Maintenance équipement"
            sub="intervalle de référence"
            icon={Wrench}
            tone="amber"
          />
          <MobilityKpi
            value={setting ? `${setting.conversionTargetPct} %` : '—'}
            label="Objectif conversion"
            sub="cible TMP → station"
            icon={Coins}
            tone="emerald"
          />
        </CardContent>
        <CardContent className="pt-0">
          <HintNote>
            {setting
              ? `Module ${setting.enabled ? 'activé' : 'désactivé'} pour ${setting.brandSlug ?? 'le réglage global'} · dernière mise à jour ${dateFr(setting.updatedAt)}${setting.updatedBy ? ` par ${setting.updatedBy}` : ''}.`
              : 'Aucun réglage spécifique : les seuils par défaut du module s\'appliquent (90 j véhicules, 180 j équipements, 25 % conversion).'}
          </HintNote>
        </CardContent>
      </Card>
    </>
  )
}
