'use client'

// T43 — Relances de fraîcheur « J+7 » (onglet Veille, cahier des charges §3.2) :
// fiches stations non revérifiées depuis plus de 7 jours → sélection, envoi de
// relances (notifications RELANCE au portail enseigne, anti-spam 24 h), KPIs de
// fraîcheur et dernière relance connue par fiche.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { KpiCard } from "@/components/shell/kpi-card"
import { toast } from "sonner"
import { useAppStore } from "@/store/app-store"
import type { RelancesResponse, RelancePostResponse } from "@/lib/types"
import {
  AlarmClock, BellRing, CalendarCheck, CheckCircle2, Hourglass, Loader2, RefreshCw,
  Send, ShieldAlert, Users2,
} from "lucide-react"
import { cn } from "@/lib/utils"

const SEUILS = [7, 14, 30]

const dateCourte = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso))

const relanceIlYA = (iso: string) => {
  const j = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (j <= 0) return "aujourd'hui"
  if (j === 1) return "hier"
  return `il y a ${j} j`
}

/** Pastille de retard : ambre au seuil, terracotta au-delà du double. */
const badgeRetard = (j: number, seuil: number) =>
  j >= seuil * 2
    ? "border-[var(--c-terra)]/40 bg-[var(--c-terra)]/10 text-[var(--c-terra)] dark:text-[var(--c-terra-300,var(--c-terra))]"
    : "border-[var(--c-amber)]/40 bg-[var(--c-amber)]/10 text-[var(--c-amber)]"

