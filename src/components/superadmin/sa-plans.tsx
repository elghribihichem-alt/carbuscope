'use client'

// Super Administration — Plans & tarifs (T32) : catalogue des offres SaaS
// (Essentiel / Pro / Enterprise) avec stats dérivées des contrats (nb actifs,
// MRR par plan) et édition journalisée en audit SYSTEME. 100 % additif :
// le 6e onglet de la Super Administration, les 5 existants sont inchangés.

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Check, Loader2, Pencil, RefreshCw, Save, Sparkles } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAppStore } from "@/store/app-store"
import { DEMO_ACCOUNTS_MAP } from "@/lib/demo-accounts"
import { fmtDT, type SaasPlanDTO } from "@/lib/saas"

// Couleurs de cartes par plan (mêmes teintes que les badges de l'espace :
// graphite pour l'offre de base, émeraude pour l'offre phare, teal racine).
const PLAN_CARD_META: Record<string, { name: string; price: string; chip: string }> = {
  ESSENTIEL: {
    name: "text-zinc-700 dark:text-zinc-300",
    price: "text-zinc-900 dark:text-zinc-100",
    chip: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  },
  PRO: {
    name: "text-emerald-700 dark:text-emerald-400",
    price: "text-emerald-700 dark:text-emerald-400",
    chip: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  },
  ENTERPRISE: {
    name: "text-teal-700 dark:text-teal-400",
    price: "text-teal-700 dark:text-teal-400",
    chip: "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-400",
  },
}

// ---------- Dialog d'édition (patron du dialog d'édition de contrat T30) ----------

/** Décimal français accepté : « 1490 » ou « 1490,5 ». null si vide/invalide. */
function parseDecimal(raw: string): number | null {
  const t = raw.trim().replace(",", ".")
  if (t === "") return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

function PlanEditForm({
  plan, actor, onClose, onSaved,
}: {
  plan: SaasPlanDTO
  actor: string
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [fee, setFee] = useState(String(plan.monthlyFee))
  const [seats, setSeats] = useState(String(plan.seatsIncluded))
  const [quota, setQuota] = useState(String(plan.stationQuota))
  const [features, setFeatures] = useState(plan.features.join("\n"))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving) return
    setError(null)

    const feeNum = parseDecimal(fee)
    if (feeNum === null || !Number.isInteger(feeNum) || feeNum < 1 || feeNum > 100000) {
      setError("Tarif mensuel invalide — saisissez un entier entre 1 et 100 000 DT.")
      return
    }
    if (!/^\d+$/.test(seats.trim()) || Number(seats.trim()) < 1 || Number(seats.trim()) > 500) {
      setError("Sièges inclus invalide — entier entre 1 et 500.")
      return
    }
    if (!/^\d+$/.test(quota.trim()) || Number(quota.trim()) < 1 || Number(quota.trim()) > 5000) {
      setError("Quota de stations invalide — entier entre 1 et 5 000.")
      return
    }
    const featureList = features.split("\n").map(f => f.trim()).filter(Boolean)
    if (featureList.length === 0) {
      setError("Fonctionnalités invalides — indiquez au moins une fonctionnalité.")
      return
    }
    const seatsNum = Number(seats.trim())
    const quotaNum = Number(quota.trim())

    // N'envoyer que les champs réellement modifiés (pattern dialog T30).
    const data: Record<string, unknown> = {}
    if (feeNum !== plan.monthlyFee) data.monthlyFee = feeNum
    if (seatsNum !== plan.seatsIncluded) data.seatsIncluded = seatsNum
    if (quotaNum !== plan.stationQuota) data.stationQuota = quotaNum
    if (featureList.join("|") !== plan.features.join("|")) data.features = featureList.join("|")

    if (Object.keys(data).length === 0) {
      toast.info("Aucune modification à enregistrer.")
      onClose()
      return
    }

    setSaving(true)
    try {
      const r = await fetch("/api/super/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, id: plan.id, actor }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => null)
        throw new Error(j?.error ?? `Erreur ${r.status}`)
      }
      toast.success("Plan modifié", {
        description: `${plan.label} — ${fmtDT(feeNum)}/mois.`,
      })
      await onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la modification du plan.")
    } finally {
      setSaving(false)
    }
  }

  return (
    // noValidate : la validation française (role="alert") gère tous les cas.
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="sp-code">Code</Label>
          <Input id="sp-code" value={plan.code} readOnly className="bg-muted font-mono text-xs" />
          <p className="text-[11px] text-muted-foreground">Le code du plan n&apos;est pas modifiable.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sp-fee">Tarif mensuel</Label>
          <div className="relative">
            <Input
              id="sp-fee"
              type="number"
              min={1}
              max={100000}
              step={1}
              inputMode="numeric"
              value={fee}
              onChange={e => setFee(e.target.value)}
              className="pr-10 tabular-nums"
              aria-describedby="sp-fee-hint"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground" aria-hidden>DT</span>
          </div>
          <p id="sp-fee-hint" className="text-[11px] text-muted-foreground">DT par mois (entier).</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sp-seats">Sièges inclus</Label>
          <Input
            id="sp-seats"
            type="number"
            min={1}
            max={500}
            step={1}
            inputMode="numeric"
            value={seats}
            onChange={e => setSeats(e.target.value)}
            className="tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sp-quota">Quota stations</Label>
          <Input
            id="sp-quota"
            type="number"
            min={1}
            max={5000}
            step={1}
            inputMode="numeric"
            value={quota}
            onChange={e => setQuota(e.target.value)}
            className="tabular-nums"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="sp-features">Fonctionnalités</Label>
          <Textarea
            id="sp-features"
            rows={5}
            value={features}
            onChange={e => setFeatures(e.target.value)}
            placeholder="Une fonctionnalité par ligne"
            aria-describedby="sp-features-hint"
          />
          <p id="sp-features-hint" className="text-[11px] text-muted-foreground">
            Une fonctionnalité par ligne — elles apparaissent en puces sur la carte du plan.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" size="sm" className="gap-1.5" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          Enregistrer les modifications
        </Button>
      </DialogFooter>
    </form>
  )
}

