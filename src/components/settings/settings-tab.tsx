'use client'

// A.9 — Onglet « Paramètres » de l'observatoire (accès Administrateur)

import { toast } from "sonner"
import { Settings, Save, Info } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAppStore } from "@/store/app-store"
import { ROLE_LABELS } from "@/store/app-store"
import { Badge } from "@/components/ui/badge"
import { SettingsProfileCard } from "./settings-profile-card"
import { SettingsNotificationsCard } from "./settings-notifications-card"
import { SettingsLanguageCard } from "./settings-language-card"
import { SettingsUsersCard } from "./settings-users-card"
import { SettingsApiCard } from "./settings-api-card"

export function SettingsTab() {
  const brandSlug = useAppStore(s => s.brandSlug)
  const role = useAppStore(s => s.role)

  const saveAll = () => {
    toast.success("Paramètres enregistrés", {
      description: "Profil enseigne, notifications, langue, utilisateurs et accès API mis à jour.",
    })
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400">
            <Settings className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Paramètres</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Profil de l&apos;enseigne, notifications, langue, utilisateurs et accès API — module A.9.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="w-fit gap-1 border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400">
          Rôle : {ROLE_LABELS[role]}
        </Badge>
      </div>

      {/* Grille 2 colonnes de cartes de paramètres */}
      {/* T53-T4b : grid-cols-1 explicite (piste minmax(0,1fr) de Tailwind) —
          sans elle, la piste « auto » s’étale au contenu min des cartes et fait
          déborder la page à 390 px (scrollWidth 467 > 390 mesuré, capture mobile). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SettingsProfileCard brandSlug={brandSlug} />
        <SettingsNotificationsCard />
        <SettingsLanguageCard />
        <SettingsUsersCard />
        <div className="lg:col-span-2">
          <SettingsApiCard />
        </div>
      </div>

      {/* Barre d'enregistrement globale */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Démonstration : les réglages sont conservés en local le temps de la session (aucune écriture serveur).
          </p>
          <Button onClick={saveAll} className="gap-1.5">
            <Save className="h-4 w-4" aria-hidden /> Enregistrer les modifications
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
