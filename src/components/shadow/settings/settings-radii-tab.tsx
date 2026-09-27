'use client'

// Shadow Market (T44-e) — Paramètres · onglet « 📐 Rayons & Seuils ».
// Configuration des cercles de cannibalisation (3 rayons d'affichage + rayon
// principal), seuil de zone rouge, seuils de perte (rouge / orange) et marge
// détaillante réglementée. Aperçu SVG interactif recalculé en direct pendant
// la saisie + bandeau de reclassification des stations (impact des nouveaux
// seuils, calcul client sur /api/shadow/map). Enregistrement : PATCH
// /api/shadow/config.

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Info, Loader2, RefreshCw, Save, Sigma } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AssumptionNote, ShadowLevelBadge, formatTnd } from "../shadow-shared"
import type { ShadowConfigDTO, ShadowLevel, ShadowMapResponse } from "@/lib/types"

const CANNIB_OPTIONS = [500, 1000, 1500, 2000, 3000]
const EXAMPLE_POINTS = [300, 900, 1700, 2600] // distances d'exemple (m)

const pointColor = (d: number, cannib: number): string => {
  if (d <= cannib * 0.33) return "#E53935"
  if (d <= cannib * 0.66) return "#FF9800"
  if (d <= cannib) return "#FFC107"
  return "#4CAF50"
}

const num = (v: string): number => {
  const n = Number(v.replace(",", "."))
  return Number.isFinite(n) ? n : NaN
}

