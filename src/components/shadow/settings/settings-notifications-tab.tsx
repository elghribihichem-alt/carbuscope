'use client'

// Shadow Market (T44-e) — Paramètres · onglet « 🔔 Notifications ».
// Alerte automatique « nouveau point détecté à moins de X m d'une station » :
// configuration (notifyActive / notifyRadiusM via PATCH /api/shadow/config),
// règles documentées avec pastilles de sévérité, simulation de bout en bout
// (POST /api/shadow/points à ~X/2 m de la station la plus menacée → alerte
// CRITICAL → vérification overview → DELETE du point de test) et préférences
// par canal (simulées — dispatch réel : moteur de veille existant).

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Bell, BellRing, CircleCheck, FlaskConical, Info, Loader2, Zap } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ShadowLevelBadge, formatTnd } from "../shadow-shared"
import type { ShadowAlertDTO, ShadowConfigDTO, ShadowMapResponse, ShadowOverviewResponse, ShadowPointDTO } from "@/lib/types"

const RADII_OPTIONS = [250, 500, 750, 1000]

const RULES: { title: string; detail: string; severity: string; severityClass: string; kind: string }[] = [
  {
    title: "Nouveau point à moins de X m d'une station",
    detail: "Tout signalement dans le rayon de notification déclenche une alerte CRITICAL (NEW_POINTS) et notifie l'enseigne menacée — perte estimée jointe.",
    severity: "CRITIQUE",
    severityClass: "border-transparent bg-[#E53935] text-white",
    kind: "NEW_POINTS",
  },
  {
    title: "Disparition d'un point rouge",
    detail: "La disparition constatée d'un point classé rouge génère une alerte INFO (NEUTRALISE) — feedback d'efficacité des contrôles.",
    severity: "INFO",
    severityClass: "border-transparent bg-[#4CAF50] text-white",
    kind: "NEUTRALISE",
  },
  {
    title: "Recrudescence de zone > +30 % / semaine",
    detail: "Une hausse de plus de 30 % des points actifs d'une zone sur 7 jours déclenche une alerte SURGE — afflux à documenter (contrebande frontalière, prix).",
    severity: "ALERTE",
    severityClass: "border-transparent bg-[#FF9800] text-white",
    kind: "SURGE",
  },
]

const CHANNELS: { key: string; label: string; hint: string }[] = [
  { key: "inapp", label: "Email in-app (boîte plateforme)", hint: "Notification dans l'application dès l'alerte" },
  { key: "digest", label: "Digest hebdomadaire", hint: "Récapitulatif lundi 08:00 (Tunis)" },
  { key: "realtime", label: "Temps réel (push)", hint: "Mobile contrôleurs + navigateur" },
]

type SimResult = { point: ShadowPointDTO; alert: ShadowAlertDTO | null; station: { code: string; name: string; gouvernorat: string } }

