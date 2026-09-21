"use client"

// Super Administration — bannière d'alertes proactives (Task D-1, refresh live Task E-2).
// Visible depuis TOUS les onglets de l'espace : elle consolide au montage les
// échéances critiques (GET /api/super/echeances — DEPASSE/CRITIQUE, warning en
// chip) et les factures en retard (GET /api/super/factures — statut EN_RETARD,
// séniorité via joursRetard). E-2 : après chaque mutation métier réussie, les
// modules SA émettent l'événement DOM "carbuscope:mutation-sa" → la bannière se
// recalcule EN DIRECT (debounce ~400 ms) sans recharger la page. Zéro alerte →
// rien rendu ; erreur réseau → rien rendu non plus (une bannière proactive
// n'est jamais un point de panne).
// Identité : amber = avertissement, red = critique/dépassé (échéance ≤ 7 j ou
// retard facture ≥ 30 j — même seuil que la section « Relances & retards » du
// module ②). Les chips orientent vers l'onglet compétent via onNaviguer.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BellRing, CalendarClock, Receipt, TriangleAlert, X } from "lucide-react"
import { formatDT, formatDTCourt, formatInt } from "@/lib/sa-types"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------- types locaux

/** Onglet(s) de SuperadminView vers lesquels la bannière peut orienter. */
export type OngletAlerteSa = "clients" | "billing"

type Gravite = "DEPASSE" | "CRITIQUE" | "WARNING" | "INFO"

/** Champs utiles de GET /api/super/echeances (calcul à la volée côté serveur). */
interface EcheanceDTO {
  id: string
  clientNom: string
  reference: string
  libelle: string
  dateEcheance: string
  joursRestants: number
  gravite: Gravite
}

interface EcheancesResponse {
  echeances: EcheanceDTO[]
  stats: { total: number; depasse: number; critique: number; warning: number; info: number }
}

/** Champs utiles de GET /api/super/factures. */
interface FactureLegereDTO {
  id: string
  numero: string
  clientNom: string
  statut: string
  dateEcheance: string
  montantTtcMillimes: number
}

interface FacturesResponse {
  factures: FactureLegereDTO[]
}

// ---------------------------------------------------------------- utilitaires

/** Fetch typé relatif : lit { error } du serveur et la transforme en exception. */
async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // corps de réponse vide
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error
    throw new Error(msg ?? `Erreur HTTP ${res.status}`)
  }
  return data as T
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError"
}

/** Jours de retard d'une facture depuis son échéance (0 si pas dépassée) — même formule que le module ②. */
function joursRetard(dateEcheance: string): number {
  return Math.max(0, -Math.round((new Date(dateEcheance).getTime() - Date.now()) / 86400000))
}

/** « J-42 » (à venir) · « J+3 » (dépassée de 3 jours) — même format que le module ①. */
function fmtJours(j: number): string {
  return j >= 0 ? `J-${j}` : `J+${Math.abs(j)}`
}

function pluriel(n: number): string {
  return n > 1 ? "s" : ""
}

/** Ligne de retard dérivée : facture + séniorité. */
interface RetardRow {
  facture: FactureLegereDTO
  jours: number
}

/** Dérivation complète des alertes de la bannière (null si aucune alerte). */
interface AlerteResume {
  nbCritiques: number
  critiqueProche: EcheanceDTO | null // déjà triée joursRestants croissant par l'API
  nbWarning: number
  retards: RetardRow[] // triées séniorité décroissante
  nbRetards: number
  montantRetardTtcMillimes: number
  plusAncienRetard: RetardRow | null
  /** Rouge dès qu'une échéance est dépassée/critique ou qu'un retard atteint 30 j (seuil critique du module ②). */
  critique: boolean
}

// ---------------------------------------------------------------- pastilles

const BANNIERE_CRITIQUE = "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
const BANNIERE_WARNING = "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"

const CHIP_CRITIQUE =
  "border-red-300 bg-white/70 text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/60"
const CHIP_WARNING =
  "border-amber-300 bg-white/70 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/60"

const RING_CRITIQUE = "focus-visible:ring-red-600 dark:focus-visible:ring-red-400"
const RING_WARNING = "focus-visible:ring-amber-600 dark:focus-visible:ring-amber-400"

const MASQUER_CRITIQUE =
  "border-red-300/70 bg-transparent text-red-700 hover:bg-red-100 dark:border-red-700/70 dark:text-red-300 dark:hover:bg-red-900/60"
const MASQUER_WARNING =
  "border-amber-300/70 bg-transparent text-amber-800 hover:bg-amber-100 dark:border-amber-700/70 dark:text-amber-300 dark:hover:bg-amber-900/60"

