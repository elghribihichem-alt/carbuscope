"use client"

// Super Administration — ③ Comptes & Personnel : vue consolidée des accès
// (équipe éditeur + comptes enseignes), onboarding, activation, rôles,
// impersonation portail enseigne et matrice pédagogique des droits.
// Conventions : identité graphite/violet, jamais bleu/indigo, UI 100 % FR.

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import { toast } from "sonner"
import {
  Activity, AlertTriangle, ArrowRight, BadgeCheck, Building2, Check, Circle, Crown, Download, Eye, History, KeyRound,
  LifeBuoy, Loader2, Lock, Minus, RefreshCw, Search, ShieldCheck, Smartphone, UserCheck,
  UserPlus, Users, UserX, X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAppStore, ROLE_LABELS, TAB_ACCESS, type Role, type Tab } from "@/store/app-store"
import {
  formatInt, formatDate, MODULE_META, SA_ROLE_META, pastille,
  type AuditLogDTO, type CompteDTO, type Pastille,
} from "@/lib/sa-types"

// ---------------------------------------------------------------- types & méta locaux

interface ParEnseigne {
  slug: string | null
  nom: string
  clientSaaS: "ACTIF" | "HORS_CONTRAT" | null
  total: number
  actifs: number
}

interface ComptesResponse {
  comptes: CompteDTO[]
  parEnseigne: ParEnseigne[]
}

/** Clé interne du groupe « équipe CarbuScope » (comptes sans enseigne). */
const EDITEUR_KEY = "carbuscope"

