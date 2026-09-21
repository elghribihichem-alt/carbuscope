'use client'

// D.2.4 — Agents terrain : zones, vérifications, campagnes, carte des zones assignées

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  UserCog, MapPin, ClipboardCheck, MapPinned, Loader2, BadgeCheck, UserRound,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { TunisiaMap } from "@/components/map/tunisia-map"
import type { StationDTO } from "@/lib/types"
import { useGovernoratNames, num } from "@/components/settings/settings-shared"

type Agent = {
  id: string
  nom: string
  zone: string
  verifications: number
  validite: number
  accent: string
}

const AGENT_ACCENTS = [
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400",
  "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
]

const INITIAL_AGENTS: Agent[] = [
  { id: "a1", nom: "Sami Trabelsi", zone: "Tunis", verifications: 42, validite: 97, accent: AGENT_ACCENTS[0] },
  { id: "a2", nom: "Nour Ben Salah", zone: "Sfax", verifications: 35, validite: 94, accent: AGENT_ACCENTS[1] },
  { id: "a3", nom: "Karim Mansouri", zone: "Nabeul", verifications: 28, validite: 92, accent: AGENT_ACCENTS[2] },
  { id: "a4", nom: "Ines Khelifi", zone: "Sousse", verifications: 31, validite: 96, accent: AGENT_ACCENTS[3] },
  { id: "a5", nom: "Yassine Ayari", zone: "Bizerte", verifications: 18, validite: 89, accent: AGENT_ACCENTS[4] },
  { id: "a6", nom: "Rania Gharbi", zone: "Kairouan", verifications: 22, validite: 91, accent: AGENT_ACCENTS[5] },
  { id: "a7", nom: "Mehdi Jlassi", zone: "Gabès", verifications: 15, validite: 86, accent: AGENT_ACCENTS[6] },
  { id: "a8", nom: "Salma Ferchichi", zone: "Médenine", verifications: 24, validite: 93, accent: AGENT_ACCENTS[7] },
]

const initials = (nom: string): string =>
  nom.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join("")

const validiteColor = (p: number): string => (p >= 95 ? "bg-emerald-500" : p >= 90 ? "bg-amber-500" : "bg-red-500")

