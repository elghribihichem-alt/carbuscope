'use client'

// T55-C-b — Hubs > Paramètres TMP › « templates » (comptes rendus diagnostic).
// 2 gabarits V1 affichés en cartes « aperçu » : Standard (en-tête hub,
// véhicule, code défaut, recommandations, conclusion, signature) et Expert
// (+ historique véhicule, priorités chiffrées, plan de maintenance 12 mois).
// Chaque section est cliquable → Sheet d'aperçu du template RENDU avec des
// données d'exemple clairement marquées « exemple ». Les rapports réels sont
// générés dans Services › Diagnostics (registre).

import { useState } from "react"
import { Bot, ChevronRight, FileText, ListChecks, ClipboardList, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { KpiCard } from "@/components/shell/kpi-card"
import { SectionHeader } from "@/components/radar/radar-shared"
import { num } from "@/lib/chart"

// ---------- Gabarits V1 ----------

interface TemplateSection {
  id: string
  titre: string
  resume: string
  /** lignes rendues dans l'aperçu (données d'exemple) */
  contenu: string[]
}

interface TemplateDef {
  id: "STANDARD" | "EXPERT"
  nom: string
  description: string
  badge: string
  sections: TemplateSection[]
}

const SECTIONS_COMMUNES: TemplateSection[] = [
  {
    id: "entete",
    titre: "En-tête hub",
    resume: "enseigne, code TMP, technicien, date & heure",
    contenu: [
      "Enseigne : Agil — Micro-hub (exemple)",
      "Code TMP : TMP-AG-01 · Gouvernorat : Ariana",
      "Technicien : S. Ben Romdhane · Reçu le 12/03/2026 à 09:40",
    ],
  },
  {
    id: "vehicule",
    titre: "Véhicule",
    resume: "immatriculation, marque/modèle, kilométrage",
    contenu: [
      "Immatriculation : 123 TU 4567 (exemple)",
      "Véhicule : Renault Clio IV 1.5 dCi",
      "Kilométrage : 87 500 km",
    ],
  },
  {
    id: "defaut",
    titre: "Code défaut trouvé",
    resume: "codes OBD lus + interprétation",
    contenu: [
      "P0401 — débit EGR insuffisant (exemple)",
      "P0131 — sonde O₂ amont : signal bas",
      "Lecture complète : 2 codes actifs, 1 code pending",
    ],
  },
  {
    id: "recommandations",
    titre: "Recommandations",
    resume: "interventions conseillées par ordre d'urgence",
    contenu: [
      "1. Nettoyage / remplacement vanne EGR (à planifier)",
      "2. Contrôle sonde lambda amont — sur devis",
      "3. Vidange 5W-30 : déjà conforme (prochaine à ~102 000 km)",
    ],
  },
  {
    id: "conclusion",
    titre: "Conclusion",
    resume: "synthèse et décision du client",
    contenu: [
      "Véhicule routier — défaut EGR non bloquant (exemple).",
      "Orientation proposée vers station classique : réparation lourde si remplacement EGR confirmé.",
    ],
  },
  {
    id: "signature",
    titre: "Signature",
    resume: "technicien, cachet hub, contact",
    contenu: [
      "Établi par : S. Ben Romdhane — technicien habilité",
      "Cachet : TMP-AG-01 · Contact : contact@agil.tn",
      "Document : CR-DIAG-2026-0123 (numéro d'exemple)",
    ],
  },
]

const TEMPLATES: TemplateDef[] = [
  {
    id: "STANDARD",
    nom: "Compte rendu Standard",
    description: "Le gabarit par défaut de chaque passage au diagnostic : lisible par tout client, sections minimales réglementaires.",
    badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    sections: SECTIONS_COMMUNES,
  },
  {
    id: "EXPERT",
    nom: "Compte rendu Expert",
    description: "Gabarit premium (fidélisation) : ajoute l'historique du véhicule, des priorités chiffrées et un plan de maintenance 12 mois.",
    badge: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400",
    sections: [
      SECTIONS_COMMUNES[0], // en-tête
      SECTIONS_COMMUNES[1], // véhicule
      {
        id: "historique",
        titre: "Historique véhicule",
        resume: "interventions antérieures du client (registre TMP)",
        contenu: [
          "12/09/2025 — Vidange 5W-30 + filtre (exemple)",
          "04/07/2025 — Montage 2× 185/65 R15 Confort",
          "21/02/2025 — Diagnostic : aucun code actif",
        ],
      },
      SECTIONS_COMMUNES[2], // code défaut
      {
        id: "priorites",
        titre: "Priorités chiffrées",
        resume: "gravité × coût estimé × urgence",
        contenu: [
          "Priorité 1 (haute) — vanne EGR : ≈ 480 DT, sous 15 jours (exemple)",
          "Priorité 2 (moyenne) — sonde O₂ : ≈ 260 DT, sous 2 mois",
          "Priorité 3 (basse) — contrôle courroie : ≈ 90 DT, à la prochaine vidange",
        ],
      },
      SECTIONS_COMMUNES[3], // recommandations
      {
        id: "plan12",
        titre: "Plan de maintenance 12 mois",
        resume: "échéancier prévisionnel km / temps",
        contenu: [
          "~102 000 km (≈ 5 mois) : vidange + filtre à air (exemple)",
          "M+8 : contrôle pneus + équilibrage",
          "M+12 : diagnostic annuel + liquide de refroidissement",
        ],
      },
      SECTIONS_COMMUNES[4], // conclusion
      SECTIONS_COMMUNES[5], // signature
    ],
  },
]

export function HubsParametresTemplates() {
  const [apercu, setApercu] = useState<TemplateDef | null>(null)

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Comptes rendus de diagnostic"
        description="Structure des 2 gabarits V1 livrés aux clients après un passage au diagnostic électronique. Cliquez une section pour ouvrir l'aperçu du rapport rendu — avec des données d'exemple clairement identifiées."
        icon={FileText}
        badge="2 gabarits V1"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Gabarits disponibles" value={num(TEMPLATES.length)} sub="Standard & Expert" icon={FileText} />
        <KpiCard
          label="Sections (Standard)"
          value={num(TEMPLATES[0].sections.length)}
          sub="de l'en-tête à la signature"
          icon={ListChecks}
        />
        <KpiCard
          label="Sections (Expert)"
          value={num(TEMPLATES[1].sections.length)}
          sub="+ historique · priorités · plan 12 mois"
          icon={ClipboardList}
        />
        <KpiCard
          label="Génération"
          value="Registre"
          sub="rapports réels dans Services › Diagnostics"
          icon={Bot}
        />
      </div>

      {/* Cartes « aperçu » des gabarits */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {TEMPLATES.map(t => (
          <Card key={t.id} className="gap-0">
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${t.id === "EXPERT" ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"}`}>
                  {t.id === "EXPERT" ? <Sparkles className="h-4.5 w-4.5" aria-hidden /> : <FileText className="h-4.5 w-4.5" aria-hidden />}
                </span>
                {t.nom}
                <Badge variant="outline" className={t.badge}>{t.id === "EXPERT" ? "premium fidélisation" : "par défaut"}</Badge>
              </CardTitle>
              <CardDescription>{t.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {t.sections.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setApercu(t)}
                  className="flex min-h-11 w-full items-center gap-2.5 rounded-lg border bg-muted/20 px-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
                  aria-label={`Aperçu de la section ${s.titre} du gabarit ${t.nom}`}
                >
                  <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.titre}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{s.resume}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              ))}
              <div className="pt-2">
                <Button variant="outline" className="min-h-11 w-full gap-2" onClick={() => setApercu(t)}>
                  <FileText className="h-4 w-4" aria-hidden />
                  Aperçu du rendu complet
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Les rapports réels sont générés dans Services › Diagnostics (registre) au moment de l&apos;intervention —
        gabarits V1 statiques, édition du texte libre par technicien non incluse (V2).
      </p>

      {/* Sheet d'aperçu du template rendu (données d'exemple) */}
      <Sheet open={apercu !== null} onOpenChange={o => { if (!o) setApercu(null) }}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
          <SheetHeader className="border-b pb-3">
            <SheetTitle className="flex flex-wrap items-center gap-2 pr-6 text-base">
              {apercu?.nom}
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                Exemple
              </Badge>
            </SheetTitle>
            <SheetDescription>
              Aperçu du rendu avec des données d&apos;exemple — structure V1, aucun rapport réel.
            </SheetDescription>
          </SheetHeader>
          {apercu && (
            <div className="space-y-3 p-4">
              {/* En-tête factice du document */}
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Compte rendu de diagnostic électronique
                </p>
                <p className="mt-1 text-sm font-bold">{apercu.nom}</p>
                <p className="text-[11px] text-muted-foreground">
                  Document CR-DIAG-2026-0123 (numéro d&apos;exemple) · généré le 12/03/2026
                </p>
              </div>
              {apercu.sections.map((s, i) => (
                <section key={s.id} className="rounded-lg border p-3" aria-labelledby={`tpl-${apercu.id}-${s.id}`}>
                  <h3 id={`tpl-${apercu.id}-${s.id}`} className="flex items-baseline gap-2 text-sm font-semibold">
                    <span className="tabular-nums text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                    {s.titre}
                  </h3>
                  <ul className="mt-1.5 space-y-1">
                    {s.contenu.map(l => (
                      <li key={l} className="flex gap-1.5 text-xs leading-relaxed text-foreground/90">
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                        <span className="min-w-0">{l}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
                Toutes les valeurs de cet aperçu (hub, véhicule, codes, tarifs estimés) sont des données
                d&apos;exemple — le gabarit rendu dans le registre utilise les données réelles de l&apos;intervention.
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
