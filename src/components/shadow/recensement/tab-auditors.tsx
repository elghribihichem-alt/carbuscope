'use client'

// Shadow Market — Recensement, onglet « 👥 Équipe d'Audit » (T44-d).
// Cartes par auditeur (zone, enseigne, productivité vs moyenne), ajout et
// édition en Dialog, Switch actif/inactif, BarChart de productivité.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Building2, Pencil, Phone, Plus, UserRound } from "lucide-react"
import { toast } from "sonner"
import type { ShadowAuditorDTO } from "@/lib/types"
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ErrorState, TabSkeleton } from "@/components/shell/loading"
import { num, tooltipStyle } from "@/lib/chart"
import { SHADOW_COLORS, ShadowKpiCard } from "../shadow-shared"

type BrandDTO = { slug: string; name: string; color: string; isIndependents: boolean }

const GOVS = [
  "Ariana", "Béja", "Ben Arous", "Bizerte", "Gabès", "Gafsa", "Jendouba", "Kairouan",
  "Kasserine", "Kébili", "Le Kef", "Mahdia", "Manouba", "Médenine", "Monastir", "Nabeul",
  "Sfax", "Sidi Bouzid", "Siliana", "Sousse", "Tataouine", "Tozeur", "Tunis", "Zaghouan",
]