export function BoAgents() {
  const govNames = useGovernoratNames()
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS)
  const [stations, setStations] = useState<StationDTO[] | null>(null)
  const [reassign, setReassign] = useState<Agent | null>(null)
  const [campaignOpen, setCampaignOpen] = useState(false)

  // Stations légères pour la carte des zones assignées
  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/stations?limit=2200", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { stations: StationDTO[] }) => { setStations(j.stations) })
      .catch(() => {})
    return () => ac.abort()
  }, [])

  const assignedZones = useMemo(() => [...new Set(agents.map(a => a.zone))], [agents])

  const zoneStations = useMemo(() => {
    if (!stations) return []
    const zones = new Set(assignedZones)
    return stations.filter(s => zones.has(s.gouvernorat))
  }, [stations, assignedZones])

  const totalVerifications = useMemo(() => agents.reduce((a, x) => a + x.verifications, 0), [agents])
  const avgValidite = useMemo(
    () => Math.round(agents.reduce((a, x) => a + x.validite, 0) / (agents.length || 1)),
    [agents]
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Liste des agents */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserCog className="h-4 w-4 text-purple-600" aria-hidden /> Agents terrain
                </CardTitle>
                <CardDescription>
                  {agents.length} agents · {num(totalVerifications)} vérifications ce mois · validité moyenne{" "}
                  {avgValidite} %.
                </CardDescription>
              </div>
              <Button onClick={() => setCampaignOpen(true)} className="gap-1.5">
                <ClipboardCheck className="h-4 w-4" aria-hidden /> Assigner une campagne
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid max-h-[560px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {agents.map(a => (
                <Card key={a.id} className="border-border/70">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className={`text-sm font-semibold ${a.accent}`}>
                          {initials(a.nom)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold leading-tight">{a.nom}</p>
                        <Badge variant="secondary" className="mt-1 gap-1 font-normal">
                          <MapPin className="h-3 w-3" aria-hidden /> {a.zone}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Vérifications</p>
                        <p className="font-semibold tabular-nums">{a.verifications} <span className="text-xs font-normal text-muted-foreground">ce mois</span></p>
                      </div>
                      <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Validité</p>
                        <p className="font-semibold tabular-nums">{a.validite} %</p>
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Taux de validité des fiches</span>
                        <span className="tabular-nums">{a.validite} %</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={a.validite} aria-valuemin={0} aria-valuemax={100} aria-label={`Taux de validité de ${a.nom}`}>
                        <div className={`h-full rounded-full ${validiteColor(a.validite)}`} style={{ width: `${a.validite}%` }} />
                      </div>
                    </div>

                    <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => setReassign(a)}>
                      <MapPinned className="h-3.5 w-3.5" aria-hidden /> Réassigner la zone
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Carte des zones assignées */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPinned className="h-4 w-4 text-emerald-600" aria-hidden /> Zones assignées
            </CardTitle>
            <CardDescription>
              {assignedZones.length} zones couvertes · {zoneStations.length} stations dans les périmètres.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stations === null ? (
              <Skeleton className="h-[300px] w-full rounded-xl" />
            ) : (
              <TunisiaMap
                stations={zoneStations}
                layers={{ stations: true, roads: false, traffic: false, zones: true, projects: false, fleet: false }}
                showLayerControl={false}
                tools={false}
                showLegend={false}
                className="h-[300px] rounded-lg border"
              />
            )}
            <div className="flex flex-wrap gap-1.5">
              {assignedZones.map(z => (
                <Badge key={z} variant="outline" className="gap-1 text-[11px] font-normal">
                  <UserRound className="h-3 w-3 text-muted-foreground" aria-hidden /> {z}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Les campagnes de vérification sont planifiées depuis les alertes de fraîcheur (D.2.3).
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Dialog : réassignation de zone */}
      {reassign && (
        <ReassignDialog
          key={reassign.id}
          agent={reassign}
          govNames={govNames}
          assignedZones={assignedZones}
          onClose={() => setReassign(null)}
          onAssign={(agent, zone) => {
            setAgents(prev => prev.map(a => (a.id === agent.id ? { ...a, zone } : a)))
            toast.success("Zone réassignée", {
              description: `${agent.nom} couvre désormais le gouvernorat de ${zone}.`,
            })
          }}
        />
      )}

      {/* Dialog : campagne de vérification */}
      <CampaignDialog
        open={campaignOpen}
        govNames={govNames}
        onClose={() => setCampaignOpen(false)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialog de réassignation de zone
// ---------------------------------------------------------------------------

function ReassignDialog({
  agent, govNames, assignedZones, onClose, onAssign,
}: {
  agent: Agent
  govNames: string[]
  assignedZones: string[]
  onClose: () => void
  onAssign: (agent: Agent, zone: string) => void
}) {
  const [zone, setZone] = useState(agent.zone)
  const [busy, setBusy] = useState(false)

  const submit = () => {
    if (zone === agent.zone) {
      toast.info("Zone inchangée — aucune réassignation nécessaire.")
      onClose()
      return
    }
    setBusy(true)
    window.setTimeout(() => {
      onAssign(agent, zone)
      setBusy(false)
      onClose()
    }, 350)
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPinned className="h-4.5 w-4.5 text-purple-600" aria-hidden />
            Réassigner la zone — {agent.nom}
          </DialogTitle>
          <DialogDescription>
            Zone actuelle : <span className="font-medium text-foreground">{agent.zone}</span>. Les zones déjà
            couvertes par un autre agent sont signalées.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Nouvelle zone (gouvernorat)</Label>
          <Select value={zone} onValueChange={setZone}>
            <SelectTrigger aria-label="Nouvelle zone de l'agent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {govNames.map(g => (
                <SelectItem key={g} value={g}>
                  {g}
                  {assignedZones.includes(g) && g !== agent.zone ? " — déjà couverte" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={busy} className="gap-1.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            <BadgeCheck className="h-4 w-4" aria-hidden /> Confirmer la réassignation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Dialog : campagne de vérification
// ---------------------------------------------------------------------------

function CampaignDialog({
  open, govNames, onClose,
}: {
  open: boolean
  govNames: string[]
  onClose: () => void
}) {
  const [zone, setZone] = useState(govNames[0] ?? "Tunis")
  const [fiches, setFiches] = useState("40")
  const [busy, setBusy] = useState(false)

  // Suit la liste des gouvernorats quand elle arrive
  useEffect(() => {
    if (govNames.length > 0) {
      const raf = requestAnimationFrame(() => setZone(prev => (govNames.includes(prev) ? prev : govNames[0]!))
      )
      return () => cancelAnimationFrame(raf)
    }
  }, [govNames])

  const submit = () => {
    const n = Number(fiches)
    if (!Number.isFinite(n) || n < 1 || n > 500) {
      toast.error("Nombre de fiches invalide (1 à 500).")
      return
    }
    setBusy(true)
    window.setTimeout(() => {
      toast.success(`Campagne planifiée pour ${num(n)} fiches de la zone ${zone}`, {
        description: "Les fiches les moins fraîches sont priorisées — suivi disponible dans « Fraîcheur ».",
      })
      setBusy(false)
      onClose()
    }, 400)
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-4.5 w-4.5 text-emerald-600" aria-hidden />
            Assigner une campagne de vérification
          </DialogTitle>
          <DialogDescription>
            Planifiez une vague de vérifications terrain sur une zone, en priorité sur les fiches obsolètes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Zone de la campagne</Label>
            <Select value={zone} onValueChange={setZone}>
              <SelectTrigger aria-label="Zone de la campagne">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {govNames.map(g => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaign-fiches">Nombre de fiches à vérifier</Label>
            <Input
              id="campaign-fiches"
              type="number"
              min={1}
              max={500}
              value={fiches}
              onChange={e => setFiches(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Les fiches non vérifiées depuis plus de 12 mois sont sélectionnées en premier.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={busy} className="gap-1.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Planifier la campagne
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
