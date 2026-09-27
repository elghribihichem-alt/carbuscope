'use client'

// Shadow Market — Recensement (T44-d), section 3 du module.
// 6 onglets : Nouveau Point · Liste des Points · Mises à Jour · Équipe
// d'Audit · Validation · Galerie Photos. Chaque onglet porte ses propres
// requêtes (AbortController) — le conteneur ne gère que la navigation.

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TabNewPoint } from "./tab-new-point"
import { TabPointsList } from "./tab-points-list"
import { TabUpdates } from "./tab-updates"
import { TabAuditors } from "./tab-auditors"
import { TabValidation } from "./tab-validation"
import { TabGallery } from "./tab-gallery"

export function ShadowRecensement({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const [tab, setTab] = useState("nouveau")
  const [focusCode, setFocusCode] = useState<string | null>(null)

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-stone-100 p-1 dark:bg-stone-900">
        <TabsTrigger value="nouveau" className="gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:text-stone-900 dark:data-[state=active]:bg-stone-800 dark:data-[state=active]:text-stone-50 sm:text-[13px]">
          <span aria-hidden>➕</span> Nouveau Point
        </TabsTrigger>
        <TabsTrigger value="liste" className="gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:text-stone-900 dark:data-[state=active]:bg-stone-800 dark:data-[state=active]:text-stone-50 sm:text-[13px]">
          <span aria-hidden>📝</span> Liste des Points
        </TabsTrigger>
        <TabsTrigger value="maj" className="gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:text-stone-900 dark:data-[state=active]:bg-stone-800 dark:data-[state=active]:text-stone-50 sm:text-[13px]">
          <span aria-hidden>🔄</span> Mises à Jour
        </TabsTrigger>
        <TabsTrigger value="audit" className="gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:text-stone-900 dark:data-[state=active]:bg-stone-800 dark:data-[state=active]:text-stone-50 sm:text-[13px]">
          <span aria-hidden>👥</span> Équipe d&apos;Audit
        </TabsTrigger>
        <TabsTrigger value="validation" className="gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:text-stone-900 dark:data-[state=active]:bg-stone-800 dark:data-[state=active]:text-stone-50 sm:text-[13px]">
          <span aria-hidden>✅</span> Validation
        </TabsTrigger>
        <TabsTrigger value="galerie" className="gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:text-stone-900 dark:data-[state=active]:bg-stone-800 dark:data-[state=active]:text-stone-50 sm:text-[13px]">
          <span aria-hidden>📸</span> Galerie Photos
        </TabsTrigger>
      </TabsList>

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
