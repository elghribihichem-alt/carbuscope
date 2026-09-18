'use client'

// C.2.3 — Promotions : création, période, ciblage géographique (état local de démonstration)

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { CalendarRange, MapPin, Percent, Plus, Tag, Loader2, Megaphone } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useGovernoratNames, fmtDate } from "@/components/settings/settings-shared"

type Promotion = {
  id: string
  nom: string
  enseigne: string
  debut: string // YYYY-MM-DD
  fin: string
  zone: string
  reduction: number
}

type PromoStatut = "EN COURS" | "PLANIFIÉE" | "TERMINÉE"

const isoDay = (d: Date): string => d.toISOString().slice(0, 10)
const addDays = (n: number): Date => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

function statutOf(p: Promotion): PromoStatut {
  const now = new Date()
  if (now < new Date(p.debut)) return "PLANIFIÉE"
  if (now > new Date(p.fin)) return "TERMINÉE"
  return "EN COURS"
}

const STATUT_CLS: Record<PromoStatut, string> = {
  "EN COURS": "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  "PLANIFIÉE": "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  "TERMINÉE": "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
}

const NATIONAL = "National (toutes zones)"

export function PortalPromotions({ brandName }: { brandName: string }) {
  const govNames = useGovernoratNames()
  const [promos, setPromos] = useState<Promotion[]>(() => [
    {
      id: "demo-1",
      nom: "Plein à prix coûtant — Rentrée scolaire",
      enseigne: brandName,
      debut: isoDay(addDays(-8)),
      fin: isoDay(addDays(7)),
      zone: NATIONAL,
      reduction: 5,
    },
    {
      id: "demo-2",
      nom: "Lavage offert dès 40 L d'essence",
      enseigne: brandName,
      debut: isoDay(addDays(12)),
      fin: isoDay(addDays(26)),
      zone: "Sfax",
      reduction: 10,
    },
  ])
  const [dialogOpen, setDialogOpen] = useState(false)

  const enCours = useMemo(() => promos.filter(p => statutOf(p) === "EN COURS").length, [promos])

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4 text-amber-600" aria-hidden /> Promotions
            </CardTitle>
            <CardDescription>
              {promos.length} promotion(s) — {enCours} en cours. Créez une campagne, définissez la période et ciblez
              une zone géographique.
            </CardDescription>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" aria-hidden /> Créer une promotion
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {promos.map(p => {
            const statut = statutOf(p)
            return (
              <Card key={p.id} className="border-border/70">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold leading-tight" title={p.nom}>{p.nom}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Tag className="h-3 w-3" aria-hidden /> {p.enseigne}
                      </p>
                    </div>
                    <Badge variant="outline" className={STATUT_CLS[statut]}>{statut}</Badge>
                  </div>
                  <p className="flex items-center gap-1.5 text-sm">
                    <CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <span className="tabular-nums">{fmtDate(p.debut)} → {fmtDate(p.fin)}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="gap-1 font-normal">
                      <MapPin className="h-3 w-3" aria-hidden /> {p.zone}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                    >
                      <Percent className="h-3 w-3" aria-hidden /> −{p.reduction} %
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {promos.length === 0 && (
            <p className="col-span-full rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Aucune promotion — créez votre première campagne.
            </p>
          )}
        </div>
      </CardContent>

      <PromoCreateDialog
        open={dialogOpen}
        brandName={brandName}
        govNames={govNames}
        onClose={() => setDialogOpen(false)}
        onCreate={p => { setPromos(prev => [p, ...prev]) }}
      />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Dialog de création d'une promotion
// ---------------------------------------------------------------------------

function PromoCreateDialog({
  open, brandName, govNames, onClose, onCreate,
}: {
  open: boolean
  brandName: string
  govNames: string[]
  onClose: () => void
  onCreate: (p: Promotion) => void
}) {
  const today = isoDay(new Date())
  const [nom, setNom] = useState("")
  const [debut, setDebut] = useState(today)
  const [fin, setFin] = useState(isoDay(addDays(14)))
  const [zone, setZone] = useState(NATIONAL)
  const [reduction, setReduction] = useState("5")
  const [saving, setSaving] = useState(false)

  const submit = () => {
    if (!nom.trim()) {
      toast.error("Le nom de la promotion est obligatoire.")
      return
    }
    if (!debut || !fin || new Date(fin) < new Date(debut)) {
      toast.error("Période invalide — la date de fin doit suivre la date de début.")
      return
    }
    const red = Number(reduction)
    if (!Number.isFinite(red) || red < 1 || red > 100) {
      toast.error("La réduction doit être un pourcentage entre 1 et 100.")
      return
    }
    setSaving(true)
    // Simulation locale (aucune persistance serveur pour les promotions)
    window.setTimeout(() => {
      onCreate({ id: `promo-${Date.now()}`, nom: nom.trim(), enseigne: brandName, debut, fin, zone, reduction: Math.round(red) })
      toast.success("Promotion créée", {
        description: `« ${nom.trim()} » — ${fmtDate(debut)} → ${fmtDate(fin)} · ${zone} · −${Math.round(red)} %`,
      })
      setNom("")
      setDebut(today)
      setFin(isoDay(addDays(14)))
      setZone(NATIONAL)
      setReduction("5")
      setSaving(false)
      onClose()
    }, 450)
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Créer une promotion</DialogTitle>
          <DialogDescription>
            Définissez l&apos;offre, la période et la zone géographique ciblée. Les automobilistes la verront sur
            l&apos;application mobile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="promo-nom">Nom de l&apos;offre</Label>
            <Input
              id="promo-nom"
              value={nom}
              onChange={e => setNom(e.target.value)}
              placeholder="Ex. Essence à prix coûtant — week-end"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="promo-enseigne">Enseigne</Label>
            <Input id="promo-enseigne" value={brandName} disabled aria-disabled />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="promo-debut">Début de période</Label>
              <Input id="promo-debut" type="date" value={debut} onChange={e => setDebut(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="promo-fin">Fin de période</Label>
              <Input id="promo-fin" type="date" value={fin} onChange={e => setFin(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Zone géographique ciblée</Label>
              <Select value={zone} onValueChange={setZone}>
                <SelectTrigger aria-label="Zone géographique ciblée">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NATIONAL}>{NATIONAL}</SelectItem>
                  {govNames.map(g => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="promo-red">Réduction (%)</Label>
              <Input
                id="promo-red"
                type="number" min={1} max={100} step={1}
                value={reduction}
                onChange={e => setReduction(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Créer la promotion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
