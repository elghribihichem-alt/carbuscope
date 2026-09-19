'use client'

// CarbuScope Mobile — Espace agent : rapport de visite (T28)
// Formulaire riche : prix affichés (DT, pré-remplis au décret, convertis en
// millimes au POST), file d'attente, personnel, propreté (points), score de
// conformité (contrôle), anomalies / pratiques concurrentes (chips + texte),
// notes. POST /api/reports → écran de confirmation.

import { useState } from "react"
import { AlertTriangle, Banknote, Eye, Flame, Cylinder, Fuel, Loader2, Navigation, Send, ShieldCheck, Sparkles, Users, UsersRound } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { FuelType } from "@/lib/types"
import type { AgentApi, ReportPayload } from "../agent-shared"
import { AgentBand, DotsRating, MissionTypeBadge, Stepper, TaskStatusBadge, complianceTone, fmtDt } from "../agent-shared"

const ANOMALY_CHIPS = ["Pompe hors service", "Prix non affiché", "File longue", "Propreté dégradée", "Signalétique dégradée"]
const PRACTICE_CHIPS = ["Self-service ouvert", "Signalétique neuve", "File fluide", "Café moins cher"]

const FUEL_ICONS: Record<FuelType, React.ComponentType<{ className?: string }>> = { ESSENCE: Fuel, GAZOLE: Flame, GPL: Cylinder }

function ChipToggle({
  label, active, onToggle, tone,
}: {
  label: string
  active: boolean
  onToggle: () => void
  tone: "red" | "orange"
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition-all active:scale-95",
        tone === "red"
          ? active
            ? "border-red-300 bg-red-50 text-red-700"
            : "border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:text-red-600"
          : active
            ? "border-orange-300 bg-orange-50 text-orange-700"
            : "border-slate-200 bg-white text-slate-500 hover:border-orange-200 hover:text-orange-600"
      )}
    >
      {active && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}
      {label}
    </button>
  )
}

