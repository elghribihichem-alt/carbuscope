'use client'

// D.2.1 — Modération des contributions : file d'attente, spam, contestations

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Check, X, Loader2, XCircle, Ban, AlertTriangle, Fuel, Users, Trash2, Scale, ShieldCheck,
  Gavel, Inbox, MapPin, User, Download,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ErrorState } from "@/components/shell/loading"
import { CONTRIBUTION_TYPE_LABELS, type ContributionDTO } from "@/lib/types"
import { relDays, fmtDateTime } from "@/components/settings/settings-shared"

type TypeMeta = { icon: LucideIcon; cls: string }

const TYPE_META: Record<string, TypeMeta> = {
  CLOSED: { icon: XCircle, cls: "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400" },
  // T53-T6b : slate → zinc (harmonisation neutres, pattern T53-T4b/T5b/T6a).
  SERVICE_UNAVAILABLE: { icon: Ban, cls: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400" },
  PRICE_ABNORMAL: { icon: AlertTriangle, cls: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400" },
  PUMP_BROKEN: { icon: Fuel, cls: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-400" },
  QUEUE: { icon: Users, cls: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" },
  CLEANLINESS: { icon: Trash2, cls: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-400" },
}

const ALL_TYPES = Object.keys(CONTRIBUTION_TYPE_LABELS)

type Contestation = {
  id: string
  station: string
  code: string
  contributeur: string
  motif: string
}

const CONTESTATIONS: Contestation[] = [
  {
    id: "cont-1",
    station: "Agil Soukra",
    code: "TN-0295",
    contributeur: "Karim B.",
    motif: "La fiche indique « ouverte 24 h/24 » mais la station ferme à 23 h depuis juillet.",
  },
  {
    id: "cont-2",
    station: "Ola Energy Sousse Corniche",
    code: "TN-1102",
    contributeur: "Ines T.",
    motif: "Le service lavage a été retiré à tort : il est bien disponible depuis la rénovation.",
  },
]

// Export CSV de la file d'attente (données réelles chargées — pattern T52-R2b/T6a :
// BOM UTF-8 + séparateur « ; » + dates FR).
function exportPendingCsv(rows: ContributionDTO[]) {
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = ["Type", "Station", "Auteur", "Commentaire", "Validations", "Statut", "Déposé le"]
  const lines = rows.map(c => [
    esc(CONTRIBUTION_TYPE_LABELS[c.type] ?? c.type),
    esc(c.stationCode),
    esc(c.author),
    esc(c.comment),
    `${c.validationCount}/3`,
    c.status,
    esc(fmtDateTime(c.createdAt)),
  ].join(";"))
  const csv = ["\uFEFF" + header.join(";"), ...lines].join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `moderation-file-attente-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  toast.success(`File exportée — ${rows.length} signalement(s) en attente.`, {
    description: "moderation-file-attente.csv · compatible Excel (UTF-8, séparateur « ; »)",
  })
}

export function BoModeration({
  pending, loading, error, onRefresh,
}: {
  pending: ContributionDTO[] | null
  loading: boolean
  error: string | null
  onRefresh: () => Promise<void>
}) {
  const [typeFilter, setTypeFilter] = useState("all")
  const [busyIds, setBusyIds] = useState<string[]>([])
  const [arbitrated, setArbitrated] = useState<string[]>([])

  const filtered = useMemo(() => {
    if (!pending) return []
    return typeFilter === "all" ? pending : pending.filter(c => c.type === typeFilter)
  }, [pending, typeFilter])

  // Détection de spam : auteurs apparaissant ≥ 3 fois en attente (calcul client)
  const suspects = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of pending ?? []) counts.set(c.author, (counts.get(c.author) ?? 0) + 1)
    return [...counts.entries()]
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])
  }, [pending])

  const act = async (c: ContributionDTO, action: "VALIDATE" | "REJECT") => {
    setBusyIds(prev => [...prev, c.id])
    try {
      const res = await fetch("/api/contributions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, action }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = (await res.json()) as { ok: boolean; status: string; validationCount: number }

      if (action === "REJECT") {
        toast.warning("Signalement rejeté", {
          description: "Le contributeur en sera informé ; la fiche reste inchangée.",
        })
      } else if (j.status === "VALIDATED") {
        toast.success("Signalement confirmé : fiche mise à jour", {
          description:
            c.type === "CLOSED"
              ? "3 concordances atteintes — la station est passée au statut « Fermée »."
              : "3 concordances atteintes — la donnée est appliquée à la fiche.",
        })
      } else {
        toast.info(`Validation enregistrée (${j.validationCount}/3)`, {
          description: "Le signalement sera appliqué dès 3 validations concordantes.",
        })
      }
      await onRefresh()
    } catch {
      toast.error("Action impossible — réessayez dans un instant.")
    } finally {
      setBusyIds(prev => prev.filter(x => x !== c.id))
    }
  }

  const arbitrate = (cont: Contestation, party: "enseigne" | "contributeur") => {
    // T53-T6b : honnêteté du bouton (pattern T4b/T5b) — aucune route
    // d'arbitrage n'existe côté serveur, l'action reste une simulation locale.
    setArbitrated(prev => [...prev, cont.id])
    if (party === "enseigne") {
      toast.info("Arbitrage simulé — version de l'enseigne maintenue", {
        description: `${cont.station} (${cont.code}) : simulation locale de démonstration, aucune écriture serveur (moteur C.3 non branché).`,
      })
    } else {
      toast.info("Arbitrage simulé — contribution retenue", {
        description: `${cont.station} (${cont.code}) : simulation locale de démonstration, aucune écriture serveur (moteur C.3 non branché).`,
      })
    }
  }

  if (error) {
    return <ErrorState message={error} retry={() => { void onRefresh() }} />
  }

  return (
    <div className="space-y-4">
      {/* Bandeau détection de spam */}
      {suspects.length > 0 ? (
        <Card className="border-red-300 bg-red-50/80 dark:border-red-900 dark:bg-red-950/40">
          <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Détection de spam</p>
                <p className="text-xs text-muted-foreground">
                  Auteur(s) récurrents dans la file d&apos;attente — comportement suspect signalé automatiquement :
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {suspects.map(([author, n]) => (
                    <Badge
                      key={author}
                      variant="outline"
                      className="border-red-300 bg-red-100 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
                    >
                      {author} ×{n}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        !loading && !error && (
          <Card className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30">
            <CardContent className="flex items-center gap-2 p-3 text-sm text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
              Aucun comportement suspect détecté — aucun auteur n&apos;accumule de signalements en attente.
            </CardContent>
          </Card>
        )
      )}

      {/* File d'attente */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Inbox className="h-4 w-4 text-red-600" aria-hidden /> File d&apos;attente des signalements
              </CardTitle>
              <CardDescription>
                {pending ? (
                  <>
                    <span className="font-semibold text-foreground tabular-nums">{filtered.length}</span>{" "}
                    signalement(s) en attente sur {pending.length} — validation à 3 concordances.
                  </>
                ) : (
                  "Chargement de la file…"
                )}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-56" aria-label="Filtrer par type">
                  <SelectValue placeholder="Tous les types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types ({pending?.length ?? 0})</SelectItem>
                  {ALL_TYPES.map(t => (
                    <SelectItem key={t} value={t}>
                      {CONTRIBUTION_TYPE_LABELS[t]} ({pending?.filter(c => c.type === t).length ?? 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* T53-T6b : export CSV de la file filtrée (pattern T52-R2b —
                  données réelles déjà chargées, aucune requête serveur). */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportPendingCsv(filtered)}
                disabled={!pending || filtered.length === 0}
                className="h-8 shrink-0 gap-1.5 text-xs"
                aria-label="Exporter la file d'attente filtrée en CSV"
              >
                <Download className="h-3.5 w-3.5" aria-hidden /> Exporter CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
              <Check className="h-6 w-6 text-emerald-600" aria-hidden />
              <p className="text-sm font-medium">File vide — tous les signalements ont été traités.</p>
              <p className="text-xs text-muted-foreground">
                Les nouvelles contributions des automobilistes apparaîtront ici en temps réel.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map(c => {
                const meta = TYPE_META[c.type] ?? { icon: AlertTriangle, cls: "" }
                const Icon = meta.icon
                const busy = busyIds.includes(c.id)
                const label = CONTRIBUTION_TYPE_LABELS[c.type] ?? c.type
                return (
                  <Card key={c.id} className="flex flex-col border-border/70">
                    <CardContent className="flex flex-1 flex-col gap-2.5 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <Badge variant="outline" className={`gap-1 ${meta.cls}`}>
                          <Icon className="h-3 w-3" aria-hidden /> {label}
                        </Badge>
                        <span className="shrink-0 text-[11px] text-muted-foreground" title={fmtDateTime(c.createdAt)}>
                          {relDays(c.createdAt)}
                        </span>
                      </div>

                      <p className="text-sm leading-snug">{c.comment || "Aucun commentaire fourni."}</p>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3" aria-hidden /> {c.author}
                        </span>
                        {c.stationCode && (
                          <span className="inline-flex items-center gap-1 font-mono">
                            <MapPin className="h-3 w-3" aria-hidden /> {c.stationCode}
                          </span>
                        )}
                      </div>

                      <div className="mt-auto space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{c.validationCount}/3 validations concordantes</span>
                          <span className="tabular-nums">{Math.round((c.validationCount / 3) * 100)} %</span>
                        </div>
                        <Progress
                          value={(c.validationCount / 3) * 100}
                          className="h-1.5 [&_[data-slot=progress-indicator]]:bg-amber-500"
                          aria-label={`${c.validationCount} validations sur 3`}
                        />
                      </div>

                      <div className="flex gap-2 pt-1">
                        {/* T53-T6b : cibles tactiles h-11 (convention 44 px,
                            pattern T4b/T5b sur les actions en vue cartes). */}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => { void act(c, "VALIDATE") }}
                          className="h-11 flex-1 gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                          Valider
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => { void act(c, "REJECT") }}
                          className="h-11 flex-1 gap-1 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden /> Rejeter
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gestion des contestations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4 text-purple-600" aria-hidden /> Gestion des contestations
          </CardTitle>
          <CardDescription>
            Les utilisateurs peuvent contester une donnée publiée — la plateforme arbitre en cas de conflit
            (dernière étape du workflow C.3). Exemples de démonstration ci-dessous : le moteur
            d&apos;arbitrage sera branché sur les contestations réelles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {CONTESTATIONS.map(cont => {
              const done = arbitrated.includes(cont.id)
              return (
                <div key={cont.id} className={`rounded-lg border p-4 ${done ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold leading-tight">{cont.station}</p>
                      <p className="text-xs text-muted-foreground">
                        Code <span className="font-mono">{cont.code}</span> · contributeur : {cont.contributeur}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400">
                      Contestation
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-snug text-muted-foreground">{cont.motif}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm" variant="outline" disabled={done}
                      onClick={() => arbitrate(cont, "enseigne")}
                      className="h-11 gap-1"
                    >
                      <Gavel className="h-3.5 w-3.5" aria-hidden /> Arbitrer (enseigne)
                    </Button>
                    <Button
                      size="sm" variant="outline" disabled={done}
                      onClick={() => arbitrate(cont, "contributeur")}
                      className="h-11 gap-1"
                    >
                      <Gavel className="h-3.5 w-3.5" aria-hidden /> Arbitrer (contributeur)
                    </Button>
                    {done && (
                      <Badge variant="secondary" className="gap-1 self-center">
                        <Check className="h-3 w-3" aria-hidden /> Arbitrage simulé
                      </Badge>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
