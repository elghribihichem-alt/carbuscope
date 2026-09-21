'use client'

// C.2.1 / C.2.2 — Gestion des stations et des services depuis le portail enseigne
// T27 : multi-vues DataViews — Tableau / Cartes / Arborescence (par gouvernorat).

import * as React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Search, Store, Settings2, Archive, Clock, Save, Loader2, MapPin, Star,
  ChevronsUpDown, Camera, Trash2,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { StatusBadge } from "@/components/shell/badges"
import { TabSkeleton, ErrorState } from "@/components/shell/loading"
import { SERVICE_ICONS } from "@/components/map/tunisia-map"
import { SERVICE_LABELS, STATUS_LABELS, type StationDTO, type StationStatus } from "@/lib/types"
import { monthsSince, num } from "@/components/settings/settings-shared"

const SERVICE_SLUGS = Object.keys(SERVICE_LABELS)
const PHOTO_POOL = ["/images/station-1.jpg", "/images/station-2.jpg", "/images/station-3.jpg", "/images/station-4.jpg"]
const EMPTY = "—"

/** Complétude d'une fiche : photo, services ≥ 3, adresse renseignée, vérifiée < 12 mois (C.2.5) */
function completenessPct(s: StationDTO): number {
  let pts = 0
  if (s.photoUrl) pts += 1
  if (s.services.length >= 3) pts += 1
  if (s.address && s.address.trim().length > 5) pts += 1
  if (monthsSince(s.lastVerified) < 12) pts += 1
  return Math.round((pts / 4) * 100)
}

const completenessColor = (p: number): string =>
  p >= 100 ? "bg-emerald-500" : p >= 75 ? "bg-amber-500" : p >= 50 ? "bg-orange-500" : "bg-red-500"

