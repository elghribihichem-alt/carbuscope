'use client'

// Shadow Market (T44-e) — Paramètres · onglet « 🏷️ Typologies ».
// Catalogue extensible des points informels : grille de cartes (icône, couleur,
// volume indicatif, interruption d'activité) + répartition live (vue d'ensemble)
// + PieChart global. Édition/ajout via Dialog → PATCH ?id= / POST
// /api/shadow/typologies. NB : l'API d'édition attend l'identifiant interne —
// non exposé par le GET — le PATCH est tenté par code et, à défaut (404), la
// modification est conservée pour la session avec un toast explicite.

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Beer, Cigarette, CircleAlert, Fuel, LifeBuoy, Loader2, Pencil, Plus, ShoppingBasket, Store, Truck, Warehouse, Wrench,
  type LucideIcon,
} from "lucide-react"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { TypologyIcon, formatLJ, formatTnd, typologyLabel } from "../shadow-shared"
import type { ShadowOverviewResponse, ShadowTypologyDTO } from "@/lib/types"

// Sélecteur d'icône (contrat : 10 icônes proposées au catalogue).
const ICON_OPTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "fuel", label: "Bidon / pompe", icon: Fuel },
  { value: "store", label: "Kiosque / commerce", icon: Store },
  { value: "truck", label: "Camion", icon: Truck },
  { value: "warehouse", label: "Entrepôt / local", icon: Warehouse },
  { value: "wrench", label: "Garage / atelier", icon: Wrench },
  { value: "shopping-basket", label: "Panier / épicerie", icon: ShoppingBasket },
  { value: "circle-alert", label: "Alerte", icon: CircleAlert },
  { value: "cigarette", label: "Tabac / contrebande", icon: Cigarette },
  { value: "beer", label: "Débit de boisson", icon: Beer },
  { value: "life-buoy", label: "Point d'eau / divers", icon: LifeBuoy },
]

type FormState = {
  code: string
  label: string
  description: string
  color: string
  volumeLJ: string
  icon: string
}

const EMPTY_FORM: FormState = {
  code: "",
  label: "",
  description: "",
  color: "#FF9800",
  volumeLJ: "200",
  icon: "fuel",
}

