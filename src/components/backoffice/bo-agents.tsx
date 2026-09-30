'use client'

// D.2.4 — Agents terrain : zones, vérifications, campagnes, carte des zones assignées
// T53-T6b : agents RÉELS de /api/field-agents (statistiques dérivées réelles :
// missions ouvertes/terminées, rapports) — l'ancienne maquette locale (8 agents
// fictifs + « validité » inventée) est retirée. La réassignation de zone est
// câblée sur PATCH /api/field-agents?id= { zone } (route réelle T28) ; la
// planification de campagne reste une simulation locale honnête (aucune route).

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  UserCog, MapPin, ClipboardCheck, MapPinned, Loader2, BadgeCheck, UserRound,
  Phone, Radar,
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
import { ErrorState } from "@/components/shell/loading"
import { TunisiaMap } from "@/components/map/tunisia-map"
import type { FieldAgentDTO, StationDTO } from "@/lib/types"
import { useGovernoratNames, num } from "@/components/settings/settings-shared"

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

const initials = (nom: string): string =>
  nom.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join("")

const accentOf = (i: number): string => AGENT_ACCENTS[i % AGENT_ACCENTS.length]!

export function BoAgents() {
  const govNames = useGovernoratNames()
  // T53-T6b : agents réels de la plateforme (veille terrain T28).
  const [agents, setAgents] = useState<FieldAgentDTO[] | null>(null)
  const [agentsError, setAgentsError] = useState<string | null>(null)
  const [stations, setStations] = useState<StationDTO[] | null>(null)
  const [reassign, setReassign] = useState<FieldAgentDTO | null>(null)
  const [campaignOpen, setCampaignOpen] = useState(false)

  const reloadAgents = useCallback(async () => {
    try {
      const r = await fetch("/api/field-agents")
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = (await r.json()) as { agents?: FieldAgentDTO[] }
      setAgents(j.agents ?? [])
      setAgentsError(null)
    } catch {
      setAgentsError("Impossible de charger les agents terrain.")
    }
  }, [])

  useEffect(() => {
    void reloadAgents()
  }, [reloadAgents])

  // Stations légères pour la carte des zones assignées
  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/stations?limit=2200", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { stations: StationDTO[] }) => { setStations(j.stations) })
      .catch(() => {})
    return () => ac.abort()
  }, [])

  // Zones des agents ACTIFS (les inactifs ne couvrent plus leur périmètre).
  const activeAgents = useMemo(() => (agents ?? []).filter(a => a.active), [agents])
  const assignedZones = useMemo(() => [...new Set(activeAgents.map(a => a.zone))], [activeAgents])

  const zoneStations = useMemo(() => {
    if (!stations) return []
    const zones = new Set(assignedZones)
    return stations.filter(s => zones.has(s.gouvernorat))
  }, [stations, assignedZones])

  const openMissions = useMemo(() => activeAgents.reduce((a, x) => a + x.missionsOpen, 0), [activeAgents])
  const totalReports = useMemo(() => (agents ?? []).reduce((a, x) => a + x.reportsCount, 0), [agents])

  if (agentsError) {
    return <ErrorState message={agentsError} retry={() => { void reloadAgents() }} />
  }

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
                  {agents === null
                    ? "Chargement des agents…"
                    : `${agents.length} agent${agents.length > 1 ? "s" : ""} (${activeAgents.length} actif${activeAgents.length > 1 ? "s" : ""}) · ${num(openMissions)} mission${openMissions > 1 ? "s" : ""} ouverte${openMissions > 1 ? "s" : ""} · ${num(totalReports)} rapport${totalReports > 1 ? "s" : ""} remonté${totalReports > 1 ? "s" : ""}.`}
                </CardDescription>
              </div>
              <Button onClick={() => setCampaignOpen(true)} className="gap-1.5">
                <ClipboardCheck className="h-4 w-4" aria-hidden /> Assigner une campagne
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {agents === null ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-44 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="grid max-h-[560px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                {agents.map((a, i) => (
                  <Card key={a.id} className={`border-border/70 ${a.active ? "" : "opacity-70"}`}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className={`text-sm font-semibold ${accentOf(i)}`}>
                            {initials(a.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold leading-tight">{a.name}</p>
                          <p className="text-xs font-mono text-muted-foreground">{a.code}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge variant="secondary" className="gap-1 font-normal">
                              <MapPin className="h-3 w-3" aria-hidden /> {a.zone}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={`gap-1 text-[11px] ${a.active
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                                // T53-T6b : slate → zinc (harmonisation neutres).
                                : "border-zinc-300 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500"}`}
                            >
                              {a.active ? "Actif" : "Inactif"}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ouvertes</p>
                          <p className="font-semibold tabular-nums">{a.missionsOpen}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Terminées</p>
                          <p className="font-semibold tabular-nums">{a.missionsDone}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Rapports</p>
                          <p className="font-semibold tabular-nums">{a.reportsCount}</p>
                        </div>
                      </div>

                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" aria-hidden /> {a.phone || "—"}
                      </p>

                      {/* T53-T6b : cible tactile h-11 (convention 44 px, pattern T4b/T5b). */}
                      <Button
                        size="sm" variant="outline"
                        className="h-11 w-full gap-1.5"
                        onClick={() => setReassign(a)}
                      >
                        <MapPinned className="h-3.5 w-3.5" aria-hidden /> Réassigner la zone
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Carte des zones assignées */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPinned className="h-4 w-4 text-emerald-600" aria-hidden /> Zones assignées
            </CardTitle>
            <CardDescription>
              {assignedZones.length} zone{assignedZones.length > 1 ? "s" : ""} couverte{assignedZones.length > 1 ? "s" : ""} par les agents actifs · {zoneStations.length} stations dans les périmètres.
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

      {/* Dialog : réassignation de zone — T53-T6b : câblée sur la route réelle
          PATCH /api/field-agents?id= { zone } (T28). */}
      {reassign && (
        <ReassignDialog
          key={reassign.id}
          agent={reassign}
          govNames={govNames}
          assignedZones={assignedZones}
          onClose={() => setReassign(null)}
          onAssigned={() => { void reloadAgents() }}
        />
      )}

      {/* Dialog : campagne de vérification — simulation locale honnête
          (aucune route serveur ; les missions réelles se créent via l'outil
          « Missions » du back-office). */}
      <CampaignDialog
        open={campaignOpen}
        govNames={govNames}
        staleHint
        onClose={() => setCampaignOpen(false)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dialog de réassignation de zone (PATCH réel)
// ---------------------------------------------------------------------------

function ReassignDialog({
  agent, govNames, assignedZones, onClose, onAssigned,
}: {
  agent: FieldAgentDTO
  govNames: string[]
  assignedZones: string[]
  onClose: () => void
  onAssigned: () => void
}) {
  const [zone, setZone] = useState(agent.zone)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (zone === agent.zone) {
      toast.info("Zone inchangée — aucune réassignation nécessaire.")
      onClose()
      return
    }
    setBusy(true)
    try {
      const r = await fetch(`/api/field-agents?id=${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zone }),
      })
      const j = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
      toast.success("Zone réassignée", {
        description: `${agent.name} couvre désormais le gouvernorat de ${zone} — mis à jour en base.`,
      })
      onAssigned()
      onClose()
    } catch (e) {
      toast.error("Réassignation refusée", {
        description: e instanceof Error ? e.message : "Erreur inconnue.",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPinned className="h-4.5 w-4.5 text-purple-600" aria-hidden />
            Réassigner la zone — {agent.name}
          </DialogTitle>
          <DialogDescription>
            Zone actuelle : <span className="font-medium text-foreground">{agent.zone}</span>. Les zones déjà
            couvertes par un autre agent actif sont signalées.
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
          <Button onClick={() => { void submit() }} disabled={busy} className="gap-1.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            <BadgeCheck className="h-4 w-4" aria-hidden /> Confirmer la réassignation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Dialog : campagne de vérification (simulation locale honnête)
// ---------------------------------------------------------------------------

function CampaignDialog({
  open, govNames, staleHint, onClose,
}: {
  open: boolean
  govNames: string[]
  staleHint: boolean
  onClose: () => void
}) {
  const [zone, setZone] = useState(govNames[0] ?? "Tunis")
  const [fiches, setFiches] = useState("40")

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
    // T53-T6b : honnêteté du bouton (pattern T4b/T5b) — aucune route de
    // campagne côté serveur : planification simulée localement, la création
    // réelle passe par l'outil « Missions » (POST /api/missions).
    toast.info(`Campagne simulée pour ${num(n)} fiches de la zone ${zone}`, {
      description: "Simulation locale, aucune écriture serveur — créez des missions réelles via l'outil « Missions ».",
    })
    onClose()
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
            {staleHint && (
              <p className="text-[11px] text-muted-foreground">
                Les fiches non vérifiées depuis plus de 12 mois sont sélectionnées en premier.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} className="gap-1.5">
            <Radar className="h-4 w-4" aria-hidden />
            Planifier la campagne (simulation)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