/** Champ prix : valeur en DT (saisie FR « 1,885 »), prix du décret en hint */
function PriceField({
  id, label, icon: Icon, value, onChange, decree,
}: {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  value: string
  onChange: (v: string) => void
  decree: number | null
}) {
  const parsed = Number(value.trim().replace(",", "."))
  const differs = decree != null && value.trim() !== "" && Number.isFinite(parsed) && Math.round(parsed * 1000) !== decree
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold text-slate-600">
          <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          {label}
        </label>
        {decree != null && (
          <span className="shrink-0 text-[9.5px] font-medium text-slate-400">
            Décret : <span className="font-bold tabular-nums text-slate-500">{fmtDt(decree)} DT</span>
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <Input
          id={id}
          value={value}
          onChange={e => onChange(e.target.value)}
          inputMode="decimal"
          placeholder="—"
          autoComplete="off"
          aria-label={`Prix ${label.toLowerCase()} affiché en dinars`}
          className="h-10 rounded-lg border-slate-200 text-center font-mono text-[15px] font-bold tabular-nums focus-visible:border-emerald-400 focus-visible:ring-emerald-500/30"
        />
        <span aria-hidden className="shrink-0 text-[12px] font-bold text-slate-400">DT</span>
        {differs && (
          <span className="shrink-0 rounded-full border border-amber-300/70 bg-amber-50 px-1.5 py-0.5 text-[8.5px] font-bold text-amber-700">
            écart
          </span>
        )}
      </div>
    </div>
  )
}

export function AgentReportScreen({ api }: { api: AgentApi }) {
  const task = api.task
  const mission = api.mission

  const decree = (fuel: FuelType): number | null => api.prices.find(p => p.fuelType === fuel)?.priceMillimes ?? null
  const [gazole, setGazole] = useState(() => {
    const d = decree("GAZOLE")
    return d != null ? fmtDt(d) : ""
  })
  const [essence, setEssence] = useState(() => {
    const d = decree("ESSENCE")
    return d != null ? fmtDt(d) : ""
  })
  const [gpl, setGpl] = useState(() => {
    const d = decree("GPL")
    return d != null ? fmtDt(d) : ""
  })
  const [queue, setQueue] = useState(0)
  const [staff, setStaff] = useState(0)
  const [cleanliness, setCleanliness] = useState(0)
  const [compliance, setCompliance] = useState(90)
  const [anomalyChips, setAnomalyChips] = useState<string[]>([])
  const [anomaliesText, setAnomaliesText] = useState("")
  const [practiceChips, setPracticeChips] = useState<string[]>([])
  const [practicesText, setPracticesText] = useState("")
  const [notes, setNotes] = useState("")
  const [flagAnomaly, setFlagAnomaly] = useState(false)
  const [sending, setSending] = useState(false)

  if (!task || !mission) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[#f6f7f5]">
        <AgentBand title="Rapport de visite" onBack={api.back} />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-[12.5px] font-semibold text-slate-600">Session agent expirée</p>
          <Button onClick={api.back} variant="outline" className="h-9 rounded-xl text-[12px] font-bold">
            Retour
          </Button>
        </div>
      </div>
    )
  }

  const isControle = mission.type === "CONTROLE"
  const toggleChip = (list: string[], setList: (v: string[]) => void, chip: string) => {
    setList(list.includes(chip) ? list.filter(c => c !== chip) : [...list, chip])
  }
  const combineParts = (chips: string[], text: string): string => {
    const parts = [...chips]
    const extra = text.trim()
    if (extra) parts.push(extra)
    return parts.join(" · ")
  }
  const combinedAnomalies = isControle ? combineParts(anomalyChips, anomaliesText) : ""
  const willBeAnomaly = isControle && (flagAnomaly || combinedAnomalies.length > 0)

  const submit = async () => {
    // Prix : saisie vide autorisée, valeur invalide bloquante
    const priceFields: { label: string; raw: string }[] = [
      { label: "gazole", raw: gazole },
      { label: "essence", raw: essence },
      { label: "GPL", raw: gpl },
    ]
    for (const p of priceFields) {
      const s = p.raw.trim().replace(",", ".")
      if (!s) continue
      const n = Number(s)
      if (!Number.isFinite(n) || n <= 0 || n >= 20) {
        toast.error(`Prix ${p.label} invalide`, { description: "Saisissez un montant en DT (ex. 1,885) — ou laissez vide." })
        return
      }
    }
    const toMillimes = (raw: string): number | null => {
      const s = raw.trim().replace(",", ".")
      if (!s) return null
      return Math.round(Number(s) * 1000)
    }
    const combinedPractices = combineParts(practiceChips, practicesText)

    const payload: ReportPayload = {
      gazolePrice: toMillimes(gazole),
      essencePrice: toMillimes(essence),
      gplPrice: toMillimes(gpl),
      queueMinutes: queue,
      staffCount: staff,
      cleanliness: cleanliness > 0 ? cleanliness : null,
      notes: notes.trim(),
      ...(isControle
        ? {
            complianceScore: compliance,
            anomalies: combinedAnomalies,
            anomaly: willBeAnomaly,
          }
        : {}),
      ...(!isControle
        ? {
            competitorPractices: combinedPractices || null,
          }
        : {}),
    }

    setSending(true)
    try {
      await api.submitReport(payload) // navigue vers agent-success
    } catch (e) {
      toast.error("Envoi impossible", {
        description: e instanceof Error ? e.message : "Erreur réseau — réessayez.",
      })
    } finally {
      setSending(false)
    }
  }

  const tone = complianceTone(compliance)
  const hasGps = task.lat != null && task.lng != null

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f7f5]">
      <AgentBand title="Rapport de visite" subtitle={task.targetLabel} onBack={api.back} />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-3 pb-6">
        {/* Contexte : mission + cible */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-1.5">
            <MissionTypeBadge type={mission.type} />
            <span className="truncate text-[11.5px] font-semibold text-slate-600">{mission.title}</span>
          </div>
          <p className="mt-1.5 text-[10.5px] leading-snug text-slate-400">
            Cible {task.order + 1}/{mission.tasksTotal}
            {task.stationCode && <span className="font-mono"> · {task.stationCode}</span>}
            {hasGps && (
              <>
                {" · "}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${task.lat},${task.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 font-bold text-emerald-700 underline underline-offset-2"
                >
                  <Navigation className="h-3 w-3" />
                  Itinéraire
                </a>
              </>
            )}
          </p>
          {isControle ? (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-emerald-50/70 px-2.5 py-2 text-[10.5px] font-medium leading-snug text-emerald-800">
              <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
              Contrôle de votre enseigne : évaluez la conformité et signalez toute anomalie.
            </p>
          ) : (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-orange-50/70 px-2.5 py-2 text-[10.5px] font-medium leading-snug text-orange-800">
              <Eye className="mt-px h-3.5 w-3.5 shrink-0" />
              Veille concurrentielle : relevez les prix affichés et les pratiques du concurrent. Observation discrète.
            </p>
          )}
        </div>

        {/* Prix affichés */}
        <section className="mt-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">
            <Banknote className="h-3.5 w-3.5 text-emerald-600" />
            Prix affichés {isControle ? "(face au décret)" : "du concurrent"}
          </h2>
          <div className="space-y-2">
            <PriceField id="price-gazole" label="Gazole" icon={FUEL_ICONS.GAZOLE} value={gazole} onChange={setGazole} decree={decree("GAZOLE")} />
            <PriceField id="price-essence" label="Essence" icon={FUEL_ICONS.ESSENCE} value={essence} onChange={setEssence} decree={decree("ESSENCE")} />
            <PriceField id="price-gpl" label="GPL" icon={FUEL_ICONS.GPL} value={gpl} onChange={setGpl} decree={decree("GPL")} />
          </div>
          <p className="mt-1.5 text-[9.5px] leading-snug text-slate-400">
            Champs pré-remplis au prix du décret en vigueur — ajustez selon l'affichage constaté sur la piste.
          </p>
        </section>

        {/* Observations terrain */}
        <section className="mt-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">
            <Users className="h-3.5 w-3.5 text-emerald-600" />
            Observations terrain
          </h2>
          <div className="space-y-2">
            <Stepper label="File d'attente" icon={Users} value={queue} onChange={setQueue} min={0} max={90} step={1} unit="min" />
            <Stepper label="Personnel en poste" icon={UsersRound} value={staff} onChange={setStaff} min={0} max={30} step={1} unit="pers." />
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                <Sparkles className="h-3.5 w-3.5 text-slate-400" />
                Propreté générale
              </p>
              <div className="mt-2 px-0.5">
                <DotsRating value={cleanliness} onChange={setCleanliness} />
              </div>
            </div>
          </div>
        </section>

        {/* Conformité (contrôle) */}
        {isControle && (
          <section className="mt-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Conformité
            </h2>
            <div className="space-y-2">
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-[11.5px] font-semibold text-slate-600">Score de conformité</p>
                  <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums", tone.chip)}>
                    {compliance} % · {tone.label}
                  </span>
                </div>
                <Slider
                  value={[compliance]}
                  onValueChange={v => setCompliance(v[0] ?? compliance)}
                  min={0}
                  max={100}
                  step={5}
                  aria-label="Score de conformité (0 à 100)"
                  className="mt-3"
                />
                <div className="mt-0.5 flex justify-between text-[9px] font-semibold tabular-nums text-slate-400">
                  <span>0</span>
                  <span>50</span>
                  <span>100</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                <p className="text-[11.5px] font-semibold text-slate-600">Anomalies constatées</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {ANOMALY_CHIPS.map(chip => (
                    <ChipToggle
                      key={chip}
                      label={chip}
                      tone="red"
                      active={anomalyChips.includes(chip)}
                      onToggle={() => {
                        toggleChip(anomalyChips, setAnomalyChips, chip)
                        if (!anomalyChips.includes(chip)) setFlagAnomaly(true) // une anomalie sélectionnée → signal actif
                      }}
                    />
                  ))}
                </div>
                <Textarea
                  value={anomaliesText}
                  onChange={e => setAnomaliesText(e.target.value)}
                  placeholder="Détaillez si besoin (les chips sélectionnées seront jointes automatiquement)…"
                  aria-label="Détail des anomalies"
                  className="mt-2 min-h-[70px] rounded-xl border-slate-200 bg-white text-[12px] focus-visible:border-emerald-400 focus-visible:ring-emerald-500/30"
                />
              </div>

              <div
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border p-3 shadow-sm transition-colors",
                  willBeAnomaly ? "border-red-200 bg-red-50/60" : "border-slate-200 bg-white"
                )}
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[12px] font-bold text-slate-700">
                    <AlertTriangle className={cn("h-4 w-4 shrink-0", willBeAnomaly ? "text-red-500" : "text-slate-400")} />
                    Signaler une anomalie
                  </p>
                  <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
                    La cible sera marquée « Anomalie » plutôt que « Faite » (toute anomalie renseignée l'active aussi).
                  </p>
                </div>
                <Switch checked={flagAnomaly} onCheckedChange={setFlagAnomaly} aria-label="Signaler une anomalie" />
              </div>
            </div>
          </section>
        )}

        {/* Pratiques concurrentes (veille) */}
        {!isControle && (
          <section className="mt-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">
              <Eye className="h-3.5 w-3.5 text-orange-600" />
              Pratiques concurrentes
            </h2>
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <div className="flex flex-wrap gap-1.5">
                {PRACTICE_CHIPS.map(chip => (
                  <ChipToggle
                    key={chip}
                    label={chip}
                    tone="orange"
                    active={practiceChips.includes(chip)}
                    onToggle={() => toggleChip(practiceChips, setPracticeChips, chip)}
                  />
                ))}
              </div>
              <Textarea
                value={practicesText}
                onChange={e => setPracticesText(e.target.value)}
                placeholder="Promotions, état des pistes, affluence, services ouverts…"
                aria-label="Pratiques concurrentes observées"
                className="mt-2 min-h-[70px] rounded-xl border-slate-200 bg-white text-[12px] focus-visible:border-emerald-400 focus-visible:ring-emerald-500/30"
              />
            </div>
          </section>
        )}

        {/* Notes libres */}
        <section className="mt-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">
            Notes libres
          </h2>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Observations complémentaires pour votre superviseur…"
            aria-label="Notes libres"
            className="min-h-[64px] rounded-xl border-slate-200 bg-white text-[12px] focus-visible:border-emerald-400 focus-visible:ring-emerald-500/30"
          />
        </section>

        {/* Aperçu du résultat */}
        <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500">À l'envoi, la cible sera marquée</p>
          <TaskStatusBadge status={willBeAnomaly ? "ANOMALIE" : "FAITE"} />
        </div>
      </div>

      {/* Envoi */}
      <div className="shrink-0 border-t border-slate-200 bg-white px-3 pb-3 pt-2.5">
        <Button
          onClick={() => void submit()}
          disabled={sending}
          className="h-11 w-full rounded-xl bg-emerald-600 text-[13.5px] font-bold text-white shadow-md hover:bg-emerald-700"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? "Envoi en cours…" : "Envoyer le rapport"}
        </Button>
      </div>
    </div>
  )
}
