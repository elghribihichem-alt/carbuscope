'use client'

// Super Administration — Utilisateurs & accès : comptes par enseigne, suspension
// et prise de main (« impersonation ») : ouvre la session du compte ciblé pour
// diagnostiquer un problème — l'action est journalisée en audit.

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Ban, CheckCircle2, Loader2, LogIn, Info, KeyRound, RefreshCw, ShieldCheck } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { useAppStore, ROLE_LABELS } from "@/store/app-store"
import { applySession } from "@/components/auth/user-menu"
import type { SaasUserDTO } from "@/lib/saas"
import { timeAgo } from "./sa-shared"

type Row = SaasUserDTO & { brandName: string; brandColor: string; contractStatus: string | null }

const initials = (name: string) =>
  name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join("")

export function SaUsers() {
  const session = useAppStore(s => s.session)
  const actor = session?.email ?? "system"
  const [users, setUsers] = useState<Row[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setRefreshing(true)
    try {
      const r = await fetch("/api/super/users")
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      setUsers(j.users)
      setError(null)
    } catch {
      setError("Impossible de charger les utilisateurs.")
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  async function toggleActive(u: Row) {
    setBusyId(u.id)
    try {
      const r = await fetch(`/api/super/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !u.active, actor }),
      })
      if (!r.ok) throw new Error()
      toast.success(`Compte « ${u.name} » ${u.active ? "suspendu" : "réactivé"}`, {
        description: u.active ? "L'utilisateur ne peut plus se connecter." : "L'accès est restauré.",
      })
      await reload()
    } catch {
      toast.error("Échec de la mise à jour du compte.")
    } finally {
      setBusyId(null)
    }
  }

  /** Impersonation V7 : journalise puis ouvre une VRAIE session serveur du
   * compte ciblé (mot de passe démo public). Un compte avec 2FA active refuse
   * la prise de main — comportement de sécurité attendu. */
  async function impersonate(u: Row) {
    if (busyId) return
    setBusyId(u.id)
    try {
      await fetch("/api/super/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "IMPERSONATION",
          message: `Prise de main sur « ${u.name} » (${u.email}) pour diagnostic`,
          actor,
          brandSlug: u.brandSlug,
        }),
      })
    } catch { /* l'audit ne doit pas bloquer la prise de main */ }
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: u.email, password: "carbuscope" }),
      })
      const body = (await r.json().catch(() => ({}))) as { user?: import("@/lib/types").SessionUser; twoFactor?: boolean; error?: string }
      if (r.status === 200 && body.user) {
        applySession(body.user, false)
        toast.info(`Prise de main : ${u.name}`, {
          description: "Session serveur ouverte avec ce compte — déconnectez-vous ou reprenez la main depuis la Super Administration.",
        })
      } else if (body.twoFactor) {
        toast.error("Prise de main refusée", {
          description: "La 2FA est active sur ce compte — elle doit être saisie depuis l'écran de connexion.",
        })
      } else {
        toast.error("Prise de main impossible", { description: body.error ?? `HTTP ${r.status}` })
      }
    } catch {
      toast.error("Échec de la prise de main.")
    } finally {
      setBusyId(null)
    }
  }

  /** V7 — réinitialisation de la 2FA d'un compte (téléphone perdu) : le secret
   * TOTP est supprimé côté serveur, l'utilisateur devra la réactiver. */
  async function resetTotp(u: Row) {
    if (busyId) return
    setBusyId(u.id)
    try {
      const r = await fetch(`/api/super/comptes?id=${encodeURIComponent(u.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetTotp: true }),
      })
      const body = (await r.json().catch(() => ({}))) as { compte?: unknown; error?: string }
      if (r.ok) {
        toast.success("2FA réinitialisée", {
          description: `${u.name} (${u.email}) se reconnecte avec son mot de passe et devra réactiver la double authentification.`,
        })
        await reload()
      } else {
        toast.error("Réinitialisation impossible", { description: body.error ?? `HTTP ${r.status}` })
      }
    } catch {
      toast.error("Échec de la réinitialisation.")
    } finally {
      setBusyId(null)
    }
  }

  const columns = useMemo<DataViewColumn<Row>[]>(() => [
    {
      key: "user",
      header: "Utilisateur",
      render: u => (
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: u.brandColor }}
            aria-hidden
          >
            {initials(u.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{u.name}</p>
            <p className="truncate text-xs text-muted-foreground">{u.email}</p>
          </div>
        </div>
      ),
      sortValue: u => u.name,
    },
    {
      key: "brand",
      header: "Enseigne",
      render: u => (
        <div className="flex items-center gap-2">
          <span className="text-sm">{u.brandName}</span>
          {u.contractStatus === "SUSPENDU" && (
            <Badge variant="outline" className="text-[9px] border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
              contrat suspendu
            </Badge>
          )}
        </div>
      ),
      sortValue: u => u.brandName,
    },
    {
      key: "role",
      header: "Rôle",
      render: u => (
        <Badge variant="secondary" className="text-[10px] font-medium">
          {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}
        </Badge>
      ),
      sortValue: u => u.role,
    },
    {
      key: "lastLogin",
      header: "Dernier accès",
      render: u => (
        <span className={`text-sm ${u.active ? "" : "text-muted-foreground"}`}>
          {u.lastLoginAt ? timeAgo(u.lastLoginAt) : "jamais"}
        </span>
      ),
      sortValue: u => u.lastLoginAt ? new Date(u.lastLoginAt).getTime() : 0,
      hideInCards: true,
    },
    {
      key: "status",
      header: "Statut",
      render: u => (
        <div className="flex flex-wrap items-center justify-center gap-1">
          <Badge variant="outline" className={`text-[10px] ${
            u.active
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
              : "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
          }`}>
            {u.active ? "Actif" : "Suspendu"}
          </Badge>
          {u.totpEnabled && (
            <Badge variant="outline" className="gap-1 border-teal-300 bg-teal-50 text-[10px] text-teal-700 dark:border-teal-700 dark:bg-teal-950 dark:text-teal-300">
              <ShieldCheck className="h-3 w-3" aria-hidden /> 2FA
            </Badge>
          )}
        </div>
      ),
      sortValue: u => (u.active ? 1 : 0),
    },
    {
      key: "actions",
      header: "Actions",
      align: "center",
      sortDisabled: true,
      render: u => {
        if (busyId === u.id) {
          return <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" aria-label="Mise à jour…" />
        }
        return (
          <div className="flex items-center justify-center gap-1.5">
            {u.active && (
              <Button variant="outline" size="sm" className="h-7 gap-1 border-teal-300 px-2 text-xs text-teal-700 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-400 dark:hover:bg-teal-950"
                onClick={() => impersonate(u)} aria-label={`Prendre la main sur ${u.name}`}
                title="Prendre la main (session du compte, action journalisée)">
                <LogIn className="h-3.5 w-3.5" aria-hidden /> Prendre la main
              </Button>
            )}
            {u.active && u.totpEnabled && (
              <Button variant="outline" size="sm" className="h-7 gap-1 border-violet-300 px-2 text-xs text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950"
                onClick={() => resetTotp(u)} aria-label={`Réinitialiser la 2FA de ${u.name}`}
                title="Réinitialiser la 2FA (téléphone perdu — secret TOTP supprimé, action journalisée)">
                <KeyRound className="h-3.5 w-3.5" aria-hidden /> 2FA
              </Button>
            )}
            <Button variant="outline" size="sm" className={`h-7 gap-1 px-2 text-xs ${
              u.active
                ? "border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950"
                : "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
            }`}
              onClick={() => toggleActive(u)} aria-label={u.active ? `Suspendre ${u.name}` : `Réactiver ${u.name}`}>
              {u.active ? <Ban className="h-3.5 w-3.5" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
              {u.active ? "Suspendre" : "Réactiver"}
            </Button>
          </div>
        )
      },
    },
  ], [busyId, impersonate, toggleActive, resetTotp])

  if (error) {
    return <Card><CardContent className="p-6 text-sm text-destructive">{error}</CardContent></Card>
  }
  if (!users) {
    return <Card><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement des comptes…</CardContent></Card>
  }

  return (
    <div className="space-y-3">
      <Card className="border-teal-300 dark:border-teal-800">
        <CardContent className="flex items-start gap-2.5 p-3.5 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden />
          <p>
            <span className="font-semibold">Prise de main (impersonation) :</span> le bouton
            « Prendre la main » ouvre la session du compte sélectionné pour diagnostiquer un
            problème signalé. L&apos;action est journalisée dans le audit et le retour au
            super-admin se fait depuis le menu du compte (en haut à droite).
          </p>
        </CardContent>
      </Card>

      <DataViews<Row>
        viewKey="sa-users"
        rows={users}
        rowKey={u => u.id}
        columns={columns}
        nested={{
          groupKey: u => u.brandName,
          groupLabel: (key, rs) => (
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold">{key}</span>
              <span className="text-xs text-muted-foreground">{rs.filter(u => u.active).length} actif(s) / {rs.length}</span>
            </span>
          ),
          groupSortValue: key => key,
          defaultOpen: "all",
        }}
        renderCard={u => (
          <div className="space-y-2.5 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: u.brandColor }}
                  aria-hidden
                >
                  {initials(u.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-tight">{u.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{u.email}</p>
                </div>
              </div>
              <Badge variant="outline" className={`shrink-0 text-[10px] ${
                u.active
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                  : "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
              }`}>
                {u.active ? "Actif" : "Suspendu"}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{u.brandName} · {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}</span>
              <span>{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "jamais connecté"}</span>
            </div>
            {u.personaId && u.active && (
              <Button variant="outline" size="sm" className="w-full gap-1 border-teal-300 text-xs text-teal-700 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-400 dark:hover:bg-teal-950"
                onClick={() => impersonate(u)}>
                <LogIn className="h-3.5 w-3.5" aria-hidden /> Prendre la main
              </Button>
            )}
          </div>
        )}
        cardColumns={2}
        maxHeightClassName="max-h-[30rem]"
        emptyMessage="Aucun compte."
        toolbarExtra={
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={reload} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden /> Actualiser
          </Button>
        }
      />
    </div>
  )
}
