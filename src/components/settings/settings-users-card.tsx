'use client'

// A.9 — Paramètres : gestion des utilisateurs (multi-comptes, comptes de démonstration)
// T27 : multi-vues DataViews — Tableau / Cartes / Arborescence (par rôle).

import { useState } from "react"
import { toast } from "sonner"
import { Users, UserPlus, Ban, ShieldCheck, Loader2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type Compte = {
  id: string
  nom: string
  email: string
  role: string
  actif: boolean
}

type RoleMeta = { label: string; cls: string; icon: LucideIcon }

const ROLES: Record<string, RoleMeta> = {
  ADMIN: { label: "Administrateur", cls: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400", icon: ShieldCheck },
  NETWORK: { label: "Direction Réseau", cls: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400", icon: Users },
  COMMERCIAL: { label: "Direction Commerciale", cls: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400", icon: Users },
  EXPANSION: { label: "Direction Expansion", cls: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-400", icon: Users },
  VIEWER: { label: "Observateur", cls: "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400", icon: Users },
}

const COMPTES_INITIAUX: Compte[] = [
  { id: "u1", nom: "Administrateur plateforme", email: "admin@carbuscope.tn", role: "ADMIN", actif: true },
  { id: "u2", nom: "Direction Réseau", email: "reseau@agil.tn", role: "NETWORK", actif: true },
  { id: "u3", nom: "Direction Commerciale", email: "commercial@agil.tn", role: "COMMERCIAL", actif: true },
  { id: "u4", nom: "Direction Expansion", email: "expansion@agil.tn", role: "EXPANSION", actif: false },
]

export function SettingsUsersCard() {
  const [comptes, setComptes] = useState<Compte[]>(COMPTES_INITIAUX)
  const [inviteOpen, setInviteOpen] = useState(false)

  const toggleActif = (id: string, actif: boolean) => {
    const c = comptes.find(x => x.id === id)
    setComptes(prev => prev.map(x => (x.id === id ? { ...x, actif } : x)))
    toast[actif ? "success" : "info"](
      actif ? `Compte activé — ${c?.email}` : `Compte désactivé — ${c?.email}`,
      { description: actif ? "L'utilisateur retrouve l'accès au portail enseigne." : "L'accès est suspendu jusqu'à réactivation." }
    )
  }

  const revoke = (c: Compte) => {
    setComptes(prev => prev.filter(x => x.id !== c.id))
    toast.warning("Utilisateur révoqué", {
      description: `${c.email} (${ROLES[c.role]?.label ?? c.role}) n'a plus accès à la plateforme.`,
    })
  }

  const invite = (email: string, role: string) => {
    setComptes(prev => [
      ...prev,
      { id: `u-${Date.now()}`, nom: ROLES[role]?.label ?? role, email, role, actif: true },
    ])
    toast.success("Invitation envoyée", {
      description: `${email} — rôle « ${ROLES[role]?.label ?? role} ». Lien valable 72 h.`,
    })
  }

  // Colonnes DataViews — activation (Switch) et révocation présentes dans les 3 vues.
  const columns: DataViewColumn<Compte>[] = [
    {
      key: "nom", header: "Utilisateur",
      sortValue: (c) => c.nom,
      render: (c) => <span className="text-sm font-medium">{c.nom}</span>,
    },
    {
      key: "email", header: "E-mail",
      sortValue: (c) => c.email,
      render: (c) => <span className="text-sm text-muted-foreground">{c.email}</span>,
    },
    {
      key: "role", header: "Rôle",
      sortValue: (c) => ROLES[c.role]?.label ?? c.role,
      render: (c) => {
        const meta = ROLES[c.role] ?? { label: c.role, cls: "", icon: Users }
        return (
          <Badge variant="outline" className={cn("gap-1", meta.cls)}>
            <meta.icon className="h-3 w-3" aria-hidden /> {meta.label}
          </Badge>
        )
      },
    },
    {
      key: "actif", header: "Actif", align: "center",
      sortValue: (c) => (c.actif ? 1 : 0),
      render: (c) => (
        <Switch
          checked={c.actif}
          onCheckedChange={v => toggleActif(c.id, v)}
          aria-label={`Activer le compte ${c.email}`}
        />
      ),
    },
    {
      key: "actions", header: "Actions", align: "right",
      render: (c) => (
        <Button size="sm" variant="ghost" onClick={() => revoke(c)} className="gap-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
          <Ban className="h-3.5 w-3.5" aria-hidden /> Révoquer
        </Button>
      ),
    },
  ]

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-red-600" aria-hidden /> Gestion des utilisateurs
            </CardTitle>
            <CardDescription>
              Comptes de démonstration multi-rôles — chaque rôle ouvre des onglets distincts (A.1) · 3 modes
              d&apos;affichage.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setInviteOpen(true)} className="gap-1.5">
            <UserPlus className="h-4 w-4" aria-hidden /> Inviter un utilisateur
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <DataViews
          viewKey="settings-users"
          columns={columns}
          rows={comptes}
          rowKey={(c) => c.id}
          emptyMessage="Aucun compte — invitez vos collaborateurs."
          nested={{
            groupKey: (c) => c.role,
            groupLabel: (gk, grows) => {
              const meta = ROLES[gk] ?? { label: gk, cls: "", icon: Users }
              const actifs = grows.filter(c => c.actif).length
              const Icon = meta.icon
              return (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {meta.label}
                  <span className="ml-1 text-[11px] font-normal text-primary/70">
                    — {grows.length} compte{grows.length > 1 ? "s" : ""} · {actifs} actif{actifs > 1 ? "s" : ""}
                  </span>
                </span>
              )
            },
            groupSortValue: (_gk, grows) => grows.length,
            hideColumnKeyInGroups: "role",
            defaultOpen: "first",
          }}
          renderCard={(c) => {
            const meta = ROLES[c.role] ?? { label: c.role, cls: "", icon: Users }
            return (
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
                  <p className="min-w-0 truncate text-sm font-semibold">{c.nom}</p>
                  <Badge variant="outline" className={cn("shrink-0 gap-1", meta.cls)}>
                    <meta.icon className="h-3 w-3" aria-hidden /> {meta.label}
                  </Badge>
                </div>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{c.email}</p>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={c.actif}
                        onCheckedChange={v => toggleActif(c.id, v)}
                        aria-label={`Activer le compte ${c.email}`}
                      />
                      <span className={cn("text-xs font-medium", c.actif ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                        {c.actif ? "Compte actif" : "Compte suspendu"}
                      </span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => revoke(c)} className="gap-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
                      <Ban className="h-3.5 w-3.5" aria-hidden /> Révoquer
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          }}
        />
      </CardContent>

      <InviteUserDialog open={inviteOpen} onClose={() => setInviteOpen(false)} onInvite={invite} />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Dialog d'invitation
// ---------------------------------------------------------------------------

function InviteUserDialog({
  open, onClose, onInvite,
}: {
  open: boolean
  onClose: () => void
  onInvite: (email: string, role: string) => void
}) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("NETWORK")
  const [busy, setBusy] = useState(false)

  const submit = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Adresse e-mail invalide.")
      return
    }
    setBusy(true)
    window.setTimeout(() => {
      onInvite(email.trim(), role)
      setEmail("")
      setRole("NETWORK")
      setBusy(false)
      onClose()
    }, 400)
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4.5 w-4.5 text-emerald-600" aria-hidden /> Inviter un utilisateur
          </DialogTitle>
          <DialogDescription>
            L&apos;utilisateur recevra un lien d&apos;activation valable 72 heures.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="inv-email">Adresse e-mail</Label>
            <Input
              id="inv-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="collaborateur@agil.tn"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Rôle</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger aria-label="Rôle de l'utilisateur invité">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROLES).map(([k, m]) => (
                  <SelectItem key={k} value={k}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Le rôle détermine les onglets accessibles (Administrateur : tout ; Observateur : lecture seule).
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={busy} className="gap-1.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Envoyer l&apos;invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