export function PortalStations({ brandSlug }: { brandSlug: string }) {
  const [stations, setStations] = useState<StationDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [search, setSearch] = useState("")
  const [gov, setGov] = useState("all")
  const [editing, setEditing] = useState<StationDTO | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    fetch(`/api/stations?brand=${encodeURIComponent(brandSlug)}&limit=400`, { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { stations: StationDTO[] }) => { setStations(j.stations); setError(null) })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return
        setError("Impossible de charger les stations de l'enseigne.")
      })
    return () => ac.abort()
  }, [brandSlug, reloadKey])

  const retry = useCallback(() => setReloadKey(k => k + 1), [])

  const govs = useMemo(
    () => (stations ? [...new Set(stations.map(s => s.gouvernorat))].sort((a, b) => a.localeCompare(b)) : []),
    [stations]
  )

  const filtered = useMemo(() => {
    if (!stations) return []
    const q = search.trim().toLowerCase()
    return stations.filter(s => {
      if (gov !== "all" && s.gouvernorat !== gov) return false
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.delegation.toLowerCase().includes(q)
      )
    })
  }, [stations, search, gov])

  /** Applique localement la station mise à jour (retour PATCH) */
  const applyUpdate = useCallback((updated: StationDTO) => {
    setStations(prev => (prev ? prev.map(s => (s.id === updated.id ? updated : s)) : prev))
  }, [])

  // Colonnes DataViews — actions (Gérer / Archiver) présentes dans les 3 vues.
  const columns: DataViewColumn<StationDTO>[] = [
    {
      key: "station", header: "Station",
      sortValue: (s) => s.name,
      render: (s) => (
        <div className="min-w-0">
          <p className="font-medium leading-tight">{s.name}</p>
          <p className="text-xs text-muted-foreground">{s.delegation || EMPTY}</p>
        </div>
      ),
    },
    {
      key: "code", header: "Code",
      sortValue: (s) => s.code,
      render: (s) => <span className="font-mono text-xs text-muted-foreground">{s.code}</span>,
    },
    {
      key: "gouvernorat", header: "Gouvernorat",
      sortValue: (s) => s.gouvernorat,
      render: (s) => (
        <span className="inline-flex items-center gap-1 text-sm">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          {s.gouvernorat}
        </span>
      ),
    },
    {
      key: "services", header: "Services",
      sortValue: (s) => s.services.length,
      render: (s) => (
        <div className="flex max-w-52 flex-wrap gap-1">
          {s.services.slice(0, 3).map(slug => (
            <Badge key={slug} variant="secondary" className="text-[10px] font-normal">
              {SERVICE_LABELS[slug] ?? slug}
            </Badge>
          ))}
          {s.services.length > 3 && (
            <Badge variant="outline" className="text-[10px]">+{s.services.length - 3}</Badge>
          )}
          {s.services.length === 0 && (
            <span className="text-xs text-muted-foreground">Aucun</span>
          )}
        </div>
      ),
    },
    {
      key: "completeness", header: "Complétude", className: "w-32",
      sortValue: (s) => completenessPct(s),
      render: (s) => {
        const comp = completenessPct(s)
        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className={`h-full rounded-full ${completenessColor(comp)}`} style={{ width: `${comp}%` }} />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{comp} %</span>
          </div>
        )
      },
    },
    {
      key: "status", header: "Statut",
      sortValue: (s) => STATUS_LABELS[s.status] ?? s.status,
      render: (s) => <StatusBadge status={s.status} />,
    },
    {
      key: "actions", header: "Actions", align: "right", className: "w-36",
      render: (s) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
            <Settings2 className="h-3.5 w-3.5" aria-hidden /> Gérer
          </Button>
          {s.status !== "CLOSED" && (
            <ArchiveStationDialog station={s} onArchived={applyUpdate}>
              <Button size="sm" variant="ghost" aria-label={`Archiver ${s.name}`}>
                <Archive className="h-3.5 w-3.5 text-red-600" aria-hidden />
              </Button>
            </ArchiveStationDialog>
          )}
        </div>
      ),
    },
  ]

  if (error) return <ErrorState message={error} retry={retry} />
  if (!stations) return <TabSkeleton title="Chargement des stations de l'enseigne…" />

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Store className="h-4 w-4 text-emerald-600" aria-hidden /> Mes stations
            </CardTitle>
            <CardDescription>
              {num(filtered.length)} / {num(stations.length)} stations — modifiez les fiches, cochez les services,
              archivez les fermetures · 3 modes d&apos;affichage.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher (nom, code, délégation)…"
                className="w-full pl-9 sm:w-64"
                aria-label="Rechercher une station"
              />
            </div>
            <Select value={gov} onValueChange={setGov}>
              <SelectTrigger className="w-full sm:w-44" aria-label="Filtrer par gouvernorat">
                <SelectValue placeholder="Gouvernorat" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les gouvernorats</SelectItem>
                {govs.map(g => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <DataViews
          viewKey="portal-stations"
          columns={columns}
          rows={filtered}
          rowKey={(s) => s.id}
          emptyMessage="Aucune station ne correspond à ces filtres."
          maxHeightClassName="max-h-[560px]"
          nested={{
            groupKey: (s) => s.gouvernorat,
            groupLabel: (gk, grows) => {
              const active = grows.filter(s => s.status !== "CLOSED").length
              const avgComp = Math.round(grows.reduce((a, s) => a + completenessPct(s), 0) / grows.length)
              return (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  {gk}
                  <span className="ml-1 text-[11px] font-normal text-primary/70">
                    — {grows.length} station{grows.length > 1 ? "s" : ""} · {active} active{active > 1 ? "s" : ""} · complétude moy. {avgComp} %
                  </span>
                </span>
              )
            },
            groupSortValue: (_gk, grows) => grows.length,
            hideColumnKeyInGroups: "gouvernorat",
            defaultOpen: "first",
          }}
          renderCard={(s) => {
            const comp = completenessPct(s)
            return (
              <Card className="overflow-hidden">
                {s.photoUrl && (
                  <img src={s.photoUrl} alt={`Photo de ${s.name}`} className="h-28 w-full border-b object-cover" />
                )}
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold leading-snug" title={s.name}>{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{s.code}</span> · {s.delegation || EMPTY}
                      </p>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>

                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> {s.gouvernorat}
                    <span className="inline-flex items-center gap-1 pl-1 font-medium text-foreground/80">
                      <Star className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                      {s.rating.toFixed(1).replace(".", ",")} ({s.reviewsCount} avis)
                    </span>
                  </p>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.services.slice(0, 3).map(slug => (
                      <Badge key={slug} variant="secondary" className="text-[10px] font-normal">
                        {SERVICE_LABELS[slug] ?? slug}
                      </Badge>
                    ))}
                    {s.services.length > 3 && (
                      <Badge variant="outline" className="text-[10px]">+{s.services.length - 3}</Badge>
                    )}
                    {s.services.length === 0 && (
                      <span className="text-xs text-muted-foreground">Aucun service renseigné</span>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-2 border-t pt-3">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div className={`h-full rounded-full ${completenessColor(comp)}`} style={{ width: `${comp}%` }} />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">{comp} % de complétude</span>
                  </div>

                  <div className="mt-3 flex justify-end gap-1.5 border-t pt-3">
                    <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
                      <Settings2 className="h-3.5 w-3.5" aria-hidden /> Gérer
                    </Button>
                    {s.status !== "CLOSED" && (
                      <ArchiveStationDialog station={s} onArchived={applyUpdate}>
                        <Button size="sm" variant="ghost" aria-label={`Archiver ${s.name}`}>
                          <Archive className="h-3.5 w-3.5 text-red-600" aria-hidden />
                        </Button>
                      </ArchiveStationDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          }}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          Complétude d&apos;une fiche : photo (25 %), au moins 3 services (25 %), adresse renseignée (25 %),
          vérification de moins de 12 mois (25 %).
        </p>
      </CardContent>

      {editing && (
        <StationEditDialog
          key={editing.id}
          station={editing}
          onClose={() => setEditing(null)}
          onSaved={applyUpdate}
        />
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Dialog d'édition d'une station (C.2.1 + C.2.2)
// ---------------------------------------------------------------------------

function StationEditDialog({
  station, onClose, onSaved,
}: {
  station: StationDTO
  onClose: () => void
  onSaved: (s: StationDTO) => void
}) {
  const [name, setName] = useState(station.name)
  const [address, setAddress] = useState(station.address)
  const [status, setStatus] = useState<StationStatus>(station.status)
  const [services, setServices] = useState<string[]>(station.services)
  const [open24, setOpen24] = useState(station.open24)
  const [open7j, setOpen7j] = useState(station.open7j)
  const [photoIdx, setPhotoIdx] = useState(() => {
    const m = /station-(\d)\.jpg/.exec(station.photoUrl ?? "")
    return m ? Number(m[1]) - 1 : -1
  })
  const [photoUrl, setPhotoUrl] = useState(station.photoUrl ?? "")
  const [saving, setSaving] = useState(false)

  const officialPhoto = () => {
    const next = (photoIdx + 1) % PHOTO_POOL.length
    setPhotoIdx(next)
    setPhotoUrl(PHOTO_POOL[next])
  }

  const toggleService = (slug: string, checked: boolean | "indeterminate") => {
    if (checked === true) setServices(prev => [...prev, slug])
    else setServices(prev => prev.filter(x => x !== slug))
  }

  const save = async () => {
    if (!name.trim()) {
      toast.error("Le nom de la station est obligatoire.")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/stations/${station.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim(),
          status,
          services,
          open24,
          open7j,
          photoUrl: photoUrl.trim() || null,
          verifiedBy: "Portail Enseigne",
          source: "Enseigne",
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = (await res.json()) as { station: StationDTO; changes: number }
      toast.success("Modification soumise — publication après vérification de cohérence", {
        description:
          j.changes > 0
            ? `${j.changes} champ(s) modifié(s) · trace enregistrée (auteur, date, IP).`
            : "Aucun changement détecté — fiche inchangée.",
      })
      onSaved(j.station)
      onClose()
    } catch {
      toast.error("Échec de l'enregistrement — réessayez dans un instant.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Settings2 className="h-4.5 w-4.5 text-emerald-600" aria-hidden />
            Gérer — {station.name}
            <Badge variant="outline" className="font-mono text-[11px]">{station.code}</Badge>
          </DialogTitle>
          <DialogDescription>
            Toute modification suit le workflow de validation avant publication (soumission → cohérence → publication).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Identité */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="st-name">Nom de la station</Label>
              <Input id="st-name" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-address">Adresse</Label>
              <Input id="st-address" value={address} onChange={e => setAddress(e.target.value)} />
            </div>
          </div>

          {/* Statut */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Statut de la station</Label>
              <Select value={status} onValueChange={v => setStatus(v as StationStatus)}>
                <SelectTrigger aria-label="Statut de la station">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock className="h-3.5 w-3.5" aria-hidden /> Horaires d&apos;ouverture
              </p>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="st-24" className="text-sm">Ouverte 24 h/24</Label>
                <Switch id="st-24" checked={open24} onCheckedChange={setOpen24} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="st-7j" className="text-sm">Ouverte 7 j/7</Label>
                <Switch id="st-7j" checked={open7j} onCheckedChange={setOpen7j} />
              </div>
            </div>
          </div>

          {/* Services (C.2.2) */}
          <div className="space-y-2">
            <Label>Services disponibles</Label>
            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-3">
              {SERVICE_SLUGS.map(slug => {
                const Icon = SERVICE_ICONS[slug]
                const checked = services.includes(slug)
                return (
                  <label
                    key={slug}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition-colors hover:bg-muted/60 ${
                      checked ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/40" : ""
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={c => toggleService(slug, c)}
                      aria-label={SERVICE_LABELS[slug]}
                    />
                    {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
                    <span className="truncate">{SERVICE_LABELS[slug]}</span>
                  </label>
                )
              })}
            </div>
            <Progress value={services.length} max={9} className="h-1" />
            <p className="text-xs text-muted-foreground">
              {services.length} service(s) sélectionné(s) — au moins 3 recommandés pour la complétude.
            </p>
          </div>

          {/* Photo (C.2.2) */}
          <div className="space-y-2">
            <Label htmlFor="st-photo">Photo officielle</Label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Input
                  id="st-photo"
                  value={photoUrl}
                  onChange={e => setPhotoUrl(e.target.value)}
                  placeholder="URL de la photo (https://… ou /images/…)"
                />
              </div>
              <Button type="button" variant="outline" onClick={officialPhoto} className="gap-1.5">
                <Camera className="h-4 w-4" aria-hidden /> Photo officielle
                <ChevronsUpDown className="h-3 w-3 text-muted-foreground" aria-hidden />
              </Button>
              {photoUrl && (
                <img
                  src={photoUrl}
                  alt={`Aperçu photo de ${station.name}`}
                  className="h-16 w-24 rounded-md border object-cover"
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              La photothèque officielle propose 4 visuels ({PHOTO_POOL.map(p => p.split("/").pop()).join(", ")}) —
              chaque clic fait tourner.
            </p>
          </div>

          {/* Archivage (C.2.1) */}
          {station.status !== "CLOSED" && (
            <div className="rounded-lg border border-red-200 bg-red-50/60 p-3 dark:border-red-900 dark:bg-red-950/30">
              <p className="flex items-center gap-1.5 text-sm font-medium text-red-700 dark:text-red-400">
                <Archive className="h-4 w-4" aria-hidden /> Archiver une station (fermeture)
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                La station passe au statut « Fermée » : elle reste tracée dans l&apos;historique mais disparaît de la
                cartographie grand public.
              </p>
              <div className="mt-2">
                <ArchiveStationDialog station={station} onArchived={s => { onSaved(s); onClose() }}>
                  <Button type="button" variant="destructive" size="sm">
                    <Archive className="h-3.5 w-3.5" aria-hidden /> Archiver cette station
                  </Button>
                </ArchiveStationDialog>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="button" onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Confirmation d'archivage (fermeture définitive)
// ---------------------------------------------------------------------------

function ArchiveStationDialog({
  station, onArchived, children,
}: {
  station: StationDTO
  onArchived: (s: StationDTO) => void
  children: React.ReactNode
}) {
  const [busy, setBusy] = useState(false)

  const archive = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/stations/${station.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CLOSED", verifiedBy: "Portail Enseigne", source: "Enseigne" }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = (await res.json()) as { station: StationDTO }
      toast.success("Station archivée", {
        description: `${station.name} (${station.code}) est passée au statut « Fermée » — modification tracée.`,
      })
      onArchived(j.station)
    } catch {
      toast.error("Échec de l'archivage — réessayez.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4.5 w-4.5 text-red-600" aria-hidden />
            Archiver {station.name} ?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Confirmez la fermeture définitive de cette station ({station.code}, {station.gouvernorat}).
            L&apos;action est journalisée et la fiche reste consultable dans l&apos;historique.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={e => { e.preventDefault(); void archive() }}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
            Confirmer la fermeture
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
