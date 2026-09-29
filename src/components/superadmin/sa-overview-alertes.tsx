'use client'

// Super Administration — Vue d'ensemble : bannière d'alertes SaaS (T52-R1).
// Version légère et vivante de l'ancienne sa-banniere-alertes.tsx (code mort,
// miné pour ce composant) : elle consolide au montage les échéances critiques
// et les factures en retard depuis GET /api/super/echeances (réécrite en T52-R1
// sur les modèles SaaS réels). Zéro alerte → rien rendu ; erreur réseau → rien
// rendu non plus (une bannière proactive n'est jamais un point de panne).
// Identité : ambre = avertissement, rouge = dépassé/critique. Les chips
// orientent vers les onglets vivants de l'espace via onNavigate.
// Recalcul : à chaque consultation, et après chaque événement DOM
// « carbuscope:mutation-sa » (debounce ~400 ms) — émis aujourd'hui par les
// modules vivants de facturation/contrats s'ils l'implémentent, sans quoi
// l'écouteur reste silencieux et inoffensif.

import { useCallback, useEffect, useMemo, useState } from "react"
import { BellRing, CalendarClock, Receipt, TriangleAlert, X } from "lucide-react"
import { fmtDT } from "@/lib/saas"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------- types locaux

type Gravite = "DEPASSE" | "CRITIQUE" | "WARNING" | "INFO"

interface EcheanceDTO {
  id: string
  type: "RENOUVELLEMENT_CONTRAT" | "FACTURE_RETARD"
  clientNom: string
  reference: string
  libelle: string
  dateEcheance: string
  joursRestants: number
  gravite: Gravite
  montantDt: number | null
}

interface EcheancesResponse {
  echeances: EcheanceDTO[]
  stats: { total: number; depasse: number; critique: number; warning: number; info: number; facturesRetard: number; montantRetardDt: number }
}

// ---------------------------------------------------------------- dérivation

interface AlerteResume {
  nbEcheancesCritiques: number
  echeanceProche: EcheanceDTO | null
  nbASurveiller: number
  retards: EcheanceDTO[]
  montantRetard: number
  plusAncienRetard: EcheanceDTO | null
  critique: boolean
}

function pluriel(n: number): string {
  return n > 1 ? "s" : ""
}

/** « J-42 » (à venir) · « J+3 » (dépassée de 3 jours). */
function fmtJours(j: number): string {
  return j >= 0 ? `J-${j}` : `J+${Math.abs(j)}`
}

// ---------------------------------------------------------------- composant

