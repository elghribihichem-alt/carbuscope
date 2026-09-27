'use client'

// Shadow Market — Recensement (T44-d), section 3 du module.
// 6 onglets : Nouveau Point · Liste des Points · Mises à Jour · Équipe
// d'Audit · Validation · Galerie Photos. Chaque onglet porte ses propres
// requêtes (AbortController) — le conteneur ne gère que la navigation.

import { useState } from "react"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { useAppStore } from "@/store/app-store"
import { TabNewPoint } from "./tab-new-point"
import { TabPointsList } from "./tab-points-list"
import { TabUpdates } from "./tab-updates"
import { TabAuditors } from "./tab-auditors"
import { TabValidation } from "./tab-validation"
import { TabGallery } from "./tab-gallery"

export function ShadowRecensement({ onNavigate }: { onNavigate?: (section: string) => void }) {
  // Onglet actif piloté par la sidebar (store T46, clé « shadow-recensement »).
  const setNav = useAppStore(s => s.setNav)
  const tab = useAppStore(s => s.nav["shadow-recensement"]) ?? "nouveau"
  const setTab = (v: string) => setNav("shadow-recensement", v)
  const [focusCode, setFocusCode] = useState<string | null>(null)

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsContent value="nouveau" className="mt-0">
        <TabNewPoint
          onGoToList={(code) => {
            if (code) setFocusCode(code)
            setTab("liste")
          }}
          onNavigate={onNavigate}
        />
      </TabsContent>
      <TabsContent value="liste" className="mt-0">
        <TabPointsList focusCode={focusCode} />
      </TabsContent>
      <TabsContent value="maj" className="mt-0">
        <TabUpdates />
      </TabsContent>
      <TabsContent value="audit" className="mt-0">
        <TabAuditors />
      </TabsContent>
      <TabsContent value="validation" className="mt-0">
        <TabValidation />
      </TabsContent>
      <TabsContent value="galerie" className="mt-0">
        <TabGallery />
      </TabsContent>
    </Tabs>
  )
}
