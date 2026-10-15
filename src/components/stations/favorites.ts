"use client"

// CarbuScope — Module « Mes stations » (A.4) : préférences locales par enseigne.
//   • Favoris  : épingles ⭐ sur les stations de MON parc (sous-onglet « Favoris »).
//   • Suivis   : liste de veille des stations CONCURRENTES ajoutées par l'utilisateur
//                (onglet « Concurrents » — « insérer les stations concurrentes »).
// Mini-store externe (useSyncExternalStore, même pattern que le mini-store de
// src/components/dashboard/dashboard-charts-grid.tsx) : instantané serveur = liste
// vide (aucun mismatch d'hydratation), écritures propagées aux abonnés et
// synchronisées entre onglets via l'événement « storage ».

import { useCallback, useSyncExternalStore } from "react"

const FAV_PREFIX = "cs-favoris-stations:"
const WATCH_PREFIX = "cs-concurrents-suivis:"

/** Clé de stockage des favoris du parc de l'enseigne connectée. */
export function favoritesKey(brandSlug: string): string {
  return `${FAV_PREFIX}${brandSlug}`
}

/** Clé de stockage de la liste de veille concurrente de l'enseigne connectée. */
export function watchlistKey(brandSlug: string): string {
  return `${WATCH_PREFIX}${brandSlug}`
}

// --- Mini-store -------------------------------------------------------------

const EMPTY: string[] = []
const listeners = new Set<() => void>()
const caches = new Map<string, { raw: string | null; ids: string[] }>()

function parseIds(raw: string | null): string[] {
  if (!raw) return EMPTY
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return EMPTY
    const ids = parsed.filter((x): x is string => typeof x === "string")
    return ids.length === 0 ? EMPTY : ids
  } catch {
    return EMPTY
  }
}

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function snapshotIds(key: string): string[] {
  const raw = readRaw(key)
  const cached = caches.get(key)
  if (cached && cached.raw === raw) return cached.ids
  const ids = parseIds(raw)
  caches.set(key, { raw, ids })
  return ids
}

function emitChange() {
  for (const l of listeners) l()
}

function subscribeIds(cb: () => void): () => void {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === undefined) return
    if (e.key.startsWith(FAV_PREFIX) || e.key.startsWith(WATCH_PREFIX)) emitChange()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", onStorage)
  }
}

function serverIds(): string[] {
  return EMPTY
}

function writeIds(key: string, ids: string[]): void {
  try {
    if (ids.length === 0) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(ids))
  } catch {
    /* localStorage indisponible (mode privé…) — silencieux */
  }
  caches.delete(key) // invalide le cache → le prochain instantané relit le stockage
  emitChange()
}

// --- Hooks -------------------------------------------------------------------

/** Liste d'identifiants persistée (favoris ou suivis) — lecture réactive. */
export function useIdList(key: string): string[] {
  const getSnapshot = useCallback(() => snapshotIds(key), [key])
  return useSyncExternalStore(subscribeIds, getSnapshot, serverIds)
}

/** Bascule un identifiant dans la liste persistée `key`. */
export function toggleStoredId(key: string, id: string): void {
  const ids = snapshotIds(key)
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
  writeIds(key, next)
}
