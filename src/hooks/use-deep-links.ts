'use client'

// T41 phase 7 — Deep-links : l'URL reflète l'état de navigation (mode + onglet,
// station en focus) et le restaure au chargement — liens partageables.
// Format discret : `#mode=observatoire&tab=map[&station=CODE]`, écrit via
// history.replaceState (pas de navigation, pas de scroll, pas d'entrée history).
// Un hash inconnu ou non autorisé pour le rôle est simplement ignoré
// (l'application démarre normalement, le hash est normalisé).

import { useEffect } from "react"
import { useAppStore, TAB_ACCESS, type Mode, type Tab } from "@/store/app-store"
import { DEMO_ACCOUNTS_MAP } from "@/lib/demo-accounts"

const VALID_MODES: string[] = ["observatoire", "portail", "mobile", "agents", "backoffice", "superadmin"]
const VALID_TABS: string[] = [
  "dashboard", "map", "stations", "competition", "calculators",
  "implantation", "prices", "veille", "reports", "demographie", "settings",
]

interface DeepLinkState {
  mode?: Mode
  tab?: Tab
  station?: string
}

/** `#mode=observatoire&tab=map&station=AGIL-001` → état validé (valeurs inconnues ignorées). */
function parseHash(): DeepLinkState {
  if (typeof window === "undefined") return {}
  const raw = window.location.hash
  if (!raw.startsWith("#")) return {}
  const params = new URLSearchParams(raw.slice(1))
  const state: DeepLinkState = {}
  const modeParam = params.get("mode") ?? undefined
  const tabParam = params.get("tab") ?? undefined
  if (modeParam && VALID_MODES.includes(modeParam)) state.mode = modeParam as Mode
  if (tabParam && VALID_TABS.includes(tabParam)) state.tab = tabParam as Tab
  // Le hash porte le code public de la station → focus « voir sur la carte ».
  const station = params.get("station")
  if (station) state.station = station
  return state
}

/** Hash canonique de l'état courant (déterministe — comparé avant écriture). */
function buildHash(mode: Mode, tab: Tab, station: string | null): string {
  const parts = [`mode=${mode}`, `tab=${tab}`]
  if (station) parts.push(`station=${encodeURIComponent(station)}`)
  return `#${parts.join("&")}`
}

export function useDeepLinks() {
  // 1. Restauration au chargement : applique le hash (validé + autorisé pour le
  //    rôle courant), puis normalise le hash vers l'état effectif — un hash
  //    invalide (#mode=xyz…) laisse donc l'app démarrer normalement.
  useEffect(() => {
    const s = useAppStore.getState()
    const hash = parseHash()
    if (hash.mode) {
      // Même garde que page.tsx : l'espace Super Admin est réservé au compte racine.
      const isSuperAdmin = s.userId ? DEMO_ACCOUNTS_MAP[s.userId]?.isSuperAdmin === true : false
      if (hash.mode !== "superadmin" || isSuperAdmin) s.setMode(hash.mode)
    }
    // setTab n'applique pas TAB_ACCESS lui-même → vérification explicite ici.
    if (hash.tab && TAB_ACCESS[hash.tab].includes(s.role)) s.setTab(hash.tab)
    if (hash.station) s.setFocusStation(hash.station)

    const after = useAppStore.getState()
    history.replaceState(null, "", buildHash(after.mode, after.tab, after.focusStationCode))
    // Restauration unique au mount : lis l'état via getState, aucune dépendance.
  }, [])

  // 2. Synchronisation store → hash (replaceState : ni navigation ni re-render
  //    de page, aucune entrée history superflue à chaque changement d'onglet).
  useEffect(() => {
    const write = (s: { mode: Mode; tab: Tab; focusStationCode: string | null }) => {
      const next = buildHash(s.mode, s.tab, s.focusStationCode)
      if (window.location.hash !== next) history.replaceState(null, "", next)
    }
    return useAppStore.subscribe((s, prev) => {
      if (s.mode !== prev.mode || s.tab !== prev.tab || s.focusStationCode !== prev.focusStationCode) {
        write(s)
      }
    })
  }, [])
}
