'use client'

// Super Administration — Module Démographie (T37) : volet « Paramétrage » —
// visibilité du module pour les utilisateurs de la plateforme. Chaque
// utilisateur peut recevoir : vue Gouvernorats, vue Gouvernorats + délégations
// (avec édition en ligne facultative), ou aucun accès (masqué). L'effet est
// immédiat : l'onglet « Démographie » apparaît dans l'Observatoire B2B du
// compte concerné (sonde /api/demographie/acces). Chaque changement est
// journalisé (kind DEMOGRAPHIE) et s'appuie sur POST action « maj-acces ».

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Eye, EyeOff, Loader2, Lock, PencilLine, Search, ShieldCheck, UserRound } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ROLE_LABELS } from "@/store/app-store"
import { DEMOGRAPHIC_LEVELS, type DemographicAccessDTO, type DemographicAccessLevel } from "@/lib/saas"
import { timeAgo } from "./sa-shared"

type ParamUser = {
  id: string
  email: string
  name: string
  role: string
  brandSlug: string | null
  active: boolean
  lastLoginAt: string | null
  brandName?: string
  brandColor?: string
}

type LevelValue = "MASQUE" | DemographicAccessLevel

const LEVEL_SELECT_META: Record<LevelValue, { label: string; chip: string }> = {
  MASQUE: { label: "Masqué", chip: "border-slate-300 bg-slate-50 text-slate-500" },
  GOUVERNORATS: { label: "Gouvernorats", chip: "border-emerald-300/70 bg-emerald-50 text-emerald-700" },
  DELEGATIONS: { label: "Gouvernorats + délégations", chip: "border-teal-300/70 bg-teal-50 text-teal-700" },
  CITES: { label: "Gouvernorats + délégations + cités", chip: "border-violet-300/70 bg-violet-50 text-violet-700" },
}

// Compte racine : accès permanent au module (Super Administration).
const SUPER_EMAIL = "rania.feki@carbuscope.tn"

/** Recherche insensible à la casse et aux accents. */
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