const CLIENT_SAAS_META: Record<string, Pastille> = {
  ACTIF: { label: "Client actif", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400", point: "bg-emerald-500" },
  HORS_CONTRAT: { label: "Hors contrat", className: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400", point: "bg-slate-400" },
}

/** Badge rôle — violet pour l'éditeur, teintes métier pour les enseignes. */
const ROLE_PASTILLE: Record<string, Pastille> = {
  SUPER_ADMIN: { label: SA_ROLE_META.SUPER_ADMIN, className: "border-violet-500/60 bg-violet-100 text-violet-800 dark:border-violet-500/50 dark:bg-violet-950 dark:text-violet-300" },
  ADMIN: { label: SA_ROLE_META.ADMIN, className: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-400" },
  NETWORK: { label: SA_ROLE_META.NETWORK, className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  COMMERCIAL: { label: SA_ROLE_META.COMMERCIAL, className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" },
  EXPANSION: { label: SA_ROLE_META.EXPANSION, className: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400" },
  VIEWER: { label: SA_ROLE_META.VIEWER, className: "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400" },
}

const ROLES: Role[] = Object.keys(ROLE_LABELS) as Role[]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ---------------------------------------------------------------- sécurité & activité (C-3)

/** Partie exploitée de la réponse de GET /api/super/audit. */
interface AuditResponse {
  logs: AuditLogDTO[]
  totalFiltres: number
}

/** Journal d'activité d'un compte, agrégé côté client par acteurEmail. */
interface ActiviteCompte {
  email: string
  nom: string
  role: string
  total: number
  sensibles: number
  dernier: AuditLogDTO | null
  modules: string[]
}

/** Compte actif sans activité tracée ou dont la dernière action date de plus de 90 jours. */
interface CompteDormant {
  compte: CompteDTO
  activite: ActiviteCompte | null
  /** null = aucune trace au journal (inconnu, pas seulement ancien). */
  joursSansActivite: number | null
}

/** Seuil de dormance (jours sans action tracée) avant suggestion de désactivation. */
const SEUIL_DORMANCE_J = 90

/** Temps relatif compact (français). */
function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  if (diffMs < 60_000) return "à l'instant"
  const min = Math.floor(diffMs / 60_000)
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.floor(h / 24)
  if (j < 31) return `il y a ${j} j`
  return `il y a ${Math.floor(j / 30)} mois`
}

/** Date absolue complète, pour l'infobulle : « 10 septembre 2026 à 13:53 ». */
function dateAbsolue(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso))
}

/** Badges compacts de module d'audit (teintes SA — aucun bleu/indigo). */
const MODULE_BADGE: Record<string, string> = {
  CLIENTS: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  FACTURATION: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  COMPTES: "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400",
  CONFIG: "border-yellow-400/70 bg-yellow-50 text-yellow-700 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
  SUPERVISION: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400",
  SUPPORT: "border-lime-300 bg-lime-50 text-lime-700 dark:border-lime-800 dark:bg-lime-950 dark:text-lime-400",
  SECURITE: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
}

/** Étapes du 2FA TOTP — réellement actives depuis la V7 (authentification réelle). */
const ETAPES_2FA = [
  {
    icone: KeyRound,
    titre: "Authentification réelle",
    description: "Ouverture de session serveur pour chaque compte : e-mail + mot de passe bcrypt, session signée 12 h.",
    detail: "Active — V7",
  },
  {
    icone: Smartphone,
    titre: "Activation par compte",
    description: "Chaque utilisateur active le 2FA depuis son menu utilisateur (QR à scanner) ; la Super Administration suit la couverture ici.",
    detail: "Active — par profil",
  },
  {
    icone: LifeBuoy,
    titre: "App authenticatrice",
    description: "Code TOTP à 6 chiffres (RFC 6238) exigé à la connexion ; en cas de téléphone perdu, réinitialisation par la Super Administration ci-dessous.",
    detail: "TOTP — RFC 6238",
  },
  {
    icone: Crown,
    titre: "Obligation Super Admin",
    description: "2FA à rendre obligatoire pour les rôles SUPER_ADMIN avant tout accès aux espaces de pilotage de l'éditeur.",
    detail: "Prévu",
  },
] as const

/** Libellés FR des onglets de l'Observatoire (miroir de la navigation). */
const TAB_LABELS: Record<Tab, string> = {
  dashboard: "Tableau de bord",
  map: "Carte interactive",
  stations: "Mes stations",
  competition: "Concurrence",
  calculators: "Calculateurs",
  implantation: "Implantation",
  prices: "Prix & marges",
  veille: "Veille",
  reports: "Rapports",
  settings: "Paramètres",
}

/** Onglets autorisés par rôle — construit dynamiquement depuis TAB_ACCESS. */
function ongletsDuRole(role: Role): string[] {
  return (Object.keys(TAB_ACCESS) as Tab[]).filter(t => TAB_ACCESS[t].includes(role)).map(t => TAB_LABELS[t])
}

function descriptionRole(role: string): string {
  if (role === "SUPER_ADMIN") return "Éditeur CarbuScope — tous les espaces + impersonation des portails enseignes."
  const onglets = ongletsDuRole(role as Role)
  return `Observatoire : ${onglets.slice(0, 4).join(", ")}${onglets.length > 4 ? ` (+${onglets.length - 4})` : ""}.`
}

// ---------------------------------------------------------------- dialog de création (onboarding)

function DialogCreation({
  onOpenChange, parEnseigne, onCree,
}: {
  onOpenChange: (o: boolean) => void
  parEnseigne: ParEnseigne[]
  onCree: () => void
}) {
  const [nom, setNom] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("ADMIN")
  const [enseigne, setEnseigne] = useState("none")
  const [envoi, setEnvoi] = useState(false)
  const [erreurEmail, setErreurEmail] = useState<string | null>(null)
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null)

  const emailValide = EMAIL_RE.test(email.trim())

  async function creer() {
    setErreurEmail(null)
    setErreurGenerale(null)
    if (!nom.trim()) { setErreurGenerale("Le nom complet est requis."); return }
    if (!emailValide) { setErreurEmail("Format d'adresse e-mail invalide."); return }
    setEnvoi(true)
    try {
      const r = await fetch("/api/super/comptes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nom.trim(),
          email: email.trim().toLowerCase(),
          role,
          brandSlug: enseigne === "none" ? null : enseigne,
        }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) {
        if (r.status === 409) setErreurEmail(j?.error ?? "Un compte existe déjà avec cet e-mail.")
        else setErreurGenerale(j?.error ?? `Erreur serveur (HTTP ${r.status}).`)
        return
      }
      const c = j.compte as CompteDTO
      toast.success("Compte créé", {
        description: `${c.name} · ${c.email} — ${SA_ROLE_META[c.role] ?? c.role}${c.brandSlug ? ` (${c.brandSlug})` : " (équipe CarbuScope)"}.`,
      })
      onOpenChange(false)
      setNom(""); setEmail(""); setRole("ADMIN"); setEnseigne("none")
      onCree()
      // event E-2 : voir sa-banniere-alertes.tsx
      window.dispatchEvent(new CustomEvent("carbuscope:mutation-sa", { detail: { source: "comptes-creation" } }))
    } catch {
      setErreurGenerale("Erreur réseau — le compte n'a pas pu être créé.")
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
          Créer un compte (onboarding)
        </DialogTitle>
        <DialogDescription>
          Nouvel accès pour une enseigne cliente ou pour l&apos;équipe CarbuScope — l&apos;action est tracée au journal d&apos;audit.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="sa-nouveau-nom">Nom complet</Label>
          <Input id="sa-nouveau-nom" value={nom} onChange={e => setNom(e.target.value)} placeholder="Prénom Nom" autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sa-nouveau-email">Adresse e-mail</Label>
          <Input
            id="sa-nouveau-email" type="email" value={email} autoComplete="off"
            onChange={e => { setEmail(e.target.value); setErreurEmail(null) }}
            placeholder="prenom.nom@enseigne.tn"
            aria-invalid={!!erreurEmail || (email.length > 0 && !emailValide)}
            className={cn("font-mono text-xs", (erreurEmail || (email.length > 0 && !emailValide)) && "border-red-300 focus-visible:ring-red-300")}
          />
          {erreurEmail && <p className="text-xs text-red-600 dark:text-red-400">{erreurEmail}</p>}
          {!erreurEmail && email.length > 0 && !emailValide && <p className="text-xs text-red-600 dark:text-red-400">Format d&apos;adresse e-mail invalide.</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Rôle</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger aria-label="Rôle du nouveau compte">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map(r => (
                  <SelectItem key={r} value={r} className="items-start py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{SA_ROLE_META[r]}</p>
                      <p className="text-[11px] leading-snug text-muted-foreground">{descriptionRole(r)}</p>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Enseigne</Label>
            <Select value={enseigne} onValueChange={setEnseigne}>
              <SelectTrigger aria-label="Enseigne du nouveau compte">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="items-start py-2">
                  <div>
                    <p className="text-sm font-medium">CarbuScope (éditeur)</p>
                    <p className="text-[11px] text-muted-foreground">Compte interne de l&apos;équipe CarbuScope.</p>
                  </div>
                </SelectItem>
                {parEnseigne.filter(pe => pe.slug !== null).map(pe => (
                  <SelectItem key={pe.slug} value={pe.slug!} className="items-start py-2">
                    <div>
                      <p className="text-sm font-medium">{pe.nom}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {pe.clientSaaS === "ACTIF" ? "Client SaaS actif" : pe.clientSaaS === "HORS_CONTRAT" ? "Hors contrat" : "—"}
                        {` · ${pe.actifs}/${pe.total} comptes actifs`}
                      </p>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {erreurGenerale && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400" role="alert">
            {erreurGenerale}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={envoi}>Annuler</Button>
        <Button onClick={() => void creer()} disabled={envoi} className="bg-violet-600 text-white hover:bg-violet-700">
          {envoi && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Créer le compte
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

// ---------------------------------------------------------------- composant

export function SaComptes() {
  // données
  const [data, setData] = useState<ComptesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const retry = useCallback(() => setReloadKey(k => k + 1), [])

  // filtres
  const [enseigneFiltre, setEnseigneFiltre] = useState("all")
  const [roleFiltre, setRoleFiltre] = useState("all")
  const [recherche, setRecherche] = useState("")

  // mutations
  const [enCours, setEnCours] = useState<Set<string>>(new Set())

  // dialogues
  const [dialogCreation, setDialogCreation] = useState(false)
  const [cibleImpersonation, setCibleImpersonation] = useState<CompteDTO | null>(null)

  const impersonate = useAppStore(s => s.impersonate)
  const setMode = useAppStore(s => s.setMode)

  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/super/comptes", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: ComptesResponse) => { setData(j); setError(null) })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return
        setError("Impossible de charger les comptes et la répartition par enseigne.")
      })
    return () => ac.abort()
  }, [reloadKey])

  // journal d'audit — activité des comptes (sécurité, C-3)
  const [auditLogs, setAuditLogs] = useState<AuditLogDTO[] | null>(null)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [auditKey, setAuditKey] = useState(0)

  const loadAudit = useCallback(async (signal: AbortSignal) => {
    try {
      const r = await fetch("/api/super/audit?limit=500", { signal })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = (await r.json()) as AuditResponse
      setAuditLogs(j.logs)
      setAuditError(null)
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return
      setAuditError("Impossible de charger le journal d’audit — l’activité des comptes est indisponible.")
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    void loadAudit(ac.signal)
    return () => ac.abort()
  }, [loadAudit, auditKey, reloadKey])

  // ---------------------------------------------------------------- mutations

  const marquerEnCours = (id: string, actif: boolean) =>
    setEnCours(s => { const n = new Set(s); if (actif) n.add(id); else n.delete(id); return n })

  async function basculerActif(c: CompteDTO) {
    marquerEnCours(c.id, true)
    try {
      const r = await fetch(`/api/super/comptes?id=${encodeURIComponent(c.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !c.active }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) {
        toast.error(c.active ? "Désactivation impossible" : "Réactivation impossible", { description: j?.error ?? `HTTP ${r.status}` })
        return
      }
      const maj = j.compte as CompteDTO
      setData(d => (d ? { ...d, comptes: d.comptes.map(x => x.id === maj.id ? { ...maj, brandName: x.brandName } : x) } : d))
      // la bascule vient d'écrire une trace SENSIBLE au journal → rafraîchir l'activité
      setAuditKey(k => k + 1)
      toast.success(c.active ? "Compte désactivé" : "Compte réactivé", {
        description: `${maj.name} (${maj.email}) — l'accès est ${maj.active ? "restauré" : "suspendu"}, l'action est tracée à l'audit.`,
      })
      // event E-2 : voir sa-banniere-alertes.tsx
      window.dispatchEvent(new CustomEvent("carbuscope:mutation-sa", { detail: { source: "comptes-bascule" } }))
    } catch {
      toast.error("Erreur réseau", { description: "La modification n'a pas pu être envoyée." })
    } finally {
      marquerEnCours(c.id, false)
    }
  }

  // ---------------------------------------------------------------- données dérivées

  /** V7 — réinitialisation de la 2FA d'un compte (téléphone perdu) : le secret
   *  TOTP est supprimé côté serveur, l'utilisateur devra la réactiver. */
  const [cibleReset2fa, setCibleReset2fa] = useState<CompteDTO | null>(null)
  async function reinitialiser2fa(c: CompteDTO) {
    marquerEnCours(c.id, true)
    try {
      const r = await fetch(`/api/super/comptes?id=${encodeURIComponent(c.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetTotp: true }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) {
        toast.error("Réinitialisation impossible", { description: j?.error ?? `HTTP ${r.status}` })
        return
      }
      const maj = j.compte as CompteDTO
      setData(d => (d ? { ...d, comptes: d.comptes.map(x => x.id === maj.id ? { ...maj, brandName: x.brandName } : x) } : d))
      setAuditKey(k => k + 1)
      setCibleReset2fa(null)
      toast.success("2FA réinitialisée", {
        description: `${maj.name} (${maj.email}) se reconnecte avec son mot de passe et devra réactiver la 2FA — action tracée.`,
      })
      window.dispatchEvent(new CustomEvent("carbuscope:mutation-sa", { detail: { source: "comptes-reset-2fa" } }))
    } catch {
      toast.error("Erreur réseau", { description: "La réinitialisation n'a pas pu être envoyée." })
    } finally {
      marquerEnCours(c.id, false)
    }
  }

  const comptes = data?.comptes ?? []
  const parEnseigne = data?.parEnseigne ?? []

  const stats = useMemo(() => {
    const total = comptes.length
    const actifs = comptes.filter(c => c.active).length
    const editeur = comptes.filter(c => !c.brandSlug)
    const superAdmins = editeur.filter(c => c.role === "SUPER_ADMIN").length
    const nbEnseignes = parEnseigne.filter(pe => pe.slug !== null).length
    return {
      total, actifs, inactifs: total - actifs,
      editeur: editeur.length, superAdmins,
      enseignes: total - editeur.length, nbEnseignes,
    }
  }, [comptes, parEnseigne])

  const clientSaaSParSlug = useMemo(() => {
    const m = new Map<string, string>()
    for (const pe of parEnseigne) m.set(pe.slug ?? EDITEUR_KEY, pe.clientSaaS ?? "EDITEUR")
    return m
  }, [parEnseigne])

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return comptes.filter(c =>
      (enseigneFiltre === "all" || (c.brandSlug ?? EDITEUR_KEY) === enseigneFiltre) &&
      (roleFiltre === "all" || c.role === roleFiltre) &&
      (!q || `${c.name} ${c.email} ${c.brandName ?? ""}`.toLowerCase().includes(q)),
    )
  }, [comptes, enseigneFiltre, roleFiltre, recherche])

  // ---------------------------------------------------------------- sécurité & activité (C-3)

  /** Le journal est-il exploitable (chargé, sans erreur) ? */
  const auditOk = auditLogs !== null && !auditError

  /** Activité par acteur du journal, triée par dernière action décroissante. */
  const activites = useMemo(() => {
    if (!auditLogs) return [] as ActiviteCompte[]
    const m = new Map<string, ActiviteCompte>()
    for (const l of auditLogs) {
      const a = m.get(l.acteurEmail) ?? {
        email: l.acteurEmail, nom: l.acteurNom, role: l.acteurRole,
        total: 0, sensibles: 0, dernier: null, modules: [] as string[],
      }
      a.total += 1
      if (l.severite === "SENSIBLE" || l.severite === "CRITIQUE") a.sensibles += 1
      if (!a.modules.includes(l.module)) a.modules.push(l.module)
      if (!a.dernier || l.createdAt >= a.dernier.createdAt) a.dernier = l
      m.set(l.acteurEmail, a)
    }
    return Array.from(m.values()).sort((x, y) =>
      (y.dernier?.createdAt ?? "").localeCompare(x.dernier?.createdAt ?? "") || y.total - x.total)
  }, [auditLogs])

  const activiteParEmail = useMemo(() => new Map(activites.map(a => [a.email, a])), [activites])

  /** Chiffres de traçabilité du journal (checklist & en-têtes). */
  const secuStats = useMemo(() => {
    const logs = auditLogs ?? []
    return {
      total: logs.length,
      sensibles: logs.filter(l => l.severite === "SENSIBLE" || l.severite === "CRITIQUE").length,
      modules: new Set(logs.map(l => l.module)).size,
      impersonations: logs.filter(l => /impersonation/i.test(l.action)).length,
    }
  }, [auditLogs])

  /** Actifs sans trace au journal OU dernière action > 90 jours → suggestion de désactivation. */
  const dormants = useMemo(() => {
    if (auditError || !auditLogs) return null
    const now = Date.now()
    return comptes
      .filter(c => c.active)
      .map((c): CompteDormant | null => {
        const a = activiteParEmail.get(c.email)
        if (a?.dernier) {
          const jours = Math.floor((now - new Date(a.dernier.createdAt).getTime()) / 86_400_000)
          if (jours <= SEUIL_DORMANCE_J) return null
          return { compte: c, activite: a, joursSansActivite: jours }
        }
        return { compte: c, activite: a ?? null, joursSansActivite: null }
      })
      .filter((d): d is CompteDormant => d !== null)
      .sort((x, y) => (y.joursSansActivite ?? Number.MAX_SAFE_INTEGER) - (x.joursSansActivite ?? Number.MAX_SAFE_INTEGER))
  }, [comptes, activiteParEmail, auditLogs, auditError])

  /** Accès suspendus portant un rôle à privilèges (SUPER_ADMIN / ADMIN). */
  const inactifsSensibles = useMemo(
    () => comptes.filter(c => !c.active && (c.role === "SUPER_ADMIN" || c.role === "ADMIN")),
    [comptes],
  )

  // ---------------------------------------------------------------- rendu

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Erreur de chargement</p>
            <p className="text-xs text-red-600/90 dark:text-red-400/80">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={retry}>Réessayer</Button>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Chargement des comptes">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Card>
          <CardHeader><Skeleton className="h-4 w-64" /></CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 rounded-lg" />
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---------------------------------------------------------------- colonnes DataViews

  const columns: DataViewColumn<CompteDTO>[] = [
    {
      key: "compte", header: "Compte", sortValue: c => c.name,
      render: c => (
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{c.name}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{c.email}</p>
        </div>
      ),
    },
    {
      key: "enseigne", header: "Enseigne", sortValue: c => c.brandName ?? "",
      render: c => {
        if (!c.brandSlug) {
          return <span className="text-[11px] italic text-muted-foreground">Équipe CarbuScope</span>
        }
        const p = pastille(CLIENT_SAAS_META, clientSaaSParSlug.get(c.brandSlug) ?? "")
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-xs font-medium">{c.brandName}</span>
            <Badge variant="outline" className={cn("h-4 gap-1 px-1.5 text-[10px]", p.className)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", p.point)} aria-hidden />
              {p.label}
            </Badge>
          </div>
        )
      },
    },
    {
      key: "role", header: "Rôle", sortValue: c => SA_ROLE_META[c.role] ?? c.role,
      render: c => {
        const p = pastille(ROLE_PASTILLE, c.role)
        return <Badge variant="outline" className={cn("text-[10px]", p.className)}>{p.label}</Badge>
      },
    },
    {
      key: "statut", header: "Statut", align: "center",
      render: c => (
        <Switch
          checked={c.active}
          disabled={enCours.has(c.id)}
          onCheckedChange={() => void basculerActif(c)}
          aria-label={`${c.active ? "Désactiver" : "Réactiver"} le compte ${c.name}`}
        />
      ),
      sortValue: c => (c.active ? 1 : 0),
    },
    {
      key: "cree", header: "Créé le", sortValue: c => new Date(c.createdAt).getTime(),
      render: c => <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{formatDate(c.createdAt)}</span>,
    },
    {
      key: "actions", header: "Actions", align: "right",
      render: c => (
        <div className="flex items-center justify-end gap-1">
          {c.brandSlug && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-violet-600 hover:text-violet-700 dark:text-violet-400"
                    disabled={!c.active}
                    onClick={() => setCibleImpersonation(c)}
                    aria-label={`Voir le portail en tant que ${c.name}`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="left">
                {c.active ? "Voir le portail en tant que…" : "Compte inactif — impersonation indisponible"}
              </TooltipContent>
            </Tooltip>
          )}
          {!c.active && (
            <Button
              variant="outline" size="sm" className="h-7 px-2 text-[11px]"
              disabled={enCours.has(c.id)}
              onClick={() => void basculerActif(c)}
            >
              {enCours.has(c.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
              Réactiver
            </Button>
          )}
        </div>
      ),
    },
  ]

  const renderCard = (c: CompteDTO) => (
    <Card className={cn("overflow-hidden", !c.active && "border-amber-300/70 dark:border-amber-800/60")}>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-snug">{c.name}</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{c.email}</p>
          </div>
          <Badge variant="outline" className={cn("shrink-0 text-[10px]", pastille(ROLE_PASTILLE, c.role).className)}>
            {pastille(ROLE_PASTILLE, c.role).label}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {c.brandSlug ? (
            <>
              <span className="font-medium text-foreground">{c.brandName}</span>
              <Badge variant="outline" className={cn("h-4 px-1.5 text-[10px]", pastille(CLIENT_SAAS_META, clientSaaSParSlug.get(c.brandSlug) ?? "").className)}>
                {pastille(CLIENT_SAAS_META, clientSaaSParSlug.get(c.brandSlug) ?? "").label}
              </Badge>
            </>
          ) : (
            <span className="italic">Équipe CarbuScope (éditeur)</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[11px] tabular-nums text-muted-foreground">créé le {formatDate(c.createdAt)}</span>
          <div className="flex items-center gap-1.5">
            {!c.active && (
              <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" disabled={enCours.has(c.id)} onClick={() => void basculerActif(c)}>
                Réactiver
              </Button>
            )}
            {c.brandSlug && (
              <Button
                variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px] text-violet-700 dark:text-violet-400"
                disabled={!c.active}
                onClick={() => setCibleImpersonation(c)}
              >
                <Eye className="h-3 w-3" /> Portail
              </Button>
            )}
            <Switch
              checked={c.active}
              disabled={enCours.has(c.id)}
              onCheckedChange={() => void basculerActif(c)}
              aria-label={`${c.active ? "Désactiver" : "Réactiver"} le compte ${c.name}`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )

  // ---------------------------------------------------------------- matrice des rôles

  const onglets: { key: Tab; label: string }[] = (Object.keys(TAB_ACCESS) as Tab[]).map(t => ({ key: t, label: TAB_LABELS[t] }))
  const lignesSpeciales: { label: string; roles: Role[]; note: string }[] = [
    { label: "Portail enseigne (terrain & validation)", roles: ROLES.filter(r => r !== "SUPER_ADMIN"), note: "Espace propre à chaque enseigne cliente." },
    { label: "Back-office CarbuScope (modération)", roles: ["ADMIN"], note: "Réservé à l'équipe de l'éditeur." },
    { label: "Super Administration (cet espace)", roles: ["SUPER_ADMIN"], note: "Poste de pilotage de l'éditeur SaaS." },
  ]

  const cellule = (autorise: boolean) =>
    autorise
      ? <Check className="mx-auto h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-label="Autorisé" />
      : <Minus className="mx-auto h-3.5 w-3.5 text-muted-foreground/50" aria-label="Non autorisé" />

  // ---------------------------------------------------------------- journal d'activité par compte (C-3)

  const colonnesActivite: DataViewColumn<ActiviteCompte>[] = [
    {
      key: "compte", header: "Compte", sortValue: a => a.nom,
      render: a => (
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{a.nom}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{a.email}</p>
          <Badge variant="outline" className={cn("mt-0.5 h-4 px-1.5 text-[9px]", pastille(ROLE_PASTILLE, a.role).className)}>
            {pastille(ROLE_PASTILLE, a.role).label}
          </Badge>
        </div>
      ),
    },
    {
      key: "derniere", header: "Dernière activité",
      sortValue: a => (a.dernier ? new Date(a.dernier.createdAt).getTime() : 0),
      render: a => a.dernier ? (
        <div className="min-w-0">
          <p className="whitespace-nowrap text-xs font-medium" title={dateAbsolue(a.dernier.createdAt)}>
            {relTime(a.dernier.createdAt)}
          </p>
          <p className="max-w-[260px] truncate text-[11px] text-muted-foreground" title={a.dernier.action}>
            {a.dernier.action}
          </p>
        </div>
      ) : (
        <span className="text-[11px] italic text-muted-foreground">aucune</span>
      ),
    },
    {
      key: "total", header: "Actions totales", align: "center",
      sortValue: a => a.total,
      render: a => <span className="text-xs font-semibold tabular-nums">{formatInt(a.total)}</span>,
    },
    {
      key: "sensibles", header: "Sensibles", align: "center",
      sortValue: a => a.sensibles,
      render: a => a.sensibles > 0 ? (
        <Badge
          variant="outline"
          className="h-5 px-1.5 text-[10px] font-semibold border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
          title="Actions de sévérité SENSIBLE ou CRITIQUE"
        >
          {formatInt(a.sensibles)}
        </Badge>
      ) : (
        <span className="text-[11px] tabular-nums text-muted-foreground" title="Aucune action sensible">0</span>
      ),
    },
    {
      key: "modules", header: "Modules",
      sortValue: a => a.modules.join(","),
      render: a => (
        <div className="flex max-w-[230px] flex-wrap gap-1">
          {a.modules.map(mo => (
            <Badge key={mo} variant="outline" className={cn("h-4 px-1.5 text-[9px]", MODULE_BADGE[mo])}>
              {MODULE_META[mo] ?? mo}
            </Badge>
          ))}
        </div>
      ),
    },
  ]

  const renderCarteActivite = (a: ActiviteCompte) => (
    <Card className="overflow-hidden">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-snug">{a.nom}</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{a.email}</p>
          </div>
          <Badge variant="outline" className={cn("shrink-0 text-[10px]", pastille(ROLE_PASTILLE, a.role).className)}>
            {pastille(ROLE_PASTILLE, a.role).label}
          </Badge>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {a.dernier ? (
            <>
              Dernière action <span className="font-medium text-foreground" title={dateAbsolue(a.dernier.createdAt)}>{relTime(a.dernier.createdAt)}</span>
              {" — "}{a.dernier.action}
            </>
          ) : (
            "Aucune activité tracée"
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span><span className="font-semibold tabular-nums text-foreground">{formatInt(a.total)}</span> action{a.total > 1 ? "s" : ""}</span>
          {a.sensibles > 0 ? (
            <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-semibold border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
              {formatInt(a.sensibles)} sensible{a.sensibles > 1 ? "s" : ""}
            </Badge>
          ) : (
            <span>aucune action sensible</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1 pt-1">
          {a.modules.map(mo => (
            <Badge key={mo} variant="outline" className={cn("h-4 px-1.5 text-[9px]", MODULE_BADGE[mo])}>
              {MODULE_META[mo] ?? mo}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  )

  // ---------------------------------------------------------------- checklist sécurité d'accès (C-3)

  const indispoJournal = "Journal d'audit indisponible — vérification impossible."
  // Couverture 2FA réelle (V7) : comptes actifs protégés par TOTP
  const comptesActifs = comptes.filter(c => c.active)
  const totpActifs = comptesActifs.filter(c => c.totpEnabled).length
  const pct2fa = comptesActifs.length ? Math.round((totpActifs / comptesActifs.length) * 100) : 0
  const parEnseigne2fa = new Map<string, { total: number; prot: number }>()
  for (const c of comptesActifs) {
    const cle = c.brandName ?? "CarbuScope (éditeur)"
    const e = parEnseigne2fa.get(cle) ?? { total: 0, prot: 0 }
    e.total += 1
    if (c.totpEnabled) e.prot += 1
    parEnseigne2fa.set(cle, e)
  }
  const comptes2fa = comptesActifs.filter(c => c.totpEnabled)
  const checklistSecu: { fait: boolean; label: string; detail: string }[] = [
    {
      fait: auditOk && secuStats.sensibles > 0,
      label: "Journal d'audit actif sur toutes les actions sensibles",
      detail: auditOk
        ? `${formatInt(secuStats.sensibles)} action${secuStats.sensibles > 1 ? "s" : ""} sensible${secuStats.sensibles > 1 ? "s" : ""} ou critique${secuStats.sensibles > 1 ? "s" : ""} tracée${secuStats.sensibles > 1 ? "s" : ""} sur ${formatInt(secuStats.modules)} modules (${formatInt(secuStats.total)} entrées au total).`
        : indispoJournal,
    },
    {
      fait: true,
      label: "Rôles restreints par onglets (TAB_ACCESS)",
      detail: `${ROLES.length} rôles pilotés sur ${onglets.length} onglets de l'Observatoire — matrice ci-dessus.`,
    },
    {
      fait: auditOk && secuStats.impersonations > 0,
      label: "Impersonation Super Admin tracée",
      detail: auditOk
        ? secuStats.impersonations > 0
          ? `${formatInt(secuStats.impersonations)} session${secuStats.impersonations > 1 ? "s" : ""} d'impersonation au journal, avertissement systématique avant ouverture du portail.`
          : "Avertissement systématique avant ouverture du portail — aucune session d'impersonation enregistrée pour l'instant."
        : indispoJournal,
    },
    {
      fait: true,
      label: "Révocation immédiate des clés API",
      detail: "Bascule d'urgence depuis Configuration → Clés API, effet immédiat et tracée à l'audit.",
    },
    { fait: totpActifs > 0, label: "2FA TOTP", detail: totpActifs > 0 ? `Active (V7) : ${formatInt(totpActifs)} compte(s) protégé(s) par un code TOTP à 6 chiffres à la connexion.` : "Mécanisme TOTP actif (V7) — aucun compte ne l'a encore activée : invitez vos utilisateurs via le menu utilisateur." },
    { fait: false, label: "Expiration automatique des sessions dormantes", detail: `À coupler au seuil de ${SEUIL_DORMANCE_J} jours du panneau « Comptes dormants ».` },
    { fait: false, label: "Politique de mots de passe complexes", detail: "Longueur minimale et mixité de classes à imposer à la création des comptes." },
    { fait: false, label: "Verrouillage après échecs répétés", detail: "Gel temporaire de l'accès après un nombre d'échecs de connexion consécutifs." },
  ]
  const secuFait = checklistSecu.filter(c => c.fait).length

  // ---------------------------------------------------------------- formulaire création (composant stable)

  // (DialogCreation — composant de premier niveau, cf. plus haut)

  // ---------------------------------------------------------------- rendu principal

  return (
    <div className="space-y-4">
      {/* ---------- KPI ---------- */}
      <section aria-label="Indicateurs clés des comptes" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Comptes au total" value={formatInt(stats.total)} icon={Users} sub="Tous espaces confondus (éditeur + enseignes)" />
        <KpiCard label="Comptes actifs" value={formatInt(stats.actifs)} icon={UserCheck} tone="success" sub="accès en service — bascule instantanée, tracée à l'audit" />
        <KpiCard label="Équipe CarbuScope" value={formatInt(stats.editeur)} icon={Crown} tone="info" sub={`dont ${stats.superAdmins} Super Admin (accès complet)`} />
        <KpiCard label="Comptes enseignes" value={formatInt(stats.enseignes)} icon={Building2} sub={`répartis sur ${stats.nbEnseignes} enseigne${stats.nbEnseignes > 1 ? "s" : ""} cliente${stats.nbEnseignes > 1 ? "s" : ""}`} />
        <KpiCard
          label="Comptes inactifs" value={formatInt(stats.inactifs)} icon={UserX}
          tone={stats.inactifs > 0 ? "warning" : "success"}
          sub={stats.inactifs > 0 ? "à réactiver ? — accès suspendu" : "aucun accès suspendu"}
        />
      </section>

      {/* ---------- Répartition par enseigne ---------- */}
      <section aria-label="Répartition des comptes par enseigne">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Répartition par enseigne</h2>
          {enseigneFiltre !== "all" && (
            <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => setEnseigneFiltre("all")}>
              <X className="h-3 w-3" /> Retirer le filtre « {parEnseigne.find(pe => (pe.slug ?? EDITEUR_KEY) === enseigneFiltre)?.nom ?? enseigneFiltre} »
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {parEnseigne.map(pe => {
            const key = pe.slug ?? EDITEUR_KEY
            const selectionne = enseigneFiltre === key
            const p = pe.clientSaaS ? pastille(CLIENT_SAAS_META, pe.clientSaaS) : null
            return (
              <button
                key={key}
                type="button"
                onClick={() => setEnseigneFiltre(selectionne ? "all" : key)}
                aria-pressed={selectionne}
                className={cn(
                  "rounded-lg border p-3 text-left shadow-xs transition-all hover:shadow-md focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:outline-none",
                  selectionne
                    ? "border-violet-400 bg-violet-50/70 dark:border-violet-700 dark:bg-violet-950/40"
                    : "border-border bg-card hover:border-violet-300/70 dark:hover:border-violet-800",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-semibold">{pe.nom}</p>
                  {p ? (
                    <Badge variant="outline" className={cn("h-5 shrink-0 gap-1 px-1.5 text-[10px]", p.className)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", p.point)} aria-hidden />
                      {p.label}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="h-5 shrink-0 border-violet-300 bg-violet-50 px-1.5 text-[10px] text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400">
                      Éditeur
                    </Badge>
                  )}
                </div>
                <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
                  {pe.actifs}/{pe.total} compte{pe.total > 1 ? "s" : ""} actif{pe.actifs > 1 ? "s" : ""}
                </p>
                {pe.total - pe.actifs > 0 && (
                  <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                    {pe.total - pe.actifs} inactif{pe.total - pe.actifs > 1 ? "s" : ""} — à réactiver ?
                  </p>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* ---------- Liste des comptes ---------- */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle>Comptes & accès</CardTitle>
              <CardDescription>
                {filtres.length} compte{filtres.length > 1 ? "s" : ""} affiché{filtres.length > 1 ? "s" : ""} sur {stats.total} — bascule d&apos;état instantanée, actions auditées
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0 border-violet-200 px-2.5 text-[11px] text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950"
                title="Télécharger tous les comptes (rôles, enseignes, état, activité tracée) au format CSV — séparateur « ; », dates ISO."
                aria-label="Exporter les comptes au format CSV"
                onClick={() => { window.location.href = "/api/super/export?type=comptes" }}
              >
                <Download className="h-3.5 w-3.5" /> Exporter CSV
              </Button>
              <Button size="sm" className="h-8 shrink-0 bg-violet-600 text-white hover:bg-violet-700" onClick={() => setDialogCreation(true)}>
                <UserPlus className="h-3.5 w-3.5" />
                Créer un compte
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Select value={enseigneFiltre} onValueChange={v => setEnseigneFiltre(v)}>
              <SelectTrigger size="sm" className="w-[200px]" aria-label="Filtrer par enseigne">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les enseignes</SelectItem>
                {parEnseigne.map(pe => (
                  <SelectItem key={pe.slug ?? EDITEUR_KEY} value={pe.slug ?? EDITEUR_KEY}>
                    {pe.nom} · {pe.actifs}/{pe.total}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={roleFiltre} onValueChange={setRoleFiltre}>
              <SelectTrigger size="sm" className="w-[190px]" aria-label="Filtrer par rôle">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les rôles</SelectItem>
                {ROLES.map(r => <SelectItem key={r} value={r}>{SA_ROLE_META[r]}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative min-w-[180px] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={recherche}
                onChange={e => setRecherche(e.target.value)}
                placeholder="Rechercher (nom, e-mail, enseigne)…"
                className="h-8 pl-8 text-xs"
                aria-label="Rechercher un compte"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataViews
            viewKey="sa-comptes"
            columns={columns}
            rows={filtres}
            rowKey={c => c.id}
            renderCard={renderCard}
            cardColumns={2}
            emptyMessage="Aucun compte pour ces filtres."
            maxHeightClassName="max-h-96"
            nested={{
              groupKey: c => c.brandSlug ?? EDITEUR_KEY,
              groupLabel: (gk, grows) => {
                const nom = grows[0]?.brandName ?? parEnseigne.find(pe => (pe.slug ?? EDITEUR_KEY) === gk)?.nom ?? gk
                const actifs = grows.filter(c => c.active).length
                return (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {nom}
                    <span className="text-[11px] font-normal text-primary/70">
                      — {actifs}/{grows.length} actif{actifs > 1 ? "s" : ""}
                    </span>
                  </span>
                )
              },
              groupSortValue: (gk, grows) => grows.length,
              hideColumnKeyInGroups: "enseigne",
              defaultOpen: "first",
            }}
          />
        </CardContent>
      </Card>

      {/* ---------- Matrice des rôles ---------- */}
      <Card>
        <CardHeader>
          <CardTitle>Matrice des rôles & espaces</CardTitle>
          <CardDescription>
            Périmètre d&apos;accès par rôle — construit dynamiquement depuis les droits de la plateforme (onglets de l&apos;Observatoire, portails et back-office).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-primary/20 bg-primary/10 hover:bg-primary/10">
                  <TableHead className="text-primary">Espace / onglet</TableHead>
                  {ROLES.map(r => {
                    const p = pastille(ROLE_PASTILLE, r)
                    return (
                      <TableHead key={r} className="text-center text-primary">
                        <Badge variant="outline" className={cn("h-5 whitespace-nowrap px-1.5 text-[9px]", p.className)}>{p.label}</Badge>
                      </TableHead>
                    )
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {onglets.map(o => (
                  <TableRow key={o.key} className="hover:bg-muted/40">
                    <TableCell className="py-1.5 text-xs font-medium">{o.label}</TableCell>
                    {ROLES.map(r => (
                      <TableCell key={r} className="py-1.5 text-center">{cellule(TAB_ACCESS[o.key].includes(r))}</TableCell>
                    ))}
                  </TableRow>
                ))}
                {lignesSpeciales.map(l => (
                  <TableRow key={l.label} className="border-t-2 border-primary/10 bg-muted/20 hover:bg-muted/30">
                    <TableCell className="py-1.5">
                      <p className="text-xs font-semibold">{l.label}</p>
                      <p className="text-[10px] text-muted-foreground">{l.note}</p>
                    </TableCell>
                    {ROLES.map(r => (
                      <TableCell key={r} className="py-1.5 text-center">{cellule(l.roles.includes(r))}</TableCell>
                    ))}
                  </TableRow>
                ))}
                <TableRow className="border-t-2 border-primary/10 bg-muted/10">
                  <TableCell className="py-1.5">
                    <p className="text-xs font-semibold">Application mobile B2C</p>
                    <p className="text-[10px] text-muted-foreground">Grand public — aucun compte requis.</p>
                  </TableCell>
                  <TableCell colSpan={ROLES.length} className="py-1.5 text-center text-[11px] italic text-muted-foreground">
                    Accès libre (aucun rôle applicable)
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            Le Super Admin peut ouvrir n&apos;importe quel portail enseigne via l&apos;impersonation (action tracée) ; les rôles enseigne héritent des onglets ci-dessus dans l&apos;Observatoire.
          </p>
        </CardContent>
      </Card>

      {/* ---------- Sécurité & activité des comptes (C-3) ---------- */}
      <section aria-labelledby="sa-secu-titre" className="space-y-4">
        <h2 id="sa-secu-titre" className="text-sm font-semibold text-foreground">
          Sécurité &amp; activité des comptes
        </h2>

        {/* Journal d'activité par compte */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
                  Journal d&apos;activité par compte
                </CardTitle>
                <CardDescription>
                  {auditOk
                    ? `Agrégé depuis le journal d'audit — ${formatInt(secuStats.total)} actions tracées, dont ${formatInt(secuStats.sensibles)} sensibles ou critiques.`
                    : "Dernières actions, volumes et modules touchés, agrégés par acteur du journal d'audit."}
                </CardDescription>
              </div>
              <Button
                variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-[11px]"
                onClick={() => setAuditKey(k => k + 1)}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Actualiser
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {auditError ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50/60 px-3 py-2 dark:border-red-900 dark:bg-red-950/30"
              >
                <p className="text-xs text-red-700 dark:text-red-400">{auditError}</p>
                <Button variant="outline" size="sm" onClick={retry}>Réessayer</Button>
              </div>
            ) : !auditLogs ? (
              <div className="space-y-2" aria-busy="true" aria-label="Chargement du journal d'activité">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ) : activites.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                Aucune action tracée au journal d&apos;audit pour le moment.
              </p>
            ) : (
              <DataViews
                viewKey="sa-activite"
                columns={colonnesActivite}
                rows={activites}
                rowKey={a => a.email}
                renderCard={renderCarteActivite}
                cardColumns={2}
                emptyMessage="Aucune activité à afficher."
                maxHeightClassName="max-h-96"
              />
            )}
          </CardContent>
        </Card>

        {/* Comptes à risque — panneau déduit des données réelles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
              Comptes à risque
            </CardTitle>
            <CardDescription>
              Panneau déduit des données réelles — croise les comptes actifs avec le journal d&apos;audit et les rôles à privilèges.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            {/* Comptes dormants */}
            <div className="min-w-0 overflow-hidden rounded-lg border border-amber-200/80 bg-amber-50/40 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
              <div className="flex items-center justify-between gap-2">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                  <History className="h-3.5 w-3.5" aria-hidden />
                  Comptes dormants
                </h4>
                <Badge
                  variant="outline"
                  className="h-5 shrink-0 border-amber-300 bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
                >
                  {dormants ? formatInt(dormants.length) : "…"}
                </Badge>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                Comptes actifs sans action tracée au journal ou dont la dernière action date de plus de
                {" "}{SEUIL_DORMANCE_J} jours — à désactiver ?
              </p>
              {auditError ? (
                <p
                  role="alert"
                  className="mt-3 rounded-md border border-red-200 bg-red-50/60 px-3 py-2 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400"
                >
                  Journal d&apos;audit indisponible — la détection de dormance ne peut pas être vérifiée.
                </p>
              ) : !dormants ? (
                <div className="mt-2 space-y-1.5" aria-busy="true" aria-label="Détection des comptes dormants">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : dormants.length === 0 ? (
                <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[11px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400">
                  Aucun compte dormant — tous les accès actifs ont une action tracée récente (≤ {SEUIL_DORMANCE_J} jours).
                </p>
              ) : (
                <ul className="mt-2 max-h-96 space-y-1.5 overflow-y-auto pr-1" aria-label="Comptes dormants">
                  {dormants.map(({ compte: c, activite: a, joursSansActivite: j }) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{c.name}</p>
                        <p className="truncate font-mono text-[10px] text-muted-foreground">{c.email}</p>
                        <p
                          className="truncate text-[10px] text-amber-700 dark:text-amber-400"
                          title={a?.dernier ? `${dateAbsolue(a.dernier.createdAt)} — ${a.dernier.action}` : undefined}
                        >
                          {j === null ? "Aucune activité tracée" : `Dernière action il y a ${j} jours`}
                          {c.brandSlug ? ` · ${c.brandName}` : " · équipe éditeur"}
                        </p>
                      </div>
                      <Button
                        variant="outline" size="sm"
                        className="h-7 shrink-0 gap-1 border-amber-300 px-2 text-[11px] text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
                        disabled={enCours.has(c.id)}
                        onClick={() => void basculerActif(c)}
                        aria-label={`Désactiver le compte dormant ${c.name}`}
                      >
                        {enCours.has(c.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserX className="h-3 w-3" />}
                        Désactiver ?
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[10px] italic leading-snug text-muted-foreground">
                Le journal de démonstration ne trace que l&apos;espace Super Administration :
                l&apos;absence de trace ne préjuge pas d&apos;une inactivité côté enseigne.
              </p>
            </div>

            {/* Inactifs à rôle sensible */}
            <div className="min-w-0 overflow-hidden rounded-lg border border-red-200/80 bg-red-50/40 p-3 dark:border-red-900/60 dark:bg-red-950/20">
              <div className="flex items-center justify-between gap-2">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-red-800 dark:text-red-300">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  Inactifs à rôle sensible
                </h4>
                <Badge
                  variant="outline"
                  className="h-5 shrink-0 gap-1 border-red-300 bg-red-50 px-1.5 text-[10px] font-semibold text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
                  {formatInt(inactifsSensibles.length)}
                </Badge>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                Accès suspendus portant un rôle SUPER_ADMIN ou ADMIN — risque de réactivation non contrôlée.
              </p>
              {inactifsSensibles.length === 0 ? (
                <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[11px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400">
                  Aucun compte inactif à rôle sensible — les accès suspendus actuels portent des rôles limités.
                </p>
              ) : (
                <ul className="mt-2 max-h-96 space-y-1.5 overflow-y-auto pr-1" aria-label="Comptes inactifs à rôle sensible">
                  {inactifsSensibles.map(c => (
                    <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <span
                          className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500"
                          aria-hidden
                          title="Risque de réactivation non contrôlée"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold">{c.name}</p>
                          <p className="truncate font-mono text-[10px] text-muted-foreground">{c.email}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {pastille(ROLE_PASTILLE, c.role).label}
                            {c.brandSlug ? ` · ${c.brandName}` : " · équipe éditeur"}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline" size="sm" className="h-7 shrink-0 gap-1 px-2 text-[11px]"
                        onClick={() => setRecherche(c.email)}
                        aria-label={`Localiser ${c.name} dans la liste des comptes`}
                      >
                        <Search className="h-3 w-3" />
                        Localiser
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 2FA TOTP — RÉELLE depuis la V7 : couverture, réinitialisation Super Admin */}
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Lock className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
              Authentification à deux facteurs (2FA)
              <Badge
                variant="outline"
                className="h-5 border-emerald-300 bg-emerald-50 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
              >
                Active — V7
              </Badge>
            </CardTitle>
            <CardDescription>
              TOTP (RFC 6238) activable par chaque compte depuis son menu utilisateur — code à 6 chiffres
              exigé à la connexion. En cas de téléphone perdu, la Super Administration réinitialise l&apos;accès ci-dessous.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Couverture */}
            <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold tabular-nums tracking-tight">{pct2fa}%</p>
                <p className="text-xs text-muted-foreground">
                  de couverture — <span className="font-semibold text-foreground">{formatInt(totpActifs)}</span>/{formatInt(comptesActifs.length)} comptes actifs protégés
                </p>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct2fa} aria-valuemin={0} aria-valuemax={100} aria-label="Couverture 2FA des comptes actifs">
                <div
                  className={`h-full rounded-full transition-all ${pct2fa >= 60 ? "bg-emerald-500" : pct2fa >= 25 ? "bg-amber-500" : "bg-slate-400"}`}
                  style={{ width: `${Math.min(100, pct2fa)}%` }}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(parEnseigne2fa.entries()).map(([nom, e]) => (
                <Badge
                  key={nom}
                  variant="outline"
                  className={`h-5 text-[10px] font-medium ${e.prot > 0 ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" : "text-muted-foreground"}`}
                >
                  {nom} · {e.prot}/{e.total}
                </Badge>
              ))}
            </div>

            {/* Comptes protégés + réinitialisation */}
            <div className="rounded-lg border">
              <p className="flex items-center gap-1.5 border-b px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                Comptes protégés ({comptes2fa.length})
              </p>
              {comptes2fa.length === 0 ? (
                <p className="px-3 py-3 text-xs leading-relaxed text-muted-foreground">
                  Aucun compte n&apos;a encore activé la 2FA. Chaque utilisateur peut le faire en un scan QR
                  depuis son menu utilisateur (en-tête → Sécurité) — les rôles SUPER_ADMIN devraient être couverts en premier.
                </p>
              ) : (
                <ul className="max-h-44 overflow-y-auto">
                  {comptes2fa.map(c => (
                    <li key={c.id} className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0">
                      <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium leading-tight">{c.name}</span>
                        <span className="block truncate text-[10.5px] leading-tight text-muted-foreground">
                          {c.email} · {c.brandName ?? "équipe éditeur"}
                        </span>
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 border-amber-300 text-[11px] font-medium text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950"
                        onClick={() => setCibleReset2fa(c)}
                        disabled={enCours.has(c.id)}
                      >
                        {enCours.has(c.id) ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <KeyRound className="h-3 w-3" aria-hidden />}
                        Réinitialiser
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Étapes (3 actives + 1 prévue) */}
            <ol className="grid gap-3 lg:grid-cols-4" aria-label="Étapes du dispositif 2FA">
              {ETAPES_2FA.map((etape, i) => {
                const Icone = etape.icone
                const prevu = etape.detail === "Prévu"
                return (
                  <li key={etape.titre} className="relative">
                    <Card className={`h-full ${prevu ? "border-dashed" : ""}`}>
                      <CardContent className="flex h-full flex-col gap-2 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${prevu ? "bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"}`}>
                            <Icone className="h-4 w-4" aria-hidden />
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[9px] font-semibold uppercase tracking-wide ${prevu ? "text-slate-500 dark:text-slate-400" : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"}`}
                          >
                            {prevu ? "prévu" : "actif"}
                          </Badge>
                        </div>
                        <p className="text-sm font-semibold leading-snug">
                          <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>
                          {etape.titre}
                        </p>
                        <p className="text-xs leading-relaxed text-muted-foreground">{etape.description}</p>
                        <p className={`mt-auto pt-2 text-[10px] uppercase tracking-wide ${prevu ? "text-slate-400 dark:text-slate-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                          {etape.detail}
                        </p>
                      </CardContent>
                    </Card>
                    {i < ETAPES_2FA.length - 1 && (
                      <ArrowRight
                        className="absolute -right-3.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-slate-300 lg:block dark:text-slate-700"
                        aria-hidden
                      />
                    )}
                  </li>
                )
              })}
            </ol>
            <p
              role="note"
              className="mt-1 flex items-start gap-1.5 rounded-md border border-emerald-200/80 bg-emerald-50/50 px-3 py-2 text-xs leading-relaxed text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
            >
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Dispositif en place : sessions signées 12 h, mots de passe bcrypt, défi TOTP à la connexion,
              tentatives échouées tracées (module Sécurité de l&apos;audit) et verrouillage anti-force-brute (15 essais / 5 min).
            </p>
          </CardContent>
        </Card>

        {/* Dialog de confirmation — réinitialisation 2FA (V7) */}
        <Dialog open={!!cibleReset2fa} onOpenChange={v => { if (!v) setCibleReset2fa(null) }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-amber-600" aria-hidden />
                Réinitialiser la 2FA ?
              </DialogTitle>
              <DialogDescription>
                {cibleReset2fa && (
                  <>Le secret TOTP de <strong>{cibleReset2fa.name}</strong> ({cibleReset2fa.email}) sera
                  supprimé : ce compte se reconnectera avec son seul mot de passe et devra réactiver la 2FA
                  depuis son menu utilisateur.</>
                )}
              </DialogDescription>
            </DialogHeader>
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              À n&apos;utiliser que sur demande vérifiée du compte (téléphone perdu, changement d&apos;appareil).
              L&apos;action est tracée à l&apos;audit (module Sécurité, sévérité sensible).
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCibleReset2fa(null)}>Annuler</Button>
              <Button
                variant="destructive"
                onClick={() => { if (cibleReset2fa) void reinitialiser2fa(cibleReset2fa) }}
                disabled={cibleReset2fa ? enCours.has(cibleReset2fa.id) : false}
                className="gap-1.5"
              >
                {cibleReset2fa && enCours.has(cibleReset2fa.id) ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
                Réinitialiser la 2FA
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Checklist sécurité d'accès */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
              Checklist sécurité d&apos;accès
            </CardTitle>
            <CardDescription>
              Mesures réellement actives (✓) et mesures prévues (○) — comptées dynamiquement depuis les données du module.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {checklistSecu.map(item => (
                <li key={item.label} className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                      item.fait
                        ? "border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                        : "border-slate-300 text-slate-400 dark:border-slate-700 dark:text-slate-500",
                    )}
                    aria-hidden
                  >
                    {item.fait ? <Check className="h-3 w-3" /> : <Circle className="h-2.5 w-2.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm leading-snug", item.fait ? "text-foreground" : "text-muted-foreground")}>
                      {item.label}
                    </p>
                    <p className="text-[11px] leading-snug text-muted-foreground">{item.detail}</p>
                  </div>
                  <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide">
                    {item.fait ? (
                      <span className="text-emerald-600 dark:text-emerald-400">actif</span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">prévu</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <Separator className="my-4" />
            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                <strong className="font-semibold text-foreground">{secuFait} mesures actives</strong>
                {" · "}{checklistSecu.length - secuFait} prévues — ces dernières dépendent de la mise en place de
                l&apos;authentification réelle (login, sessions), aujourd&apos;hui absente de la démonstration.
              </span>
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ---------- Note d'honnêteté ---------- */}
      <p className="px-1 text-xs italic text-muted-foreground">
        Démo sans authentification réelle — l&apos;impersonation simule le changement de contexte : un simple rechargement
        de page réinitialise la session, et aucune donnée n&apos;est exposée sans validation serveur.
      </p>

      {/* ---------- Dialogues ---------- */}
      <Dialog open={dialogCreation} onOpenChange={setDialogCreation}>
        <DialogCreation onOpenChange={setDialogCreation} parEnseigne={parEnseigne} onCree={() => setReloadKey(k => k + 1)} />
      </Dialog>

      <Dialog open={!!cibleImpersonation} onOpenChange={o => { if (!o) setCibleImpersonation(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
              Voir le portail en tant que…
            </DialogTitle>
            <DialogDescription>
              Impersonation d&apos;un compte enseigne — le bandeau violet de l&apos;en-tête permet de revenir à la Super Administration.
            </DialogDescription>
          </DialogHeader>
          {cibleImpersonation && (
            <div className="space-y-3">
              <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900 dark:bg-violet-950/40">
                <p className="text-sm font-semibold">{cibleImpersonation.name}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{cibleImpersonation.email}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={cn("text-[10px]", pastille(ROLE_PASTILLE, cibleImpersonation.role).className)}>
                    {pastille(ROLE_PASTILLE, cibleImpersonation.role).label}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">{cibleImpersonation.brandName}</Badge>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground" role="alert">
                Vous ouvrirez le portail enseigne sous l&apos;identité <strong className="text-foreground">{cibleImpersonation.name}</strong> —
                toute action y sera tracée au journal d&apos;audit. La session d&apos;impersonation n&apos;est pas persistée
                (un rechargement réinitialise).
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCibleImpersonation(null)}>Annuler</Button>
            <Button
              className="bg-violet-600 text-white hover:bg-violet-700"
              onClick={() => {
                const c = cibleImpersonation
                if (!c || !c.brandSlug) return
                impersonate(c.brandSlug, c.role as Role, `${c.name} · ${c.email}`)
                setMode("portail")
                setCibleImpersonation(null)
                toast.success("Portail enseigne ouvert", {
                  description: `Identité : ${c.name} (${c.email}) — bandeau violet en tête, « Retour Super Admin » pour revenir.`,
                })
              }}
            >
              <Eye className="h-3.5 w-3.5" />
              Ouvrir le portail
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
