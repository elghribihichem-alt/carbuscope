'use client'

// Shadow Market — Recensement, onglet « ✅ Validation » (T44-d).
// Workflow Brut → Vérifié → Validé / Rejeté / Doublon : 5 compteurs, bandeau
// pédagogique, file d'attente avec actions individuelles et groupées
// (multi-sélection), KPI délai moyen de validation.

import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowRight, Ban, Check, CheckCheck, CircleAlert, Clock, Copy, Eye, Users } from "lucide-react"
import { toast } from "sonner"
import type { ShadowPointDTO } from "@/lib/types"
import { SHADOW_SOURCE_LABELS } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { ErrorState, TabSkeleton } from "@/components/shell/loading"
import { num } from "@/lib/chart"
import { cn } from "@/lib/utils"
import {
  SHADOW_COLORS, ShadowStatusBadge, TypologyIcon, formatMillimes, formatTnd, relDateFr, typologyLabel,
} from "../shadow-shared"

type ValidationStats = { brut: number; verifie: number; valide: number; rejete: number; doublon: number }
type ValidationResponse = { pending: ShadowPointDTO[]; stats: ValidationStats }

const TRANSITIONS: Record<string, string[]> = {
  BRUT: ["VERIFIE", "REJETE", "DOUBLON"],
  VERIFIE: ["VALIDE", "REJETE", "DOUBLON"],
}

const STATUS_KEY: Record<string, keyof ValidationStats> = {
  BRUT: "brut", VERIFIE: "verifie", VALIDE: "valide", REJETE: "rejete", DOUBLON: "doublon",
}

const STATUS_WORD: Record<string, string> = {
  VERIFIE: "vérifié", VALIDE: "validé", REJETE: "rejeté", DOUBLON: "doublon",
}