export function SaDemographieParametrage({ access, actor, onChanged }: {
  access: DemographicAccessDTO[]
  actor: string
  onChanged: () => void | Promise<void>
}) {
  const [users, setUsers] = useState<ParamUser[] | null>(null)
  const [localAccess, setLocalAccess] = useState<DemographicAccessDTO[]>(access)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("TOUS")

  useEffect(() => { setLocalAccess(access) }, [access])

  useEffect(() => {
    let alive = true
    fetch("/api/super/users")
      .then(async r => {
        const j = await r.json().catch(() => null)
        if (!r.ok || !j?.users) throw new Error(j?.error ?? "Impossible de charger les utilisateurs")
        if (alive) setUsers(j.users as ParamUser[])
      })
      .catch(e => {
        if (alive) toast.error(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => { alive = false }
  }, [])

  const accessByUserId = useMemo(() => new Map(localAccess.map(a => [a.userId, a])), [localAccess])

  const rows = useMemo(() => {
    if (!users) return []
    const q = norm(query.trim())
    return users
      .filter(u => {
        const acc = accessByUserId.get(u.id)
        if (filter === "AVEC") return Boolean(acc)
        if (filter === "SANS") return !acc
        if (filter === "EDITION") return Boolean(acc?.canEdit)
        return true
      })
      .filter(u => {
        if (!q) return true
        return norm(u.name).includes(q) || norm(u.email).includes(q) || norm(u.brandName ?? u.brandSlug ?? "plateforme").includes(q)
      })
  }, [users, query, filter, accessByUserId])

  const stats = useMemo(() => {
    const granted = localAccess.length
    const gov = localAccess.filter(a => a.level === "GOUVERNORATS").length
    const deleg = localAccess.filter(a => a.level === "DELEGATIONS").length
    const cites = localAccess.filter(a => a.level === "CITES").length
    const edit = localAccess.filter(a => a.canEdit).length
    return { granted, gov, deleg, cites, edit }
  }, [localAccess])

  /** Applique un changement de visibilité (optimiste + rollback + audit). */
  const apply = (user: ParamUser, level: LevelValue, canEdit: boolean) => {
    const prev = localAccess
    const next = level === "MASQUE"
      ? localAccess.filter(a => a.userId !== user.id)
      : localAccess.some(a => a.userId === user.id)
        ? localAccess.map(a => a.userId === user.id ? { ...a, level, canEdit } : a)
        : [...localAccess, {
          userId: user.id, email: user.email, name: user.name, brandSlug: user.brandSlug,
          level, canEdit, updatedAt: new Date().toISOString(), updatedBy: actor,
        }]
    setLocalAccess(next)
    fetch("/api/super/demographie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "maj-acces", userId: user.id,
        level: level === "MASQUE" ? "MASQUE" : level,
        canEdit: level === "MASQUE" ? false : canEdit,
        actor,
      }),
    })
      .then(async r => {
        const j = await r.json().catch(() => null)
        if (!r.ok || !(j?.access || j?.revoked)) throw new Error(j?.error ?? "Échec de la modification")
        const label = level === "MASQUE" ? "accès masqué" : `${LEVEL_SELECT_META[level].label}${canEdit ? " · édition autorisée" : " · lecture seule"}`
        toast.success(`${user.name} — ${label}`)
        void onChanged()
      })
      .catch(e => {
        setLocalAccess(prev)
        toast.error(e instanceof Error ? e.message : "Erreur inconnue")
      })
  }

  if (!users) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement des comptes utilisateurs…
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4 text-emerald-600" aria-hidden /> Paramétrage de visibilité
          </CardTitle>
          <CardDescription>
            Choisissez quels utilisateurs voient le module Démographie dans leur Observatoire B2B — vue
            gouvernorats, gouvernorats + délégations ou gouvernorats + délégations + cités (3ᵉ niveau), en
            lecture seule ou avec édition en ligne. La super-administratrice garde un accès permanent (⚡).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              { label: "Utilisateurs autorisés", value: stats.granted, icon: Eye },
              { label: "Vue gouvernorats", value: stats.gov, icon: Eye },
              { label: "Gouvernorats + délégations", value: stats.deleg, icon: Eye },
              { label: "Avec cités (3ᵉ niv.)", value: stats.cites, icon: Eye },
              { label: "Édition autorisée", value: stats.edit, icon: PencilLine },
            ].map(s => {
              const Icon = s.icon
              return (
                <div key={s.label} className="rounded-lg border bg-muted/30 p-2.5 text-center">
                  <Icon className="mx-auto h-3.5 w-3.5 text-emerald-600" aria-hidden />
                  <p className="mt-1 text-lg font-bold leading-none tabular-nums">{s.value}</p>
                  <p className="mt-1 text-[10.5px] leading-tight text-muted-foreground">{s.label}</p>
                </div>
              )
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Rechercher un utilisateur, un e-mail, une enseigne…"
                className="pl-8"
                aria-label="Rechercher un utilisateur"
              />
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="sm:w-52" aria-label="Filtrer par niveau d'accès">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TOUS">Tous les comptes</SelectItem>
                <SelectItem value="AVEC">Avec accès</SelectItem>
                <SelectItem value="SANS">Sans accès</SelectItem>
                <SelectItem value="EDITION">Édition autorisée</SelectItem>
              </SelectContent>
            </Select>
            <span className="whitespace-nowrap text-xs text-muted-foreground" aria-live="polite">
              {rows.length} compte(s)
            </span>
          </div>

          <div className="max-h-[52vh] overflow-auto rounded-xl border" role="region" aria-label="Paramétrage de visibilité du module Démographie" tabIndex={0}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky top-0 z-20 bg-background min-w-[220px]">Utilisateur</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background min-w-[110px]">Statut</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background min-w-[190px]">Visibilité</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background w-24 text-center">Édition</TableHead>
                  <TableHead className="sticky top-0 z-20 bg-background w-32 text-right">Modifié</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      Aucun compte ne correspond aux filtres.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map(u => {
                  const acc = accessByUserId.get(u.id)
                  const isSuper = u.email === SUPER_EMAIL
                  const level: LevelValue = isSuper ? "DELEGATIONS" : acc ? acc.level : "MASQUE"
                  const canEdit = isSuper ? true : acc?.canEdit ?? false
                  return (
                    <TableRow key={u.id} className={acc ? "bg-emerald-50/40 dark:bg-emerald-950/20" : ""}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                            style={{ backgroundColor: u.brandColor ?? "#57534e" }}
                            aria-hidden
                          >
                            {u.name.split(" ").map(x => x[0]).slice(0, 2).join("")}
                          </span>
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                              {u.name}
                              {isSuper && <Lock className="h-3 w-3 text-amber-500" aria-label="Accès permanent" />}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">{u.email}</p>
                            <p className="truncate text-[11px] text-muted-foreground/80">
                              {u.brandName ?? "Plateforme"} · {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {u.active ? (
                          <Badge variant="outline" className="border-emerald-300/70 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                            Actif
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-red-300/70 bg-red-50 text-[10px] text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                            Suspendu
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {isSuper ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Accès permanent
                          </span>
                        ) : (
                          <Select value={level} onValueChange={v => apply(u, v as LevelValue, canEdit)}>
                            <SelectTrigger className="h-9 text-xs" aria-label={`Visibilité du module pour ${u.name}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(LEVEL_SELECT_META) as LevelValue[]).map(lv => (
                                <SelectItem key={lv} value={lv}>
                                  <span className="flex items-center gap-2">
                                    {lv === "MASQUE" ? <EyeOff className="h-3.5 w-3.5 text-slate-400" aria-hidden /> : <Eye className="h-3.5 w-3.5 text-emerald-600" aria-hidden />}
                                    {LEVEL_SELECT_META[lv].label}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Switch
                            checked={canEdit}
                            disabled={level === "MASQUE" || isSuper}
                            onCheckedChange={v => apply(u, level, v)}
                            aria-label={`Autoriser l'édition pour ${u.name}`}
                          />
                          <span className="text-[10px] text-muted-foreground">{canEdit ? "oui" : "non"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-[11px] text-muted-foreground">
                        {acc?.updatedAt ? (
                          <span title={`${acc.updatedAt}${acc.updatedBy ? ` — ${acc.updatedBy}` : ""}`}>
                            {timeAgo(acc.updatedAt)}
                          </span>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Alert>
        <UserRound aria-hidden />
        <AlertDescription>
          Un accès accordé fait apparaître l&apos;onglet « Démographie » dans l&apos;Observatoire B2B du compte
          concerné (immédiatement après changement de profil ou rechargement). L&apos;édition en ligne suit le
          même référentiel que la Super Administration — mêmes validations françaises et journal d&apos;audit.
          Le socle démographique alimente par ailleurs carte, implantation, rapports et calculateurs.
        </AlertDescription>
      </Alert>
    </div>
  )
}
