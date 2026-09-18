'use client'

// A.9 — Paramètres : profil de l'enseigne (state local, non persistant)

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Building2, Save, MapPin, Phone, Mail, UserRound } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { BrandDTO } from "@/lib/types"
import { useGovernoratNames, num } from "@/components/settings/settings-shared"

export function SettingsProfileCard({ brandSlug }: { brandSlug: string }) {
  const govNames = useGovernoratNames()
  const [brand, setBrand] = useState<BrandDTO | null>(null)
  const [nom, setNom] = useState("")
  const [stations, setStations] = useState("")
  const [selected, setSelected] = useState<string[]>(["Tunis", "Ariana", "Ben Arous", "Nabeul", "Sousse", "Sfax"])
  const [refNom, setRefNom] = useState("Direction Réseau")
  const [refEmail, setRefEmail] = useState("reseau@agil.tn")
  const [refTel, setRefTel] = useState("+216 71 000 000")

  // Pré-remplissage depuis /api/brands
  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/brands", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { brands: BrandDTO[] }) => {
        const b = j.brands.find(x => x.slug === brandSlug) ?? null
        setBrand(b)
        if (b) {
          setNom(b.name)
          setStations(String(b.stationCount))
        }
      })
      .catch(() => {})
    return () => ac.abort()
  }, [brandSlug])

  const toggleGov = (g: string) => {
    setSelected(prev => (prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]))
  }

  const save = () => {
    toast.success("Profil de l'enseigne enregistré", {
      description: `${nom || "Enseigne"} · ${selected.length} gouvernorat(s) d'implantation · ${stations || 0} stations déclarées.`,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-emerald-600" aria-hidden /> Profil de l&apos;enseigne
        </CardTitle>
        <CardDescription>
          Identité réseau déclarée à la plateforme — utilisée pour la facturation et les contacts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pf-nom">Nom de l&apos;enseigne</Label>
            <Input id="pf-nom" value={nom} onChange={e => setNom(e.target.value)} placeholder={brand ? brand.name : "Nom…"} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-stations">Nombre de stations déclarées</Label>
            <Input
              id="pf-stations"
              type="number"
              min={0}
              value={stations}
              onChange={e => setStations(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Référentiel plateforme : {brand ? `${num(brand.stationCount)} stations` : "chargement…"}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Gouvernorats d&apos;implantation</Label>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border bg-muted/20 p-3">
            {govNames.map(g => {
              const on = selected.includes(g)
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggleGov(g)}
                  aria-pressed={on}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    on
                      ? "border-emerald-300 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {g}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {selected.length} gouvernorat(s) sélectionné(s) — cliquez pour activer/désactiver.
          </p>
        </div>

        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <p className="text-xs font-medium text-muted-foreground">Contact référent</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="pf-ref-nom" className="text-xs">Nom</Label>
              <Input id="pf-ref-nom" value={refNom} onChange={e => setRefNom(e.target.value)} className="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-ref-email" className="text-xs">E-mail</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="pf-ref-email" type="email" value={refEmail} onChange={e => setRefEmail(e.target.value)} className="h-8 pl-8" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-ref-tel" className="text-xs">Téléphone</Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="pf-ref-tel" type="tel" value={refTel} onChange={e => setRefTel(e.target.value)} className="h-8 pl-8" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className="gap-1 font-normal">
            <MapPin className="h-3 w-3" aria-hidden /> {selected.length} gouvernorats
          </Badge>
          <Button onClick={save} size="sm" variant="outline" className="gap-1.5">
            <Save className="h-3.5 w-3.5" aria-hidden /> Enregistrer
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
