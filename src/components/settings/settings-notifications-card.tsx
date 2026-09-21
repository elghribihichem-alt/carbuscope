'use client'

// A.9 — Paramètres : notifications (fréquence, canaux, rayon de veille)

import { useState } from "react"
import { toast } from "sonner"
import { Bell, Mail, Webhook, Radio, Save, Smartphone } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const CANAUX = [
  { id: "email", label: "E-mail", icon: Mail, badge: "Quotidien 08:00" },
  { id: "push", label: "Push navigateur", icon: Bell, badge: "Temps réel" },
  { id: "sms", label: "SMS", icon: Smartphone, badge: "Critique uniquement" },
  { id: "webhook", label: "Webhook", icon: Webhook, badge: "POST JSON" },
] as const

const FREQ_LABELS: Record<string, string> = {
  realtime: "Temps réel",
  daily: "Quotidien",
  weekly: "Hebdomadaire",
}

export function SettingsNotificationsCard() {
  const [freq, setFreq] = useState("realtime")
  const [canaux, setCanaux] = useState<string[]>(["email", "push"])
  const [rayon, setRayon] = useState(10)

  const toggleCanal = (id: string, checked: boolean | "indeterminate") => {
    if (checked === true) setCanaux(prev => [...prev, id])
    else setCanaux(prev => prev.filter(x => x !== id))
  }

  const save = () => {
    toast.success("Notifications enregistrées", {
      description: `${FREQ_LABELS[freq]} · ${canaux.length} canal(aux) actif(s) · rayon de veille ${rayon} km.`,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4 text-amber-600" aria-hidden /> Notifications
        </CardTitle>
        <CardDescription>
          Fréquence des alertes concurrentielles, canaux de diffusion et rayon de veille par défaut.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Fréquence des alertes</Label>
          <Select value={freq} onValueChange={setFreq}>
            <SelectTrigger aria-label="Fréquence des alertes" className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="realtime">Temps réel (dès détection)</SelectItem>
              <SelectItem value="daily">Quotidien (digest 08:00)</SelectItem>
              <SelectItem value="weekly">Hebdomadaire (lundi 09:00)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Canaux de notification</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {CANAUX.map(c => {
              const Icon = c.icon
              const on = canaux.includes(c.id)
              return (
                <label
                  key={c.id}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 transition-colors hover:bg-muted/50 ${
                    on ? "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30" : ""
                  }`}
                >
                  <Checkbox checked={on} onCheckedChange={v => toggleCanal(c.id, v)} aria-label={c.label} />
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="flex-1 text-sm">{c.label}</span>
                  <Badge variant="secondary" className="text-[10px] font-normal">{c.badge}</Badge>
                </label>
              )
            })}
          </div>
        </div>

        <div className="space-y-2.5 rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Rayon de veille par défaut
            </Label>
            <span className="text-sm font-semibold tabular-nums">{rayon} km</span>
          </div>
          <Slider
            value={[rayon]}
            min={2}
            max={30}
            step={1}
            onValueChange={v => setRayon(v[0] ?? rayon)}
            aria-label="Rayon de veille en kilomètres"
          />
          <p className="text-[11px] text-muted-foreground">
            Détection des ouvertures/fermetures concurrentes autour de chaque station du réseau (2 à 30 km).
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} size="sm" variant="outline" className="gap-1.5">
            <Save className="h-3.5 w-3.5" aria-hidden /> Enregistrer
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
