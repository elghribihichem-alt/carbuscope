'use client'

// CarbuScope — T54-Ca — Module 2 « Mobility Hub Operations », volet 2/5 :
// « Gestion des services ». Sélecteur de hub en cartes défilantes (hub
// présélectionnable via nav.hubsSel — handoff depuis la carte des TMP),
// KPI du hub (services actifs / en pause / clôturés, réservations du mois),
// table des services triable par colonne (catégorie badge tonnée — mapping
// documenté dans hub-shared.tsx, tarif DT, statut, capacité/j, réservations
// du mois + mini jauge de remplissage mensuelle) et vue groupée par catégorie
// (toggle). CRUD complet : « Nouveau service » (Dialog catégorie/nom/tarif/
// capacité/statut → POST), édition préremplie (PATCH), pause/reprise libres
// (PATCH) et clôture DÉFINITIVE sous AlertDialog (guard 400 FR côté API sur
// tout service CLOSED). Toasts sonner à chaque mutation, remontage des
// dialogs par clé (discipline lint T54-B3b — zéro setState synchrone d'effet).

import { useEffect, useMemo, useState } from "react"
import {
  Activity, CalendarCheck, CheckCircle2, ChevronDown, ChevronUp, CircleSlash,
  Layers, Loader2, Pause, Pencil, Play, Plus, Wrench,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton, TabSkeleton, ErrorState } from "@/components/shell/loading"
import { num } from "@/lib/chart"
import {
  HUB_STATUS_META, SERVICE_META, SERVICE_ORDER, SERVICE_STATUS_META,
  ServiceCategoryBadge, ServiceStatusBadge, priceFr,
  type HubDTO, type HubServiceDTO,
} from "./hub-shared"

/* ============================== Dialog création / édition ============================== */

/**
 * Formulaire de service (création si initial=null, édition sinon). Remonté par
 * clé à chaque ouverture — état local garanti neuf, aucune réinitialisation
 * par effet (pattern T54-B3b). En édition : seuls les champs MODIFIÉS sont
 * envoyés au PATCH (le statut identique serait rejeté 400 par l'API).
 */