export function SettingsRadiiTab() {
  const [config, setConfig] = useState<ShadowConfigDTO | null>(null)
  const [map, setMap] = useState<ShadowMapResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [nonce, setNonce] = useState(0)

  // Champs du formulaire (chaînes — conversion à la validation)
  const [r1, setR1] = useState("")
  const [r2, setR2] = useState("")
  const [r3, setR3] = useState("")
  const [cannib, setCannib] = useState("2000")
  const [redThreshold, setRedThreshold] = useState("")
  const [lossRed, setLossRed] = useState("")
  const [lossOrange, setLossOrange] = useState("")
  const [margin, setMargin] = useState("")

  // Application d'une configuration aux champs du formulaire (init + reset).
  const applyConfig = (cfg: ShadowConfigDTO) => {
    setR1(String(cfg.radiiM[0] ?? 500))
    setR2(String(cfg.radiiM[1] ?? 1000))
    setR3(String(cfg.radiiM[2] ?? 2000))
    setCannib(String(cfg.cannibRadiusM))
    setRedThreshold(String(cfg.redZoneThreshold))
    setLossRed(String(cfg.lossRedTnd))
    setLossOrange(String(cfg.lossOrangeTnd))
    setMargin(String(cfg.marginTndPerL).replace(".", ","))
  }

  // Chargement initial (et après « Réessayer ») : config + carte
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
        setError(null)
        setConfig(cfg)
        setMap(m)
        applyConfig(cfg)
      })
      .catch(() => setError("La configuration du module n'a pas pu être chargée."))
    return () => ctrl.abort()
  }, [nonce])

  // ---- Validation live ----
  const v = useMemo(() => {
    const vr = [num(r1), num(r2), num(r3)]
    const radiiOk = vr.every(x => Number.isFinite(x) && x >= 100 && x <= 5000)
    const increasing = radiiOk && vr[0] < vr[1] && vr[1] < vr[2]
    const thresholdOk = Number.isFinite(num(redThreshold)) && num(redThreshold) >= 3 && num(redThreshold) <= 15
    const redOk = Number.isFinite(num(lossRed)) && num(lossRed) >= 500 && num(lossRed) <= 10_000_000
    const orangeOk = Number.isFinite(num(lossOrange)) && num(lossOrange) >= 100 && num(lossOrange) <= 10_000_000
    const orderOk = redOk && orangeOk && num(lossRed) > num(lossOrange)
    const marginOk = Number.isFinite(num(margin)) && num(margin) >= 0.1 && num(margin) <= 0.3
    return {
      radii: vr, radiiOk, increasing, thresholdOk, redOk, orangeOk, orderOk, marginOk,
      valid: radiiOk && increasing && thresholdOk && redOk && orangeOk && orderOk && marginOk,
    }
  }, [r1, r2, r3, redThreshold, lossRed, lossOrange, margin])

  const dirty = useMemo(() => {
    if (!config) return false
    return (
      r1 !== String(config.radiiM[0]) || r2 !== String(config.radiiM[1]) || r3 !== String(config.radiiM[2]) ||
      cannib !== String(config.cannibRadiusM) || redThreshold !== String(config.redZoneThreshold) ||
      lossRed !== String(config.lossRedTnd) || lossOrange !== String(config.lossOrangeTnd) ||
      margin !== String(config.marginTndPerL).replace(".", ",")
    )
  }, [config, r1, r2, r3, cannib, redThreshold, lossRed, lossOrange, margin])

  // ---- Reclassification (impact des nouveaux seuils, calcul client) ----
  const reclass = useMemo(() => {
    if (!map || !config || !v.redOk || !v.orangeOk || !v.orderOk) return null
    const newRed = num(lossRed)
    const newOrange = num(lossOrange)
    const level = (loss: number): ShadowLevel =>
      loss >= newRed ? "RED" : loss >= newOrange ? "ORANGE" : loss > 0 ? "YELLOW" : "GREEN"
    const transitions = map.stations
      .map(s => ({ s, next: level(s.lossTnd) }))
      .filter(x => x.next !== x.s.level)
      .map(x => ({ code: x.s.code, name: x.s.name, gouvernorat: x.s.gouvernorat, lossTnd: x.s.lossTnd, from: x.s.level, to: x.next }))
      .sort((a, b) => b.lossTnd - a.lossTnd)
    const toRed = transitions.filter(t => t.to === "RED").length
    const toOrange = transitions.filter(t => t.to === "ORANGE" && t.from === "YELLOW").length
    const calmed = transitions.filter(t => t.to === "YELLOW" || t.to === "GREEN").length
    return { transitions, toRed, toOrange, calmed }
  }, [map, config, lossRed, lossOrange, v.redOk, v.orangeOk, v.orderOk])

  const save = () => {
    if (!v.valid || !dirty) return
    setSaving(true)
    fetch("/api/shadow/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        radiiM: v.radii.map(Math.round),
        cannibRadiusM: Number(cannib),
        redZoneThreshold: Math.round(num(redThreshold)),
        lossRedTnd: Math.round(num(lossRed)),
        lossOrangeTnd: Math.round(num(lossOrange)),
        marginTndPerL: num(margin),
      }),
    })
      .then(r => {
        if (!r.ok) return r.json().then(j => { throw new Error((j as { error?: string }).error ?? "invalid") })
        return r.json() as Promise<ShadowConfigDTO>
      })
      .then(cfg => {
        setConfig(cfg)
        applyConfig(cfg)
        toast.success("Configuration enregistrée", {
          description: `Rayons ${cfg.radiiM.join(" / ")} m · cannibalisation ${cfg.cannibRadiusM} m · seuils ${formatTnd(cfg.lossRedTnd)} / ${formatTnd(cfg.lossOrangeTnd)} — le recalcul des niveaux est immédiat.`,
        })
        // Re-baseline de la carte (les niveaux serveur ont été recalculés).
        return fetch("/api/shadow/map").then(r => r.json() as Promise<ShadowMapResponse>)
      })
      .then(m => {
        setMap(m)
      })
      .catch(e => {
        toast.error("Enregistrement refusé", {
          description: e instanceof Error && e.message !== "invalid" ? e.message : "Vérifiez les bornes des champs (le seuil rouge doit rester supérieur au seuil orange).",
        })
      })
      .finally(() => setSaving(false))
  }

  if (error) {
    return (
      <div className="rounded-xl border border-dashed border-[#E53935]/50 p-6 text-center text-sm text-muted-foreground">
        {error}
        <div className="mt-3">
          <Button variant="outline" className="gap-1.5" onClick={() => setNonce(n => n + 1)}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Réessayer
          </Button>
        </div>
      </div>
    )
  }
  if (!config || !map) {
    return (
      <div className="space-y-3">
        <div className="h-40 animate-pulse rounded-xl bg-stone-200 dark:bg-stone-800" />
        <div className="h-64 animate-pulse rounded-xl bg-stone-200 dark:bg-stone-800" />
      </div>
    )
  }

  // ---- Géométrie de l'aperçu SVG ----
  const radii = v.radii.every(Number.isFinite) ? v.radii : [500, 1000, 2000]
  const cannibM = Number(cannib) || 2000
  const maxM = Math.max(radii[2], cannibM, 2600)
  const scale = 88 / maxM
  const cx = 150
  const cy = 108
  const ptAngles = [-60, 35, 140, 250] // degrés (sens horaire depuis l'est)
  const ptPos = EXAMPLE_POINTS.map((d, i) => {
    const a = (ptAngles[i] * Math.PI) / 180
    return { d, x: cx + d * scale * Math.cos(a), y: cy - d * scale * Math.sin(a), color: pointColor(d, cannibM) }
  })

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(320px,420px)]">
        {/* Formulaire */}
        <Card className="border-stone-200 bg-white/95 dark:border-stone-800 dark:bg-stone-900/95">
          <CardContent className="space-y-5 p-4 sm:p-6">
            <div>
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-50">
                <span aria-hidden>🎯</span> Cercles de cannibalisation &amp; seuils d&apos;alerte
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Aperçu interactif à droite — recalculé en direct pendant la saisie.
              </p>
            </div>

            {/* Rayons affichés */}
            <fieldset className="space-y-2.5">
              <legend className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Rayons affichés sur la cartographie (m) — 100 à 5 000
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { val: r1, set: setR1, label: "Rayon 1" },
                  { val: r2, set: setR2, label: "Rayon 2" },
                  { val: r3, set: setR3, label: "Rayon 3" },
                ]).map(f => (
                  <div key={f.label} className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">{f.label}</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={f.val}
                      onChange={e => f.set(e.target.value)}
                      aria-label={`${f.label} en mètres`}
                      className={v.radiiOk ? "" : "border-[#E53935]"}
                    />
                  </div>
                ))}
              </div>
              {v.radiiOk && !v.increasing && (
                <p className="text-[11px] font-semibold text-[#FF9800]">Les trois rayons doivent être croissants (R1 &lt; R2 &lt; R3).</p>
              )}
              {!v.radiiOk && <p className="text-[11px] font-semibold text-[#E53935]">Chaque rayon doit être compris entre 100 et 5 000 m.</p>}
            </fieldset>

            {/* Rayon de cannibalisation + zone rouge */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Rayon de cannibalisation principal</Label>
                <Select value={cannib} onValueChange={setCannib}>
                  <SelectTrigger aria-label="Rayon de cannibalisation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CANNIB_OPTIONS.map(o => (
                      <SelectItem key={o} value={String(o)}>{o.toLocaleString("fr-FR")} m</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Au-delà, un point informel n&apos;est plus compté comme capteur de volume.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Seuil zone rouge (nb de points)</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={redThreshold}
                  onChange={e => setRedThreshold(e.target.value)}
                  aria-label="Seuil de zone rouge en nombre de points"
                  className={v.thresholdOk ? "" : "border-[#E53935]"}
                />
                <p className="text-[11px] text-muted-foreground">Une grappe d&apos;au moins N points devient « zone rouge » (3 à 15).</p>
              </div>
            </div>

            {/* Seuils de perte */}
            <fieldset className="space-y-2.5">
              <legend className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Seuils d&apos;alerte de perte (DT/mois)</legend>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Seuil rouge (critique)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={lossRed}
                    onChange={e => setLossRed(e.target.value)}
                    aria-label="Seuil de perte rouge en dinars"
                    className={v.redOk ? "" : "border-[#E53935]"}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Seuil orange (modéré)</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={lossOrange}
                    onChange={e => setLossOrange(e.target.value)}
                    aria-label="Seuil de perte orange en dinars"
                    className={v.orangeOk ? "" : "border-[#E53935]"}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 p-2.5 dark:border-stone-800 dark:bg-stone-900">
                <Sigma className="h-4 w-4 shrink-0 text-[#FF9800]" aria-hidden />
                <p className="text-[11px] font-semibold text-stone-700 dark:text-stone-300">
                  Aperçu des libellés :{" "}
                  <span className="text-[#E53935]">Critique &gt; {formatTnd(v.redOk ? num(lossRed) : config.lossRedTnd)}</span>
                  {" · "}
                  <span className="text-[#FF9800]">Modéré &gt; {formatTnd(v.orangeOk ? num(lossOrange) : config.lossOrangeTnd)}</span>
                  {" · "}
                  <span className="text-[#B26A00]">Vigilance en dessous</span>
                </p>
              </div>
              {!v.orderOk && (v.redOk || v.orangeOk) && (
                <p className="text-[11px] font-semibold text-[#E53935]">Le seuil rouge doit rester supérieur au seuil orange.</p>
              )}
            </fieldset>

            {/* Marge */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Marge détaillante (DT/L)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={margin}
                onChange={e => setMargin(e.target.value)}
                aria-label="Marge détaillante en dinars par litre"
                className={`max-w-[140px] ${v.marginOk ? "" : "border-[#E53935]"}`}
              />
              <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                Marge réglementée — source registre des décrets (plage 0,10 à 0,30 DT/L). Sert au modèle de perte :
                volume L/j × marge × 30,4 j.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 pt-4 dark:border-stone-800">
              <Button onClick={save} disabled={!v.valid || !dirty || saving} className="gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                Enregistrer la configuration
              </Button>
              <Button
                variant="outline"
                className="gap-1.5"
                disabled={!dirty}
                onClick={() => {
                  applyConfig(config)
                  toast.info("Saisie réinitialisée", { description: "Les valeurs enregistrées ont été restaurées." })
                }}
              >
                <RefreshCw className="h-4 w-4" aria-hidden /> Annuler les modifications
              </Button>
              {!dirty && <span className="text-[11px] text-muted-foreground">Aucune modification en attente.</span>}
            </div>

            <AssumptionNote>
              Modèle de perte : volume journalier × marge détaillante × 30,4 jours, attribué aux stations dans le rayon de
              cannibalisation avec un facteur de capture 1 − d/rayon (plancher 0,15). Toute modification de marge
              re-scale l&apos;ensemble des pertes affichées dans le module.
            </AssumptionNote>
          </CardContent>
        </Card>

        {/* Aperçu interactif */}
        <div className="space-y-4">
          <Card className="border-stone-200 bg-white/95 dark:border-stone-800 dark:bg-stone-900/95">
            <CardContent className="space-y-3 p-4">
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-50">
                <span aria-hidden>🛰️</span> Aperçu interactif
              </h3>
              <div className="overflow-hidden rounded-xl border border-stone-200 bg-[#FAFAF8] dark:border-stone-800 dark:bg-stone-950">
                <svg viewBox="0 0 300 216" className="h-auto w-full" role="img" aria-label="Schéma d'une station entourée des rayons configurés et de points informels d'exemple">
                  {/* cercles d'affichage */}
                  {radii.map((r, i) => (
                    <circle key={`r${i}`} cx={cx} cy={cy} r={r * scale} fill="none" stroke="#A8A29E" strokeWidth={1} strokeDasharray={i === 0 ? "none" : "3 3"} opacity={0.8} />
                  ))}
                  {/* rayon de cannibalisation */}
                  <circle cx={cx} cy={cy} r={cannibM * scale} fill="#E5393512" stroke="#E53935" strokeWidth={1.6} strokeDasharray="6 4" />
                  {/* étiquettes des rayons */}
                  {radii.map((r, i) => (
                    <text key={`t${i}`} x={cx + 3} y={cy - r * scale - 2} fontSize="7.5" fill="#57534E">
                      {r.toLocaleString("fr-FR")} m
                    </text>
                  ))}
                  <text x={cx + 4} y={cy + cannibM * scale + 9} fontSize="7.5" fill="#E53935" fontWeight="bold">
                    cannibalisation {cannibM.toLocaleString("fr-FR")} m
                  </text>
                  {/* station */}
                  <rect x={cx - 7} y={cy - 5} width={14} height={10} rx={2} fill="#1C1917" />
                  <text x={cx} y={cy + 20} fontSize="8" fill="#1C1917" textAnchor="middle" fontWeight="bold">Station</text>
                  {/* points d'exemple */}
                  {ptPos.map(p => (
                    <g key={p.d}>
                      <circle cx={p.x} cy={p.y} r={4.5} fill={p.color} stroke="#fff" strokeWidth={1.2} />
                      <text x={p.x + 6} y={p.y + 2.5} fontSize="7.5" fill="#57534E">{p.d.toLocaleString("fr-FR")} m</text>
                    </g>
                  ))}
                  <text x={8} y={208} fontSize="7.5" fill="#78716C">
                    Points d&apos;exemple : rouge = capture forte · orange = moyenne · jaune = faible · vert = hors rayon
                  </text>
                </svg>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Rayons d&apos;affichage {radii.map(r => `${Math.round(r).toLocaleString("fr-FR")} m`).join(" · ")} — rayon de
                cannibalisation {cannibM.toLocaleString("fr-FR")} m (surface rouge pâle).
              </p>
            </CardContent>
          </Card>

          {/* Reclassification */}
          <Card className="border-stone-200 bg-white/95 dark:border-stone-800 dark:bg-stone-900/95">
            <CardContent className="space-y-2.5 p-4">
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-50">
                <span aria-hidden>🔁</span> Impact des nouveaux seuils
              </h3>
              {!reclass || reclass.transitions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-stone-300 p-3 text-[11px] text-muted-foreground dark:border-stone-700">
                  {reclass ? "Aucune station ne changerait de niveau avec ces seuils — calibrage identique à la configuration enregistrée." : "Saisissez des seuils valides pour visualiser le reclassement."}
                </p>
              ) : (
                <>
                  <div className={`flex flex-wrap items-center gap-2 rounded-lg border p-3 ${
                    reclass.toRed > 0
                      ? "border-[#E53935]/40 bg-[#E53935]/5"
                      : "border-[#4CAF50]/40 bg-[#4CAF50]/5"
                  }`}>
                    <Badge variant="outline" className="border-transparent bg-[#E53935] text-white">{reclass.toRed}</Badge>
                    <p className="text-[11.5px] font-semibold text-stone-800 dark:text-stone-100">
                      {reclass.toRed > 0
                        ? `${reclass.toRed} station${reclass.toRed > 1 ? "s" : ""} passerai${reclass.toRed > 1 ? "ent" : "t"} en rouge avec ces seuils.`
                        : "Aucun passage en rouge."}
                      {reclass.toOrange > 0 && ` +${reclass.toOrange} en orange.`}
                      {reclass.calmed > 0 && ` ${reclass.calmed} reviendrai${reclass.calmed > 1 ? "ent" : "t"} en vigilance/calme.`}
                    </p>
                  </div>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
                    {reclass.transitions.slice(0, 12).map(t => (
                      <div key={t.code} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-stone-200 bg-white p-2 dark:border-stone-800 dark:bg-stone-900">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-semibold text-stone-800 dark:text-stone-100" title={t.name}>{t.name}</p>
                          <p className="text-[10.5px] text-muted-foreground">{t.gouvernorat} · {formatTnd(t.lossTnd)}/mois</p>
                        </div>
                        <ShadowLevelBadge level={t.from} />
                        <span className="text-[10px] text-muted-foreground">→</span>
                        <ShadowLevelBadge level={t.to} />
                      </div>
                    ))}
                    {reclass.transitions.length > 12 && (
                      <p className="text-center text-[10.5px] text-muted-foreground">
                        + {reclass.transitions.length - 12} autres reclassements…
                      </p>
                    )}
                  </div>
                </>
              )}
              <p className="text-[10.5px] leading-snug text-muted-foreground">
                Calcul client sur les {map.stations.length.toLocaleString("fr-FR")} stations de la carte — le
                reclassement effectif est appliqué par le serveur lors de l&apos;enregistrement.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