/** Chip cliquable : oriente vers l'onglet compétent de la Super Administration. */
interface ChipAlerte {
  key: string
  onglet: OngletAlerteSa
  icone: React.ComponentType<{ className?: string }>
  label: string
  aria: string
  style: string
  ring: string
}

// ---------------------------------------------------------------- composant

export function SaBanniereAlertes({ onNaviguer }: { onNaviguer: (onglet: OngletAlerteSa) => void }) {
  const [data, setData] = useState<{ echeances: EcheancesResponse; factures: FacturesResponse } | null>(null)
  // Échec réseau : la bannière proactive reste simplement absente (jamais de panneau rouge).
  const [echec, setEchec] = useState(false)
  const [masque, setMasque] = useState(false)
  // Contrôleur du chargement le plus récent (montage OU rafraîchissement E-2) :
  // sert à aborter un fetch en vol avant d'en relancer un autre.
  const acRef = useRef<AbortController | null>(null)

  const load = useCallback((signal: AbortSignal) => {
    // Deux sources parallèles ; les setState vivent dans les callbacks asynchrones
    // (.then/.catch) — jamais dans le corps synchrone de l'effet (règle React 19).
    void Promise.all([
      apiJson<EcheancesResponse>("/api/super/echeances", { signal }),
      apiJson<FacturesResponse>("/api/super/factures", { signal }),
    ])
      .then(([ech, fac]) => {
        setData({ echeances: ech, factures: fac })
        // Un rafraîchissement E-2 réussi fait aussi repartir de zéro après un échec
        // réseau initial (la bannière redevient possible sans remontage).
        setEchec(false)
      })
      .catch((e: unknown) => {
        if (!isAbort(e)) setEchec(true)
      })
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    acRef.current = ac
    void load(ac.signal)
    return () => ac.abort()
  }, [load])

  // E-2 — réception : les modules SA émettent window.dispatchEvent(new CustomEvent(
  // "carbuscope:mutation-sa", …)) après chaque mutation réussie (paiement, relance,
  // annulation, génération mensuelle, transition de contrat, avenant, note,
  // création/bascule de compte — voir les sites d'émission dans sa-billing.tsx,
  // sa-clients.tsx et sa-comptes.tsx). Ici : debounce ~400 ms pour coalescer les
  // rafales (ex. génération mensuelle multi-évts), abort du fetch en vol avant de
  // relancer, puis load existant (pattern AbortController + setState en .then/.catch).
  // Si la bannière est MASQUÉE, les données se mettent quand même à jour : seul
  // l'état masqué est conservé (elle réapparaîtra correcte au prochain montage).
  // Aucun setState direct dans le corps de l'effet — le handler différé appelle
  // une fonction qui fait le fetch+setState dans ses callbacks .then/.catch.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const onMutationSa = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        acRef.current?.abort()
        const ac = new AbortController()
        acRef.current = ac
        void load(ac.signal)
      }, 400)
    }
    window.addEventListener("carbuscope:mutation-sa", onMutationSa)
    return () => {
      window.removeEventListener("carbuscope:mutation-sa", onMutationSa)
      if (timer) clearTimeout(timer)
      acRef.current?.abort()
    }
  }, [load])

  // ------------------------------------------------------------- dérivation
  const alerte = useMemo<AlerteResume | null>(() => {
    if (!data) return null
    const echs = data.echeances.echeances
    const critiques = echs.filter((e) => e.gravite === "DEPASSE" || e.gravite === "CRITIQUE")
    const warnings = echs.filter((e) => e.gravite === "WARNING")
    const retards: RetardRow[] = data.factures.factures
      .filter((f) => f.statut === "EN_RETARD")
      .map((f) => ({ facture: f, jours: joursRetard(f.dateEcheance) }))
      .sort((a, b) => b.jours - a.jours || b.facture.montantTtcMillimes - a.facture.montantTtcMillimes)
    const nbCritiques = critiques.length
    const nbRetards = retards.length
    const nbWarning = warnings.length
    if (nbCritiques === 0 && nbRetards === 0 && nbWarning === 0) return null
    const plusAncienRetard = retards[0] ?? null
    return {
      nbCritiques,
      critiqueProche: critiques[0] ?? null,
      nbWarning,
      retards,
      nbRetards,
      montantRetardTtcMillimes: retards.reduce((s, r) => s + r.facture.montantTtcMillimes, 0),
      plusAncienRetard,
      critique: nbCritiques > 0 || (plusAncienRetard?.jours ?? 0) >= 30,
    }
  }, [data])

  if (masque || echec || !alerte) return null

  const { critique } = alerte
  const Icone = critique ? TriangleAlert : BellRing

  // Résumé compact : comptes critiques + retards, puis l'urgence la plus forte.
  const fragments: string[] = []
  if (alerte.nbCritiques > 0) {
    fragments.push(`${formatInt(alerte.nbCritiques)} échéance${pluriel(alerte.nbCritiques)} critique${pluriel(alerte.nbCritiques)}`)
  }
  if (alerte.nbRetards > 0) {
    fragments.push(
      `${formatInt(alerte.nbRetards)} facture${pluriel(alerte.nbRetards)} en retard (${formatDT(alerte.montantRetardTtcMillimes)})`,
    )
  }
  if (fragments.length === 0) {
    fragments.push(`${formatInt(alerte.nbWarning)} échéance${pluriel(alerte.nbWarning)} à surveiller ≤ 30 j`)
  }
  const urgence = alerte.critiqueProche
    ? `plus pressante : ${alerte.critiqueProche.clientNom} ${fmtJours(alerte.critiqueProche.joursRestants)}`
    : alerte.plusAncienRetard && alerte.plusAncienRetard.jours > 0
      ? `retard le plus ancien : ${formatInt(alerte.plusAncienRetard.jours)} j`
      : null
  const resume = urgence ? `${fragments.join(" · ")} · ${urgence}` : fragments.join(" · ")

  const chips: ChipAlerte[] = []
  if (alerte.nbCritiques > 0) {
    chips.push({
      key: "ech-critiques",
      onglet: "clients",
      icone: TriangleAlert,
      label: `Échéances critiques (${formatInt(alerte.nbCritiques)})`,
      aria: `Consulter les ${formatInt(alerte.nbCritiques)} échéance${pluriel(alerte.nbCritiques)} critique${pluriel(alerte.nbCritiques)} dans l'onglet Clients`,
      style: CHIP_CRITIQUE,
      ring: RING_CRITIQUE,
    })
  }
  if (alerte.nbWarning > 0) {
    chips.push({
      key: "ech-warning",
      onglet: "clients",
      icone: CalendarClock,
      label: `À surveiller ≤ 30 j (${formatInt(alerte.nbWarning)})`,
      aria: `Consulter les ${formatInt(alerte.nbWarning)} échéance${pluriel(alerte.nbWarning)} à surveiller dans l'onglet Clients`,
      style: CHIP_WARNING,
      ring: RING_WARNING,
    })
  }
  if (alerte.nbRetards > 0) {
    chips.push({
      key: "factures-retard",
      onglet: "billing",
      icone: Receipt,
      label: `Factures en retard (${formatInt(alerte.nbRetards)} · ${formatDTCourt(alerte.montantRetardTtcMillimes)})`,
      aria: `Consulter les ${formatInt(alerte.nbRetards)} facture${pluriel(alerte.nbRetards)} en retard dans l'onglet Facturation`,
      style: critique ? CHIP_CRITIQUE : CHIP_WARNING,
      ring: critique ? RING_CRITIQUE : RING_WARNING,
    })
  }

  return (
    <section
      role="status"
      aria-live="polite"
      aria-label={`Alertes de la Super Administration : ${resume}`}
      className={cn(
        "overflow-hidden rounded-lg border shadow-sm",
        critique ? BANNIERE_CRITIQUE : BANNIERE_WARNING,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-3 py-2.5 md:px-4">
        <Icone
          className={cn("h-5 w-5 shrink-0", critique ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400")}
          aria-hidden
        />
        <p className="min-w-0 flex-1 text-xs font-medium leading-snug md:text-sm">{resume}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => {
            const ChipIcone = chip.icone
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => onNaviguer(chip.onglet)}
                aria-label={chip.aria}
                title={chip.aria}
                className={cn(
                  "inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-md border px-2.5 py-2",
                  "text-[11px] font-semibold leading-tight transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset",
                  chip.style,
                  chip.ring,
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
            title="Masquer pour la session courante (réaffiché à la prochaine consultation)"
            className={cn(
              "inline-flex min-h-11 w-11 shrink-0 items-center justify-center rounded-md border",
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset",
              critique ? MASQUER_CRITIQUE : MASQUER_WARNING,
              critique ? RING_CRITIQUE : RING_WARNING,
            )}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <p className="px-3 pb-2 text-[10px] leading-snug opacity-80 md:px-4">
        Recalcul à chaque consultation ET après chaque action métier (paiement, relance, transition, génération) —
        échéances à fenêtre −30/+90 j, retards des factures émises. Le masquage dure le temps de la session.
      </p>
    </section>
  )
}