export function SettingsNotificationsTab() {
  const [config, setConfig] = useState<ShadowConfigDTO | null>(null)
  const [map, setMap] = useState<ShadowMapResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [patching, setPatching] = useState(false)

  // Simulation
  const [simulating, setSimulating] = useState(false)
  const [simResult, setSimResult] = useState<SimResult | null>(null)
  const [recentAlerts, setRecentAlerts] = useState<ShadowAlertDTO[] | null>(null)

  // Préférences par canal (simulées — état local)
  const [channels, setChannels] = useState<Record<string, boolean>>({ inapp: true, digest: true, realtime: false })

  useEffect(() => {
    const ctrl = new AbortController()
    Promise.all([
      fetch("/api/shadow/config", { signal: ctrl.signal }).then(r => {
        if (!r.ok) throw new Error("config")
        return r.json() as Promise<ShadowConfigDTO>
      }),
      fetch("/api/shadow/map", { signal: ctrl.signal }).then(r => {
        if (!r.ok) throw new Error("map")
        return r.json() as Promise<ShadowMapResponse>
      }),
    ])
      .then(([cfg, m]) => {
        setConfig(cfg)
        setMap(m)
      })
      .catch(() => setError("La configuration des notifications n'a pas pu être chargée."))
    return () => ctrl.abort()
  }, [])

  const patchConfig = (patch: Record<string, unknown>, okMessage: string, okDesc: string) => {
    setPatching(true)
    fetch("/api/shadow/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then(async r => {
        if (!r.ok) {
          const j = (await r.json().catch(() => null)) as { error?: string } | null
          throw new Error(j?.error ?? "refus")
        }
        return r.json() as Promise<ShadowConfigDTO>
      })
      .then(cfg => {
        setConfig(cfg)
        toast.success(okMessage, { description: okDesc })
      })
      .catch(e => {
        toast.error("Modification impossible", { description: e instanceof Error ? e.message : "Réessayez." })
      })
      .finally(() => setPatching(false))
  }

  // Station cible de la simulation : la plus menacée de la carte.
  const simTarget = useMemo(
    () => [...(map?.stations ?? [])].sort((a, b) => b.lossTnd - a.lossTnd)[0] ?? null,
    [map],
  )

  const runSimulation = async () => {
    if (!simTarget) return
    setSimulating(true)
    setSimResult(null)
    setRecentAlerts(null)
    try {
      // Distance ≈ la moitié du rayon configuré (garantit le déclenchement).
      const dist = Math.max(120, Math.round((config?.notifyRadiusM ?? 500) * 0.5))
      const lat = simTarget.lat + dist / 111320 // ~dist mètres au nord
      const r = await fetch("/api/shadow/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typologyCode: "CAMION_CITERNE",
          gouvernorat: simTarget.gouvernorat,
          delegation: simTarget.delegation,
          cite: null,
          lat,
          lng: simTarget.lng,
          volumeLJ: 2000,
          priceMillimes: null,
          notes: "Point de test généré depuis Paramètres → Notifications (simulation de la règle NEW_POINTS).",
          reporter: "Simulation (Paramètres)",
          source: "AUDIT",
        }),
      })
      if (!r.ok) throw new Error("post")
      const j = (await r.json()) as { point: ShadowPointDTO; alert: ShadowAlertDTO | null }
      setSimResult({ point: j.point, alert: j.alert, station: simTarget })
      if (j.alert) {
        toast.success("Règle déclenchée — alerte créée", {
          description: j.alert.title,
        })
      } else {
        toast.warning("Aucune alerte générée", {
          description: "Le point simulé est au-delà du rayon de notification ou les alertes sont désactivées.",
        })
      }

      // Nettoyage : suppression douce du point de test (DISPARITION tracée).
      const d = await fetch(`/api/shadow/points/${j.point.id}`, { method: "DELETE" })
      if (d.ok) {
        toast.info("Point de test nettoyé", {
          description: `${j.point.code} marqué disparu (l'alerte générée reste consultable pour la démonstration).`,
        })
      }

      // Vérification : l'alerte apparaît bien dans la vue d'ensemble.
      const o = await fetch("/api/shadow/overview")
      if (o.ok) {
        const ov = (await o.json()) as ShadowOverviewResponse
        setRecentAlerts(ov.alerts.slice(0, 4))
      }
    } catch {
      toast.error("Simulation impossible", { description: "Le point de test n'a pas pu être créé. Réessayez." })
    } finally {
      setSimulating(false)
    }
  }

  if (error) {
    return <div className="rounded-xl border border-dashed border-[#E53935]/50 p-6 text-center text-sm text-muted-foreground">{error}</div>
  }
  if (!config || !map) {
    return (
      <div className="space-y-3">
        <div className="h-32 animate-pulse rounded-xl bg-stone-200 dark:bg-stone-800" />
        <div className="h-48 animate-pulse rounded-xl bg-stone-200 dark:bg-stone-800" />
      </div>
    )
  }

  const radius = config.notifyRadiusM
  const alertPreview =
    `🔔 [CRITIQUE] ${simTarget?.gouvernorat ?? "Médenine"} : nouveau point à ~${Math.max(120, Math.round(radius * 0.5))} m ` +
    `de la station ${simTarget?.name ?? "…"} — camion-citerne, ~2 000 L/j, perte estimée ~${formatTnd(2000 * 0.19 * 30.4 * 0.75)}/mois.`

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Configuration */}
        <Card className="border-stone-200 bg-white/95 dark:border-stone-800 dark:bg-stone-900/95">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-50">
              <Bell className="h-4 w-4 text-[#E53935]" aria-hidden />
              Alerte « nouveau point proche station »
            </h3>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-800">
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-stone-800 dark:text-stone-100">Notifications actives</p>
                <p className="text-[11px] text-muted-foreground">Interrupteur global — coupe toute génération d&apos;alerte NEW_POINTS.</p>
              </div>
              <label className="flex shrink-0 items-center gap-2">
                {patching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />}
                <Switch
                  checked={config.notifyActive}
                  onCheckedChange={v =>
                    patchConfig(
                      { notifyActive: v },
                      v ? "Notifications activées" : "Notifications désactivées",
                      v
                        ? "Tout nouveau point dans le rayon déclenchera une alerte + notification enseigne."
                        : "Aucune alerte NEW_POINTS ne sera générée (les autres règles restent actives).",
                    )
                  }
                  aria-label="Activer les notifications"
                />
              </label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Rayon de notification (m)</Label>
              <Select
                value={String(config.notifyRadiusM)}
                onValueChange={v =>
                  patchConfig(
                    { notifyRadiusM: Number(v) },
                    "Rayon de notification mis à jour",
                    `Seuil de déclenchement : ${Number(v).toLocaleString("fr-FR")} m autour de chaque station.`,
                  )
                }
              >
                <SelectTrigger className="w-[180px]" aria-label="Rayon de notification">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RADII_OPTIONS.map(o => (
                    <SelectItem key={o} value={String(o)}>{o.toLocaleString("fr-FR")} m</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Un point recensé à moins de {radius.toLocaleString("fr-FR")} m d&apos;une station déclenche l&apos;alerte.
              </p>
            </div>
            <div className="rounded-xl bg-stone-50 p-3 dark:bg-stone-900">
              <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Aperçu du libellé généré</p>
              <p className="text-[11.5px] leading-relaxed text-stone-700 dark:text-stone-300">{alertPreview}</p>
            </div>
          </CardContent>
        </Card>

        {/* Règles */}
        <Card className="border-stone-200 bg-white/95 dark:border-stone-800 dark:bg-stone-900/95">
          <CardContent className="space-y-3 p-4 sm:p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-50">
              <Zap className="h-4 w-4 text-[#FF9800]" aria-hidden />
              Règles de notification
            </h3>
            <div className="space-y-2">
              {RULES.map(rule => (
                <div key={rule.kind} className="rounded-xl border border-stone-200 p-3 dark:border-stone-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] font-bold ${rule.severityClass}`}>{rule.severity}</Badge>
                    <p className="text-[12.5px] font-bold text-stone-800 dark:text-stone-100">{rule.title}</p>
                    <code className="ml-auto rounded bg-stone-100 px-1 py-px font-mono text-[9.5px] text-stone-500 dark:bg-stone-800">{rule.kind}</code>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{rule.detail}</p>
                </div>
              ))}
            </div>
            <p className="flex items-start gap-2 rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-2 text-[10.5px] leading-relaxed text-muted-foreground dark:border-stone-700 dark:bg-stone-900">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Rayon de substitution « X » : {radius.toLocaleString("fr-FR")} m (paramètre ci-contre). Les pastilles
              reprennent la charte métier : rouge critique · vert information · orange recrudescence.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Simulation */}
      <Card className="border-stone-200 bg-white/95 dark:border-stone-800 dark:bg-stone-900/95">
        <CardContent className="space-y-3 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-50">
              <FlaskConical className="h-4 w-4 text-purple-600 dark:text-purple-400" aria-hidden />
              Tester la règle « nouveau point proche station »
            </h3>
            <Button onClick={() => void runSimulation()} disabled={simulating || !config.notifyActive} className="gap-1.5">
              {simulating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BellRing className="h-4 w-4" aria-hidden />}
              {simulating ? "Test en cours…" : "Tester la règle"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Crée un point factice (camion-citerne, ~2 000 L/j) à ~{Math.max(120, Math.round(radius * 0.5))} m de la station la
            plus menacée {simTarget ? `(${simTarget.name} — ${simTarget.gouvernorat}, ${formatTnd(simTarget.lossTnd)}/mois)` : ""},
            déclenche l&apos;alerte, vérifie sa présence dans la vue d&apos;ensemble puis supprime le point de test.
            {!config.notifyActive && " ⚠️ Notifications désactivées — activez l'interrupteur pour simuler."}
          </p>

          {simResult && (
            <div className="space-y-2.5">
              <div className={`rounded-xl border p-3 ${simResult.alert ? "border-[#E53935]/40 bg-[#E53935]/5" : "border-stone-300 dark:border-stone-700"}`}>
                <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-bold text-stone-900 dark:text-stone-50">
                  {simResult.alert ? (
                    <>
                      <Badge variant="outline" className="border-transparent bg-[#E53935] text-white">
                        {simResult.alert.severity === "CRITICAL" ? "CRITIQUE" : "MOYENNE"}
                      </Badge>
                      Alerte générée : {simResult.alert.kind === "NEW_POINTS" ? "nouveaux points" : simResult.alert.kind}
                    </>
                  ) : (
                    "Aucune alerte générée (hors rayon)"
                  )}
                </p>
                {simResult.alert ? (
                  <>
                    <p className="mt-1 text-[12px] font-semibold text-stone-800 dark:text-stone-100">{simResult.alert.title}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{simResult.alert.detail}</p>
                    <p className="mt-1.5 flex items-center gap-2 text-[10.5px] text-muted-foreground">
                      <CircleCheck className="h-3.5 w-3.5 text-[#4CAF50]" aria-hidden />
                      Point de test <code className="rounded bg-stone-100 px-1 dark:bg-stone-800">{simResult.point.code}</code> créé
                      puis supprimé — l&apos;alerte reste consultable dans Vue d&apos;ensemble → Alertes.
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Le point simulé était au-delà du rayon de {radius.toLocaleString("fr-FR")} m — rapprochez le rayon ou
                    réessayez.
                  </p>
                )}
              </div>
              {recentAlerts && recentAlerts.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                    Vérification — dernières alertes de la vue d&apos;ensemble
                  </p>
                  <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
                    {recentAlerts.map(a => (
                      <div
                        key={a.id}
                        className={`flex items-start gap-2 rounded-lg border p-2.5 ${
                          simResult.alert?.id === a.id
                            ? "border-[#E53935]/60 bg-[#E53935]/5"
                            : "border-stone-200 dark:border-stone-800"
                        }`}
                      >
                        <span
                          className="mt-1 h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: a.severity === "CRITICAL" ? "#E53935" : a.severity === "MEDIUM" ? "#FF9800" : "#FFC107" }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11.5px] font-semibold text-stone-800 dark:text-stone-100" title={a.title}>
                            {a.title}
                            {simResult.alert?.id === a.id && (
                              <Badge variant="outline" className="ml-1.5 border-[#E53935]/50 bg-[#E53935]/10 text-[9px] text-[#C62828]">
                                générée par le test
                              </Badge>
                            )}
                          </p>
                          <p className="text-[10.5px] text-muted-foreground">
                            {a.zone} · {new Date(a.date).toLocaleString("fr-FR")} · {formatTnd(a.lossTnd)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Préférences par canal */}
      <Card className="border-stone-200 bg-white/95 dark:border-stone-800 dark:bg-stone-900/95">
        <CardContent className="space-y-3 p-4 sm:p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-50">
            <span aria-hidden>📮</span> Préférences par canal
          </h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {CHANNELS.map(c => (
              <label
                key={c.key}
                className="flex cursor-pointer items-start justify-between gap-2.5 rounded-xl border border-stone-200 p-3 transition-colors hover:border-stone-400 dark:border-stone-800"
              >
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-bold text-stone-800 dark:text-stone-100">{c.label}</span>
                  <span className="block text-[10.5px] leading-snug text-muted-foreground">{c.hint}</span>
                </span>
                <Switch
                  checked={channels[c.key]}
                  onCheckedChange={v => {
                    setChannels(prev => ({ ...prev, [c.key]: v }))
                    toast.info(v ? `Canal activé : ${c.label}` : `Canal désactivé : ${c.label}`, {
                      description: "Préférence conservée le temps de la session — le dispatch réel est assuré par le moteur de veille existant.",
                    })
                  }}
                  aria-label={c.label}
                />
              </label>
            ))}
          </div>
          <p className="flex items-start gap-2 rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-2 text-[10.5px] leading-relaxed text-muted-foreground dark:border-stone-700 dark:bg-stone-900">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Canaux simulés (état local) — le dispatch réel des alertes Shadow Market est assuré par le moteur de veille
            existant de la plateforme (notifications portail + email).
          </p>
          <div className="flex items-center gap-2 rounded-xl bg-stone-50 p-3 text-[11px] text-muted-foreground dark:bg-stone-900">
            <ShadowLevelBadge level="RED" loss={15000} />
            <span>Exemple de badge d&apos;alerte dans le fil — cliquer une alerte ouvre la station concernée sur la cartographie.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
