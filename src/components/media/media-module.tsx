'use client'

// CarbuScope — Module Média (T60) : coque du module côté Portail enseigne.
// 5 volets pilotés par nav.media (?? "dashboard") via le store — même contrat
// que Radar/Hubs (onglets in-page, entrée directe sidebar T57/T60).
//   · dashboard     — campagnes actives, budget consommé, stations couvertes
//   · explorateur   — carte + tableau imbriqué panneaux→faces + filtres +
//                     comparateur + édition en ligne
//   · simulations   — liste (brouillons / envoyées / archivées) + assistant
//                     de campagne en 5 étapes + partage (PDF / wa.me / email)
//   · membres       — rôles & périmètres géographiques (admin enseigne)
//   · preferences   — pondérations du score composite, branding PDF
// Les permissions sont résolues CÔTÉ SERVEUR (/api/media/*) — ce composant ne
// contient AUCUNE logique de visibilité.

import type * as React from "react"
import { Megaphone } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAppStore } from "@/store/app-store"
import { ModuleHeader, useLocalT } from "./media-shared"
import { MediaDashboard } from "./media-dashboard"
import { MediaExplorer } from "./media-explorer"
import { MediaSimulations } from "./media-simulations"
import { MediaMembers } from "./media-members"
import { MediaPreferences } from "./media-preferences"

const DICT = {
  fr: {
    "tab.dashboard": "Tableau de bord",
    "tab.explorateur": "Explorateur de faces",
    "tab.simulations": "Simulations",
    "tab.membres": "Membres",
    "tab.preferences": "Préférences",
    header: "Média & Panneaux urbains",
    headerDesc: "Découvrez, comparez, simulez et budgétez vos campagnes d'affichage urbain. L'explorateur respecte strictement vos droits de visibilité — rien de masqué ne transite côté client.",
    badge: "V1 · Panneaux urbains",
  },
  en: {
    "tab.dashboard": "Dashboard",
    "tab.explorateur": "Face explorer",
    "tab.simulations": "Simulations",
    "tab.membres": "Members",
    "tab.preferences": "Preferences",
    header: "Media & Urban Panels",
    headerDesc: "Discover, compare, simulate and budget your urban display campaigns. The explorer strictly respects your visibility rights — nothing masked ever reaches the client.",
    badge: "V1 · Urban panels",
  },
  ar: {
    "tab.dashboard": "لوحة القيادة",
    "tab.explorateur": "مستكشف الأوجه",
    "tab.simulations": "المحاكات",
    "tab.membres": "الأعضاء",
    "tab.preferences": "التفضيلات",
    header: "الإعلام واللوحات الحضرية",
    headerDesc: "اكتشف وقارن وحاكي وحدد ميزانية حملات الإعلان الحضري. المستكشف يحترم حقوق الرؤية الخاصة بك بدقة — لا شيء مخفي يصل إلى العميل.",
    badge: "النسخة 1 · لوحات حضرية",
  },
}

const MEDIA_SUBTABS: ReadonlyArray<{ id: string; labelKey: string }> = [
  { id: "dashboard", labelKey: "tab.dashboard" },
  { id: "explorateur", labelKey: "tab.explorateur" },
  { id: "simulations", labelKey: "tab.simulations" },
  { id: "membres", labelKey: "tab.membres" },
  { id: "preferences", labelKey: "tab.preferences" },
]

export function MediaModule({ brandSlug }: { brandSlug: string }) {
  const { t } = useLocalT(DICT)
  const setNav = useAppStore(s => s.setNav)
  const raw = useAppStore(s => s.nav.media) ?? "dashboard"
  const tab = MEDIA_SUBTABS.some(s => s.id === raw) ? raw : "dashboard"

  return (
    <div className="space-y-4">
      <ModuleHeader
        icon={Megaphone}
        title={t("header")}
        description={t("headerDesc")}
        badge={t("badge")}
      />
      <Tabs value={tab} onValueChange={v => setNav("media", v)} className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList className="h-auto w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {MEDIA_SUBTABS.map(s => (
              <TabsTrigger key={s.id} value={s.id} className="gap-2 px-3 py-2 text-xs sm:text-sm">
                <span className="truncate">{t(s.labelKey)}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="dashboard" className="mt-0 space-y-4">
          <MediaDashboard brandSlug={brandSlug} onExplore={() => setNav("media", "explorateur")} />
        </TabsContent>
        <TabsContent value="explorateur" className="mt-0 space-y-4">
          <MediaExplorer />
        </TabsContent>
        <TabsContent value="simulations" className="mt-0 space-y-4">
          <MediaSimulations brandSlug={brandSlug} />
        </TabsContent>
        <TabsContent value="membres" className="mt-0 space-y-4">
          <MediaMembers brandSlug={brandSlug} />
        </TabsContent>
        <TabsContent value="preferences" className="mt-0 space-y-4">
          <MediaPreferences />
        </TabsContent>
      </Tabs>
    </div>
  )
}