export function SaOverviewAlertes({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [data, setData] = useState<EcheancesResponse | null>(null)
  const [masque, setMasque] = useState(false)

  const load = useCallback((signal: AbortSignal) => {
    void fetch("/api/super/echeances", { signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: EcheancesResponse) => setData(d))
      .catch((e: unknown) => {
        // Échec réseau : la bannière proactive reste simplement absente.
        if (e instanceof Error && e.name === "AbortError") return
      })
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    void load(ac.signal)
    return () => ac.abort()
  }, [load])

  // Recalcul après chaque mutation métier SA réussie (debounce, fetch relancé).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const onMutationSa = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const ac = new AbortController()
        void load(ac.signal)
      }, 400)
    }
    window.addEventListener("carbuscope:mutation-sa", onMutationSa)
    return () => {
      window.removeEventListener("carbuscope:mutation-sa", onMutationSa)
      if (timer) clearTimeout(timer)
    }
  }, [load])

  const alerte = useMemo<AlerteResume | null>(() => {
    if (!data) return null
    const echs = data.echeances
    const critiques = echs.filter(e => e.type === "RENOUVELLEMENT_CONTRAT" && (e.gravite === "DEPASSE" || e.gravite === "CRITIQUE"))
    const aSurveiller = echs.filter(e => e.type === "RENOUVELLEMENT_CONTRAT" && e.gravite === "WARNING")
    const retards = echs
      .filter(e => e.type === "FACTURE_RETARD")
      .sort((a, b) => a.joursRestants - b.joursRestants)
    if (critiques.length === 0 && retards.length === 0 && aSurveiller.length === 0) return null
    const plusAncienRetard = retards[0] ?? null
    return {
      nbEcheancesCritiques: critiques.length,
      echeanceProche: critiques[0] ?? null,
      nbASurveiller: aSurveiller.length,
      retards,
      montantRetard: retards.reduce((s, r) => s + (r.montantDt ?? 0), 0),
      plusAncienRetard,
      critique: critiques.length > 0 || (plusAncienRetard?.joursRestants ?? 0) <= -30,
    }
  }, [data])

  if (masque || !alerte) return null

  const { critique } = alerte
  const Icone = critique ? TriangleAlert : BellRing

  // Résumé compact : comptes critiques + retards, puis l'urgence la plus forte.
  const fragments: string[] = []
  if (alerte.nbEcheancesCritiques > 0) {
    fragments.push(`${alerte.nbEcheancesCritiques} échéance${pluriel(alerte.nbEcheancesCritiques)} critique${pluriel(alerte.nbEcheancesCritiques)}`)
  }
  if (alerte.retards.length > 0) {
    fragments.push(`${alerte.retards.length} facture${pluriel(alerte.retards.length)} en retard (${fmtDT(alerte.montantRetard)})`)
  }
  if (fragments.length === 0) {
    fragments.push(`${alerte.nbASurveiller} échéance${pluriel(alerte.nbASurveiller)} à surveiller ≤ 30 j`)
  }
  const urgence = alerte.echeanceProche
    ? `plus pressante : ${alerte.echeanceProche.clientNom} ${fmtJours(alerte.echeanceProche.joursRestants)}`
    : alerte.plusAncienRetard
      ? `retard le plus ancien : ${alerte.plusAncienRetard.clientNom} ${fmtJours(alerte.plusAncienRetard.joursRestants)}`
      : null
  const resume = urgence ? `${fragments.join(" · ")} · ${urgence}` : fragments.join(" · ")

  const chips: { key: string; onglet: string; icone: typeof Receipt; label: string }[] = []
  if (alerte.retards.length > 0) {
    chips.push({ key: "retards", onglet: "invoices", icone: Receipt, label: `Facturation (${alerte.retards.length})` })
  }
  if (alerte.nbEcheancesCritiques + alerte.nbASurveiller > 0) {
    chips.push({
      key: "echeances",
      onglet: "contracts",
      icone: alerte.nbEcheancesCritiques > 0 ? TriangleAlert : CalendarClock,
      label: `Contrats (${alerte.nbEcheancesCritiques + alerte.nbASurveiller})`,
    })
  }

  const banniere = critique
    ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
    : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
  const chipStyle = critique
    ? "border-red-300 bg-white/70 text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/60"
    : "border-amber-300 bg-white/70 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/60"

  return (
    <section
      role="status"
      aria-live="polite"
      aria-label={`Alertes de la plateforme : ${resume}`}
      className={cn("overflow-hidden rounded-lg border shadow-sm", banniere)}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-3 py-2.5 md:px-4">
        <Icone
          className={cn("h-5 w-5 shrink-0", critique ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400")}
          aria-hidden
        />
        <p className="min-w-0 flex-1 text-xs font-medium leading-snug md:text-sm">{resume}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map(chip => {
            const ChipIcone = chip.icone
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => onNavigate(chip.onglet)}
                aria-label={`Consulter — ${chip.label}`}
                className={cn(
                  "inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-md border px-2.5 py-2",
                  "text-[11px] font-semibold leading-tight transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-600 dark:focus-visible:ring-red-400",
                  chipStyle,
                )}
              >
                <ChipIcone className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 text-left">{chip.label}</span>
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setMasque(true)}
            aria-label="Masquer les alertes pour la session courante"
            title="Masquer pour la session courante (réaffiché au prochain chargement)"
            className={cn(
              "inline-flex min-h-11 w-11 shrink-0 items-center justify-center rounded-md border",
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset",
              "focus-visible:ring-red-600 dark:focus-visible:ring-red-400",
              critique
                ? "border-red-300/70 bg-transparent text-red-700 hover:bg-red-100 dark:border-red-700/70 dark:text-red-300 dark:hover:bg-red-900/60"
                : "border-amber-300/70 bg-transparent text-amber-800 hover:bg-amber-100 dark:border-amber-700/70 dark:text-amber-300 dark:hover:bg-amber-900/60",
            )}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </section>
  )
}
