'use client'

// Super Administration — Enseignes & contrats : plans, statuts, sièges, quotas,
// renouvellements et facturation par enseigne cliente. Actions : suspension /
// réactivation (les comptes utilisateurs suivent le contrat — confirmation
// obligatoire T52-R2), édition du contrat via dialog (T30), création (T32) et
// export CSV du filtre actif (T30 — fiabilisé T52-R2 : périmètre + totaux).
// Recherche et filtres statut/plan ajoutés en T52-R2.

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Ban, CheckCircle2, Download, Loader2, Pencil, Plus, RefreshCw, Save, Search, TriangleAlert } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAppStore } from "@/store/app-store"
import { DEMO_ACCOUNTS_MAP } from "@/lib/demo-accounts"
import { fmtDT, PLAN_LABELS, CONTRACT_STATUS_META, type SaasContractDTO, type SaasPlanDTO, type SaasUserDTO } from "@/lib/saas"
import { fmtDate, daysUntil } from "./sa-shared"
import { SaConfirmDialog } from "./sa-confirm-dialog"

type Row = SaasContractDTO & { activeUsers: number }

interface BrandOption {
  slug: string
  name: string
  color: string
  isIndependents: boolean
  stationCount: number
}

const PLAN_OPTIONS = ["ESSENTIEL", "PRO", "ENTERPRISE"] as const

const STATUS_FILTERS = [
  { value: "TOUTES", label: "Toutes" },
  { value: "ACTIF", label: "Actifs" },
  { value: "ESSAI", label: "Essais" },
  { value: "SUSPENDU", label: "Suspendus" },
  { value: "RESILIE", label: "Résiliés" },
] as const

const STATUS_SLUGS: Record<string, string> = {
  TOUTES: "toutes", ACTIF: "actifs", ESSAI: "essais", SUSPENDU: "suspendus", RESILIE: "resilies",
}

/** Recherche insensible à la casse et aux accents. */
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

// ---------- Export CSV (pattern report-csv.ts : BOM UTF-8 + séparateur « ; ») ----------