function ServiceFormDialog({ hub, initial, onClose, onSaved }: {
  hub: HubDTO
  initial: HubServiceDTO | null
  onClose: () => void
  onSaved: (service: HubServiceDTO, created: boolean) => void
}) {
  const isEdit = initial != null
  const [category, setCategory] = useState(initial?.category ?? "LAVAGE")
  const [name, setName] = useState(initial?.name ?? "")
  const [price, setPrice] = useState(initial?.price != null ? String(initial.price) : "")
  const [capacity, setCapacity] = useState(
    initial?.capacityPerDay != null ? String(initial.capacityPerDay) : "",
  )
  const [status, setStatus] = useState(initial?.status === "PAUSED" ? "PAUSED" : "ACTIVE")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const submit = async () => {
    const trimmed = name.trim()
    if (trimmed.length < 2 || trimmed.length > 80) {
      setFormError("Le nom du service doit contenir entre 2 et 80 caractères.")
      return
    }
    const priceNb = price.trim() === "" ? null : Number(price.trim().replace(",", "."))
    if (priceNb != null && (!Number.isFinite(priceNb) || priceNb < 0)) {
      setFormError("Tarif invalide — un montant en DT supérieur ou égal à 0 (ou vide pour une vente libre).")
      return
    }
    const capNb = capacity.trim() === "" ? null : Number(capacity.trim())
    if (capNb != null && (!Number.isInteger(capNb) || capNb < 1)) {
      setFormError("Capacité invalide — un nombre entier de prestations par jour (≥ 1), ou laissez vide.")
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      const body: Record<string, unknown> = isEdit
        ? { id: initial.id }
        : { hubId: hub.id, category, status }
      if (isEdit) {
        if (trimmed !== initial.name) body.name = trimmed
        if (priceNb !== initial.price) body.price = priceNb
        if (capNb !== initial.capacityPerDay) body.capacityPerDay = capNb
        if (status !== initial.status) body.status = status
        if (Object.keys(body).length === 1) {
          setFormError("Aucune modification détectée — ajustez au moins un champ.")
          setSaving(false)
          return
        }
      } else {
        body.name = trimmed
        body.price = priceNb
        body.capacityPerDay = capNb
      }

      const r = await fetch("/api/hubs/services", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = (await r.json().catch(() => ({}))) as { service?: HubServiceDTO; error?: string }
      if (!r.ok || !json.service) {
        setFormError(json.error ?? "Enregistrement impossible — réessayez.")
        setSaving(false)
        return
      }
      onSaved(json.service, !isEdit)
    } catch {
      setFormError("Enregistrement impossible — vérifiez votre connexion.")
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !saving) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le service" : "Nouveau service"}</DialogTitle>
          <DialogDescription>
            {hub.code} — {hub.name}
            {isEdit ? " · les champs modifiés seuls seront enregistrés." : " · tarifs et capacité indicatifs."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="svc-category">Catégorie</Label>
            <Select value={category} onValueChange={setCategory} disabled={isEdit}>
              <SelectTrigger id="svc-category" className="h-11 text-sm" aria-label="Catégorie du service">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_ORDER.map(c => (
                  <SelectItem key={c} value={c}>
                    {SERVICE_META[c]?.label ?? c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isEdit && (
              <p className="text-[11px] text-muted-foreground">
                La catégorie est structurelle — non modifiable en V1.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="svc-name">Nom du service</Label>
            <Input
              id="svc-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex. Lavage complet + aspiration"
              maxLength={80}
              className="h-11 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="svc-price">Tarif (DT)</Label>
              <Input
                id="svc-price"
                value={price}
                onChange={e => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder="vide = vente libre"
                className="h-11 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-capacity">Capacité / jour</Label>
              <Input
                id="svc-capacity"
                value={capacity}
                onChange={e => setCapacity(e.target.value)}
                inputMode="numeric"
                placeholder="non suivie"
                className="h-11 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="svc-status">Statut</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="svc-status" className="h-11 text-sm" aria-label="Statut du service">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Actif</SelectItem>
                <SelectItem value="PAUSED">En pause</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              La clôture (définitive) se fait depuis la ligne du tableau.
            </p>
          </div>

          {formError && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
              {formError}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button className="h-11 gap-2" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {isEdit ? "Enregistrer" : "Créer le service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ============================== Volet ============================== */

type SortKey = "category" | "name" | "status" | "capacity" | "bookings"

const STATUS_SORT: Record<string, number> = { ACTIVE: 0, PAUSED: 1, CLOSED: 2 }

export function HubServices({ preselect }: { preselect: string }) {
  // ---- Hubs (sélecteur) : une passe, abortable, retry ----
  const [hubs, setHubs] = useState<HubDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // ---- Hub sélectionné (présélection nav.hubsSel, sinon le 1er actif) ----
  const [hubId, setHubId] = useState("")

  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/hubs", { signal: ctrl.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`/api/hubs → ${r.status}`)
        return (await r.json()) as { hubs: HubDTO[] }
      })
      .then(d => {
        setHubs(d.hubs ?? [])
        setError(null)
        setHubId(prev =>
          prev ||
          d.hubs.find(h => h.id === preselect)?.id ||
          d.hubs[0]?.id ||
          "",
        )
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
  }, [reloadKey, preselect])

  const hub = useMemo(() => hubs?.find(h => h.id === hubId) ?? null, [hubs, hubId])

  // ---- Services du hub sélectionné (état clé par hubId + dérivation) ----
  const [serviceData, setServiceData] = useState<{ hubId: string; services: HubServiceDTO[] } | null>(null)
  useEffect(() => {
    if (!hubId) return
    const ctrl = new AbortController()
    fetch(`/api/hubs/services?hubId=${encodeURIComponent(hubId)}`, { signal: ctrl.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`/api/hubs/services → ${r.status}`)
        return (await r.json()) as { services: HubServiceDTO[] }
      })
      .then(d => setServiceData({ hubId, services: d.services ?? [] }))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
      })
    return () => ctrl.abort()
  }, [hubId, reloadKey])

  const services: HubServiceDTO[] | null =
    serviceData && serviceData.hubId === hubId ? serviceData.services : null

  /** Applique une ligne mutée en place (PATCH) / ajoute une création (POST). */
  const applyService = (s: HubServiceDTO) =>
    setServiceData(prev =>
      prev ? { ...prev, services: prev.services.map(x => (x.id === s.id ? s : x)) } : prev,
    )
  const addService = (s: HubServiceDTO) =>
    setServiceData(prev => (prev ? { ...prev, services: [s, ...prev.services] } : prev))

  // ---- KPI du hub (dérivés de la table réelle) ----
  const kpis = useMemo(() => {
    const list = services ?? []
    return {
      actifs: list.filter(s => s.status === "ACTIVE").length,
      pauses: list.filter(s => s.status === "PAUSED").length,
      clotures: list.filter(s => s.status === "CLOSED").length,
      bookings: list.reduce((a, s) => a + s.bookingsThisMonth, 0),
    }
  }, [services])

  // ---- Tri + vue groupée ----
  const [sortKey, setSortKey] = useState<SortKey>("category")
  const [sortDir, setSortDir] = useState<1 | -1>(1)
  const [groupBy, setGroupBy] = useState(false)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 1 ? -1 : 1))
    else {
      setSortKey(key)
      setSortDir(1)
    }
  }

  const sorted = useMemo(() => {
    if (!services) return []
    const list = [...services]
    list.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case "category":
          cmp = SERVICE_ORDER.indexOf(a.category) - SERVICE_ORDER.indexOf(b.category)
          break
        case "name":
          cmp = a.name.localeCompare(b.name, "fr")
          break
        case "status":
          cmp = (STATUS_SORT[a.status] ?? 9) - (STATUS_SORT[b.status] ?? 9)
          break
        case "capacity":
          cmp = (a.capacityPerDay ?? -1) - (b.capacityPerDay ?? -1)
          break
        case "bookings":
          cmp = a.bookingsThisMonth - b.bookingsThisMonth
          break
      }
      return cmp * sortDir || a.name.localeCompare(b.name, "fr")
    })
    return list
  }, [services, sortKey, sortDir])

  const groups = useMemo(
    () =>
      SERVICE_ORDER.map(category => ({
        category,
        rows: sorted.filter(s => s.category === category),
      })).filter(g => g.rows.length > 0),
    [sorted],
  )

  // ---- Dialogs (remontés par clé — état neuf à chaque ouverture) ----
  const [formState, setFormState] = useState<{ service: HubServiceDTO | null; seq: number } | null>(null)
  const [closeTarget, setCloseTarget] = useState<HubServiceDTO | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // ---- Mutations statut (pause / reprise / clôture définitive) ----
  const patchStatus = async (service: HubServiceDTO, status: "PAUSED" | "ACTIVE" | "CLOSED") => {
    setBusyId(service.id)
    try {
      const r = await fetch("/api/hubs/services", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: service.id, status }),
      })
      const json = (await r.json().catch(() => ({}))) as { service?: HubServiceDTO; error?: string }
      if (!r.ok || !json.service) {
        toast.error(json.error ?? "Action impossible — réessayez.")
        return false
      }
      applyService(json.service)
      if (status === "PAUSED") {
        toast.warning(`« ${json.service.name} » mis en pause.`, {
          description: "Il n'apparaît plus comme service actif du hub.",
        })
      } else if (status === "CLOSED") {
        toast.warning(`« ${json.service.name} » clôturé — action définitive.`, {
          description: "Le service reste visible dans l'historique mais ne peut plus être modifié.",
        })
      } else {
        toast.success(`« ${json.service.name} » réactivé.`)
      }
      return true
    } catch {
      toast.error("Action impossible — vérifiez votre connexion.")
      return false
    } finally {
      setBusyId(null)
    }
  }

  /* ---------- Rendus ---------- */

  if (error !== null) {
    return <ErrorState message={error} retry={() => setReloadKey(k => k + 1)} />
  }
  if (hubs === null) {
    return <TabSkeleton title="Chargement des services TMP…" />
  }

  const th = (key: SortKey, label: string, className = "") => (
    <TableHead
      className={`h-10 text-[11px] uppercase tracking-wide ${className}`}
      aria-sort={sortKey === key ? (sortDir === 1 ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
        onClick={() => toggleSort(key)}
      >
        {label}
        {sortKey === key ? (
          sortDir === 1 ? <ChevronUp className="h-3 w-3" aria-hidden /> : <ChevronDown className="h-3 w-3" aria-hidden />
        ) : (
          <ChevronDown className="h-3 w-3 opacity-30" aria-hidden />
        )}
      </button>
    </TableHead>
  )

  /** Mini jauge de remplissage mensuel : réservations / (capacité × 30 j). */
  const gauge = (s: HubServiceDTO) => {
    if (s.capacityPerDay == null || s.capacityPerDay <= 0) return null
    const fill = Math.min(1, s.bookingsThisMonth / (s.capacityPerDay * 30))
    const cls =
      fill <= 0.6 ? "bg-emerald-500" : fill <= 0.85 ? "bg-amber-500" : "bg-[var(--c-terra)]"
    return (
      <span className="flex items-center gap-1.5" title="Remplissage mensuel estimé (réservations / capacité × 30 j)">
        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className={`block h-full rounded-full ${cls}`} style={{ width: `${Math.round(fill * 100)}%` }} />
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground">{Math.round(fill * 100)} %</span>
      </span>
    )
  }

  const renderRow = (s: HubServiceDTO, showCategory: boolean) => {
    const busy = busyId === s.id
    return (
      <TableRow key={s.id} className={s.status === "CLOSED" ? "opacity-60" : undefined}>
        {showCategory && (
          <TableCell className="py-2.5 pl-3">
            <ServiceCategoryBadge category={s.category} />
          </TableCell>
        )}
        <TableCell className="max-w-[220px] truncate py-2.5 text-[13px] font-medium" title={s.name}>
          {s.name}
        </TableCell>
        <TableCell className="py-2.5 text-right text-[13px] tabular-nums">{priceFr(s.price)}</TableCell>
        <TableCell className="py-2.5">
          <ServiceStatusBadge status={s.status} />
        </TableCell>
        <TableCell className="py-2.5 text-right text-[13px] tabular-nums">
          {s.capacityPerDay != null ? num(s.capacityPerDay) : "—"}
        </TableCell>
        <TableCell className="py-2.5">
          <span className="flex items-center justify-end gap-2">
            <span className="tabular-nums text-[13px]">{num(s.bookingsThisMonth)}</span>
            {gauge(s)}
          </span>
        </TableCell>
        <TableCell className="py-1.5 pr-2">
          {s.status === "CLOSED" ? (
            <span className="flex h-11 items-center justify-center text-[11px] text-muted-foreground">
              clôturé
            </span>
          ) : (
            <span className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                title="Modifier le service"
                aria-label={`Modifier ${s.name}`}
                disabled={busy}
                onClick={() => setFormState({ service: s, seq: Date.now() })}
              >
                <Pencil className="h-4 w-4" aria-hidden />
              </Button>
              {s.status === "ACTIVE" ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 text-amber-600 hover:text-amber-700 dark:text-amber-400"
                  title="Mettre en pause"
                  aria-label={`Mettre ${s.name} en pause`}
                  disabled={busy}
                  onClick={() => patchStatus(s, "PAUSED")}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                  title="Reprendre le service"
                  aria-label={`Reprendre ${s.name}`}
                  disabled={busy}
                  onClick={() => patchStatus(s, "ACTIVE")}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 text-[var(--c-terra)] hover:text-[var(--c-terra-ink)]"
                title="Clôturer définitivement"
                aria-label={`Clôturer ${s.name}`}
                disabled={busy}
                onClick={() => setCloseTarget(s)}
              >
                <CircleSlash className="h-4 w-4" aria-hidden />
              </Button>
            </span>
          )}
        </TableCell>
      </TableRow>
    )
  }

  return (
    <div className="min-w-0 space-y-4">
      {/* ---- Sélecteur de hub : cartes défilantes (présélection nav.hubsSel) ---- */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Wrench className="h-3.5 w-3.5" aria-hidden /> Terminal Multi-Services
        </p>
        <div
          className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
          role="list"
          aria-label="Sélecteur de hub"
        >
          {hubs.map(h => {
            const meta = HUB_STATUS_META[h.status]
            const isSel = h.id === hubId
            return (
              <button
                key={h.id}
                role="listitem"
                onClick={() => setHubId(h.id)}
                aria-current={isSel ? "true" : undefined}
                className={`min-w-[210px] shrink-0 rounded-lg border p-3 text-left transition-colors ${
                  isSel
                    ? "border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500/40 dark:bg-emerald-950/40"
                    : "hover:bg-accent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px] tracking-tight">{h.code}</Badge>
                  {meta && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <span className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} aria-hidden />
                      {meta.label}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 truncate text-sm font-medium">{h.name}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {num(h.activeServicesCount)} service{h.activeServicesCount > 1 ? "s" : ""} actif{h.activeServicesCount > 1 ? "s" : ""}
                  {" · "}
                  {num(h.bookingsThisMonth)} réserv./mois
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* ---- KPI du hub ---- */}
      {hub && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> Services actifs
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {services === null ? "…" : num(kpis.actifs)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Pause className="h-3.5 w-3.5 text-amber-600" aria-hidden /> En pause
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {services === null ? "…" : num(kpis.pauses)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <CircleSlash className="h-3.5 w-3.5 text-zinc-400" aria-hidden /> Clôturés
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {services === null ? "…" : num(kpis.clotures)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <CalendarCheck className="h-3.5 w-3.5 text-amber-600" aria-hidden /> Réserv. du mois
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {services === null ? "…" : num(kpis.bookings)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">tous services du hub</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ---- Table des services (tri par colonne) / vue groupée ---- */}
      <Card className="min-w-0">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Activity className="h-4 w-4 text-[var(--c-amber)]" aria-hidden />
              {services === null ? "Chargement…" : `${num(sorted.length)} service${sorted.length > 1 ? "s" : ""}`}
              {hub && <span className="text-muted-foreground">· {hub.code}</span>}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 text-sm">
                <Switch
                  id="group-by-category"
                  checked={groupBy}
                  onCheckedChange={setGroupBy}
                  aria-label="Grouper par catégorie"
                />
                <Label htmlFor="group-by-category" className="flex items-center gap-1.5 text-[13px] font-normal text-muted-foreground">
                  <Layers className="h-3.5 w-3.5" aria-hidden /> Grouper par catégorie
                </Label>
              </span>
              <Button
                className="h-11 gap-2"
                onClick={() => hub && setFormState({ service: null, seq: Date.now() })}
                disabled={!hub}
              >
                <Plus className="h-4 w-4" aria-hidden /> Nouveau service
              </Button>
            </div>
          </div>

          {services === null ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-2/3 rounded-md" />
            </div>
          ) : services.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Aucun service enregistré sur {hub?.name ?? "ce hub"}.
              </p>
              <Button
                className="mt-3 h-11 gap-2"
                onClick={() => hub && setFormState({ service: null, seq: Date.now() })}
              >
                <Plus className="h-4 w-4" aria-hidden /> Créer le premier service
              </Button>
            </div>
          ) : groupBy ? (
            /* Vue groupée par catégorie (sections repliées simples) */
            <div className="space-y-3">
              {groups.map(g => (
                <div key={g.category} className="rounded-lg border">
                  <p className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
                    <ServiceCategoryBadge category={g.category} />
                    <span className="text-[11px] text-muted-foreground">
                      {num(g.rows.length)} service{g.rows.length > 1 ? "s" : ""}
                    </span>
                  </p>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {th("name", "Nom")}
                          {th("status", "Statut")}
                          {th("capacity", "Capacité/j", "text-right")}
                          {th("bookings", "Réserv. mois", "text-right")}
                          <TableHead className="h-10 text-right text-[11px] uppercase tracking-wide">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>{g.rows.map(s => renderRow(s, false))}</TableBody>
                    </Table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Table plate triable par colonne */
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {th("category", "Catégorie", "pl-3")}
                    {th("name", "Nom")}
                    <TableHead className="h-10 text-right text-[11px] uppercase tracking-wide">Tarif</TableHead>
                    {th("status", "Statut")}
                    {th("capacity", "Capacité/j", "text-right")}
                    {th("bookings", "Réserv. mois", "text-right")}
                    <TableHead className="h-10 text-right text-[11px] uppercase tracking-wide">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>{sorted.map(s => renderRow(s, true))}</TableBody>
              </Table>
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Transitions libres Actif ↔ En pause ; la clôture est définitive (le
            service clôturé ne se modifie plus — en recréer un pour le remplacer).
          </p>
        </CardContent>
      </Card>

      {/* ---- Dialog création / édition (remonté par clé) ---- */}
      {formState && hub && (
        <ServiceFormDialog
          key={`service-form-${formState.seq}`}
          hub={hub}
          initial={formState.service}
          onClose={() => setFormState(null)}
          onSaved={(service, created) => {
            if (created) addService(service)
            else applyService(service)
            setFormState(null)
            toast.success(
              created
                ? `Service « ${service.name} » créé sur ${hub.code}.`
                : `Service « ${service.name} » mis à jour.`,
            )
          }}
        />
      )}

      {/* ---- Clôture définitive : confirmation AlertDialog ---- */}
      <AlertDialog open={closeTarget != null} onOpenChange={o => { if (!o) setCloseTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clôturer « {closeTarget?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Action DÉFINITIVE : le service ne pourra plus être modifié, repris
              ni supprimé — il restera visible dans l&apos;historique du hub
              {" "}{hub?.code}. Pour le remplacer, créez un nouveau service.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[var(--c-terra)] text-white hover:bg-[var(--c-terra-ink)]"
              onClick={() => {
                const target = closeTarget
                setCloseTarget(null)
                if (target) void patchStatus(target, "CLOSED")
              }}
            >
              Clôturer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
