'use client'

// Super Administration — Agent IA interne (Phase 3, T33) : lancement de
// nouvelles tâches (exécution LLM réelle côté serveur), tâches enregistrées
// avec relance/suppression, et activation de l'agent enseigne par enseigne
// puis membre par membre (la Super Administration garde un accès permanent).
// 100 % additif : 7e onglet de la Super Administration.

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  ChevronDown, ListTodo, Loader2, Lock, Play, RefreshCw, Save, Sparkles, ToggleRight, Trash2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { useAppStore, ROLE_LABELS } from "@/store/app-store"
import { DEMO_ACCOUNTS_MAP } from "@/lib/demo-accounts"
import { AI_TASK_STATUS_META, PLAN_LABELS, type AiBrandSettingDTO, type AiTaskDTO } from "@/lib/saas"
import { fmtDate, timeAgo } from "./sa-shared"

/** Secondes françaises à 1 décimale : « 12,4 ». */
function fmtSeconds(ms: number | null): string {
  if (ms === null || ms === undefined) return "—"
  return (ms / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** Pastille timeline colorée par statut (même style que le journal d'audit). */
const STATUS_DOT: Record<string, string> = {
  ENREGISTREE: "#a1a1aa",
  EN_COURS: "#d97706",
  TERMINEE: "#059669",
  ECHEC: "#dc2626",
}

export function SaAiAgent() {
  const userId = useAppStore(s => s.userId)
  const account = userId ? DEMO_ACCOUNTS_MAP[userId] : null
  const actor = account?.email ?? "system"

  // ---- Tâches ----
  const [tasks, setTasks] = useState<AiTaskDTO[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [instruction, setInstruction] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [lastTask, setLastTask] = useState<AiTaskDTO | null>(null)
  const [listBusyId, setListBusyId] = useState<string | null>(null)
  const [openResultId, setOpenResultId] = useState<string | null>(null)

  // ---- Activation par enseigne / membre ----
  const [settings, setSettings] = useState<AiBrandSettingDTO[] | null>(null)

  const reloadTasks = useCallback(async () => {
    setRefreshing(true)
    try {
      const r = await fetch("/api/super/ai-tasks")
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      setTasks(j.tasks)
      setError(null)
    } catch {
      setError("Impossible de charger les tâches de l'agent IA.")
    } finally {
      setRefreshing(false)
    }
  }, [])

  const reloadSettings = useCallback(async () => {
    try {
      const r = await fetch("/api/super/ai-agent-settings")
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      setSettings(j.brands)
    } catch {
      setSettings([])
    }
  }, [])

  useEffect(() => {
    void reloadTasks()
    void reloadSettings()
  }, [reloadTasks, reloadSettings])

  /** Validation FR locale (mêmes règles que l'API). */
  function validate(): string | null {
    if (title.trim().length < 3 || title.trim().length > 120) {
      return "Titre requis — entre 3 et 120 caractères"
    }
    if (instruction.trim().length < 10 || instruction.trim().length > 4000) {
      return "Instruction requise — entre 10 et 4 000 caractères"
    }
    return null
  }

  /** Création + lancement immédiat : l'exécution LLM est réelle (jusqu'à 120 s). */
  async function launchNow(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (running) return
    const err = validate()
    if (err) {
      setFormError(err)
      return
    }
    setFormError(null)
    setRunning(true)
    setLastTask(null)
    try {
      const r = await fetch("/api/super/ai-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "creer", title: title.trim(), instruction: instruction.trim(), lancer: true, actor }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error ?? `Erreur ${r.status}`)
      const task: AiTaskDTO = j.task
      setLastTask(task)
      if (task.status === "TERMINEE") {
        toast.success("Tâche IA terminée", {
          description: `« ${task.title} » — terminée en ${fmtSeconds(task.durationMs)} s.`,
        })
        setTitle("")
        setInstruction("")
      } else {
        toast.error("Tâche IA en échec", { description: task.error ?? "Erreur inconnue." })
      }
      await reloadTasks()
    } catch (e2) {
      setFormError(e2 instanceof Error ? e2.message : "Échec de l'appel à l'agent IA.")
    } finally {
      setRunning(false)
    }
  }

  /** Enregistrement sans exécution (brouillon relançable plus tard). */
  async function saveOnly() {
    if (running) return
    const err = validate()
    if (err) {
      setFormError(err)
      return
    }
    setFormError(null)
    try {
      const r = await fetch("/api/super/ai-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "creer", title: title.trim(), instruction: instruction.trim(), actor }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error ?? `Erreur ${r.status}`)
      toast.success("Tâche enregistrée", {
        description: `« ${j.task.title} » — lancez-la quand vous voulez depuis la liste.`,
      })
      setTitle("")
      setInstruction("")
      setLastTask(null)
      await reloadTasks()
    } catch (e2) {
      setFormError(e2 instanceof Error ? e2.message : "Échec de l'enregistrement de la tâche.")
    }
  }

  /** Relance une tâche existante (ré-exécute l'instruction stockée). */
  async function runTask(t: AiTaskDTO) {
    if (listBusyId) return
    setListBusyId(t.id)
    try {
      const r = await fetch("/api/super/ai-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "executer", id: t.id, actor }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error ?? `Erreur ${r.status}`)
      const task: AiTaskDTO = j.task
      if (task.status === "TERMINEE") {
        toast.success("Tâche IA terminée", {
          description: `« ${task.title} » — terminée en ${fmtSeconds(task.durationMs)} s.`,
        })
      } else {
        toast.error("Tâche IA en échec", { description: task.error ?? "Erreur inconnue." })
      }
      await reloadTasks()
    } catch {
      toast.error("Échec du lancement de la tâche IA.")
    } finally {
      setListBusyId(null)
    }
  }

  /** Suppression immédiate (pattern « Suspendre » des contrats — pas de dialog). */
  async function deleteTask(t: AiTaskDTO) {
    if (listBusyId) return
    setListBusyId(t.id)
    try {
      const r = await fetch("/api/super/ai-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "supprimer", id: t.id, actor }),
      })
      if (!r.ok) throw new Error()
      toast.success("Tâche supprimée", { description: `« ${t.title} »` })
      if (openResultId === t.id) setOpenResultId(null)
      if (lastTask?.id === t.id) setLastTask(null)
      await reloadTasks()
    } catch {
      toast.error("Échec de la suppression de la tâche.")
    } finally {
      setListBusyId(null)
    }
  }

  /** Bascule d'activation pour une enseigne (maj optimiste + audit serveur). */
  function toggleBrand(b: AiBrandSettingDTO) {
    const next = !b.enabled
    setSettings(prev =>
      prev?.map(x => (x.brandSlug === b.brandSlug ? { ...x, enabled: next } : x)) ?? prev
    )
    void (async () => {
      try {
        const r = await fetch("/api/super/ai-agent-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: "brand", key: b.brandSlug, enabled: next, actor }),
        })
        if (!r.ok) throw new Error()
        toast.success(`Agent IA ${next ? "activé" : "désactivé"} — ${b.brandName}`)
      } catch {
        setSettings(prev =>
          prev?.map(x => (x.brandSlug === b.brandSlug ? { ...x, enabled: !next } : x)) ?? prev
        )
        toast.error("Échec de la mise à jour de l'activation.")
      }
    })()
  }

  /** Bascule d'activation pour un membre du personnel (maj optimiste). */
  function toggleUser(b: AiBrandSettingDTO, userId: string, name: string, next: boolean) {
    setSettings(prev =>
      prev?.map(x =>
        x.brandSlug === b.brandSlug
          ? { ...x, users: x.users.map(u => (u.id === userId ? { ...u, enabled: next } : u)) }
          : x
      ) ?? prev
    )
    void (async () => {
      try {
        const r = await fetch("/api/super/ai-agent-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: "user", key: userId, enabled: next, actor }),
        })
        if (!r.ok) throw new Error()
        toast.success(`Agent IA ${next ? "activé" : "désactivé"} — ${name}`)
      } catch {
        setSettings(prev =>
          prev?.map(x =>
            x.brandSlug === b.brandSlug
              ? { ...x, users: x.users.map(u => (u.id === userId ? { ...u, enabled: !next } : u)) }
              : x
          ) ?? prev
        )
        toast.error("Échec de la mise à jour de l'activation.")
      }
    })()
  }

  if (error) {
    return <Card><CardContent className="p-6 text-sm text-destructive">{error}</CardContent></Card>
  }
  if (!tasks) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement de l&apos;agent IA…
        </CardContent>
      </Card>
    )
  }

  const lastMeta = lastTask ? AI_TASK_STATUS_META[lastTask.status] : null

  return (
    <div className="space-y-4">
      {/* ---- 1. Lancer une nouvelle tâche ---- */}
      <Card className="border-teal-200 dark:border-teal-900">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
            Lancer une nouvelle tâche
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Décrivez l&apos;analyse ou la rédaction attendue — l&apos;agent IA de CarbuScope
            l&apos;exécute côté serveur et conserve le résultat.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={launchNow} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ai-title">Titre de la tâche</Label>
              <Input
                id="ai-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Plan de relance des impayés"
                maxLength={140}
                disabled={running}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-instruction">Instruction à l&apos;agent IA</Label>
              <Textarea
                id="ai-instruction"
                rows={4}
                value={instruction}
                onChange={e => setInstruction(e.target.value)}
                placeholder="Analyse les factures impayées du mois et propose 3 actions de recouvrement."
                disabled={running}
              />
            </div>

            {formError && (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {formError}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" className="gap-1.5" disabled={running}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                Lancer maintenant
              </Button>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={running} onClick={saveOnly}>
                <Save className="h-4 w-4" aria-hidden /> Enregistrer
              </Button>
              {running && (
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  L&apos;agent IA travaille sur « {title.trim()} »…
                </p>
              )}
            </div>
          </form>

          {/* Panneau résultat de la dernière exécution */}
          {lastTask && !running && (
            <div className="mt-4 space-y-2 rounded-lg border p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`text-[10px] ${lastMeta?.className ?? ""}`}>
                  {lastMeta?.label ?? lastTask.status}
                </Badge>
                <p className="text-sm font-semibold leading-tight">« {lastTask.title} »</p>
                {lastTask.status === "TERMINEE" && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Terminée en {fmtSeconds(lastTask.durationMs)} s
                  </span>
                )}
              </div>
              {lastTask.status === "TERMINEE" && lastTask.result ? (
                <p className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm leading-relaxed">
                  {lastTask.result}
                </p>
              ) : lastTask.error ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                  {lastTask.error}
                </p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- 2. Tâches enregistrées ---- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <ListTodo className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
            Tâches enregistrées ({tasks.length})
            <Button
              variant="ghost" size="sm" className="ml-auto h-7 gap-1.5 px-2 text-xs"
              onClick={reloadTasks} disabled={refreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden /> Actualiser
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="max-h-[28rem] space-y-0 overflow-y-auto" aria-label="Tâches de l'agent IA">
            {tasks.map(t => {
              const meta = AI_TASK_STATUS_META[t.status]
              const busy = listBusyId === t.id
              const runningTask = t.status === "EN_COURS"
              const open = openResultId === t.id
              return (
                <li key={t.id} className="relative border-l border-border pl-5 pb-4 last:pb-0">
                  <span
                    className="absolute left-[-5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background"
                    style={{ backgroundColor: STATUS_DOT[t.status] ?? "#a8a29e" }}
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] ${meta?.className ?? ""}`}>
                      {meta?.label ?? t.status}
                    </Badge>
                    <p className="text-sm font-semibold leading-tight">{t.title}</p>
                    <span className="text-[11px] text-muted-foreground" title={fmtDate(t.createdAt)}>
                      {timeAgo(t.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground" title={t.instruction}>
                    {t.instruction}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Button
                      variant="outline" size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={busy || runningTask}
                      onClick={() => runTask(t)}
                      aria-label={`${t.status === "ENREGISTREE" ? "Lancer" : "Relancer"} la tâche ${t.title}`}
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
                      {t.status === "ENREGISTREE" ? "Lancer" : "Relancer"}
                    </Button>
                    {t.result && (
                      <Button
                        variant="outline" size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        aria-expanded={open}
                        onClick={() => setOpenResultId(open ? null : t.id)}
                      >
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
                        Voir le résultat
                      </Button>
                    )}
                    <Button
                      variant="outline" size="sm"
                      className="h-7 gap-1 border-red-300 px-2 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                      disabled={busy}
                      onClick={() => deleteTask(t)}
                      aria-label={`Supprimer la tâche ${t.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden /> Supprimer
                    </Button>
                    {t.status === "TERMINEE" && t.durationMs !== null && (
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        Terminée en {fmtSeconds(t.durationMs)} s
                      </span>
                    )}
                    {t.status === "ECHEC" && t.error && (
                      <span className="truncate text-[11px] text-destructive" title={t.error}>
                        {t.error}
                      </span>
                    )}
                  </div>
                  {open && t.result && (
                    <p className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm leading-relaxed">
                      {t.result}
                    </p>
                  )}
                </li>
              )
            })}
            {tasks.length === 0 && (
              <li className="py-6 text-center text-sm text-muted-foreground">
                Aucune tâche enregistrée — lancez votre première tâche ci-dessus.
              </li>
            )}
          </ol>
        </CardContent>
      </Card>

      {/* ---- 3. Activation de l'agent IA ---- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <ToggleRight className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
            Activation de l&apos;agent IA
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            L&apos;agent IA est toujours disponible pour la Super Administration. Activez-le
            enseigne par enseigne — puis membre par membre — pour ouvrir l&apos;accès aux personnels.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Accès racine permanent */}
          <div className="flex flex-wrap items-center gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5">
            <Lock className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden />
            <p className="min-w-0 flex-1 text-sm font-semibold leading-tight">
              {account?.name ?? "Super-admin"} — Super Administration
            </p>
            <Badge
              variant="outline"
              className="border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-400"
            >
              Accès permanent
            </Badge>
          </div>

          {!settings && (
            <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement des enseignes…
            </p>
          )}

          {settings && settings.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">Aucune enseigne cliente.</p>
          )}

          {settings && settings.map(b => (
            <div key={b.brandSlug} className="space-y-2 rounded-lg border p-3.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: b.color }}
                  aria-hidden
                />
                <p className="text-sm font-semibold leading-tight">{b.brandName}</p>
                <Badge variant="secondary" className="text-[10px] font-medium">
                  {PLAN_LABELS[b.plan] ?? b.plan}
                </Badge>
                <Switch
                  className="ml-auto"
                  checked={b.enabled}
                  onCheckedChange={() => toggleBrand(b)}
                  aria-label={`Activer l'agent IA pour ${b.brandName}`}
                />
              </div>

              {b.users.length > 0 && (
                <div className="space-y-1.5 pl-4">
                  {!b.enabled && (
                    <p className="pl-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                      Activez d&apos;abord l&apos;enseigne
                    </p>
                  )}
                  {b.users.map(u => (
                    <div
                      key={u.id}
                      className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-md border bg-muted/30 px-2.5 py-2"
                    >
                      <p className={`text-sm font-medium leading-tight ${u.active ? "" : "text-muted-foreground"}`}>{u.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{u.email}</p>
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}
                      </Badge>
                      {!u.active && (
                        <Badge variant="outline" className="text-[9px] border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                          compte suspendu
                        </Badge>
                      )}
                      <Switch
                        className="ml-auto"
                        checked={u.enabled}
                        onCheckedChange={next => toggleUser(b, u.id, u.name, next)}
                        aria-label={`Activer l'agent IA pour ${u.name}`}
                      />
                    </div>
                  ))}
                </div>
              )}
              {b.users.length === 0 && (
                <p className="pl-4 text-xs text-muted-foreground">Aucun personnel rattaché à cette enseigne.</p>
              )}
            </div>
          ))}

          <p className="border-t pt-3 text-xs text-muted-foreground">
            Accès effectif d&apos;un membre = enseigne activée ET membre activé.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