export function TabValidation() {
  const [data, setData] = useState<ValidationResponse | null>(null)
  const [avgDelayDays, setAvgDelayDays] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<{ point: ShadowPointDTO; next: string } | null>(null)
  const [confirmBatch, setConfirmBatch] = useState<{ ids: string[]; next: string } | null>(null)

  // File d'attente + statistiques.
  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/shadow/validation", { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
        return res.json() as Promise<ValidationResponse>
      })
      .then((json) => {
        setData(json)
        setError(null)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
  }, [reloadKey])

  // Délai moyen de validation (points VALIDE) — calcul client.
  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/shadow/points?status=VALIDE&limit=500", { signal: ctrl.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ points: ShadowPointDTO[] }>) : Promise.reject(new Error(`Erreur ${res.status}`))))
      .then((json) => {
        const pts = json.points ?? []
        if (pts.length === 0) {
          setAvgDelayDays(null)
          return
        }
        let sum = 0
        let count = 0
        for (const p of pts) {
          const first = new Date(p.firstSeenAt).getTime()
          const check = new Date(p.lastCheckAt).getTime()
          if (Number.isFinite(first) && Number.isFinite(check) && check > first) {
            sum += check - first
            count += 1
          }
        }
        setAvgDelayDays(count > 0 ? sum / count / 86400000 : null)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
      })
    return () => ctrl.abort()
  }, [reloadKey])

  // File triée : BRUT d'abord, puis VERIFIE — au sein de chaque statut, du
  // plus ancien au plus récent (file FIFO).
  const queue = useMemo(() => {
    if (data === null) return []
    const rank = (p: ShadowPointDTO) => (p.status === "BRUT" ? 0 : 1)
    return [...data.pending].sort((a, b) =>
      rank(a) - rank(b) || new Date(a.firstSeenAt).getTime() - new Date(b.firstSeenAt).getTime(),
    )
  }, [data])

  const stats = data?.stats
  const selectedPoints = useMemo(() => queue.filter((p) => selected.includes(p.id)), [queue, selected])
  const selBrut = selectedPoints.filter((p) => p.status === "BRUT")
  const selVerifie = selectedPoints.filter((p) => p.status === "VERIFIE")

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const clearSelection = useCallback(() => setSelected([]), [])

  // ---- Mutation : transition de statut ----
  const patchStatus = useCallback(async (point: ShadowPointDTO, next: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/shadow/points/${encodeURIComponent(point.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      const json = (await res.json()) as { point?: ShadowPointDTO; error?: string }
      if (!res.ok || !json.point) throw new Error(json.error ?? `Erreur ${res.status}`)
      setData((prev) => {
        if (prev === null) return prev
        const cur = STATUS_KEY[point.status]
        const to = STATUS_KEY[next]
        const nextStats = { ...prev.stats, [cur]: prev.stats[cur] - 1, [to]: prev.stats[to] + 1 }
        return { pending: prev.pending.filter((p) => p.id !== point.id), stats: nextStats }
      })
      return true
    } catch (e) {
      toast.error("Transition impossible", { description: e instanceof Error ? e.message : "Erreur inconnue" })
      return false
    }
  }, [])

  const runTransition = useCallback(async (point: ShadowPointDTO, next: string) => {
    setBusy(true)
    const ok = await patchStatus(point, next)
    setBusy(false)
    if (ok) {
      toast.success(`${point.code} ${STATUS_WORD[next] ?? next.toLowerCase()}`, {
        description: next === "VALIDE"
          ? "Le point entre dans les statistiques officielles du marché parallèle."
          : "Statut mis à jour — action tracée dans l'historique.",
      })
    }
  }, [patchStatus])

  const runBatch = useCallback(async (ids: string[], next: string) => {
    const targets = queue.filter((p) => ids.includes(p.id) && (TRANSITIONS[p.status] ?? []).includes(next))
    if (targets.length === 0) return
    setBusy(true)
    let okCount = 0
    for (const p of targets) {
      const ok = await patchStatus(p, next)
      if (ok) okCount += 1
    }
    setSelected((prev) => prev.filter((id) => !targets.some((t) => t.id === id)))
    setBusy(false)
    if (okCount > 0) {
      toast.success(`${okCount} point${okCount > 1 ? "s" : ""} ${STATUS_WORD[next] ?? next}${okCount > 1 ? "s" : ""}`, {
        description: `${targets.length - okCount} transition${targets.length - okCount > 1 ? "s" : ""} refusée${targets.length - okCount > 1 ? "s" : ""} (workflow).`,
      })
    }
  }, [queue, patchStatus])

  if (error !== null) {
    return <ErrorState message={error} retry={() => setReloadKey((k) => k + 1)} />
  }
  if (data === null || stats === undefined) {
    return <TabSkeleton title="Chargement de la file de validation…" />
  }

  return (
    <div className="space-y-4">
      {/* Bandeau workflow */}
      <Card className="border-stone-300 bg-stone-50/60 dark:border-stone-700 dark:bg-stone-900/60">
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="flex items-center gap-1.5 rounded-full bg-stone-200 px-3 py-1.5 font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-300">
              <CircleAlert className="h-3.5 w-3.5" aria-hidden /> 1 · Brut (signalement terrain)
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              <Eye className="h-3.5 w-3.5" aria-hidden /> 2 · Vérifié (contrôle sur place)
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <CheckCheck className="h-3.5 w-3.5" aria-hidden /> 3 · Validé
            </span>
            <span className="text-muted-foreground">ou</span>
            <span className="flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1.5 font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
              <Ban className="h-3.5 w-3.5" aria-hidden /> Rejeté
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-stone-200 px-3 py-1.5 font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-300">
              <Users className="h-3.5 w-3.5" aria-hidden /> Doublon
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-950">
            <Clock className="h-4 w-4 text-stone-500" aria-hidden />
            <div className="text-xs">
              <p className="font-semibold">Délai moyen de validation</p>
              <p className="text-muted-foreground">
                {avgDelayDays != null
                  ? `${avgDelayDays.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} jours (signalement → validation)`
                  : "— (aucun point validé)"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compteurs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <CounterCard label="Bruts" value={stats.brut} color={SHADOW_COLORS.gray} hint="en attente de vérification terrain" />
        <CounterCard label="Vérifiés" value={stats.verifie} color={SHADOW_COLORS.yellow} hint="prêts pour décision finale" />
        <CounterCard label="Validés" value={stats.valide} color={SHADOW_COLORS.green} hint="comptabilisés officiellement" />
        <CounterCard label="Rejetés" value={stats.rejete} color={SHADOW_COLORS.red} hint="signalements infondés" />
        <CounterCard label="Doublons" value={stats.doublon} color={SHADOW_COLORS.blue} hint="points déjà recensés" />
      </div>

      {/* Actions groupées */}
      {selected.length > 0 ? (
        <Card className="border-stone-400 dark:border-stone-600">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
            <p className="text-xs font-medium">
              {selected.length} point{selected.length > 1 ? "s" : ""} sélectionné{selected.length > 1 ? "s" : ""} —{" "}
              <span className="text-muted-foreground">{selBrut.length} brut(s), {selVerifie.length} vérifié(s)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {selBrut.length > 0 ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => { void runBatch(selBrut.map((p) => p.id), "VERIFIE") }}>
                  <Eye className="h-3.5 w-3.5" aria-hidden /> Marquer {selBrut.length} vérifié{selBrut.length > 1 ? "s" : ""}
                </Button>
              ) : null}
              {selVerifie.length > 0 ? (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => { void runBatch(selVerifie.map((p) => p.id), "VALIDE") }}
                  style={{ backgroundColor: SHADOW_COLORS.green, color: "white" }}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden /> Valider {selVerifie.length}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setConfirmBatch({ ids: selected, next: "REJETE" })}
                style={{ color: SHADOW_COLORS.red, borderColor: SHADOW_COLORS.red }}
              >
                <Ban className="h-3.5 w-3.5" aria-hidden /> Rejeter {selected.length}
              </Button>
              <Button size="sm" variant="ghost" onClick={clearSelection}>Tout désélectionner</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* File d'attente */}
      {queue.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            🎉 File vide — tous les signalements ont été traités. Les nouveaux points arrivent en statut Brut.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              File d&apos;attente ({queue.length})
              <span className="ml-2 font-normal text-muted-foreground">les plus anciens d&apos;abord</span>
            </p>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={selected.length === queue.length && queue.length > 0}
                onCheckedChange={(c) => setSelected(c === true ? queue.map((p) => p.id) : [])}
                aria-label="Sélectionner tous les points"
              />
              Tout sélectionner
            </label>
          </div>
          <div className="grid max-h-[720px] gap-3 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
            {queue.map((p) => {
              const checked = selected.includes(p.id)
              const allowed = TRANSITIONS[p.status] ?? []
              return (
                <Card key={p.id} className={cn("transition-shadow", checked && "ring-2 ring-stone-400 dark:ring-stone-500")}>
                  <CardContent className="space-y-2.5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleSelect(p.id)}
                          aria-label={`Sélectionner ${p.code}`}
                          className="mt-0.5"
                        />
                        <div>
                          <p className="font-mono text-xs font-semibold tabular-nums">{p.code}</p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs">
                            <TypologyIcon code={p.typologyCode} className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {typologyLabel(p.typologyCode)}
                          </p>
                        </div>
                      </div>
                      <ShadowStatusBadge status={p.status} />
                    </div>

                    <div className="flex gap-3">
                      {p.photoUrl ? (
                        <img
                          src={p.photoUrl}
                          alt={`Photo du point ${p.code}`}
                          className="h-16 w-20 shrink-0 rounded-md object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="flex h-16 w-20 shrink-0 items-center justify-center rounded-md bg-stone-100 text-[10px] text-stone-400 dark:bg-stone-800"
                          role="img"
                          aria-label="Pas de photo"
                        >
                          pas de photo
                        </div>
                      )}
                      <div className="min-w-0 flex-1 space-y-0.5 text-[11px]">
                        <p className="truncate text-stone-700 dark:text-stone-300">
                          {p.delegation} · {p.gouvernorat}{p.cite ? ` · ${p.cite}` : ""}
                        </p>
                        <p className="tabular-nums text-muted-foreground">
                          {p.volumeLJ.toLocaleString("fr-FR")} L/j · {formatMillimes(p.priceMillimes)} · perte {formatTnd(p.lossTnd)}/mois
                        </p>
                        <p className="truncate text-muted-foreground">
                          {p.nearestStation
                            ? `${p.nearestStation.name} (${p.nearestStation.distanceM.toLocaleString("fr-FR")} m)`
                            : "aucune station à proximité"}
                        </p>
                      </div>
                    </div>

                    {p.notes ? (
                      <p className="line-clamp-2 rounded bg-stone-50 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground dark:bg-stone-900" title={p.notes}>
                        {p.notes}
                      </p>
                    ) : null}

                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1.5 truncate">
                        <Badge variant="outline" className="px-1.5 text-[10px] font-medium">
                          {SHADOW_SOURCE_LABELS[p.source] ?? p.source}
                        </Badge>
                        {p.reporter}
                      </span>
                      <span>{relDateFr(p.firstSeenAt)}</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 border-t border-dashed border-stone-200 pt-2.5 dark:border-stone-800">
                      {allowed.includes("VERIFIE") ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => { void runTransition(p, "VERIFIE") }}
                          className="h-7 border-amber-300 bg-amber-50 text-[11px] text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        >
                          <Eye className="h-3 w-3" aria-hidden /> Marquer vérifié
                        </Button>
                      ) : null}
                      {allowed.includes("VALIDE") ? (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => { void runTransition(p, "VALIDE") }}
                          className="h-7 text-[11px] text-white"
                          style={{ backgroundColor: SHADOW_COLORS.green }}
                        >
                          <Check className="h-3 w-3" aria-hidden /> Valider
                        </Button>
                      ) : null}
                      {allowed.includes("REJETE") ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => setConfirm({ point: p, next: "REJETE" })}
                          className="h-7 border-rose-300 bg-rose-50 text-[11px] text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300"
                        >
                          <Ban className="h-3 w-3" aria-hidden /> Rejeter
                        </Button>
                      ) : null}
                      {allowed.includes("DOUBLON") ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => setConfirm({ point: p, next: "DOUBLON" })}
                          className="h-7 text-[11px]"
                        >
                          <Copy className="h-3 w-3" aria-hidden /> Doublon
                        </Button>
                      ) : null}
                      {!p.active ? (
                        <span className="self-center text-[11px] text-muted-foreground">(point inactif)</span>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Confirmation — transition individuelle */}
      <Dialog open={confirm !== null} onOpenChange={(o) => { if (!o) setConfirm(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base" style={{ color: confirm?.next === "REJETE" ? SHADOW_COLORS.red : SHADOW_COLORS.blue }}>
              {confirm?.next === "REJETE" ? "Rejeter le signalement ?" : "Marquer comme doublon ?"}
            </DialogTitle>
          </DialogHeader>
          {confirm ? (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Le point <span className="font-semibold text-foreground">{confirm.point.code}</span> (
                {typologyLabel(confirm.point.typologyCode)}, {confirm.point.delegation} —{" "}
                {SHADOW_SOURCE_LABELS[confirm.point.source] ?? confirm.point.source} · {confirm.point.reporter}){" "}
                {confirm.next === "REJETE"
                  ? "sera rejeté : le signalement est jugé infondé. Il sort de la file et n'entre pas dans les statistiques."
                  : "sera marqué doublon : il correspond vraisemblablement à un point déjà recensé."}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirm(null)}>Annuler</Button>
                <Button
                  onClick={() => {
                    const target = confirm
                    setConfirm(null)
                    void runTransition(target.point, target.next)
                  }}
                  style={{
                    backgroundColor: confirm.next === "REJETE" ? SHADOW_COLORS.red : SHADOW_COLORS.blue,
                    color: "white",
                  }}
                >
                  {confirm.next === "REJETE" ? "Confirmer le rejet" : "Confirmer le doublon"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Confirmation — rejet groupé */}
      <Dialog open={confirmBatch !== null} onOpenChange={(o) => { if (!o) setConfirmBatch(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base" style={{ color: SHADOW_COLORS.red }}>
              <Ban className="h-4 w-4" aria-hidden />
              Rejeter {confirmBatch?.ids.length ?? 0} point{(confirmBatch?.ids.length ?? 0) > 1 ? "s" : ""} ?
            </DialogTitle>
          </DialogHeader>
          {confirmBatch ? (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Les {confirmBatch.ids.length} signalements sélectionnés seront rejetés. Cette action est tracée dans
                l&apos;historique et retire les points de la file d&apos;attente.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmBatch(null)} disabled={busy}>Annuler</Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    const target = confirmBatch
                    setConfirmBatch(null)
                    void runBatch(target.ids, target.next)
                  }}
                  style={{ backgroundColor: SHADOW_COLORS.red, color: "white" }}
                >
                  {busy ? "Traitement…" : "Confirmer"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Compteur coloré (5 statuts — couleurs métier fixes)
// ---------------------------------------------------------------------------

function CounterCard({ label, value, color, hint }: { label: string; value: number; color: string; hint: string }) {
  return (
    <Card>
      <CardContent className="relative overflow-hidden p-4">
        <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color }} aria-hidden />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{num(value)}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>
          </div>
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-label={label} />
        </div>
      </CardContent>
    </Card>
  )
}
