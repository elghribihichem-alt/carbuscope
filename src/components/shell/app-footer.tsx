'use client'

import { Fuel, MapPin, Users, Database } from "lucide-react"

export function AppFooter() {
  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Fuel className="h-3.5 w-3.5 text-emerald-600" />
          CarbuScope — « Le Waze du carburant »
        </span>
        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />1 814 stations · 24 gouvernorats</span>
        <span className="flex items-center gap-1"><Users className="h-3 w-3" />6 enseignes suivies</span>
        <span className="flex items-center gap-1"><Database className="h-3 w-3" />Données de démonstration à valeur d'illustration</span>
        <span className="ml-auto">© 2025 CarbuScope · Plateforme B2B/B2C/B2B2B</span>
      </div>
    </footer>
  )
}