export function TabAuditors() {
  const [auditors, setAuditors] = useState<ShadowAuditorDTO[] | null>(null)
  const [brands, setBrands] = useState<BrandDTO[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ShadowAuditorDTO | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/shadow/auditors", { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
        return res.json() as Promise<{ auditors: ShadowAuditorDTO[] }>
      })
      .then((json) => {
        setAuditors(json.auditors ?? [])
        setError(null)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
  }, [reloadKey])

  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/brands", { signal: ctrl.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ brands: BrandDTO[] }>) : Promise.reject(new Error(`Erreur ${res.status}`))))
      .then((json) => setBrands(json.brands ?? []))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
      })
    return () => ctrl.abort()
  }, [])

  const brandColor = useCallback(
    (slug: string) => {
      if (!slug) return SHADOW_COLORS.gray
      return brands.find((b) => b.slug === slug)?.color ?? SHADOW_COLORS.gray
    },
    [brands],
  )

  const avgPoints = useMemo(() => {
    if (auditors === null || auditors.length === 0) return 0
    return auditors.reduce((s, a) => s + a.pointsDone, 0) / auditors.length
  }, [auditors])

  const chartRows = useMemo(() => {
    if (auditors === null) return []
    return [...auditors]
      .sort((a, b) => b.pointsDone - a.pointsDone)
      .map((a) => ({ name: a.name.length > 24 ? `${a.name.slice(0, 22)}…` : a.name, points: a.pointsDone, above: a.pointsDone >= avgPoints }))
  }, [auditors, avgPoints])

  const stats = useMemo(() => {
    if (auditors === null) return null
    return {
      total: auditors.length,
      actifs: auditors.filter((a) => a.active).length,
      cumules: auditors.reduce((s, a) => s + a.pointsDone, 0),
      zones: new Set(auditors.map((a) => a.zone)).size,
    }
  }, [auditors])

  // ---- Mutations ----
  const patchAuditor = useCallback(async (a: ShadowAuditorDTO, body: Record<string, unknown>, label: string) => {
    try {
      const res = await fetch(`/api/shadow/auditors?id=${encodeURIComponent(a.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { auditor?: ShadowAuditorDTO; error?: string }
      if (!res.ok || !json.auditor) throw new Error(json.error ?? `Erreur ${res.status}`)
      setAuditors((prev) => (prev ? prev.map((x) => (x.id === a.id ? json.auditor! : x)) : prev))
      toast.success(label, { description: `${a.name} mis à jour.` })
    } catch (e) {
      toast.error("Mise à jour impossible", { description: e instanceof Error ? e.message : "Erreur inconnue" })
    }
  }, [])

  const toggleActive = useCallback((a: ShadowAuditorDTO, active: boolean) => {
    void patchAuditor(a, { active }, active ? "Auditeur activé" : "Auditeur désactivé")
  }, [patchAuditor])

  const openCreate = useCallback(() => {
    setEditing(null)
    setFormOpen(true)
  }, [])

  const openEdit = useCallback((a: ShadowAuditorDTO) => {
    setEditing(a)
    setFormOpen(true)
  }, [])

  const onSaved = useCallback((a: ShadowAuditorDTO, created: boolean) => {
    setAuditors((prev) => {
      if (prev === null) return [a]
      return created ? [a, ...prev] : prev.map((x) => (x.id === a.id ? a : x))
    })
    setFormOpen(false)
  }, [])

  if (error !== null) {
    return <ErrorState message={error} retry={() => setReloadKey((k) => k + 1)} />
  }
  if (auditors === null || stats === null) {
    return <TabSkeleton title="Chargement de l'équipe d'audit…" />
  }

  return (
    <div className="space-y-4">
      {/* Statistiques */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ShadowKpiCard value={num(stats.total)} label="Auditeurs" sub="équipe de recensement" tone="neutral" icon={UserRound} />
        <ShadowKpiCard value={num(stats.actifs)} label="Auditeurs actifs" sub="en mission actuellement" tone="green" />
        <ShadowKpiCard value={num(stats.cumules)} label="Points recensés" sub="cumul de l'équipe" tone="orange" />
        <ShadowKpiCard value={num(stats.zones)} label="Zones couvertes" sub="gouvernorats + national" tone="yellow" />
      </div>

      {/* grid-cols-1 explicite (= minmax(0,1fr)) : sans lui, la piste implicite « auto »
          peut prendre max-content et déborde à 390 px (pattern T53-T6a). */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* Cartes auditeurs */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Équipe terrain</p>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Ajouter un auditeur
            </Button>
          </div>
          <div className="grid max-h-[640px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {auditors.map((a) => {
              const gapPct = avgPoints > 0 ? ((a.pointsDone - avgPoints) / avgPoints) * 100 : 0
              const brand = a.brandSlug ? brands.find((b) => b.slug === a.brandSlug) : undefined
              return (
                <Card key={a.id} className={a.active ? "" : "opacity-70"}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{a.name}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: brand ? brand.color : SHADOW_COLORS.gray }} aria-label={brand ? brand.name : "Plateforme"} />
                          {a.zone}
                          {brand ? ` · ${brand.name}` : " · Plateforme"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={a.active}
                          onCheckedChange={(c) => toggleActive(a, c)}
                          aria-label={`${a.active ? "Désactiver" : "Activer"} ${a.name}`}
                        />
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(a)} aria-label={`Modifier ${a.name}`}>
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </div>
                    </div>

                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" aria-hidden />
                      <span className="tabular-nums">{a.phone || "—"}</span>
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-md bg-stone-50 p-2 text-center dark:bg-stone-900">
                        <p className="text-lg font-bold tabular-nums leading-none">{num(a.pointsDone)}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">points recensés</p>
                      </div>
                      <div className="rounded-md bg-stone-50 p-2 text-center dark:bg-stone-900">
                        <p className="text-lg font-bold tabular-nums leading-none">{num(a.rechecks)}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">recontrôles</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-muted-foreground">Productivité vs moyenne ({num(Math.round(avgPoints))} pts)</p>
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
                        style={{
                          backgroundColor: gapPct >= 0 ? "#4CAF5022" : "#FF980022",
                          color: gapPct >= 0 ? SHADOW_COLORS.green : SHADOW_COLORS.orange,
                        }}
                      >
                        {gapPct >= 0 ? "+" : ""}
                        {gapPct.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} %
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        {/* BarChart productivité */}
        <Card className="lg:sticky lg:top-32">
          <CardHeader>
            <CardTitle className="text-sm">Productivité par auditeur</CardTitle>
            <p className="text-xs text-muted-foreground">
              Points recensés (décroissant) — la ligne pointillée marque la moyenne de l&apos;équipe.
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-[460px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    tickFormatter={(v: number) => num(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={150}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    content={({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) => {
                      if (!active || !payload?.length) return null
                      const row = payload[0]?.payload as { name: string; points: number; above: boolean } | undefined
                      if (!row) return null
                      return (
                        <div className="px-3 py-2 text-xs" style={tooltipStyle()}>
                          <p className="font-medium text-popover-foreground">{row.name}</p>
                          <p className="tabular-nums">{num(row.points)} points recensés</p>
                          <p className="text-muted-foreground">{row.above ? "au-dessus" : "en-dessous"} de la moyenne</p>
                        </div>
                      )
                    }}
                  />
                  <ReferenceLine x={avgPoints} stroke={SHADOW_COLORS.gray} strokeDasharray="4 4" />
                  <Bar dataKey="points" name="Points" barSize={12} radius={[0, 3, 3, 0]}>
                    {chartRows.map((r) => (
                      <Cell key={r.name} fill={r.above ? SHADOW_COLORS.green : SHADOW_COLORS.orange} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog ajout / édition */}
      <AuditorFormDialog
        open={formOpen}
        editing={editing}
        brands={brands}
        onClose={() => setFormOpen(false)}
        onSaved={onSaved}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Formulaire d'auditeur (création / édition)
// ---------------------------------------------------------------------------

function AuditorFormDialog({
  open, editing, brands, onClose, onSaved,
}: {
  open: boolean
  editing: ShadowAuditorDTO | null
  brands: BrandDTO[]
  onClose: () => void
  onSaved: (a: ShadowAuditorDTO, created: boolean) => void
}) {
  const [name, setName] = useState("")
  const [zone, setZone] = useState("National")
  const [brandSlug, setBrandSlug] = useState("")
  const [phone, setPhone] = useState("")
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(editing?.name ?? "")
    setZone(editing?.zone ?? "National")
    setBrandSlug(editing?.brandSlug ?? "")
    setPhone(editing?.phone ?? "")
    setActive(editing?.active ?? true)
  }, [open, editing])

  const submit = async () => {
    if (name.trim() === "") {
      toast.error("Nom requis", { description: "Saisissez le nom de l'auditeur ou de l'équipe." })
      return
    }
    setSaving(true)
    try {
      const body = { name: name.trim(), zone, brandSlug, phone: phone.trim(), active }
      const res = editing
        ? await fetch(`/api/shadow/auditors?id=${encodeURIComponent(editing.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/shadow/auditors", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
      const json = (await res.json()) as { auditor?: ShadowAuditorDTO; error?: string }
      if (!res.ok || !json.auditor) throw new Error(json.error ?? `Erreur ${res.status}`)
      onSaved(json.auditor, editing === null)
      toast.success(editing ? "Auditeur mis à jour" : "Auditeur ajouté", {
        description: `${json.auditor.name} — zone ${json.auditor.zone}.`,
      })
    } catch (e) {
      toast.error("Enregistrement impossible", { description: e instanceof Error ? e.message : "Erreur inconnue" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" aria-hidden />
            {editing ? `Modifier ${editing.name}` : "Ajouter un auditeur"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="aud-name" className="text-xs">Nom / équipe</Label>
            <Input id="aud-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Walid Gharbi" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Zone</Label>
              <Select value={zone} onValueChange={setZone}>
                <SelectTrigger className="w-full" aria-label="Zone de l'auditeur">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="National">National</SelectItem>
                  {GOVS.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Enseigne</Label>
              <Select value={brandSlug || "plateforme"} onValueChange={(v) => setBrandSlug(v === "plateforme" ? "" : v)}>
                <SelectTrigger className="w-full" aria-label="Enseigne de rattachement">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="plateforme">Plateforme</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.slug} value={b.slug}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="aud-phone" className="text-xs">Téléphone</Label>
            <Input id="aud-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+216 …" className="tabular-nums" />
          </div>
          {editing ? (
            <div className="flex items-center justify-between rounded-md border border-stone-200 p-3 dark:border-stone-800">
              <div>
                <p className="text-xs font-medium">Auditeur actif</p>
                <p className="text-[11px] text-muted-foreground">Désactivez s&apos;il a quitté l&apos;équipe.</p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} aria-label="Auditeur actif" />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
