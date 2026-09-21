'use client'

// CarbuScope — Aperçu de l'Application Mobile B2C (Module B)
// Layout : présentation produit (gauche) · maquette de téléphone interactive (centre)
// · fonctionnalités phares & monétisation (droite). Colonnes latérales masquées < lg.

import {
  BellRing, CloudOff, Crown, Fuel, Gift, Globe, HandHeart, Handshake, Languages, Megaphone, MousePointerClick,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PhoneFrame } from "./phone-frame"
import { MobileApp } from "./mobile-app"

const DIFFERENCIANTS = [
  {
    icon: BellRing,
    title: "Alertes intelligentes",
    text: "« Station Agil ouverte 24h/24 à 2 km », « lavage disponible sur votre trajet », « borne de recharge libre » — la bonne info au bon moment.",
  },
  {
    icon: HandHeart,
    title: "Contribution communautaire",
    text: "Signalements validés par 3 utilisateurs concordants, photos géolocalisées, réputation à badges et niveaux.",
  },
  {
    icon: CloudOff,
    title: "Mode hors ligne",
    text: "Cartes téléchargées et fiches stations en cache — les signalements partent dès la reconnexion.",
  },
  {
    icon: Languages,
    title: "Multilingue — 5 langues",
    text: "Arabe (RTL), français, anglais, italien, espagnol — avec détection automatique de la langue du téléphone.",
  },
]

const MONETISATION = [
  { icon: Megaphone, title: "Sponsoring", text: "Bannières, promotions géolocalisées, contenus sponsorisés." },
  { icon: Handshake, title: "Partenariats", text: "Assurances, banques, télécoms, agroalimentaire." },
  { icon: Gift, title: "Fidélité", text: "Programme de points cross-enseignes." },
  { icon: Crown, title: "Premium", text: "Version sans publicité (optionnel)." },
]

const PARCOURS: [string, string][] = [
  ["B.2.1", "Accueil — carte « autour de moi » + stations proches"],
  ["B.2.2", "Recherche — filtres enseigne, service, horaires, note"],
  ["B.2.3", "Fiche station — services, horaires, avis récents"],
  ["B.2.4", "Navigation — itinéraire Google Maps / Waze"],
  ["B.2.5", "Signalement — 6 types + photo géolocalisée"],
  ["B.2.6", "Avis — note globale + 4 critères notés"],
  ["B.2.7", "Profil — historique, réputation, préférences"],
  ["B.2.8", "Fidélité — cartes enseignes, points, paliers"],
  ["B.2.9", "Promotions — sponsors & offres géolocalisées"],
]

const LANGUES = [
  { label: "العربية", rtl: true },
  { label: "Français" },
  { label: "English" },
  { label: "Italiano" },
  { label: "Español" },
]

export function MobileB2CView() {
  return (
    <section className="flex flex-1 flex-col bg-gradient-to-b from-emerald-50/70 via-background to-background py-6 dark:from-emerald-950/40 lg:py-8">
      <div className="mx-auto grid w-full max-w-[1400px] flex-1 items-center gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:gap-10">

        {/* ---- Colonne gauche : présentation produit ---- */}
        <aside className="hidden lg:block" aria-label="Présentation de l'application">
          <div className="space-y-5">
            <div>
              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                Module B — Application Mobile B2C
              </Badge>
              <h2 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight text-foreground xl:text-[28px]">
                CarbuScope Mobile —
                <br />
                le Waze du carburant
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                « L'application que tout automobiliste tunisien ouvre avant de prendre la route. Gratuite, simple, fiable. »
                Stations-service, services, horaires et disponibilités — une donnée certifiée par la communauté, les enseignes
                et la plateforme.
              </p>
            </div>

            <ul className="space-y-3">
              {DIFFERENCIANTS.map(f => {
                const Icon = f.icon
                return (
                  <li key={f.title} className="flex gap-3 rounded-xl border bg-card p-3 shadow-sm">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{f.title}</p>
                      <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{f.text}</p>
                    </div>
                  </li>
                )
              })}
            </ul>

            <div className="flex gap-2.5 rounded-xl border border-amber-300/60 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/50">
              <MousePointerClick className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-[12px] leading-snug text-amber-900 dark:text-amber-300">
                <strong>Aperçu interactif de démonstration.</strong> Les stations, avis et signalements de la maquette sont
                réels : explorez la carte, ouvrez une fiche, laissez un avis — tout fonctionne.
              </p>
            </div>
          </div>
        </aside>

        {/* ---- Colonne centrale : le téléphone ---- */}
        <div className="flex flex-col items-center">
          <div className="mb-4 text-center lg:hidden">
            <h2 className="flex items-center justify-center gap-2 text-xl font-extrabold tracking-tight text-foreground">
              <Fuel className="h-5 w-5 text-emerald-600" />
              CarbuScope Mobile
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">Le Waze du carburant — aperçu interactif</p>
          </div>
          <PhoneFrame>
            <MobileApp />
          </PhoneFrame>
        </div>

        {/* ---- Colonne droite : fonctionnalités phares ---- */}
        <aside className="hidden lg:block" aria-label="Fonctionnalités phares">
          <Card className="overflow-hidden lg:max-h-[min(844px,calc(100vh-220px))] lg:overflow-y-auto">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Fonctionnalités phares</CardTitle>
              <CardDescription>Monétisation (B.4) et points clés du produit B2C</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Modèle de monétisation</p>
                {MONETISATION.map(m => {
                  const Icon = m.icon
                  return (
                    <div key={m.title} className="flex items-center gap-3 rounded-lg border bg-card p-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-[13px] font-semibold text-foreground">{m.title}</p>
                        <p className="text-[11.5px] leading-snug text-muted-foreground">{m.text}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="rounded-xl border p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <Globe className="h-3.5 w-3.5 text-emerald-600" />
                  5 langues
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {LANGUES.map(l => (
                    <span key={l.label} className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                      {l.label}
                      {l.rtl && <span className="rounded-full bg-purple-100 px-1.5 py-px text-[9px] font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-400">RTL</span>}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[10.5px] leading-snug text-muted-foreground">
                  Détection automatique de la langue du téléphone au premier lancement.
                </p>
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Parcours B2C (B.2.1 → B.2.9)</p>
                <ul className="mt-2 space-y-1.5">
                  {PARCOURS.map(([id, label]) => (
                    <li key={id} className="flex items-center gap-2 text-[12px]">
                      <Badge variant="secondary" className="shrink-0 font-mono text-[10px] text-emerald-700 dark:text-emerald-400">{id}</Badge>
                      <span className="text-muted-foreground">{label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  )
}
