'use client'

// Shadow Market (T44-e) — section « Paramètres » : 4 onglets.
//   🔐 Accès & Droits   : matrice des rôles + comptes réels + périmètres
//   📐 Rayons & Seuils  : configuration des cercles de cannibalisation (PATCH)
//   🏷️ Typologies       : catalogue extensible des points informels (CRUD)
//   🔔 Notifications    : alertes « nouveau point proche station » + simulation
// Chaque onglet charge ses propres données (config / comptes / typologies /
// carte) — setState uniquement dans les .then (règle set-state-in-effect).

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SectionHeader } from "../shadow-shared"
import { SettingsAccessTab } from "./settings-access-tab"
import { SettingsRadiiTab } from "./settings-radii-tab"
import { SettingsTypologiesTab } from "./settings-typologies-tab"
import { SettingsNotificationsTab } from "./settings-notifications-tab"

export function ShadowSettings() {
  return (
    <div className="space-y-4">
      <SectionHeader
        emoji="⚙️"
        title="Paramètres du module"
        description="Accès et périmètres, rayons de cannibalisation et seuils d'alerte, typologies des points informels et règles de notification — le périmètre de données reste appliqué côté serveur (session signée)."
      />

      <Tabs defaultValue="access">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="access">🔐 Accès &amp; Droits</TabsTrigger>
          <TabsTrigger value="radii">📐 Rayons &amp; Seuils</TabsTrigger>
          <TabsTrigger value="typologies">🏷️ Typologies</TabsTrigger>
          <TabsTrigger value="notifications">🔔 Notifications</TabsTrigger>
        </TabsList>
        <TabsContent value="access">
          <SettingsAccessTab />
        </TabsContent>
        <TabsContent value="radii">
          <SettingsRadiiTab />
        </TabsContent>
        <TabsContent value="typologies">
          <SettingsTypologiesTab />
        </TabsContent>
        <TabsContent value="notifications">
          <SettingsNotificationsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
