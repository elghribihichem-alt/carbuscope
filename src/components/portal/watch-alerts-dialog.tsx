"use client"

// Veille automatisée des notes (C.2.6+) — alertes email programmées déclenchées
// quand une station chute de seuil points. Dialog ouvert depuis la carte
// « Surveillance des notes » du portail Avis & réputation.

import { useEffect, useMemo, useState } from "react"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import {
  BellPlus, Zap, CalendarDays, CalendarRange, Mail, Trash2, Loader2, Send, Info,
  Radar as RadarIcon, MailCheck, Target,
} from "lucide-react"
import type { WatchlistAlertDTO } from "@/lib/types"
import { relDays } from "@/components/settings/settings-shared"
import { cn } from "@/lib/utils"

type WatchLite = { code: string; name: string; gouvernorat: string; delta: number }

const FREQUENCY_OPTIONS = [
  { value: "IMMEDIATE", label: "Immédiat", hint: "Dès la détection d'une chute", icon: Zap },
  { value: "DAILY", label: "Digest quotidien", hint: "Résumé chaque matin à 8 h", icon: CalendarDays },
  { value: "WEEKLY", label: "Digest hebdomadaire", hint: "Synthèse le lundi", icon: CalendarRange },
] as const

const frequencyLabel = (v: string) => FREQUENCY_OPTIONS.find(f => f.value === v)?.label ?? v

const fmtPt = (n: number) => `${n.toFixed(1).replace(".", ",")} pt`

