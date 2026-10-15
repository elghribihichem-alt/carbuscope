'use client'

// T55-B3-b — Socle partagé du module « Franchise » (Radar) : DTO typés du
// contrat API, hooks de chargement (candidats, contrats, hubs — lecture des
// routes existantes + nouvelles routes B3-b), métadonnées de statuts
// (badges FR, jamais de bleu), transitions d'avancement du pipeline et
// parseur du contenu de contrat sérialisé (sections lisibles).

import { useCallback, useEffect, useState } from "react"
import { num } from "@/lib/chart"

/* ============================ DTO ============================ */

export interface CandidateDTO {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  gouvernorat: string
  zoneNote: number
  capital: number | null
  experience: string | null
  status: string
  notes: string
  hubs: { code: string; name: string; status: string }[]
  contracts: { number: string; status: string }[]
  createdAt: string
  updatedAt: string
}

export interface ContractDTO {
  id: string
  number: string
  format: string
  status: string
  content: string
  signedAt: string | null
  createdAt: string
  /** Hub rattaché (id brut — hubId dénormalisé côté Prisma) + fiche jointe. */
  hubId?: string | null
  candidate: {
    id: string
    fullName: string
    email: string | null
    phone: string | null
    gouvernorat: string
    zoneNote: number
    capital: number | null
    experience: string | null
    status: string
    notes: string
    createdAt: string
  }
  hub: { id: string; code: string; name: string; status: string; gouvernorat: string } | null
}

/** Hub allégé (contrat de /api/hubs GET — lecture seule). */
export interface HubLiteDTO {
  id: string
  code: string
  name: string
  gouvernorat: string
  delegation: string | null
  status: string
  format: string
  franchisee: string | null
  investmentDt: number
}

/* ============================ Statuts ============================ */

export const CANDIDATE_STATUS_META: Record<string, { label: string; badge: string }> = {
  INTERESSE: { label: "Intéressé", badge: "border-stone-300 bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300" },
  QUALIFIE: { label: "Qualifié", badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  VISITE: { label: "Visite faite", badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" },
  SIGNE: { label: "Signé", badge: "border-[#059669]/40 bg-[#059669]/10 text-[#047857] dark:text-emerald-300" },
  REFUSE: { label: "Refusé", badge: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400" },
}

/** Ordre d'avancement du pipeline (l'action « Avancer » suit cette chaîne). */
export const CANDIDATE_FLOW = ["INTERESSE", "QUALIFIE", "VISITE", "SIGNE"] as const

export function nextStatus(status: string): string | null {
  const i = CANDIDATE_FLOW.indexOf(status as (typeof CANDIDATE_FLOW)[number])
  if (i === -1 || i === CANDIDATE_FLOW.length - 1) return null
  return CANDIDATE_FLOW[i + 1]
}

export const CONTRACT_STATUS_META: Record<string, { label: string; badge: string }> = {
  BROUILLON: { label: "Brouillon", badge: "border-stone-300 bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300" },
  SIGNE: { label: "Signé", badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" },
  ACTIF: { label: "Actif", badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  RESILIE: { label: "Résilié", badge: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400" },
}

/* ============================ Helpers ============================ */

export const money = (v: number | null) => (v !== null && v > 0 ? `${num(v)} DT` : "—")

export const fmtDateFr = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—"

/** Mutation JSON (POST/PATCH) avec message d'erreur FR du serveur si présent. */
export async function franchiseApi(
  url: string,
  method: "POST" | "PATCH",
  body: unknown,
): Promise<{ ok: boolean; message: string | null; data: Record<string, unknown> | null }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok) {
      const msg = data && typeof data.error === "string" ? data.error : `HTTP ${res.status}`
      return { ok: false, message: msg, data }
    }
    return { ok: true, message: null, data }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erreur réseau", data: null }
  }
}

/* ============================ Parse du contrat ============================ */

export interface ContractSection {
  titre: string
  lignes: string[]
}

/** Parse le content sérialisé (JSON { version, sections[] }) — tolérant :
 *  un contenu non JSON (seed) est affiché comme bloc brut. */
export function parseContractContent(content: string): { sections: ContractSection[]; raw: string | null } {
  try {
    const parsed = JSON.parse(content) as { sections?: ContractSection[] }
    if (Array.isArray(parsed.sections) && parsed.sections.length > 0) {
      return { sections: parsed.sections, raw: null }
    }
  } catch {
    // contenu historique non sérialisé — repli brut
  }
  return { sections: [], raw: content || "" }
}

/* ============================ Hooks ============================ */

/** Chargement + rechargement de la liste des candidats (paresseux : `enabled`). */
export function useFranchiseCandidates(enabled = true) {
  const [candidates, setCandidates] = useState<CandidateDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey(k => k + 1), [])

  useEffect(() => {
    if (!enabled) return
    let alive = true
    fetch("/api/franchise/candidates")
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => { if (alive) { setCandidates(d.candidates ?? []); setError(null) } })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : "Erreur inconnue") })
    return () => { alive = false }
  }, [reloadKey, enabled])

  return { candidates, error, reload }
}

/** Chargement + rechargement de la liste des contrats (paresseux : `enabled`). */
export function useFranchiseContracts(enabled = true) {
  const [contracts, setContracts] = useState<ContractDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey(k => k + 1), [])

  useEffect(() => {
    if (!enabled) return
    let alive = true
    fetch("/api/franchise/contracts")
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => { if (alive) { setContracts(d.contracts ?? []); setError(null) } })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : "Erreur inconnue") })
    return () => { alive = false }
  }, [reloadKey, enabled])

  return { contracts, error, reload }
}

/** Chargement des hubs (contrat /api/hubs GET — lecture seule). */
export function useFranchiseHubs(brandSlug: string | null, enabled: boolean) {
  const [hubs, setHubs] = useState<HubLiteDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey(k => k + 1), [])

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const qs = brandSlug ? `?brand=${encodeURIComponent(brandSlug)}` : ""
    fetch(`/api/hubs${qs}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => { if (alive) { setHubs(d.hubs ?? []); setError(null) } })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : "Erreur inconnue") })
    return () => { alive = false }
  }, [reloadKey, brandSlug, enabled])

  return { hubs, error, reload }
}
