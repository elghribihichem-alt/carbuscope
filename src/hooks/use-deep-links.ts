'use client'

// T41 phase 7 — Deep-links : l'URL reflète l'état de navigation et le restaure
// au chargement — liens partageables. Format discret :
// `#mode=portail&espace=shadow&tab=map[&station=CODE]`, écrit via
// history.replaceState.
// T50 — 3 espaces produit : les modes historiques d'un ancien lien
// (#mode=observatoire | shadow | backoffice | agents) sont convertis vers
// l'espace enseigne fusionné (#mode=portail&espace=…). Un hash inconnu ou non
// autorisé est ignoré (l'application démarre normalement, hash normalisé).

import { useEffect } from "react"
import { useAppStore, migrateMode, TAB_ACCESS, type Mode, type Tab } from "@/store/app-store"
import { DEMO_ACCOUNTS_MAP } from "@/lib/demo-accounts"

const VALID_MODES: string[] = ["portail", "mobile", "superadmin"]
const VALID_ESPACES: string[] = ["observatoire", "portail", "shadow", "backoffice", "agents"]
/** Modes historiques convertis vers un module de l'espace enseigne fusionné. */
const LEGACY_ESPACES: Record<string, string> = {
  observatoire: "observatoire",
  portail: "portail",
  shadow: "shadow",
  backoffice: "backoffice",
  agents: "agents",
}
const VALID_TABS: string[] = [
  "dashboard", "map", "stations", "competition", "calculators",
  "implantation", "prices", "veille", "reports", "demographie", "settings",
]

interface DeepLinkState {
  mode?: Mode
  espace?: string
  tab?: Tab
  station?: string
}

/** `#mode=portail&espace=shadow&tab=map` → état validé (valeurs inconnues ignorées). */
function parseHash(): DeepLinkState {
  if (typeof window === "undefined") return {}
  const raw = window.location.hash
  if (!raw.startsWith("#")) return {}
  const params = new URLSearchParams(raw.slice(1))
  const state: DeepLinkState = {}
  const modeParam = params.get("mode") ?? undefined
  const espaceParam = params.get("espace") ?? undefined
  const tabParam = params.get("tab") ?? undefined
  if (modeParam) {
    if (VALID_MODES.includes(modeParam)) state.mode = modeParam as Mode
    else if (LEGACY_ESPACES[modeParam]) {
      // Lien historique : mode fusionné + module préservé dans l'espace.
      state.mode = "portail"
      if (!espaceParam) state.espace = LEGACY_ESPACES[modeParam]
    } else {
      state.mode = migrateMode(modeParam)
    }
  }
  if (espaceParam && VALID_ESPACES.includes(espaceParam)) state.espace = espaceParam
  if (tabParam && VALID_TABS.includes(tabParam)) state.tab = tabParam as Tab
  // Le hash porte le code public de la station → focus « voir sur la carte ».
  const station = params.get("station")
  if (station) state.station = station
  return state
}

/** Hash canonique de l'état courant (déterministe — comparé avant écriture). */
function buildHash(mode: Mode, espace: string, tab: Tab, station: string | null): string {
  const parts = [`mode=${mode}`]
  if (mode === "portail") parts.push(`espace=${espace}`)
  parts.push(`tab=${tab}`)
  if (station) parts.push(`station=${encodeURIComponent(station)}`)
  return `#${parts.join("&")}`
}

export function useDeepLinks() {
  // 1. Restauration au chargement : applique le hash (validé + autorisé pour le
  //    rôle courant), puis normalise le hash vers l'état effectif.
  useEffect(() => {
    const s = useAppStore.getState()
    const hash = parseHash()
    if (hash.mode) {
      // Même garde que page.tsx : l'espace Super Admin est réservé au compte racine.
      const isSuperAdmin = s.userId ? DEMO_ACCOUNTS_MAP[s.userId]?.isSuperAdmin === true : false
      if (hash.mode !== "superadmin" || isSuperAdmin) s.setMode(hash.mode)
    }
    if (hash.espace) s.setNav("espace", hash.espace)
    // setTab n'applique pas TAB_ACCESS lui-même → vérification explicite ici.
    if (hash.tab && TAB_ACCESS[hash.tab].includes(s.role)) s.setTab(hash.tab)
    if (hash.station) s.setFocusStation(hash.station)

    const after = useAppStore.getState()
    history.replaceState(null, "", buildHash(after.mode, after.nav.espace ?? "observatoire", after.tab, after.focusStationCode))
    // Restauration unique au mount : lis l'état via getState, aucune dépendance.
  }, [])

  // 2. Synchronisation store → hash (replaceState : ni navigation ni re-render
  //    de page, aucune entrée history superflue à chaque changement d'onglet).
  useEffect(() => {
    const write = (s: { mode: Mode; tab: Tab; focusStationCode: string | null; nav: Record<string, string> }) => {
      const next = buildHash(s.mode, s.nav.espace ?? "observatoire", s.tab, s.focusStationCode)
      if (window.location.hash !== next) history.replaceState(null, "", next)
    }
    return useAppStore.subscribe((s, prev) => {
      if (s.mode !== prev.mode || s.tab !== prev.tab || s.focusStationCode !== prev.focusStationCode || s.nav.espace !== prev.nav.espace) {
        write(s)
      }
    })
  }, [])
}