export function WatchAlertsDialog({
  open, onOpenChange, brandSlug, brandName, watchlist,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  brandSlug: string
  brandName: string
  watchlist: WatchLite[]
}) {
  // ----- Données -----
  const [alerts, setAlerts] = useState<WatchlistAlertDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ----- Formulaire -----
  const [scopeMode, setScopeMode] = useState<"ALL" | "STATION">("ALL")
  const [stationCode, setStationCode] = useState<string>(watchlist[0]?.code ?? "")
  const [threshold, setThreshold] = useState(0.8)
  const [frequency, setFrequency] = useState<string>("DAILY")
  const [email, setEmail] = useState(`qualite.${brandSlug.replace(/[^a-z0-9]/gi, "")}@example.tn`)
  const [sending, setSending] = useState(false)

  // ----- Aperçu email de test -----
  const [testPreview, setTestPreview] = useState<{ subject: string; preview: string; recipients: number } | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !brandSlug) return
    let cancelled = false
    // Reset + fetch différés hors du corps synchrone de l'effet (règle set-state-in-effect).
    const timer = window.setTimeout(() => {
      if (cancelled) return
      setAlerts(null)
      setError(null)
      fetch(`/api/watchlist-alerts?brand=${encodeURIComponent(brandSlug)}`)
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then(j => { if (!cancelled) setAlerts(j.alerts) })
        .catch(e => { if (!cancelled) setError(e.message) })
    }, 0)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [open, brandSlug])

  // Station effectivement ciblée : choix explicite sinon 1ʳᵉ station de la watchlist
  // (dérivation au rendu plutôt qu'un effet — règle set-state-in-effect).
  const effectiveStationCode = stationCode && watchlist.some(w => w.code === stationCode)
    ? stationCode
    : (watchlist[0]?.code ?? "")

  // Évaluation live du seuil choisi dans le formulaire (client-side, données fraîches du portail)
  const liveHint = useMemo(() => {
    const exceeded = watchlist.filter(w =>
      w.delta >= threshold && (scopeMode === "ALL" || w.code === effectiveStationCode))
    return {
      count: exceeded.length,
      examples: exceeded.slice(0, 2).map(w => w.name),
    }
  }, [watchlist, threshold, scopeMode, effectiveStationCode])

  // ----- Actions -----
  const createAlert = () => {
    if (scopeMode === "STATION" && !effectiveStationCode) {
      toast.error("Choisissez la station à surveiller.")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Adresse email invalide.")
      return
    }
    setSending(true)
    fetch("/api/watchlist-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandSlug, scope: scopeMode === "ALL" ? "ALL" : effectiveStationCode,
        thresholdPoints: threshold, frequency, email: email.trim(),
      }),
    })
      .then(r => (r.ok ? r.json() : r.json().then(j => Promise.reject(new Error(j.error ?? `HTTP ${r.status}`)))))
      .then(({ alert }: { alert: WatchlistAlertDTO }) => {
        setAlerts(prev => [alert, ...(prev ?? [])])
        toast.success("Alerte programmée.", {
          description: alert.nowExceedCount > 0
            ? `${alert.nowExceedCount} station${alert.nowExceedCount > 1 ? "s" : ""} dépassent déjà ce seuil — le moteur de veille veillera sur « ${alert.stationLabel} ».`
            : `Aucune station ne dépasse ce seuil pour l'instant — vous serez alerté dès la première chute.`,
        })
      })
      .catch(e => toast.error(e instanceof Error ? e.message : "Échec de la programmation"))
      .finally(() => setSending(false))
  }

  const toggleAlert = (a: WatchlistAlertDTO) => {
    const next = !a.active
    // Mise à jour optimiste + rollback en erreur
    setAlerts(prev => prev?.map(x => x.id === a.id ? { ...x, active: next } : x) ?? prev)
    fetch(`/api/watchlist-alerts/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next }),
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(({ alert }: { alert: { triggerCount: number; lastTriggeredAt: string | null } }) => {
        setAlerts(prev => prev?.map(x => x.id === a.id
          ? { ...x, triggerCount: alert.triggerCount, lastTriggeredAt: alert.lastTriggeredAt, active: next }
          : x) ?? prev)
        toast.success(next
          ? `Alerte réactivée — ${alert.triggerCount} déclenchement${alert.triggerCount > 1 ? "s" : ""} cumulé${alert.triggerCount > 1 ? "s" : ""}.`
          : "Alerte mise en pause.")
      })
      .catch(() => {
        setAlerts(prev => prev?.map(x => x.id === a.id ? { ...x, active: a.active } : x) ?? prev)
        toast.error("Échec du changement d'état.")
      })
  }

  const deleteAlert = (a: WatchlistAlertDTO) => {
    fetch(`/api/watchlist-alerts/${a.id}`, { method: "DELETE" })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(() => {
        setAlerts(prev => prev?.filter(x => x.id !== a.id) ?? prev)
        toast.success("Alerte supprimée.")
      })
      .catch(() => toast.error("Échec de la suppression."))
  }

  const sendTest = (a: WatchlistAlertDTO) => {
    setTestingId(a.id)
    fetch(`/api/watchlist-alerts/${a.id}`, { method: "POST" })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { subject: string; preview: string; recipients: number }) => setTestPreview(j))
      .catch(() => toast.error("Échec de l'aperçu email."))
      .finally(() => setTestingId(null))
  }

  const activeCount = alerts?.filter(a => a.active).length ?? 0

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400">
                <RadarIcon className="h-4 w-4" aria-hidden />
              </span>
              Veille automatisée des notes
            </DialogTitle>
            <DialogDescription>
              Programmez des alertes email déclenchées quand une station de {brandName} chute de
              seuil points — le moteur surveille la watchlist en continu, même quand le portail est fermé.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          ) : alerts === null ? (
            <div className="space-y-2 py-6 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-hidden />
              Chargement des alertes programmées…
            </div>
          ) : (
            <div className="space-y-5">
              {/* ---------- Alertes existantes ---------- */}
              <section aria-labelledby="wa-existing" className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 id="wa-existing" className="text-sm font-semibold">
                    Alertes programmées
                    {activeCount > 0 && (
                      <Badge variant="outline" className="ml-2 gap-1 border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                        {activeCount} active{activeCount > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </h3>
                </div>

                {alerts.length === 0 ? (
                  <div className="flex items-start gap-3 rounded-lg border border-dashed p-4">
                    <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="text-sm leading-relaxed">
                      <strong>Aucune alerte programmée.</strong>{" "}
                      <span className="text-muted-foreground">
                        Vous surveillez actuellement {watchlist.length} station{watchlist.length > 1 ? "s" : ""} manuellement —
                        programmez une alerte ci-dessous pour être notifié automatiquement.
                      </span>
                    </div>
                  </div>
                ) : (
                  <ScrollArea className="max-h-72 -mr-2 pr-2">
                    <ul className="space-y-2">
                      {alerts.map(a => (
                        <li
                          key={a.id}
                          className={cn(
                            "rounded-lg border p-3 transition-all",
                            a.active
                              ? "border-orange-200/80 bg-orange-50/30 dark:border-orange-900/50 dark:bg-orange-950/20"
                              : "border-border bg-muted/30 opacity-70",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <MailCheck className={cn("h-3.5 w-3.5 shrink-0", a.active ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground")} aria-hidden />
                                <span className="truncate text-sm font-semibold">{a.stationLabel}</span>
                                <Badge variant="outline" className="shrink-0 text-[10px]">
                                  {frequencyLabel(a.frequency)}
                                </Badge>
                                <Badge variant="outline" className="shrink-0 border-red-300/70 text-[10px] font-bold text-red-700 dark:border-red-800 dark:text-red-400">
                                  seuil −{fmtPt(a.thresholdPoints)}
                                </Badge>
                              </div>
                              <p className="mt-1 truncate text-xs text-muted-foreground" title={a.email}>
                                <Mail className="mr-1 inline h-3 w-3" aria-hidden />{a.email}
                              </p>
                            </div>
                            <Switch
                              checked={a.active}
                              onCheckedChange={() => toggleAlert(a)}
                              aria-label={a.active ? `Mettre en pause l'alerte ${a.stationLabel}` : `Réactiver l'alerte ${a.stationLabel}`}
                            />
                          </div>

                          {/* Évaluation live */}
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                            {a.nowExceedCount > 0 ? (
                              <span className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-400">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" aria-hidden />
                                {a.nowExceedCount} station{a.nowExceedCount > 1 ? "s" : ""} dépassent ce seuil actuellement
                                {a.nowExamples.length > 0 && (
                                  <span className="font-normal text-muted-foreground">({a.nowExamples.join(", ")})</span>
                                )}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                                Situation stable sous ce seuil
                              </span>
                            )}
                            <span className="text-muted-foreground">
                              {a.triggerCount} déclenchement{a.triggerCount > 1 ? "s" : ""}
                              {a.lastTriggeredAt ? ` · dernier ${relDays(a.lastTriggeredAt)}` : ""}
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 gap-1.5 px-2 text-[11px]"
                              disabled={testingId === a.id}
                              onClick={() => sendTest(a)}
                            >
                              {testingId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
                              Aperçu email
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 gap-1.5 px-2 text-[11px] text-red-600 hover:text-red-700 dark:text-red-400"
                              onClick={() => deleteAlert(a)}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Supprimer
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </section>

              <Separator />

              {/* ---------- Nouvelle alerte ---------- */}
              <section aria-labelledby="wa-new" className="space-y-4">
                <h3 id="wa-new" className="flex items-center gap-2 text-sm font-semibold">
                  <BellPlus className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden />
                  Programmer une nouvelle alerte
                </h3>

                {/* Périmètre */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Périmètre surveillé</Label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      aria-pressed={scopeMode === "ALL"}
                      onClick={() => setScopeMode("ALL")}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-all hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        scopeMode === "ALL"
                          ? "border-orange-400 bg-orange-50/60 ring-1 ring-orange-300 dark:border-orange-700 dark:bg-orange-950/40 dark:ring-orange-800"
                          : "border-border",
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        <RadarIcon className="h-3.5 w-3.5" aria-hidden />
                        Toute la watchlist
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {watchlist.length} station{watchlist.length > 1 ? "s" : ""} en perte de vitesse détectée{watchlist.length > 1 ? "s" : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={scopeMode === "STATION"}
                      onClick={() => setScopeMode("STATION")}
                      disabled={watchlist.length === 0}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-all hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                        scopeMode === "STATION"
                          ? "border-orange-400 bg-orange-50/60 ring-1 ring-orange-300 dark:border-orange-700 dark:bg-orange-950/40 dark:ring-orange-800"
                          : "border-border",
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        <Target className="h-3.5 w-3.5" aria-hidden />
                        Une station précise
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        Surveiller une station sensible au cas par cas
                      </span>
                    </button>
                  </div>

                  {scopeMode === "STATION" && watchlist.length > 0 && (
                    <div className="space-y-1.5">
                      <Label htmlFor="wa-station" className="text-xs font-medium">Station à surveiller</Label>
                      <Select value={effectiveStationCode} onValueChange={setStationCode}>
                        <SelectTrigger id="wa-station" className="h-9">
                          <SelectValue placeholder="Choisir une station" />
                        </SelectTrigger>
                        <SelectContent>
                          {watchlist.map(w => (
                            <SelectItem key={w.code} value={w.code}>
                              {w.name} — chute {fmtPt(w.delta)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Seuil */}
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label className="text-xs font-medium">Seuil de déclenchement (chute de note)</Label>
                    <span className="text-sm font-semibold tabular-nums text-primary">−{fmtPt(threshold)}</span>
                  </div>
                  <Slider
                    value={[threshold]}
                    min={0.3} max={2} step={0.1}
                    onValueChange={v => setThreshold(v[0] ?? threshold)}
                    aria-label="Seuil de déclenchement en points"
                  />
                  <p className="flex items-start gap-1.5 text-[11px] leading-snug" aria-live="polite">
                    <Info className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                    {liveHint.count > 0 ? (
                      <span>
                        <strong className="text-red-700 dark:text-red-400">{liveHint.count} station{liveHint.count > 1 ? "s" : ""}</strong>{" "}
                        dépasserait déjà ce seuil{liveHint.examples.length > 0 && (
                          <> — {liveHint.examples.join(", ")}</>
                        )}
                        {liveHint.count > 2 && <>…</>}.
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Aucune station ne dépasse ce seuil — vous serez notifié à la première chute détectée.</span>
                    )}
                  </p>
                </div>

                {/* Fréquence */}
                <fieldset className="space-y-2">
                  <legend className="text-xs font-medium">Fréquence d’envoi</legend>
                  <RadioGroup
                    value={frequency}
                    onValueChange={setFrequency}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                  >
                    {FREQUENCY_OPTIONS.map(f => {
                      const Icon = f.icon
                      return (
                        <label
                          key={f.value}
                          className={cn(
                            "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-all hover:bg-muted/40",
                            frequency === f.value
                              ? "border-orange-400 bg-orange-50/60 ring-1 ring-orange-300 dark:border-orange-700 dark:bg-orange-950/40 dark:ring-orange-800"
                              : "border-border",
                          )}
                        >
                          <RadioGroupItem value={f.value} className="sr-only" />
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" aria-hidden />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold leading-tight">{f.label}</span>
                            <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">{f.hint}</span>
                          </span>
                        </label>
                      )
                    })}
                  </RadioGroup>
                </fieldset>

                {/* Destinataire */}
                <div className="space-y-1.5">
                  <Label htmlFor="wa-email" className="text-xs font-medium">Destinataire</Label>
                  <div className="flex gap-2">
                    <Mail className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <Input
                      id="wa-email" type="email" className="h-9"
                      value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="qualite@votre-enseigne.tn"
                      autoComplete="off"
                    />
                  </div>
                </div>

                <Button onClick={createAlert} disabled={sending} className="w-full gap-2">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BellPlus className="h-4 w-4" aria-hidden />}
                  Programmer l’alerte
                </Button>
              </section>
            </div>
          )}

          <DialogFooter className="mt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Aperçu email de test ---------- */}
      <Dialog open={testPreview !== null} onOpenChange={o => { if (!o) setTestPreview(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden />
              Aperçu de la notification
            </DialogTitle>
            <DialogDescription>
              Email tel qu’il serait envoyé au destinataire (démo — aucun envoi réel).
            </DialogDescription>
          </DialogHeader>
          {testPreview && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Objet</p>
                <p className="mt-0.5 text-sm font-semibold">{testPreview.subject}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Corps</p>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground">
                  {testPreview.preview}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestPreview(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