function PlanEditDialog({
  plan, actor, onClose, onSaved,
}: {
  plan: SaasPlanDTO | null
  actor: string
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  return (
    <Dialog open={plan !== null} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier le plan</DialogTitle>
          <DialogDescription>
            {plan
              ? `${plan.label} — les modifications sont journalisées dans l'audit (type Système).`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {plan && (
          <PlanEditForm key={plan.id} plan={plan} actor={actor} onClose={onClose} onSaved={onSaved} />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------- Onglet principal ----------

export function SaPlans() {
  const userId = useAppStore(s => s.userId)
  const actor = userId ? DEMO_ACCOUNTS_MAP[userId]?.email ?? "system" : "system"
  const [plans, setPlans] = useState<SaasPlanDTO[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<SaasPlanDTO | null>(null)

  const reload = useCallback(async () => {
    setRefreshing(true)
    try {
      const r = await fetch("/api/super/plans")
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      setPlans(j.plans)
      setError(null)
    } catch {
      setError("Impossible de charger le catalogue des plans.")
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  if (error) {
    return <Card><CardContent className="p-6 text-sm text-destructive">{error}</CardContent></Card>
  }
  if (!plans) {
    return <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement du catalogue…</CardContent></Card>
  }

  // « Le plus populaire » : le plan le plus souscrit (au moins 2 contrats).
  const maxContracts = Math.max(0, ...plans.map(p => p.contractsCount))
  const popular = maxContracts >= 2 ? plans.find(p => p.contractsCount === maxContracts) ?? null : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Catalogue des offres vendues aux enseignes — les modifications sont journalisées dans l&apos;audit.
        </p>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={reload} disabled={refreshing}>
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden /> Actualiser
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map(plan => {
          const meta = PLAN_CARD_META[plan.code] ?? PLAN_CARD_META.ESSENTIEL
          const isEnterprise = plan.code === "ENTERPRISE"
          return (
            <Card
              key={plan.id}
              className={isEnterprise ? "border-teal-400/70 dark:border-teal-700/70" : undefined}
            >
              <CardContent className="space-y-4 p-6">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className={`text-base font-bold leading-tight ${meta.name}`}>{plan.label}</h3>
                    <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{plan.code}</p>
                  </div>
                  {popular?.id === plan.id && (
                    <Badge
                      variant="outline"
                      className="gap-1 border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    >
                      <Sparkles className="h-3 w-3" aria-hidden /> Le plus populaire
                    </Badge>
                  )}
                </div>

                <p className="flex items-baseline gap-1">
                  <span className={`text-3xl font-bold tabular-nums tracking-tight ${meta.price}`}>{fmtDT(plan.monthlyFee)}</span>
                  <span className="text-sm text-muted-foreground">/mois</span>
                </p>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <p className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Sièges inclus :</span>
                    <span className="font-semibold tabular-nums">{plan.seatsIncluded}</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Quota stations :</span>
                    <span className="font-semibold tabular-nums">{plan.stationQuota}</span>
                  </p>
                </div>

                <ul className="space-y-1.5" aria-label={`Fonctionnalités du plan ${plan.label}`}>
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm leading-snug">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex items-center justify-between gap-2 border-t pt-3">
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {plan.contractsActive} contrat(s) actif(s) · MRR {fmtDT(plan.mrr)}
                  </p>
                  <Badge variant="outline" className={`text-[10px] ${meta.chip}`}>
                    {plan.contractsCount} contrat(s)
                  </Badge>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-full gap-1.5 text-xs"
                  onClick={() => setEditing(plan)}
                  aria-label={`Modifier le plan ${plan.label}`}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden /> Modifier
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <PlanEditDialog
        plan={editing}
        actor={actor}
        onClose={() => setEditing(null)}
        onSaved={reload}
      />
    </div>
  )
}