function csvEscape(v: string | number): string {
  const s = String(v ?? "")
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(csvEscape).join(";")
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([`\ufeff${content}`], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

const fmtCsvAmount = (v: number) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

function exportContractsCsv(rows: Row[], statusFilter: string, planFilter: string): string {
  const lines: string[] = [
    csvRow([
      "Enseigne", "Plan", "Statut", "Tarif mensuel (DT)", "Sièges actifs",
      "Quota sièges", "Stations", "Contact", "Renouvellement", "Impayé (DT)",
    ]),
  ]
  for (const c of rows) {
    lines.push(csvRow([
      c.brandName,
      PLAN_LABELS[c.plan] ?? c.plan,
      CONTRACT_STATUS_META[c.status]?.label ?? c.status,
      fmtCsvAmount(c.monthlyFee),
      c.activeUsers,
      c.seats,
      `${c.stationCount} / ${c.stationQuota}`,
      `${c.contactName} (${c.contactEmail})`,
      new Date(c.renewsAt).toLocaleDateString("fr-FR"),
      fmtCsvAmount(c.unpaidTotal),
    ]))
  }
  // Ligne de totaux (T52-R2) — sommes des colonnes numériques du périmètre exporté.
  lines.push(csvRow([
    `Total — ${rows.length} contrat(s)`, "", "", "",
    rows.reduce((s, c) => s + c.activeUsers, 0),
    rows.reduce((s, c) => s + c.seats, 0),
    "", "", "",
    fmtCsvAmount(rows.reduce((s, c) => s + c.unpaidTotal, 0)),
  ]))
  const scope = `${STATUS_SLUGS[statusFilter] ?? "toutes"}${planFilter !== "TOUTES" ? `-${planFilter.toLowerCase()}` : ""}`
  const filename = `carbuscope-contrats-${scope}-${todayStamp()}.csv`
  downloadCsv(filename, lines.join("\r\n"))
  return filename
}

// ---------- Dialog d'édition (T30) ----------

/** ISO → valeur d'un input type=date (YYYY-MM-DD), fuseau local. */
function isoToLocalDateInput(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Décimal français accepté : « 890 » ou « 890,5 ». null si vide/invalide. */
function parseDecimal(raw: string): number | null {
  const t = raw.trim().replace(",", ".")
  if (t === "") return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

function ContractEditForm({
  contract, actor, onClose, onSaved,
}: {
  contract: Row
  actor: string
  onClose: () => void
  onSaved: (contract: Row, plan: string, fee: number) => Promise<void>
}) {
  const [plan, setPlan] = useState<string>(contract.plan)
  const [fee, setFee] = useState(contract.monthlyFee > 0 ? String(contract.monthlyFee) : "")
  const [seats, setSeats] = useState(String(contract.seats))
  const [quota, setQuota] = useState(String(contract.stationQuota))
  const [renews, setRenews] = useState(isoToLocalDateInput(contract.renewsAt))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving) return
    setError(null)

    const feeNum = parseDecimal(fee)
    if (feeNum === null || feeNum < 1 || feeNum > 100000) {
      setError("Tarif mensuel invalide — saisissez un montant entre 1 et 100 000 DT.")
      return
    }
    if (!/^\d+$/.test(seats.trim()) || Number(seats.trim()) < 1 || Number(seats.trim()) > 500) {
      setError("Nombre de sièges invalide — entier entre 1 et 500.")
      return
    }
    if (!/^\d+$/.test(quota.trim()) || Number(quota.trim()) < 1 || Number(quota.trim()) > 5000) {
      setError("Quota de stations invalide — entier entre 1 et 5 000.")
      return
    }
    if (!renews || Number.isNaN(Date.parse(renews))) {
      setError("Date de renouvellement invalide.")
      return
    }
    const seatsNum = Number(seats.trim())
    const quotaNum = Number(quota.trim())

    // N'envoyer que les champs réellement modifiés (pattern station-form-dialog).
    const data: Record<string, unknown> = {}
    if (plan !== contract.plan) data.plan = plan
    if (feeNum !== contract.monthlyFee) data.monthlyFee = feeNum
    if (seatsNum !== contract.seats) data.seats = seatsNum
    if (quotaNum !== contract.stationQuota) data.stationQuota = quotaNum
    if (renews !== isoToLocalDateInput(contract.renewsAt)) data.renewsAt = renews

    if (Object.keys(data).length === 0) {
      toast.info("Aucune modification à enregistrer.")
      onClose()
      return
    }

    setSaving(true)
    try {
      const r = await fetch(`/api/super/contracts/${contract.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, actor }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => null)
        throw new Error(j?.error ?? `Erreur ${r.status}`)
      }
      await onSaved(contract, plan, feeNum)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la modification du contrat.")
    } finally {
      setSaving(false)
    }
  }

  return (
    // noValidate : la validation française (role="alert") gère tous les cas,
    // y compris les valeurs vides/négatives, sans tooltip natif du navigateur.
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="sa-plan">Plan</Label>
          <Select value={plan} onValueChange={setPlan}>
            <SelectTrigger id="sa-plan" className="w-full">
              <SelectValue placeholder="Sélectionner un plan" />
            </SelectTrigger>
            <SelectContent>
              {PLAN_OPTIONS.map(p => (
                <SelectItem key={p} value={p}>{PLAN_LABELS[p] ?? p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sa-fee">Tarif mensuel</Label>
          <div className="relative">
            <Input
              id="sa-fee"
              type="number"
              min={1}
              max={100000}
              step={0.001}
              inputMode="decimal"
              value={fee}
              onChange={e => setFee(e.target.value)}
              placeholder="Ex. 890"
              className="pr-10 tabular-nums"
              aria-describedby="sa-fee-hint"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground" aria-hidden>DT</span>
          </div>
          <p id="sa-fee-hint" className="text-[11px] text-muted-foreground">DT par mois, jusqu&apos;à 3 décimales.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sa-seats">Sièges (utilisateurs inclus)</Label>
          <Input
            id="sa-seats"
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
          <Label htmlFor="sa-quota">Quota stations</Label>
          <Input
            id="sa-quota"
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
          <Label htmlFor="sa-renews">Renouvellement</Label>
          <Input
            id="sa-renews"
            type="date"
            value={renews}
            onChange={e => setRenews(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Prochaine échéance annuelle du contrat — actuellement le {fmtDate(contract.renewsAt)}.
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

function ContractEditDialog({
  contract, actor, onClose, onSaved,
}: {
  contract: Row | null
  actor: string
  onClose: () => void
  onSaved: (contract: Row, plan: string, fee: number) => Promise<void>
}) {
  return (
    <Dialog open={contract !== null} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier le contrat</DialogTitle>
          <DialogDescription>
            {contract
              ? `${contract.brandName} · ${PLAN_LABELS[contract.plan] ?? contract.plan} — les modifications sont journalisées dans l'audit.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {contract && (
          <ContractEditForm
            key={contract.id}
            contract={contract}
            actor={actor}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------- Dialog de création (T32 — patron du dialog d'édition T30) ----------

/** Valeur d'un input type=date pour aujourd'hui + n jours, fuseau local. */
function localDateInDays(n: number): string {
  const d = new Date(Date.now() + n * 86_400_000)
  const p = (x: number) => String(x).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function ContractCreateForm({
  brands, plans, takenSlugs, actor, onClose, onCreated,
}: {
  brands: BrandOption[]
  plans: SaasPlanDTO[]
  takenSlugs: Set<string>
  actor: string
  onClose: () => void
  onCreated: () => Promise<void>
}) {
  const [brandSlug, setBrandSlug] = useState<string>("")
  const [plan, setPlan] = useState<string>("")
  const [fee, setFee] = useState("")
  const [seats, setSeats] = useState("")
  const [quota, setQuota] = useState("")
  const [renews, setRenews] = useState(localDateInDays(30)) // essai : J+30 par défaut
  const [contactName, setContactName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const freeBrands = brands.filter(b => !takenSlugs.has(b.slug))

  function pickPlan(code: string) {
    setPlan(code)
    // La sélection du plan pré-remplit tarif/sièges/quota (restants éditables).
    const p = plans.find(pl => pl.code === code)
    if (p) {
      setFee(String(p.monthlyFee))
      setSeats(String(p.seatsIncluded))
      setQuota(String(p.stationQuota))
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving) return
    setError(null)

    if (!brandSlug) {
      setError("Sélectionnez une enseigne cliente.")
      return
    }
    if (takenSlugs.has(brandSlug)) {
      setError("Un contrat existe déjà pour cette enseigne.")
      return
    }
    if (!plan) {
      setError("Sélectionnez un plan du catalogue.")
      return
    }
    const feeNum = parseDecimal(fee)
    if (feeNum === null || feeNum < 1 || feeNum > 100000) {
      setError("Tarif mensuel invalide — saisissez un montant entre 1 et 100 000 DT.")
      return
    }
    if (!/^\d+$/.test(seats.trim()) || Number(seats.trim()) < 1 || Number(seats.trim()) > 500) {
      setError("Nombre de sièges invalide — entier entre 1 et 500.")
      return
    }
    if (!/^\d+$/.test(quota.trim()) || Number(quota.trim()) < 1 || Number(quota.trim()) > 5000) {
      setError("Quota de stations invalide — entier entre 1 et 5 000.")
      return
    }
    if (!renews || Number.isNaN(Date.parse(renews))) {
      setError("Date de renouvellement invalide.")
      return
    }
    if (contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      setError("Adresse e-mail de contact invalide.")
      return
    }
    const seatsNum = Number(seats.trim())
    const quotaNum = Number(quota.trim())

    setSaving(true)
    try {
      const r = await fetch("/api/super/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandSlug, plan, monthlyFee: feeNum, seats: seatsNum, stationQuota: quotaNum,
          renewsAt: renews, contactName: contactName.trim(), contactEmail: contactEmail.trim(), actor,
        }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => null)
        throw new Error(j?.error ?? `Erreur ${r.status}`)
      }
      const j = await r.json()
      const brand = brands.find(b => b.slug === brandSlug)
      toast.success(`Contrat créé — ${brand?.name ?? j.contract.brandName} · essai 30 jours`, {
        description: `Plan ${plan} · ${fmtDT(feeNum)}/mois, essai jusqu'au ${fmtDate(j.contract.renewsAt)}.`,
      })
      await onCreated()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la création du contrat.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="nc-brand">Enseigne cliente</Label>
          <Select value={brandSlug} onValueChange={setBrandSlug}>
            <SelectTrigger id="nc-brand" className="w-full">
              <SelectValue placeholder="Sélectionner une enseigne" />
            </SelectTrigger>
            <SelectContent>
              {brands.map(b => {
                const taken = takenSlugs.has(b.slug)
                return (
                  <SelectItem key={b.slug} value={b.slug} disabled={taken}>
                    {b.name}{taken ? " · contrat existant" : ` · ${b.stationCount} stations`}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Seules les enseignes sans contrat sont sélectionnables — {freeBrands.length} libre(s) sur {brands.length}.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nc-plan">Plan</Label>
          <Select value={plan} onValueChange={pickPlan}>
            <SelectTrigger id="nc-plan" className="w-full">
              <SelectValue placeholder="Sélectionner un plan" />
            </SelectTrigger>
            <SelectContent>
              {plans.map(p => (
                <SelectItem key={p.code} value={p.code} disabled={!p.active}>
                  {p.label} · {p.monthlyFee.toLocaleString("fr-FR")} DT
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">La sélection pré-remplit le tarif, les sièges et le quota.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nc-fee">Tarif mensuel</Label>
          <div className="relative">
            <Input
              id="nc-fee"
              type="number"
              min={1}
              max={100000}
              step={0.001}
              inputMode="decimal"
              value={fee}
              onChange={e => setFee(e.target.value)}
              placeholder="Ex. 890"
              className="pr-10 tabular-nums"
              aria-describedby="nc-fee-hint"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground" aria-hidden>DT</span>
          </div>
          <p id="nc-fee-hint" className="text-[11px] text-muted-foreground">DT par mois, jusqu&apos;à 3 décimales.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nc-seats">Sièges (utilisateurs inclus)</Label>
          <Input
            id="nc-seats"
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
          <Label htmlFor="nc-quota">Quota stations</Label>
          <Input
            id="nc-quota"
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
        <div className="space-y-1.5">
          <Label htmlFor="nc-renews">Renouvellement</Label>
          <Input
            id="nc-renews"
            type="date"
            value={renews}
            onChange={e => setRenews(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">Fin d&apos;essai — par défaut aujourd&apos;hui + 30 jours.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nc-contact-name">Contact — nom</Label>
          <Input
            id="nc-contact-name"
            type="text"
            value={contactName}
            onChange={e => setContactName(e.target.value)}
            placeholder="Ex. Sonia Beji"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="nc-contact-email">Contact — e-mail</Label>
          <Input
            id="nc-contact-email"
            type="email"
            value={contactEmail}
            onChange={e => setContactEmail(e.target.value)}
            placeholder="Ex. sonia.beji@agil.tn"
          />
          <p className="text-[11px] text-muted-foreground">Optionnels — l&apos;enseigne servira de contact par défaut.</p>
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
        <Button type="submit" size="sm" className="gap-1.5" disabled={saving || !brandSlug || !plan}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          Créer le contrat
        </Button>
      </DialogFooter>
    </form>
  )
}

function NewContractDialog({
  open, takenSlugs, actor, onClose, onCreated,
}: {
  open: boolean
  takenSlugs: Set<string>
  actor: string
  onClose: () => void
  onCreated: () => Promise<void>
}) {
  const [brands, setBrands] = useState<BrandOption[] | null>(null)
  const [plans, setPlans] = useState<SaasPlanDTO[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Chargement à l'ouverture (pattern reload : états gérés dans la fonction).
  const loadOptions = useCallback(async (open: boolean) => {
    if (!open) return
    setLoading(true)
    setBrands(null)
    setPlans(null)
    setLoadError(null)
    try {
      const [rb, rp] = await Promise.all([
        fetch("/api/brands").then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))),
        fetch("/api/super/plans").then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))),
      ]) as [{ brands: BrandOption[] }, { plans: SaasPlanDTO[] }]
      setBrands(rb.brands)
      setPlans(rp.plans)
    } catch {
      setLoadError("Impossible de charger les enseignes et les plans.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOptions(open)
  }, [open, loadOptions])

  const freeCount = brands ? brands.filter(b => !takenSlugs.has(b.slug)).length : 0

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau contrat</DialogTitle>
          <DialogDescription>
            Ouvre un essai de 30 jours pour une enseigne encore sans contrat — création journalisée dans l&apos;audit.
          </DialogDescription>
        </DialogHeader>
        {loadError && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
            {loadError}
          </p>
        )}
        {!brands || !plans || loading ? (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement des enseignes et des plans…
          </p>
        ) : freeCount === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Toutes les enseignes du répertoire ont déjà un contrat — aucun nouveau client disponible.
          </p>
        ) : (
          <ContractCreateForm
            key={brands.map(b => b.slug).join(",")}
            brands={brands}
            plans={plans}
            takenSlugs={takenSlugs}
            actor={actor}
            onClose={onClose}
            onCreated={onCreated}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------- Onglet principal ----------

export function SaContracts() {
  const userId = useAppStore(s => s.userId)
  // T52-R2 : acteur d'audit = e-mail de la session V7 (repli ancien flux démo
  //  userId, puis « system ») — cohérent avec la journalisation sa-users.
  const session = useAppStore(s => s.session)
  const actor = session?.email ?? (userId ? DEMO_ACCOUNTS_MAP[userId]?.email ?? "system" : "system")
  const [contracts, setContracts] = useState<SaasContractDTO[] | null>(null)
  const [users, setUsers] = useState<SaasUserDTO[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Row | null>(null)
  const [creating, setCreating] = useState(false)
  // Filtres & recherche (T52-R2)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("TOUTES")
  const [planFilter, setPlanFilter] = useState<string>("TOUTES")
  // Changement de statut en attente de confirmation (T52-R2)
  const [statusAction, setStatusAction] = useState<{ row: Row; status: string } | null>(null)

  const reload = useCallback(async () => {
    setRefreshing(true)
    try {
      const [rc, ru] = await Promise.all([
        fetch("/api/super/contracts").then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))),
        fetch("/api/super/users").then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))),
      ])
      setContracts(rc.contracts)
      setUsers(ru.users)
      setError(null)
    } catch {
      setError("Impossible de charger les contrats.")
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const rows = useMemo<Row[]>(() => {
    if (!contracts || !users) return []
    return contracts.map(c => ({
      ...c,
      activeUsers: users.filter(u => u.brandSlug === c.brandSlug && u.active).length,
    }))
  }, [contracts, users])

  // Enseignes déjà sous contrat (options désactivées du dialog de création).
  const takenSlugs = useMemo(() => new Set((contracts ?? []).map(c => c.brandSlug)), [contracts])

  // Périmètre affiché : statut + plan + recherche (enseigne, contact, e-mail).
  const needle = norm(search.trim())
  const filtered = useMemo(
    () => rows.filter(c =>
      (statusFilter === "TOUTES" || c.status === statusFilter) &&
      (planFilter === "TOUTES" || c.plan === planFilter) &&
      (needle === "" ||
        norm(c.brandName).includes(needle) ||
        norm(c.contactName).includes(needle) ||
        norm(c.contactEmail).includes(needle))
    ),
    [rows, statusFilter, planFilter, needle]
  )

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { TOUTES: rows.length, ACTIF: 0, ESSAI: 0, SUSPENDU: 0, RESILIE: 0 }
    rows.forEach(r => { c[r.status] = (c[r.status] ?? 0) + 1 })
    return c
  }, [rows])

  async function changeStatus(c: Row, status: string) {
    setBusyId(c.id)
    try {
      const r = await fetch(`/api/super/contracts/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, actor }),
      })
      if (!r.ok) throw new Error(await r.text())
      const labels: Record<string, string> = { ACTIF: "réactivé", SUSPENDU: "suspendu", RESILIE: "résilié", ESSAI: "passé en essai" }
      toast.success(`Contrat ${c.brandName} ${labels[status] ?? status}`, {
        description: status === "SUSPENDU"
          ? "Les comptes utilisateurs de l'enseigne ont été suspendus."
          : "Les comptes utilisateurs ont été mis à jour.",
      })
      await reload()
    } catch {
      toast.error("Échec de la mise à jour du contrat.")
    } finally {
      setBusyId(null)
    }
  }

  /** Exécuté depuis le dialogue de confirmation (T52-R2) : les changements de
   *  statut suspendent/réactivent aussi les comptes utilisateurs de l'enseigne. */
  async function confirmStatusAction() {
    if (!statusAction) return
    await changeStatus(statusAction.row, statusAction.status)
    setStatusAction(null)
  }

  async function handleEditSaved(c: Row, plan: string, fee: number) {
    toast.success("Contrat modifié", {
      description: `${c.brandName} · ${PLAN_LABELS[plan] ?? plan} — ${fmtDT(fee)}/mois.`,
    })
    await reload()
  }

  async function handleCreated() {
    await reload()
  }

  function handleExport() {
    const filename = exportContractsCsv(filtered, statusFilter, planFilter)
    const scope = [
      STATUS_FILTERS.find(f => f.value === statusFilter)?.label.toLowerCase() ?? "toutes",
      planFilter !== "TOUTES" ? `plan ${PLAN_LABELS[planFilter] ?? planFilter}` : null,
      needle !== "" ? `recherche « ${search.trim()} »` : null,
    ].filter(Boolean).join(" · ")
    toast.success(`Export CSV téléchargé (${filtered.length} contrat(s))`, {
      description: `${filename} — ${scope}.`,
    })
  }

  const columns = useMemo<DataViewColumn<Row>[]>(() => [
    {
      key: "brand",
      header: "Enseigne",
      render: c => (
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
          <span className="font-semibold">{c.brandName}</span>
          <Badge variant="outline" className="text-[10px]">{PLAN_LABELS[c.plan] ?? c.plan}</Badge>
        </div>
      ),
      sortValue: c => c.brandName,
    },
    {
      key: "status",
      header: "Statut",
      render: c => {
        const meta = CONTRACT_STATUS_META[c.status]
        return (
          <Badge variant="outline" className={`text-[10px] ${meta?.className ?? ""}`}>
            {meta?.label ?? c.status}
          </Badge>
        )
      },
      sortValue: c => c.status,
    },
    {
      key: "contact",
      header: "Contact",
      render: c => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-tight">{c.contactName}</p>
          <p className="truncate text-xs text-muted-foreground">{c.contactEmail}</p>
        </div>
      ),
      sortValue: c => c.contactName,
      hideInCards: true,
    },
    {
      key: "fee",
      header: "Tarif",
      align: "right",
      render: c => (
        c.monthlyFee > 0 ? (
          <span className="tabular-nums font-semibold">
            {fmtDT(c.monthlyFee)}<span className="text-muted-foreground">/mois</span>
          </span>
        ) : <span className="text-muted-foreground">—</span>
      ),
      sortValue: c => c.monthlyFee,
    },
    {
      key: "seats",
      header: "Sièges",
      align: "center",
      render: c => (
        <span className="tabular-nums text-sm">
          <span className={c.activeUsers > c.seats ? "font-bold text-red-600" : "font-semibold"}>{c.activeUsers}</span>
          <span className="text-muted-foreground"> / {c.seats}</span>
        </span>
      ),
      sortValue: c => c.activeUsers / Math.max(1, c.seats),
      cardLabel: "Sièges actifs",
    },
    {
      key: "quota",
      header: "Stations",
      align: "center",
      render: c => (
        <span className="tabular-nums text-sm">
          <span className={c.stationCount > c.stationQuota ? "font-bold text-red-600" : "font-semibold"}>{c.stationCount}</span>
          <span className="text-muted-foreground"> / {c.stationQuota}</span>
        </span>
      ),
      sortValue: c => c.stationCount / Math.max(1, c.stationQuota),
      cardLabel: "Quota stations",
      hideInCards: true,
    },
    {
      key: "renews",
      header: "Renouvellement",
      render: c => {
        const d = daysUntil(c.renewsAt)
        return (
          <div className="text-sm">
            <p>{fmtDate(c.renewsAt)}</p>
            {c.status !== "RESILIE" && (
              <p className={`text-[11px] ${d < 0 ? "font-medium text-red-600" : d <= 30 ? "text-amber-600" : "text-muted-foreground"}`}>
                {d < 0 ? `dépassé de ${Math.abs(d)} j` : `dans ${d} j`}
              </p>
            )}
          </div>
        )
      },
      sortValue: c => new Date(c.renewsAt).getTime(),
    },
    {
      key: "billing",
      header: "Facturation",
      align: "right",
      render: c => (
        <div className="text-sm">
          <p className="tabular-nums font-semibold">{fmtDT(c.totalBilled)}</p>
          {c.unpaidCount > 0 && (
            <p className="text-[11px] font-medium text-red-600">{c.unpaidCount} impayée(s) · {fmtDT(c.unpaidTotal)}</p>
          )}
        </div>
      ),
      sortValue: c => c.unpaidTotal,
      hideInCards: true,
    },
    {
      key: "actions",
      header: "Actions",
      align: "center",
      sortDisabled: true,
      render: c => {
        if (busyId === c.id) {
          return <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" aria-label="Mise à jour…" />
        }
        return (
          <div className="flex items-center justify-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setEditing(c)}
              aria-label={`Modifier le contrat ${c.brandName}`}
              title="Modifier le contrat"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </Button>
            {c.status === "SUSPENDU" ? (
              <Button variant="outline" size="sm" className="h-7 gap-1 border-emerald-300 px-2 text-xs text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                onClick={() => setStatusAction({ row: c, status: "ACTIF" })} aria-label={`Réactiver le contrat ${c.brandName}`}>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Réactiver
              </Button>
            ) : c.status !== "RESILIE" ? (
              <Button variant="outline" size="sm" className="h-7 gap-1 border-amber-300 px-2 text-xs text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950"
                onClick={() => setStatusAction({ row: c, status: "SUSPENDU" })} aria-label={`Suspendre le contrat ${c.brandName}`}>
                <Ban className="h-3.5 w-3.5" aria-hidden /> Suspendre
              </Button>
            ) : null}
          </div>
        )
      },
    },
  ], [busyId, changeStatus])

  if (error) {
    return <Card><CardContent className="p-6 text-sm text-destructive">{error}</CardContent></Card>
  }
  if (!contracts || !users) {
    return <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement des contrats…</CardContent></Card>
  }

  return (
    <div className="space-y-3">
      {rows.some(r => r.unpaidCount > 0 && r.status !== "SUSPENDU") && (
        <Card className="border-amber-300 dark:border-amber-800">
          <CardContent className="flex items-center gap-2.5 p-3.5 text-sm">
            <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <p>
              <span className="font-semibold">Encaissements en attente :</span>{" "}
              {rows.filter(r => r.unpaidCount > 0 && r.status !== "SUSPENDU").map(r => `${r.brandName} (${r.unpaidCount})`).join(" · ")}.
              Encaissez depuis l&apos;onglet Facturation ou suspendez le contrat.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Recherche + filtres statut/plan (T52-R2) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative min-w-0 flex-1 basis-48">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher une enseigne ou un contact…"
            className="h-8 pl-8 text-sm"
            aria-label="Rechercher un contrat par enseigne, contact ou e-mail"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par statut">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === f.value
                  ? "border-teal-600 bg-teal-600 text-white"
                  : "border-border bg-background text-muted-foreground hover:border-teal-400 hover:text-foreground"
              }`}
              aria-pressed={statusFilter === f.value}
            >
              {f.label} <span className="opacity-70">({statusCounts[f.value] ?? 0})</span>
            </button>
          ))}
        </div>
        <Select value={planFilter} onValueChange={v => setPlanFilter(v)}>
          <SelectTrigger className="h-8 w-40 text-xs" aria-label="Filtrer par plan">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TOUTES">Tous les plans</SelectItem>
            {PLAN_OPTIONS.map(p => (
              <SelectItem key={p} value={p}>{PLAN_LABELS[p] ?? p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {filtered.length} contrat(s){" "}
          {(() => {
            const mrr = filtered.reduce((s, c) => s + (c.status === "ACTIF" ? c.monthlyFee : 0), 0)
            return mrr > 0 ? `· MRR actif ${fmtDT(mrr)}` : ""
          })()}
        </span>
      </div>

      <DataViews<Row>
        viewKey="sa-contracts"
        rows={filtered}
        rowKey={r => r.id}
        columns={columns}
        nested={{
          groupKey: r => r.status,
          groupLabel: (key, rs) => {
            const meta = CONTRACT_STATUS_META[key]
            return (
              <span className="flex items-center gap-2">
                <Badge variant="outline" className={`text-[10px] ${meta?.className ?? ""}`}>{meta?.label ?? key}</Badge>
                <span className="text-xs text-muted-foreground">{rs.length} contrat(s)</span>
              </span>
            )
          },
          groupSortValue: key => ["ACTIF", "ESSAI", "SUSPENDU", "RESILIE"].indexOf(key),
          hideColumnKeyInGroups: "status",
          defaultOpen: "all",
        }}
        renderCard={c => (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                <p className="truncate font-semibold">{c.brandName}</p>
              </div>
              {(() => { const meta = CONTRACT_STATUS_META[c.status]; return (
                <Badge variant="outline" className={`shrink-0 text-[10px] ${meta?.className ?? ""}`}>{meta?.label ?? c.status}</Badge>
              ) })()}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{PLAN_LABELS[c.plan] ?? c.plan}</span>
              <span className="font-bold tabular-nums">{c.monthlyFee > 0 ? `${fmtDT(c.monthlyFee)}/mois` : "—"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <p>Sièges : <span className="font-semibold text-foreground">{c.activeUsers}/{c.seats}</span></p>
              <p>Renouv. : <span className="font-semibold text-foreground">{fmtDate(c.renewsAt)}</span></p>
              <p>Contact : <span className="font-semibold text-foreground">{c.contactName}</span></p>
              <p>Impayé : <span className={c.unpaidCount > 0 ? "font-semibold text-red-600" : "font-semibold text-foreground"}>{c.unpaidCount > 0 ? fmtDT(c.unpaidTotal) : "—"}</span></p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-full gap-1 text-xs"
              onClick={() => setEditing(c)}
              aria-label={`Modifier le contrat ${c.brandName}`}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Modifier
            </Button>
          </div>
        )}
        cardColumns={2}
        maxHeightClassName="max-h-[30rem]"
        emptyMessage={
          rows.length > 0
            ? "Aucun contrat ne correspond à la recherche ou aux filtres actifs."
            : "Aucun contrat."
        }
        toolbarExtra={
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setCreating(true)}
              aria-label="Créer un nouveau contrat"
              title="Créer un contrat (essai 30 jours) pour une enseigne sans contrat"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Nouveau contrat
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={handleExport}
              disabled={rows.length === 0}
              title={rows.length === 0 ? "Aucun contrat à exporter" : "Exporter les contrats affichés au format CSV"}
            >
              <Download className="h-3.5 w-3.5" aria-hidden /> Exporter CSV
            </Button>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={reload} disabled={refreshing}>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden /> Actualiser
            </Button>
          </div>
        }
      />

      <ContractEditDialog
        contract={editing}
        actor={actor}
        onClose={() => setEditing(null)}
        onSaved={handleEditSaved}
      />

      <NewContractDialog
        open={creating}
        takenSlugs={takenSlugs}
        actor={actor}
        onClose={() => setCreating(false)}
        onCreated={handleCreated}
      />

      {/* Confirmation suspension / réactivation (T52-R2) */}
      <SaConfirmDialog
        open={statusAction !== null}
        onOpenChange={o => { if (!o) setStatusAction(null) }}
        onConfirm={confirmStatusAction}
        busy={statusAction !== null && busyId === statusAction.row.id}
        tone={statusAction?.status === "SUSPENDU" ? "amber" : "emerald"}
        icon={statusAction?.status === "SUSPENDU" ? Ban : CheckCircle2}
        title={
          statusAction?.status === "SUSPENDU"
            ? `Suspendre le contrat ${statusAction.row.brandName} ?`
            : `Réactiver le contrat ${statusAction?.row.brandName ?? ""} ?`
        }
        description={
          statusAction?.status === "SUSPENDU"
            ? "Le contrat passe au statut « Suspendu » jusqu'à sa réactivation — l'action est journalisée dans l'audit (type Contrat)."
            : "Le contrat reprend le statut « Actif » — l'action est journalisée dans l'audit (type Contrat)."
        }
        confirmLabel={statusAction?.status === "SUSPENDU" ? "Suspendre le contrat" : "Réactiver le contrat"}
      >
        {statusAction && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground">Plan · tarif</span>
              <span className="font-semibold tabular-nums">
                {PLAN_LABELS[statusAction.row.plan] ?? statusAction.row.plan} · {fmtDT(statusAction.row.monthlyFee)}/mois
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground">Renouvellement</span>
              <span className="font-semibold tabular-nums">{fmtDate(statusAction.row.renewsAt)}</span>
            </div>
            {statusAction.status === "SUSPENDU" ? (
              <ul className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                <li>• Les {statusAction.row.activeUsers} compte(s) utilisateur(s) actif(s) de l&apos;enseigne seront suspendus — accès à la plateforme refusé.</li>
                <li>• Les factures émises sont conservées ; l&apos;encours impayé reste exigible ({fmtDT(statusAction.row.unpaidTotal)}).</li>
              </ul>
            ) : (
              <ul className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                <li>• Les comptes utilisateurs de l&apos;enseigne seront réactivés (accès restauré).</li>
                <li>• La facturation mensuelle reprend au tarif contractuel.</li>
              </ul>
            )}
          </div>
        )}
      </SaConfirmDialog>
    </div>
  )
}
