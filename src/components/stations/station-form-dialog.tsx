'use client'

// CarbuScope — éditeur de fiche station (A.4 / C.2.1-C.2.2).
// Deux modes : création (POST, statut « En projet » par défaut, GPS Tunis par défaut)
// et modification (PATCH, envoi des seuls champs modifiés → historique auto).

import { useState } from "react"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import type { StationDTO, StationStatus } from "@/lib/types"
import { SERVICE_LABELS } from "@/lib/types"
import { ROLE_LABELS, useAppStore } from "@/store/app-store"
import { SERVICE_ICONS } from "@/components/map/tunisia-map"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { GOVERNORATS } from "./station-utils"

const SERVICE_KEYS = Object.keys(SERVICE_ICONS)
const STATUS_VALUES: StationStatus[] = ["ACTIVE", "RENOVATION", "PROJECT", "CLOSED"]

function numOrUndef(raw: string): number | undefined {
  const t = raw.trim().replace(",", ".")
  if (t === "") return undefined
  const v = Number(t)
  return Number.isFinite(v) ? v : NaN
}

function StationFormBody({
  station,
  brandSlug,
  onClose,
  onSaved,
}: {
  station: StationDTO | null
  brandSlug: string
  onClose: () => void
  onSaved: (station: StationDTO, created: boolean) => void
}) {
  const isEdit = station != null
  const role = useAppStore((s) => s.role)

  const [name, setName] = useState(station?.name ?? "")
  const [address, setAddress] = useState(station?.address ?? "")
  const [gouvernorat, setGouvernorat] = useState(station?.gouvernorat ?? "Tunis")
  const [delegation, setDelegation] = useState(station?.delegation ?? "")
  const [status, setStatus] = useState<StationStatus>(station?.status ?? "PROJECT")
  const [traffic, setTraffic] = useState(station ? String(station.traffic) : "")
  const [open24, setOpen24] = useState(station?.open24 ?? false)
  const [open7j, setOpen7j] = useState(station?.open7j ?? false)
  const [services, setServices] = useState<string[]>(station?.services ?? [])
  const [lat, setLat] = useState(station ? String(station.lat) : "36.8")
  const [lng, setLng] = useState(station ? String(station.lng) : "10.18")
  const [saving, setSaving] = useState(false)

  const toggleService = (slug: string, checked: boolean) => {
    setServices((prev) => (checked ? [...prev, slug] : prev.filter((s) => s !== slug)))
  }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (saving) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error("Le nom de la station est obligatoire.")
      return
    }
    const trafficNum = numOrUndef(traffic)
    if (trafficNum !== undefined && Number.isNaN(trafficNum)) {
      toast.error("Le trafic captif doit être un nombre (véhicules/jour).")
      return
    }
    if (trafficNum !== undefined && trafficNum < 0) {
      toast.error("Le trafic captif ne peut pas être négatif.")
      return
    }

    let body: Record<string, unknown>
    if (isEdit && station) {
      const diff: Record<string, unknown> = {}
      if (trimmedName !== station.name) diff.name = trimmedName
      if (address.trim() !== station.address) diff.address = address.trim()
      if (gouvernorat.trim() !== station.gouvernorat) diff.gouvernorat = gouvernorat.trim()
      if (delegation.trim() !== station.delegation) diff.delegation = delegation.trim()
      if (status !== station.status) diff.status = status
      if (trafficNum !== undefined && trafficNum !== station.traffic) diff.traffic = trafficNum
      if (open24 !== station.open24) diff.open24 = open24
      if (open7j !== station.open7j) diff.open7j = open7j
      const sameServices = station.services.length === services.length && station.services.every((x) => services.includes(x))
      if (!sameServices) diff.services = services
      body = { ...diff, verifiedBy: ROLE_LABELS[role] ?? "Portail enseigne" }
    } else {
      const latNum = numOrUndef(lat)
      const lngNum = numOrUndef(lng)
      if (latNum === undefined || Number.isNaN(latNum) || latNum < 30 || latNum > 38) {
        toast.error("Latitude invalide — la Tunisie se situe entre 30 et 38 degrés Nord.")
        return
      }
      if (lngNum === undefined || Number.isNaN(lngNum) || lngNum < 7 || lngNum > 13) {
        toast.error("Longitude invalide — la Tunisie se situe entre 7 et 13 degrés Est.")
        return
      }
      body = {
        name: trimmedName,
        brandSlug,
        gouvernorat: gouvernorat.trim() || "Tunis",
        delegation: delegation.trim(),
        address: address.trim(),
        lat: latNum,
        lng: lngNum,
        status,
        ...(trafficNum !== undefined && !Number.isNaN(trafficNum) ? { traffic: trafficNum } : {}),
        open24,
        open7j,
        services,
      }
    }

    setSaving(true)
    try {
      const res = await fetch(isEdit ? `/api/stations/${station?.id}` : "/api/stations", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errJson: unknown = await res.json().catch(() => null)
        const msg = errJson && typeof errJson === "object" && "error" in errJson && typeof errJson.error === "string"
          ? errJson.error
          : `Erreur ${res.status}`
        throw new Error(msg)
      }
      const json = (await res.json()) as { station: StationDTO }
      toast.success(isEdit ? "Fiche mise à jour" : "Station ajoutée au réseau", {
        description: `${json.station.name} · ${json.station.code}`,
      })
      onSaved(json.station, !isEdit)
      onClose()
    } catch (err) {
      toast.error(isEdit ? "Échec de la mise à jour" : "Échec de la création", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="st-name">Nom commercial *</Label>
          <Input
            id="st-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. Agil Soukra"
            required
            maxLength={120}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="st-address">Adresse</Label>
          <Input
            id="st-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Route, repère, commune…"
            maxLength={200}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="st-gov">Gouvernorat</Label>
          <Select value={gouvernorat} onValueChange={setGouvernorat}>
            <SelectTrigger id="st-gov" className="w-full">
              <SelectValue placeholder="Sélectionner un gouvernorat" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {GOVERNORATS.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="st-deleg">Délégation</Label>
          <Input
            id="st-deleg"
            value={delegation}
            onChange={(e) => setDelegation(e.target.value)}
            placeholder="Ex. Soukra"
            maxLength={80}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="st-status">Statut</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as StationStatus)}>
            <SelectTrigger id="st-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_VALUES.map((st) => (
                <SelectItem key={st} value={st}>
                  {st === "ACTIVE" ? "Active" : st === "RENOVATION" ? "En rénovation" : st === "PROJECT" ? "En projet" : "Fermée"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="st-traffic">Trafic captif (véh./jour)</Label>
          <Input
            id="st-traffic"
            type="number"
            min={0}
            step={50}
            inputMode="numeric"
            value={traffic}
            onChange={(e) => setTraffic(e.target.value)}
            placeholder="Ex. 1800"
            className="tabular-nums"
          />
        </div>

        {!isEdit && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="st-lat">Latitude</Label>
              <Input
                id="st-lat"
                type="number"
                step={0.0001}
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-lng">Longitude</Label>
              <Input
                id="st-lng"
                type="number"
                step={0.0001}
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <p className="text-[11px] text-muted-foreground sm:col-span-2">
              Coordonnées par défaut : Tunis (36,8 — 10,18). Ajustez-les pour positionner la station sur la carte.
            </p>
          </>
        )}
      </div>

      {/* Horaires */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium">Ouverte 24h/24</p>
            <p className="text-[11px] text-muted-foreground">Service continu jour et nuit</p>
          </div>
          <Switch checked={open24} onCheckedChange={setOpen24} aria-label="Ouverte 24h/24" />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium">Ouverte 7j/7</p>
            <p className="text-[11px] text-muted-foreground">Ouverture dominicale</p>
          </div>
          <Switch checked={open7j} onCheckedChange={setOpen7j} aria-label="Ouverte 7j/7" />
        </div>
      </div>

      {/* Services (C.2.2 : cocher/décocher les services disponibles) */}
      <div className="space-y-1.5">
        <Label>Services disponibles ({services.length}/{SERVICE_KEYS.length})</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SERVICE_KEYS.map((slug) => {
            const Icon = SERVICE_ICONS[slug]
            const checked = services.includes(slug)
            return (
              <label
                key={slug}
                className={cn(
                  "flex cursor-pointer select-none items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted/50",
                  checked && "border-primary/40 bg-primary/5 text-primary"
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) => toggleService(slug, c === true)}
                  aria-label={SERVICE_LABELS[slug] ?? slug}
                />
                {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                <span className="truncate">{SERVICE_LABELS[slug] ?? slug}</span>
              </label>
            )
          })}
        </div>
      </div>

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" size="sm" className="gap-1.5" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          {isEdit ? "Enregistrer les modifications" : "Créer la station"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function StationFormDialog({
  open,
  station,
  brandSlug,
  onClose,
  onSaved,
}: {
  open: boolean
  station: StationDTO | null
  brandSlug: string
  onClose: () => void
  onSaved: (station: StationDTO, created: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{station ? "Modifier la fiche station" : "Ajouter une station"}</DialogTitle>
          <DialogDescription>
            {station
              ? `${station.name} · ${station.code} — les modifications sont tracées dans l'historique.`
              : `Nouvelle station du réseau « ${brandSlug} » — créée au statut « En projet » avec validation possible ensuite.`}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <StationFormBody station={station} brandSlug={brandSlug} onClose={onClose} onSaved={onSaved} />
        )}
      </DialogContent>
    </Dialog>
  )
}