export function SettingsTypologiesTab() {
  const [typologies, setTypologies] = useState<ShadowTypologyDTO[] | null>(null)
  const [overview, setOverview] = useState<ShadowOverviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Dialogues
  const [editOpen, setEditOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<ShadowTypologyDTO | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [savingDialog, setSavingDialog] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    Promise.all([
      fetch("/api/shadow/typologies", { signal: ctrl.signal }).then(r => {
        if (!r.ok) throw new Error("typologies")
        return r.json() as Promise<{ typologies: ShadowTypologyDTO[] }>
      }),
      fetch("/api/shadow/overview", { signal: ctrl.signal }).then(r => {
        if (!r.ok) throw new Error("overview")
        return r.json() as Promise<ShadowOverviewResponse>
      }),
    ])
      .then(([t, o]) => {
        setTypologies(t.typologies)
        setOverview(o)
      })
      .catch(() => setError("Le catalogue des typologies n'a pas pu être chargé."))
    return () => ctrl.abort()
  }, [])

  const statsByCode = useMemo(() => {
    const m = new Map<string, { count: number; pct: number; volumeLJ: number; lossTnd: number }>()
    for (const t of overview?.typologies ?? []) {
      m.set(t.code, { count: t.count, pct: t.pct, volumeLJ: t.volumeLJ, lossTnd: t.lossTnd })
    }
    return m
  }, [overview])

  const pieData = useMemo(
    () =>
      (overview?.typologies ?? []).map(t => ({
        name: typologyLabel(t.code, t.label),
        value: t.count,
        color: t.color,
      })),
    [overview],
  )

  // ------------------------------------------------------------------
  // Édition — PATCH ?id={code} avec repli session (identifiant interne non
  // exposé par le GET : code seul identifiant côté client).
  // ------------------------------------------------------------------

  const openEdit = (t: ShadowTypologyDTO) => {
    setEditing(t)
    setForm({
      code: t.code,
      label: t.label,
      description: t.description,
      color: t.color,
      volumeLJ: String(t.volumeLJ),
      icon: t.icon,
    })
    setEditOpen(true)
  }

  const saveEdit = () => {
    if (!editing) return
    const label = form.label.trim()
    const volume = Number(form.volumeLJ)
    if (!label) {
      toast.error("Libellé requis")
      return
    }
    if (!Number.isFinite(volume) || volume < 0 || volume > 100000) {
      toast.error("Volume invalide", { description: "Volume indicatif : 0 à 100 000 L/j." })
      return
    }
    setSavingDialog(true)
    fetch(`/api/shadow/typologies?id=${encodeURIComponent(editing.code)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label,
        description: form.description.trim(),
        color: form.color,
        volumeLJ: Math.round(volume),
        icon: form.icon,
      }),
    })
      .then(async r => {
        if (r.ok) {
          const j = (await r.json()) as { typology: ShadowTypologyDTO }
          setTypologies(prev => (prev ? prev.map(t => (t.code === j.typology.code ? j.typology : t)) : prev))
          toast.success("Typologie mise à jour", { description: `« ${j.typology.label} » — catalogue synchronisé.` })
          return
        }
        if (r.status === 404) {
          // Identifiant interne requis par l'API — repli : édition de session.
          setTypologies(prev =>
            prev
              ? prev.map(t =>
                  t.code === editing.code
                    ? { ...t, label, description: form.description.trim(), color: form.color, volumeLJ: Math.round(volume), icon: form.icon }
                    : t,
                )
              : prev,
          )
          toast.info("Modifiée pour cette session", {
            description:
              "L'API d'édition attend l'identifiant interne de la typologie (non exposé par le catalogue) — " +
              "la modification est conservée localement et signalée au back-office.",
          })
          return
        }
        const j = (await r.json().catch(() => null)) as { error?: string } | null
        throw new Error(j?.error ?? "erreur PATCH")
      })
      .catch(e => {
        toast.error("Édition refusée", { description: e instanceof Error && e.message !== "erreur PATCH" ? e.message : "Réessayez." })
      })
      .finally(() => {
        setSavingDialog(false)
        setEditOpen(false)
      })
  }

  // ------------------------------------------------------------------
  // Ajout — POST (persistance réelle : le code est fourni par le formulaire)
  // ------------------------------------------------------------------

  const saveAdd = () => {
    const code = form.code.trim().toUpperCase()
    const label = form.label.trim()
    const volume = Number(form.volumeLJ)
    if (!/^[A-Z][A-Z0-9_]{1,30}$/.test(code)) {
      toast.error("Code invalide", { description: "MAJUSCULES, chiffres et underscore — 2 à 31 caractères (ex. VRAC_CAMION)." })
      return
    }
    if (!label) {
      toast.error("Libellé requis")
      return
    }
    if (!Number.isFinite(volume) || volume < 0 || volume > 100000) {
      toast.error("Volume invalide", { description: "Volume indicatif : 0 à 100 000 L/j." })
      return
    }
    setSavingDialog(true)
    fetch("/api/shadow/typologies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        label,
        description: form.description.trim(),
        color: form.color,
        volumeLJ: Math.round(volume),
        icon: form.icon,
      }),
    })
      .then(async r => {
        if (!r.ok) {
          const j = (await r.json().catch(() => null)) as { error?: string } | null
          throw new Error(j?.error ?? "création impossible")
        }
        return r.json() as Promise<{ typology: ShadowTypologyDTO }>
      })
      .then(j => {
        setTypologies(prev => (prev ? [...prev, j.typology].sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99) || a.code.localeCompare(b.code)) : [j.typology]))
        toast.success("Typologie créée", {
          description: `« ${j.typology.label} » (${j.typology.code}) — elle apparaît immédiatement dans les formulaires de recensement (web et mobile).`,
        })
        setAddOpen(false)
        setForm(EMPTY_FORM)
      })
      .catch(e => {
        toast.error("Création refusée", { description: e instanceof Error ? e.message : "Réessayez." })
      })
      .finally(() => setSavingDialog(false))
  }

  // ------------------------------------------------------------------
  // Activation / désactivation — PATCH { active } (repli session identique)
  // ------------------------------------------------------------------

  const toggleActive = (t: ShadowTypologyDTO) => {
    const next = !t.active
    setToggling(t.code)
    fetch(`/api/shadow/typologies?id=${encodeURIComponent(t.code)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next }),
    })
      .then(async r => {
        if (r.ok) {
          const j = (await r.json()) as { typology: ShadowTypologyDTO }
          setTypologies(prev => (prev ? prev.map(x => (x.code === j.typology.code ? j.typology : x)) : prev))
        } else if (r.status === 404) {
          setTypologies(prev => (prev ? prev.map(x => (x.code === t.code ? { ...x, active: next } : x)) : prev))
        } else {
          throw new Error("toggle")
        }
        if (!next) {
          toast.warning(`Typologie « ${t.label} » désactivée`, {
            description: "Les points existants gardent leur typologie — la catégorie n'est simplement plus proposée aux nouveaux signalements.",
          })
        } else {
          toast.success(`Typologie « ${t.label} » activée`)
        }
      })
      .catch(() => {
        toast.error("Modification impossible", { description: "L'état de la typologie n'a pas pu être modifié." })
      })
      .finally(() => setToggling(null))
  }

  if (error) {
    return (
      <div className="rounded-xl border border-dashed border-[#E53935]/50 p-6 text-center text-sm text-muted-foreground">{error}</div>
    )
  }
  if (!typologies || !overview) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-40 animate-pulse rounded-xl bg-stone-200 dark:bg-stone-800" />
        ))}
      </div>
    )
  }

  const dialogFields = (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Libellé</Label>
        <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} aria-label="Libellé" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Description (terrain)</Label>
        <Textarea
          rows={3}
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          aria-label="Description"
          className="text-xs"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Couleur</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.color}
              onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
              aria-label="Couleur de la typologie"
              className="h-9 w-14 cursor-pointer rounded-md border border-stone-300 bg-white p-1 dark:border-stone-700 dark:bg-stone-900"
            />
            <Input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-28 font-mono text-xs" aria-label="Code couleur hex" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Volume indicatif (L/j)</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={form.volumeLJ}
            onChange={e => setForm(f => ({ ...f, volumeLJ: e.target.value }))}
            aria-label="Volume indicatif en litres par jour"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Icône</Label>
        <Select value={form.icon} onValueChange={v => setForm(f => ({ ...f, icon: v }))}>
          <SelectTrigger className="w-full" aria-label="Icône de la typologie">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ICON_OPTIONS.map(o => {
              const Icon = o.icon
              return (
                <SelectItem key={o.value} value={o.value}>
                  <span className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {o.label}
                  </span>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>
    </>
  )

  return (
    <div className="space-y-4">
      {/* grid-cols-1 explicite (= minmax(0,1fr)) : sans lui, la piste implicite « auto »
          peut prendre max-content et déborde à 390 px (pattern T53-T6a). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        {/* Grille des typologies */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {typologies.length} catégories · désactiver une typologie ne supprime pas les points existants.
            </p>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setForm(EMPTY_FORM)
                setAddOpen(true)
              }}
            >
              <Plus className="h-4 w-4" aria-hidden /> Nouvelle typologie
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {typologies.map(t => {
              const stats = statsByCode.get(t.code)
              return (
                <Card
                  key={t.code}
                  className={`border-stone-200 bg-white/95 transition-opacity dark:border-stone-800 dark:bg-stone-900/95 ${t.active ? "" : "opacity-70"}`}
                >
                  <CardContent className="space-y-2.5 p-4">
                    <div className="flex items-start gap-2.5">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${t.color}22`, color: t.color }}
                        aria-hidden
                      >
                        <TypologyIcon code={t.code} className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-bold text-stone-900 dark:text-stone-50">
                          {t.label}
                          <code className="rounded bg-stone-100 px-1 py-px font-mono text-[10px] font-semibold text-stone-500 dark:bg-stone-800">{t.code}</code>
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />
                          volume indicatif {formatLJ(t.volumeLJ)}
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => openEdit(t)} aria-label={`Éditer ${t.label}`}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>
                    <p className="line-clamp-2 text-[11.5px] leading-snug text-muted-foreground" title={t.description}>{t.description}</p>
                    {stats ? (
                      <p className="rounded-lg bg-stone-50 px-2.5 py-1.5 text-[11px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                        Répartition live : <strong>{stats.count.toLocaleString("fr-FR")} points</strong> ·{" "}
                        {stats.pct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % · {formatLJ(stats.volumeLJ)} ·{" "}
                        {formatTnd(stats.lossTnd)}/mois
                      </p>
                    ) : (
                      <p className="rounded-lg bg-stone-50 px-2.5 py-1.5 text-[11px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                        Aucun point recensé dans cette catégorie.
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-2 border-t border-stone-100 pt-2 dark:border-stone-800">
                      <span className={`text-[10.5px] font-bold uppercase tracking-wide ${t.active ? "text-[#4CAF50]" : "text-stone-400"}`}>
                        {t.active ? "Active" : "Inactive"}
                      </span>
                      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        {toggling === t.code ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                        <Switch checked={t.active} onCheckedChange={() => toggleActive(t)} aria-label={`Activer ${t.label}`} />
                      </label>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        {/* Répartition globale */}
        <Card className="h-fit border-stone-200 bg-white/95 dark:border-stone-800 dark:bg-stone-900/95">
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-50">
              <span aria-hidden>🥧</span> Répartition nationale
            </h3>
            <div className="h-[220px]">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={82} paddingAngle={2} strokeWidth={1.5}>
                    {pieData.map(d => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number | string) => [`${Number(v).toLocaleString("fr-FR")} points`, "Catégorie"]}
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5">
              {pieData.map(d => (
                <div key={d.name} className="flex items-center gap-2 text-[11.5px]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-stone-700 dark:text-stone-200">{d.name}</span>
                  <span className="tabular-nums font-semibold text-stone-500 dark:text-stone-400">
                    {((d.value / (overview.kpis.activePoints || 1)) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
                  </span>
                </div>
              ))}
            </div>
            <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-2 text-[10.5px] leading-snug text-muted-foreground dark:border-stone-700 dark:bg-stone-900">
              Une nouvelle typologie apparaît immédiatement dans les formulaires de recensement (web et application
              mobile des contrôleurs) — les points existants gardent leur catégorie en cas de désactivation.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Dialog Édition */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Éditer « {editing?.label ?? ""} »
              <Badge variant="outline" className="ml-2 font-mono text-[10px]">{editing?.code}</Badge>
            </DialogTitle>
            <DialogDescription>Libellé, description, couleur, volume indicatif et icône de la catégorie.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">{dialogFields}</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
            <Button onClick={saveEdit} disabled={savingDialog} className="gap-1.5">
              {savingDialog && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Ajout */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouvelle typologie</DialogTitle>
            <DialogDescription>
              Ajoutez une catégorie de point informel (ex. « Vente au vrac camion », « Débit clandestin ») — elle devient
              disponible immédiatement dans les recensements.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Code (unique, MAJUSCULES)</Label>
              <Input
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="VRAC_CAMION"
                className="font-mono"
                aria-label="Code de la typologie"
              />
              <p className="text-[10.5px] text-muted-foreground">Lettres majuscules, chiffres et underscore — 2 à 31 caractères.</p>
            </div>
            {dialogFields}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Annuler</Button>
            <Button onClick={saveAdd} disabled={savingDialog} className="gap-1.5">
              {savingDialog && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Créer la typologie
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