export function RelancesCard() {
  const brandSlug = useAppStore(s => s.brandSlug)
  const [seuil, setSeuil] = useState(7)
  const [data, setData] = useState<RelancesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const r = await fetch(`/api/relances?brand=${encodeURIComponent(brandSlug)}&seuil=${seuil}`, { signal })
      if (!r.ok) throw new Error(`API /api/relances [${r.status}]`)
      const j = (await r.json()) as RelancesResponse
      setData(j)
      setChecked(new Set())
      setError(null)
    } catch (e) {
      if (signal.aborted) return
      setError(e instanceof Error ? e.message : "Erreur inconnue")
    }
  }, [brandSlug, seuil])

  useEffect(() => {
    const ac = new AbortController()
    const t = setTimeout(() => { void load(ac.signal) }, 0)
    return () => { clearTimeout(t); ac.abort() }
  }, [load])

  const stations = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data?.stations ?? []
    return (data?.stations ?? []).filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(q) ||
      s.gouvernorat.toLowerCase().includes(q) ||
      s.delegation.toLowerCase().includes(q),
    )
  }, [data, search])

  const envoyer = async () => {
    if (!checked.size || sending) return
    setSending(true)
    try {
      const r = await fetch("/api/relances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: brandSlug, codes: Array.from(checked) }),
      })
      const body = (await r.json().catch(() => ({}))) as RelancePostResponse & { error?: string }
      if (r.ok) {
        if (body.sent > 0) {
          toast.success(`${body.sent} relance${body.sent > 1 ? "s" : ""} envoyée${body.sent > 1 ? "s" : ""}`, {
            description: `Le portail ${body.notifiedBrand} reçoit les notifications de re-vérification${body.skipped ? ` · ${body.skipped} ignorée(s) (anti-spam 24 h)` : ""}.`,
          })
        } else {
          toast.info("Aucune relance envoyée", {
            description: "Les fiches sélectionnées ont déjà été relancées dans les dernières 24 h.",
          })
        }
        await load(new AbortController().signal)
      } else {
        toast.error("Envoi impossible", { description: body.error ?? `HTTP ${r.status}` })
      }
    } catch {
      toast.error("Envoi impossible — vérifiez votre réseau.")
    } finally {
      setSending(false)
    }
  }

  const toutesCochees = stations.length > 0 && stations.every(s => checked.has(s.code))
  const cocherTout = () => {
    setChecked(toutesCochees ? new Set() : new Set(stations.map(s => s.code)))
  }
  const cocher = (code: string) => {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const k = data?.kpis

  return (
    <Card id="relances-j7" className="scroll-mt-[calc(var(--cs-header-h,64px)+56px)]">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <AlarmClock className="h-4 w-4 text-[var(--c-amber)]" aria-hidden />
              Relances de fraîcheur — J+{seuil}
            </CardTitle>
            <CardDescription>
              Fiches stations non revérifiées depuis plus de {seuil} jours — cahier des charges §3.2 :
              « délai de mise à jour &lt; 7 jours ». Les relances arrivent dans le centre de
              notifications du portail enseigne.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex rounded-md border border-[var(--c-line)] bg-[var(--c-tint)]/60 p-0.5" role="group" aria-label="Seuil de retard">
              {SEUILS.map(s => (
                <button
                  key={s}
                  onClick={() => setSeuil(s)}
                  aria-pressed={seuil === s}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    seuil === s ? "bg-[var(--c-paper)] text-[var(--c-ink-deep)] shadow-sm" : "text-[var(--c-ink-muted)] hover:text-[var(--c-ink)]",
                  )}
                >
                  J+{s}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => void load(new AbortController().signal)} disabled={busy}>
              <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} aria-hidden /> Actualiser
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ---------- KPIs de fraîcheur ---------- */}
        {k && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Fiches en retard"
              value={<span className="tabular-nums">{k.overdue}</span>}
              // T53-T3 : k.total est compté au NATIONAL par /api/relances (route protégée
              // ce round) — libellé explicite en attendant la correction côté API.
              sub={`sur ${k.total} stations actives (toutes enseignes)`}
              icon={ShieldAlert}
              tone={k.overdue > 0 ? "warning" : "success"}
            />
            <KpiCard
              label="Taux de fraîcheur"
              value={<span className="tabular-nums">{k.freshnessRate.toLocaleString("fr-FR")} %</span>}
              sub={`au seuil J+${seuil} · base nationale`}
              icon={CalendarCheck}
              tone={k.freshnessRate >= 90 ? "success" : "warning"}
            />
            <KpiCard
              label="Retard moyen"
              value={<span className="tabular-nums">{k.avgDaysLate} j</span>}
              sub={k.oldestDays ? `plus ancienne : ${k.oldestDays} j` : "aucune fiche en retard"}
              icon={Hourglass}
              tone="default"
            />
            <KpiCard
              label="Relances 24 h"
              value={<span className="tabular-nums">{k.relanced24h}</span>}
              sub="déjà envoyées (anti-spam)"
              icon={BellRing}
              tone={k.relanced24h > 0 ? "default" : "success"}
            />
          </div>
        )}

        {/* ---------- Barre d'actions ---------- */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filtrer : nom, code, gouvernorat…"
            className="h-8 w-full max-w-[260px] text-xs"
            aria-label="Filtrer les fiches en retard"
          />
          <Button
            size="sm"
            className="h-8 gap-1.5 px-3 text-xs"
            onClick={() => void envoyer()}
            disabled={!checked.size || sending}
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
            {checked.size > 0 ? `Relancer ${checked.size} fiche${checked.size > 1 ? "s" : ""}` : "Relancer la sélection"}
          </Button>
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--c-ink-muted)]">
            <Users2 className="h-3 w-3" aria-hidden />
            {stations.length} fiche{stations.length > 1 ? "s" : ""} affichée{stations.length > 1 ? "s" : ""}
          </span>
        </div>

        {/* ---------- Liste des fiches en retard ---------- */}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!data && !error && (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement des fiches en retard…
          </p>
        )}
        {data && stations.length === 0 && !error && (
          <div className="flex items-center gap-2.5 rounded-lg border border-[var(--c-line)] bg-[var(--c-tint)]/40 px-4 py-3 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--c-green)]" aria-hidden />
            <p>
              <span className="font-medium">Aucune fiche en retard</span> — toutes les stations actives
              de l&apos;enseigne ont été revérifiées dans les {seuil} derniers jours.
            </p>
          </div>
        )}
        {data && stations.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-[var(--c-line-faint)]">
            <table className="w-full text-sm">
              <caption className="sr-only">Fiches stations au-delà du seuil de re-vérification de {seuil} jours</caption>
              <thead>
                <tr className="border-b border-[var(--c-line-faint)] bg-[var(--c-tint)]/50 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">
                  <th scope="col" className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={toutesCochees}
                      onChange={cocherTout}
                      aria-label={toutesCochees ? "Désélectionner toutes les fiches" : "Sélectionner toutes les fiches affichées"}
                      className="h-3.5 w-3.5 accent-[var(--c-brown)]"
                    />
                  </th>
                  <th scope="col" className="px-3 py-2">Station</th>
                  <th scope="col" className="hidden px-3 py-2 md:table-cell">Gouvernorat</th>
                  <th scope="col" className="px-3 py-2">Dernier contrôle</th>
                  <th scope="col" className="hidden px-3 py-2 lg:table-cell">Par</th>
                  <th scope="col" className="px-3 py-2">Dernière relance</th>
                </tr>
              </thead>
              <tbody className="max-h-80 overflow-y-auto scroll-coffee">
                {stations.map(s => (
                  <tr
                    key={s.code}
                    className={cn(
                      "border-b border-[var(--c-line-faint)]/60 transition-colors last:border-0 hover:bg-[var(--c-tint)]/40",
                      checked.has(s.code) && "bg-[var(--c-tint)]/60",
                    )}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={checked.has(s.code)}
                        onChange={() => cocher(s.code)}
                        aria-label={`Sélectionner ${s.name} (${s.code})`}
                        className="h-3.5 w-3.5 accent-[var(--c-brown)]"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.brandColor }} aria-hidden />
                        <span className="min-w-0">
                          <span className="block truncate font-medium leading-tight">{s.name}</span>
                          <span className="block truncate text-[11px] text-[var(--c-ink-muted)]">{s.code}</span>
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-3 py-2 text-xs text-[var(--c-ink-muted)] md:table-cell">
                      {s.gouvernorat}
                      <span className="block text-[10px]">{s.delegation}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs">{dateCourte(s.lastVerified)}</span>
                        <Badge variant="outline" className={cn("text-[10px] tabular-nums", badgeRetard(s.daysLate, seuil))}>
                          +{s.daysLate} j
                        </Badge>
                      </span>
                    </td>
                    <td className="hidden px-3 py-2 text-xs text-[var(--c-ink-muted)] lg:table-cell">
                      {s.verifiedBy || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {s.lastReminderAt ? (
                        <span className="flex items-center gap-1 text-[var(--c-ink-muted)]">
                          <BellRing className="h-3 w-3" aria-hidden /> {relanceIlYA(s.lastReminderAt)}
                        </span>
                      ) : (
                        <span className="text-[var(--c-ink-muted)]">jamais</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-[var(--c-ink-muted)]">
          Une relance envoie une notification <span className="font-medium">RELANCE</span> au portail
          enseigne (visible en direct si le portail est connecté) · anti-spam : une relance maximum par
          fiche et par 24 h · l&apos;envoi est journalisé à l&apos;audit (module VEILLE).
        </p>
      </CardContent>
    </Card>
  )
}
