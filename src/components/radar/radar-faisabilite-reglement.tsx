'use client'

// T55-B3-a — Études de faisabilité > « reglement » : checklist réglementaire
// interactive (contenu statique structuré V1 — PAS de données simulées) par
// type de projet. 4 groupes / 15 documents pour le projet complet : volet
// foncier (APIC, permis, urbanisme), volet carburant (agrément, protection
// civile, cuves, arrêté d'ouverture), volet atelier (registre, déchets, RC
// pro) et environnement. Filtre par format : le Hub masque les volets
// carburant, l'Express masque le volet atelier. Cases à cocher locales,
// barre de progression, réinitialisation, note honnête « indicative ».
// REGLEMENT_GROUPS est exporté et réutilisé par le PDF de faisabilité.

import { useMemo, useState } from "react"
import { RotateCcw, Scale, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { SectionHeader } from "./radar-shared"
import { FORMAT_KEYS, FORMAT_META, type FormatKey } from "./radar-formats-engine"

/* ---------- Contenu réglementaire (statique V1, partagé avec le PDF) ---------- */

export interface ReglementItem {
  id: string
  label: string
  detail: string
}

export interface ReglementGroup {
  id: string
  titre: string
  description: string
  /** Groupes pertinents par format : le Hub n'a pas les volets carburant,
   *  l'Express (kiosque) n'a pas de volet atelier. */
  formats: FormatKey[]
  items: ReglementItem[]
}

export const REGLEMENT_GROUPS: ReglementGroup[] = [
  {
    id: "foncier",
    titre: "Autorisations foncières",
    description: "Sécuriser la parcelle et le droit de construire — municipalité / commune et administration foncière.",
    formats: ["CLASSIQUE", "EXPRESS", "MOBILITY_HUB"],
    items: [
      { id: "apic", label: "APIC — avis préalable d'implantation commerciale", detail: "Dossier auprès de l'administration compétente avant tout investissement." },
      { id: "permis", label: "Permis de construire", detail: "Dépôt en mairie / commune, plans visés par un architecte." },
      { id: "urbanisme", label: "Certificat de conformité urbanistique", detail: "Vérification du plan d'occupation et des servitudes de la parcelle." },
      { id: "prop", label: "Acte de propriété ou bail notarié", detail: "Sécurisation juridique du foncier avant génie civil." },
    ],
  },
  {
    id: "carburant",
    titre: "Exploitation carburant",
    description: "Volet spécifique à la distribution de carburant — non applicable au Mobility Hub sans cuves.",
    formats: ["CLASSIQUE", "EXPRESS"],
    items: [
      { id: "agrement", label: "Agrément de distribution de carburant", detail: "Autorisation d'exploiter délivrée par le ministère du Commerce." },
      { id: "pc", label: "Protection civile — visite de conformité", detail: "Inspection PC des extincteurs, dispersion, plans d'évacuation." },
      { id: "cuves", label: "Cuves double paroi + rétention", detail: "Contrôle de l'installation de stockage et du bac de rétention." },
      { id: "arrete", label: "Arrêté d'ouverture", detail: "Publication de l'arrêté d'ouverture signé par le gouverneur." },
    ],
  },
  {
    id: "atelier",
    titre: "Exploitation atelier (TMP)",
    description: "Volet atelier technique — vidange, pneus, diagnostic (Hub complet, zone TMP du Classique).",
    formats: ["CLASSIQUE", "MOBILITY_HUB"],
    items: [
      { id: "rc", label: "Registre de commerce + CIN du gérant", detail: "Immatriculation de l'activité et identité de l'exploitant." },
      { id: "dechets", label: "Agrément gestion déchets vidange / pneus", detail: "Convention de collecte avec un opérateur agréé (huiles usagées, pneumatiques)." },
      { id: "assurance", label: "Assurance RC professionnelle atelier", detail: "Responsabilité civile couvrant les prestations techniques." },
    ],
  },
  {
    id: "environnement",
    titre: "Environnement",
    description: "Volet environnemental applicable à tous les formats.",
    formats: ["CLASSIQUE", "EXPRESS", "MOBILITY_HUB"],
    items: [
      { id: "impact", label: "Étude d'impact environnemental", detail: "Selon la classe du projet (CNEH le cas échéant)." },
      { id: "eaux-usees", label: "Gestion des eaux usées", detail: "Raccordement ONAS ou fosse conforme + convention d'évacuation." },
      { id: "eaux-pluies", label: "Séparation eaux de lavage / eaux pluviales", detail: "Décanteur-séparateur d'hydrocarbures sur le réseau de lavage." },
      { id: "convention-dechets", label: "Convention de collecte des déchets", detail: "Traçabilité des déchets produits par le point de service." },
    ],
  },
]

/* ---------- Composant : checklist interactive ---------- */

export function FaisabiliteReglement() {
  const [format, setFormat] = useState<FormatKey>("CLASSIQUE")
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  const groups = useMemo(
    () => REGLEMENT_GROUPS.filter(g => g.formats.includes(format)),
    [format],
  )
  const items = useMemo(() => groups.flatMap(g => g.items), [groups])
  const checkedCount = items.filter(it => checked[it.id]).length
  const pct = items.length > 0 ? Math.round((checkedCount / items.length) * 100) : 0

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Checklist réglementaire"
        description="Les autorisations et documents à réunir pour ouvrir un point de service, groupés par volet : foncier (APIC, permis), exploitation carburant, exploitation atelier et environnement. Cochez au fil de l'instruction — l'état est conservé pendant la session."
        icon={Scale}
        badge="Contenu statique V1"
      />

      {/* Filtre par format + progression + réinitialisation */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Type de projet :</span>
            {FORMAT_KEYS.map(f => {
              const m = FORMAT_META[f]
              const active = format === f
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  aria-pressed={active}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
                    active ? m.chip : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <m.icon className="h-4 w-4" aria-hidden />
                  {m.short}
                </button>
              )
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto min-h-11 gap-1.5"
              onClick={() => setChecked({})}
              disabled={checkedCount === 0}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Réinitialiser
            </Button>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium">
                {checkedCount} / {items.length} document{items.length > 1 ? "s" : ""} réunis
              </span>
              <span className="tabular-nums text-muted-foreground">{pct} %</span>
            </div>
            <Progress value={pct} aria-label={`Progression de la checklist : ${checkedCount} sur ${items.length} documents`} />
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {format === "MOBILITY_HUB"
                ? "Mobility Hub : pas de volet carburant (pas de cuves ni de distribution) — foncier, atelier et environnement restent exigés."
                : format === "EXPRESS"
                  ? "Micro-station Express : volet carburant complet, pas de volet atelier (kiosque sans prestation technique)."
                  : "Station Classique : tous les volets — foncier, carburant, atelier (zone TMP) et environnement."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Groupes de documents */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map(g => {
          const gChecked = g.items.filter(it => checked[it.id]).length
          return (
            <Card key={g.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  {g.titre}
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px] tabular-nums">
                    {gChecked}/{g.items.length}
                  </Badge>
                </CardTitle>
                <CardDescription>{g.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {g.items.map(it => (
                  <label
                    key={it.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-2 transition-colors hover:bg-muted/40 has-[button[data-state=checked]]:border-emerald-400 has-[button[data-state=checked]]:bg-emerald-50/50 dark:has-[button[data-state=checked]]:bg-emerald-950/30"
                  >
                    <Checkbox
                      checked={!!checked[it.id]}
                      onCheckedChange={v => setChecked(s => ({ ...s, [it.id]: v === true }))}
                      aria-label={it.label}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-snug">{it.label}</span>
                      <span className="block text-[11px] leading-snug text-muted-foreground">{it.detail}</span>
                    </span>
                  </label>
                ))}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Note honnête */}
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-2 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Checklist indicative V1 (contenu statique) — se rapprocher des agences locales (municipalité, protection
            civile, ministère du Commerce, ONAS) pour les exigences en vigueur et les délais réels. Les cases cochées
            ne sont pas persistées : elles servent de brouillon d&apos;instruction pendant la session.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
