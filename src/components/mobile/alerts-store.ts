// CarbuScope Mobile — préférences d'alertes intelligentes persistées (localStorage)
// Extension B.3.1 : les alertes du centre sont personnalisées et mémorisées.

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { DEFAULT_ALERT_PREFS, type AlertPrefs } from "./smart-alerts"

/** Bascule un élément dans un tableau (contrairement au toggleIn de shared.tsx, dédié aux Set) */
function toggleInArray<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter(x => x !== v) : [...list, v]
}

interface AlertsPrefsState extends AlertPrefs {
  toggleFavBrand: (slug: string) => void
  toggleWatchedService: (slug: string) => void
  setRadiusKm: (km: number) => void
  setOpen24Only: (v: boolean) => void
  resetPrefs: () => void
}

export const useAlertsStore = create<AlertsPrefsState>()(
  persist(
    (set) => ({
      ...DEFAULT_ALERT_PREFS,
      toggleFavBrand: slug => set(s => ({ favBrands: toggleInArray(s.favBrands, slug) })),
      toggleWatchedService: slug => set(s => ({ watchedServices: toggleInArray(s.watchedServices, slug) })),
      setRadiusKm: radiusKm => set({ radiusKm }),
      setOpen24Only: open24Only => set({ open24Only }),
      resetPrefs: () => set({ ...DEFAULT_ALERT_PREFS }),
    }),
    {
      name: "carbuscope-alerts",
      // Assainit l'état persisté (types corrompus / anciens formats)
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AlertPrefs>
        return {
          ...current,
          favBrands: Array.isArray(p.favBrands) ? p.favBrands : DEFAULT_ALERT_PREFS.favBrands,
          watchedServices: Array.isArray(p.watchedServices) ? p.watchedServices : DEFAULT_ALERT_PREFS.watchedServices,
          radiusKm: typeof p.radiusKm === "number" ? p.radiusKm : DEFAULT_ALERT_PREFS.radiusKm,
          open24Only: typeof p.open24Only === "boolean" ? p.open24Only : DEFAULT_ALERT_PREFS.open24Only,
        }
      },
    }
  )
)
