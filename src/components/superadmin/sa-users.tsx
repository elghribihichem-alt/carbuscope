'use client'

// Super Administration — Utilisateurs & accès : comptes par enseigne, suspension
// et prise de main (« impersonation ») : ouvre la session du compte ciblé pour
// diagnostiquer un problème — l'action est journalisée en audit.
// T52-R3 : récapitulatif en tête (actifs / suspendus / 2FA / enseignes),
// recherche nom + e-mail (accents neutralisés), filtres par rôle, suspension
// confirmée par dialogue (pattern R2b SaConfirmDialog) et export CSV du filtre.

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Ban, Building2, CheckCircle2, Download, Loader2, LogIn, Info, KeyRound,
  RefreshCw, Search, ShieldCheck, Users, X,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataViews, type DataViewColumn } from "@/components/ui/data-views"
import { useAppStore, ROLE_LABELS } from "@/store/app-store"
import { applySession } from "@/components/auth/user-menu"
import type { SaasUserDTO } from "@/lib/saas"
import { timeAgo } from "./sa-shared"
import { SaConfirmDialog } from "./sa-confirm-dialog"

type Row = SaasUserDTO & { brandName: string; brandColor: string; contractStatus: string | null }

const initials = (name: string) =>
  name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join("")

/** Recherche insensible à la casse et aux accents (pattern R2b). */
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

// ---------- Export CSV (pattern R2b : BOM UTF-8 + séparateur « ; ») ----------

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

