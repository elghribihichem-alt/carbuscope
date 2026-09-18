'use client'

// A.9 — Paramètres : gestion des utilisateurs (multi-comptes, comptes de démonstration)

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-red-600" aria-hidden /> Gestion des utilisateurs
            </CardTitle>
            <CardDescription>
              Comptes de démonstration multi-rôles — chaque rôle ouvre des onglets distincts (A.1).
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setInviteOpen(true)} className="gap-1.5">
            <UserPlus className="h-4 w-4" aria-hidden /> Inviter un utilisateur
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utilisateur</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead className="text-center">Actif</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comptes.map(c => {
                const meta = ROLES[c.role] ?? { label: c.role, cls: "", icon: Users }
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nom}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`gap-1 ${meta.cls}`}>
                        <meta.icon className="h-3 w-3" aria-hidden /> {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={c.actif}
                        onCheckedChange={v => toggleActif(c.id, v)}
                        aria-label={`Activer le compte ${c.email}`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => revoke(c)} className="gap-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
                        <Ban className="h-3.5 w-3.5" aria-hidden /> Révoquer
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
              {comptes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    Aucun compte — invitez vos collaborateurs.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
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
