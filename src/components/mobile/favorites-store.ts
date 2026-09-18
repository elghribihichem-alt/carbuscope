// CarbuScope Mobile — favoris persistés (B.2.7)
// Stations favorites (cœur sur la fiche), enseignes et services préférés du
// profil. localStorage « carbuscope-favorites », avec assainissement au merge.

import { create } from "zustand"
import { persist } from "zustand/middleware"

function toggleInArray<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter(x => x !== v) : [...list, v]
}

interface FavoritesState {
  stationIds: string[]
  favBrands: string[]
  favServices: string[]
  toggleFavorite: (id: string) => void
  removeFavorite: (id: string) => void
  toggleFavBrand: (slug: string) => void
  toggleFavService: (slug: string) => void
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set) => ({
      stationIds: [],
      favBrands: ["agil"],
      favServices: ["lavage", "cafe"],
      toggleFavorite: id => set(s => ({ stationIds: toggleInArray(s.stationIds, id) })),
      removeFavorite: id => set(s => ({ stationIds: s.stationIds.filter(x => x !== id) })),
      toggleFavBrand: slug => set(s => ({ favBrands: toggleInArray(s.favBrands, slug) })),
      toggleFavService: slug => set(s => ({ favServices: toggleInArray(s.favServices, slug) })),
    }),
    {
      name: "carbuscope-favorites",
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<FavoritesState>
        return {
          ...current,
          stationIds: Array.isArray(p.stationIds) ? p.stationIds : [],
          favBrands: Array.isArray(p.favBrands) ? p.favBrands : current.favBrands,
          favServices: Array.isArray(p.favServices) ? p.favServices : current.favServices,
        }
      },
    }
  )
)