export function SaUsers() {
  const session = useAppStore(s => s.session)
  const actor = session?.email ?? "system"
  const [users, setUsers] = useState<Row[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("TOUS")
  const [pendingSuspend, setPendingSuspend] = useState<Row | null>(null)

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

  // ---- Récapitulatif (sur l'ensemble des comptes, indépendant des filtres) ----

  const stats = useMemo(() => {
    if (!users) return null
    return {
      total: users.length,
      actifs: users.filter(u => u.active).length,
      suspendus: users.filter(u => !u.active).length,
      totp: users.filter(u => u.totpEnabled).length,
      enseignes: new Set(users.filter(u => u.brandSlug).map(u => u.brandSlug)).size,
    }
  }, [users])

  // ---- Filtres : recherche texte (nom / e-mail / enseigne) + chips par rôle ----

  const roleCounts = useMemo(() => {
    if (!users) return []
    const counts = new Map<string, number>()
    for (const u of users) counts.set(u.role, (counts.get(u.role) ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
      .map(([role, count]) => ({ role, count, label: ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role }))
  }, [users])

  const needle = norm(search.trim())

  const rows = useMemo(() => {
    if (!users) return []
    return users.filter(u =>
      (roleFilter === "TOUS" || u.role === roleFilter) &&
      (needle === "" || norm(u.name).includes(needle) || norm(u.email).includes(needle) || norm(u.brandName).includes(needle))
    )
  }, [users, roleFilter, needle])

  function exportCsv() {
    if (rows.length === 0) return
    const lines: string[] = [csvRow(["Nom", "E-mail", "Enseigne", "Rôle", "Statut", "2FA", "Dernier accès"])]
    for (const u of rows) {
      lines.push(csvRow([
        u.name,
        u.email,
        u.brandName,
        ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role,
        u.active ? "Actif" : "Suspendu",
        u.totpEnabled ? "Activée" : "—",
        u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("fr-FR") : "jamais",
      ]))
    }
    const scopeParts = [
      roleFilter !== "TOUS" ? `role-${roleFilter.toLowerCase()}` : "tous-roles",
      needle !== "" ? `recherche-${csvEscape(search.trim()).slice(0, 24)}` : null,
    ].filter(Boolean)
    const filename = `carbuscope-utilisateurs-${scopeParts.join("-")}-${todayStamp()}.csv`
    downloadCsv(filename, lines.join("\r\n"))
    toast.success(`Export CSV téléchargé (${rows.length} compte(s))`, {
      description: `${filename} — filtre ${roleFilter !== "TOUS" ? (ROLE_LABELS[roleFilter as keyof typeof ROLE_LABELS] ?? roleFilter).toLowerCase() : "tous rôles"}${needle !== "" ? ` · recherche « ${search.trim()} »` : ""}.`,
    })
  }

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
              onClick={() => (u.active ? setPendingSuspend(u) : void toggleActive(u))}
              aria-label={u.active ? `Suspendre ${u.name}` : `Réactiver ${u.name}`}>
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
      {/* ---- Récapitulatif (T52-R3) ---- */}
      {stats && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Users className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
              Comptes de la plateforme
              <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
                {stats.total} compte(s) · {stats.enseignes} enseigne(s)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-lg border bg-emerald-50/50 p-3 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
                <p className="text-xl font-bold leading-none tabular-nums text-emerald-700 dark:text-emerald-400">{stats.actifs}</p>
                <p className="mt-1 text-[11px] leading-tight text-muted-foreground">comptes actifs</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-center">
                <p className="text-xl font-bold leading-none tabular-nums text-zinc-600 dark:text-zinc-400">{stats.suspendus}</p>
                <p className="mt-1 text-[11px] leading-tight text-muted-foreground">suspendu(s)</p>
              </div>
              <div className="rounded-lg border bg-teal-50/50 p-3 text-center dark:border-teal-900 dark:bg-teal-950/30">
                <p className="flex items-center justify-center gap-1.5 text-xl font-bold leading-none tabular-nums text-teal-700 dark:text-teal-400">
                  <ShieldCheck className="h-4 w-4" aria-hidden /> {stats.totp}
                </p>
                <p className="mt-1 text-[11px] leading-tight text-muted-foreground">double authentification (2FA)</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-center">
                <p className="flex items-center justify-center gap-1.5 text-xl font-bold leading-none tabular-nums text-amber-700 dark:text-amber-400">
                  <Building2 className="h-4 w-4" aria-hidden /> {stats.enseignes}
                </p>
                <p className="mt-1 text-[11px] leading-tight text-muted-foreground">enseignes représentées</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-teal-300 dark:border-teal-800">
        <CardContent className="flex items-start gap-2.5 p-3.5 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden />
          <p>
            <span className="font-semibold">Prise de main (impersonation) :</span> le bouton
            « Prendre la main » ouvre la session du compte sélectionné pour diagnostiquer un
            problème signalé. L&apos;action est journalisée dans le journal d&apos;audit et le retour au
            super-admin se fait depuis le menu du compte (en haut à droite).
          </p>
        </CardContent>
      </Card>

      {/* ---- Recherche + filtres par rôle (T52-R3) ---- */}
      <Card>
        <CardContent className="space-y-2 p-3.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher par nom, e-mail ou enseigne…"
                className="pl-8 pr-9 text-sm"
                aria-label="Rechercher un utilisateur"
                maxLength={60}
              />
              {search.trim() !== "" && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Effacer la recherche"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
            <p className="whitespace-nowrap text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {rows.length} / {users.length} compte(s)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par rôle">
            <button
              onClick={() => setRoleFilter("TOUS")}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                roleFilter === "TOUS"
                  ? "border-teal-600 bg-teal-600 text-white"
                  : "border-border bg-background text-muted-foreground hover:border-teal-400 hover:text-foreground"
              }`}
              aria-pressed={roleFilter === "TOUS"}
            >
              Tous les rôles <span className="opacity-70">({users.length})</span>
            </button>
            {roleCounts.map(r => (
              <button
                key={r.role}
                onClick={() => setRoleFilter(r.role)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  roleFilter === r.role
                    ? "border-teal-600 bg-teal-600 text-white"
                    : "border-border bg-background text-muted-foreground hover:border-teal-400 hover:text-foreground"
                }`}
                aria-pressed={roleFilter === r.role}
              >
                {r.label} <span className="opacity-70">({r.count})</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <DataViews<Row>
        viewKey="sa-users"
        rows={rows}
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
        emptyMessage={needle !== "" || roleFilter !== "TOUS" ? "Aucun compte ne correspond à ces filtres." : "Aucun compte."}
        toolbarExtra={
          <>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs"
              onClick={exportCsv} disabled={rows.length === 0}
              title={rows.length === 0 ? "Aucun compte dans ce filtre à exporter" : "Exporter les comptes du filtre actif au format CSV (BOM UTF-8, séparateur « ; »)"}>
              <Download className="h-3.5 w-3.5" aria-hidden /> Exporter CSV
            </Button>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={reload} disabled={refreshing}>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden /> Actualiser
            </Button>
          </>
        }
      />

      {/* Confirmation de suspension (pattern R2b — l'action est réversible
          depuis le même bouton « Réactiver », mais coupe l'accès immédiatement). */}
      <SaConfirmDialog
        open={pendingSuspend !== null}
        onOpenChange={o => { if (!o) setPendingSuspend(null) }}
        onConfirm={async () => {
          if (!pendingSuspend) return
          await toggleActive(pendingSuspend)
          setPendingSuspend(null)
        }}
        busy={pendingSuspend !== null && busyId === pendingSuspend.id}
        icon={Ban}
        tone="amber"
        title="Suspendre ce compte ?"
        description={
          pendingSuspend
            ? `« ${pendingSuspend.name} » (${pendingSuspend.email}) ne pourra plus se connecter à CarbuScope — ni à son espace enseigne, ni à l'application mobile. La suspension est réversible (« Réactiver ») et l'action est journalisée.`
            : ""
        }
        confirmLabel="Suspendre le compte"
      >
        {pendingSuspend && (
          <div className="space-y-1 rounded-md border bg-muted/40 px-3 py-2 text-xs">
            <p className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Enseigne</span>
              <span className="font-medium">{pendingSuspend.brandName}</span>
            </p>
            <p className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Rôle</span>
              <span className="font-medium">{ROLE_LABELS[pendingSuspend.role as keyof typeof ROLE_LABELS] ?? pendingSuspend.role}</span>
            </p>
            <p className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Dernier accès</span>
              <span className="font-medium">{pendingSuspend.lastLoginAt ? timeAgo(pendingSuspend.lastLoginAt) : "jamais connecté"}</span>
            </p>
          </div>
        )}
      </SaConfirmDialog>
    </div>
  )
}
