'use client'

// CarbuScope — Module Média (T60) : console Super Administration « Média
// (référentiel) ». 6 volets en onglets in-page, pilotés par nav.saMedia
// (?? "dashboard") — pattern des autres volets SA (sa-radar, sa-hubs).
//   · dashboard    — panneaux/faces, occupation globale, top 10, alertes 30 j
//   · panels       — gestion panneaux & faces (CRUD, import, photos, carte)
//   · owners       — propriétaires physiques (régies, communes, privés)
//   · permissions  — matrice enseigne × face + aperçu en direct
//   · traffic      — trafic & audience (édition en ligne, import, historique)
//   · audit        — journal d'audit inaltérable (filtres acteur/face/champ)
//   · engine       — paramétrage du moteur (saisonnalité, chevauchement, coût)

import type * as React from "react"
import { Megaphone } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAppStore } from "@/store/app-store"
import { ModuleHeader, useLocalT } from "@/components/media/media-shared"
import { SaMediaDashboard } from "./sa-media-dashboard"
import { SaMediaPanels } from "./sa-media-panels"
import { SaMediaOwners } from "./sa-media-owners"
import { SaMediaPermissions } from "./sa-media-permissions"
import { SaMediaTraffic } from "./sa-media-traffic"
import { SaMediaAudit } from "./sa-media-audit"
import { SaMediaEngine } from "./sa-media-engine"

const DICT = {
  fr: {
    "tab.dashboard": "Tableau de bord",
    "tab.panels": "Panneaux & faces",
    "tab.owners": "Propriétaires",
    "tab.permissions": "Permissions",
    "tab.traffic": "Trafic & audience",
    "tab.audit": "Journal d'audit",
    "tab.engine": "Moteur",
    header: "Média — référentiel & permissions",
    headerDesc: "Gestion du référentiel global des panneaux urbains et de leurs faces, des propriétaires physiques, de la matrice de visibilité enseigne × face et du paramétrage du moteur de simulation.",
    badge: "Super Administration",
  },
  en: {
    "tab.dashboard": "Dashboard",
    "tab.panels": "Panels & faces",
    "tab.owners": "Owners",
    "tab.permissions": "Permissions",
    "tab.traffic": "Traffic & audience",
    "tab.audit": "Audit journal",
    "tab.engine": "Engine",
    header: "Media — referential & permissions",
    headerDesc: "Global referential of urban panels and their faces, physical owners, the brand × face visibility matrix and the simulation engine settings.",
    badge: "Super Administration",
  },
  ar: {
    "tab.dashboard": "لوحة القيادة",
    "tab.panels": "اللوحات والأوجه",
    "tab.owners": "المالكون",
    "tab.permissions": "الصلاحيات",
    "tab.traffic": "المرور والجمهور",
    "tab.audit": "سجل التدقيق",
    "tab.engine": "المحرك",
    header: "الإعلام — المرجع والصلاحيات",
    headerDesc: "إدارة المرجع الشامل للوحات الحضرية وأوجهها، والمالكين الماديين، ومصفوفة الرؤية بين العلامات والأوجه، وإعدادات محرك المحاكاة.",
    badge: "الإدارة العليا",
  },
}

const SA_MEDIA_SUBTABS: ReadonlyArray<{ id: string; labelKey: string }> = [
  { id: "dashboard", labelKey: "tab.dashboard" },
  { id: "panels", labelKey: "tab.panels" },
  { id: "owners", labelKey: "tab.owners" },
  { id: "permissions", labelKey: "tab.permissions" },
  { id: "traffic", labelKey: "tab.traffic" },
  { id: "audit", labelKey: "tab.audit" },
  { id: "engine", labelKey: "tab.engine" },
]

export function SaMedia() {
  const { t } = useLocalT(DICT)
  const setNav = useAppStore(s => s.setNav)
  const raw = useAppStore(s => s.nav.saMedia) ?? "dashboard"
  const tab = SA_MEDIA_SUBTABS.some(s => s.id === raw) ? raw : "dashboard"

  return (
    <div className="space-y-4">
      <ModuleHeader
        icon={Megaphone}
        title={t("header")}
        description={t("headerDesc")}
        badge={t("badge")}
      />
      <Tabs value={tab} onValueChange={v => setNav("saMedia", v)} className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList className="h-auto w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
            {SA_MEDIA_SUBTABS.map(s => (
              <TabsTrigger key={s.id} value={s.id} className="gap-2 px-3 py-2 text-xs sm:text-sm">
                <span className="truncate">{t(s.labelKey)}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="dashboard" className="mt-0 space-y-4">
          <SaMediaDashboard />
        </TabsContent>
        <TabsContent value="panels" className="mt-0 space-y-4">
          <SaMediaPanels />
        </TabsContent>
        <TabsContent value="owners" className="mt-0 space-y-4">
          <SaMediaOwners />
        </TabsContent>
        <TabsContent value="permissions" className="mt-0 space-y-4">
          <SaMediaPermissions />
        </TabsContent>
        <TabsContent value="traffic" className="mt-0 space-y-4">
          <SaMediaTraffic />
        </TabsContent>
        <TabsContent value="audit" className="mt-0 space-y-4">
          <SaMediaAudit />
        </TabsContent>
        <TabsContent value="engine" className="mt-0 space-y-4">
          <SaMediaEngine />
        </TabsContent>
      </Tabs>
    </div>
  )
}
