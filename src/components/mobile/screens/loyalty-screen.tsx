'use client'

// CarbuScope Mobile — Écran Fidélité (B.2.8 + B.4)
// Cartes de fidélité par enseigne (points, niveau, prochain palier),
// programme cross-enseignes, offres personnalisées.

import { Coffee, Droplets, Gift, Star, Zap } from "lucide-react"
import { toast } from "sonner"
import { ScreenHeader, SectionTitle } from "../shared"

const LOYALTY_CARDS = [
  {
    brand: "Agil",
    color: "#dc2626",
    dark: "#7f1d1d",
    points: 860,
    next: 1000,
    level: "Argent",
    nextLevel: "Or",
    cardId: "AG •• 4821",
  },
  {
    brand: "TotalEnergies",
    color: "#ea580c",
    dark: "#7c2d12",
    points: 420,
    next: 600,
    level: "Bronze",
    nextLevel: "Argent",
    cardId: "TE •• 1043",
  },
  {
    brand: "Ola Energy",
    color: "#9333ea",
    dark: "#581c87",
    points: 1310,
    next: 1500,
    level: "Or",
    nextLevel: "Platine",
    cardId: "OE •• 7742",
  },
]

const GLOBAL_POINTS = 2590
const GLOBAL_TARGET = 3000

const PERSONAL_OFFERS = [
  { icon: Coffee, title: "Café offert dès 40 L", sub: "Dans les stations Agil fidélité · jusqu'au 31/08", tint: "bg-amber-50 text-amber-600" },
  { icon: Droplets, title: "−20 % sur le lavage le mardi", sub: "Stations TotalEnergies participantes", tint: "bg-emerald-50 text-emerald-600" },
  { icon: Zap, title: "Points doublés sur les bornes", sub: "Recharge Ola Energy · tout l'été", tint: "bg-purple-50 text-purple-600" },
]

export function LoyaltyScreen() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f7f5]">
      <ScreenHeader
        title="Fidélité"
        subtitle="Programme cross-enseignes"
        right={
          <span className="mr-2 inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-1 text-[10px] font-bold text-purple-700">
            <Gift className="h-3 w-3" />
            3 cartes
          </span>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-3 pb-6">
        {/* Programme cross-enseignes (B.2.8 / B.4) */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 p-4 text-white shadow-lg">
          <div aria-hidden className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-white/10" />
          <div className="relative">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-200">Programme cross-enseignes</p>
            <div className="mt-1 flex items-end justify-between">
              <p className="text-[32px] font-extrabold leading-none tabular-nums">
                {GLOBAL_POINTS.toLocaleString("fr-FR")}
                <span className="ml-1 text-sm font-semibold text-emerald-200">pts</span>
              </p>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
                <Star className="h-5 w-5 fill-amber-300 text-amber-300" />
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-emerald-100">
              1 DT dépensé dans n'importe quelle station partenaire = 1 point, quelle que soit l'enseigne.
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-amber-300" style={{ width: `${Math.min(100, Math.round((GLOBAL_POINTS / GLOBAL_TARGET) * 100))}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-emerald-100">
              <span>{GLOBAL_POINTS.toLocaleString("fr-FR")} pts</span>
              <span>Bon carburant 20 DT à {GLOBAL_TARGET.toLocaleString("fr-FR")} pts</span>
            </div>
          </div>
        </div>

        {/* Cartes de fidélité enseignes (B.2.8) */}
        <section className="mt-4">
          <SectionTitle icon={Gift}>Vos cartes de fidélité</SectionTitle>
          <div className="space-y-2.5">
            {LOYALTY_CARDS.map(c => {
              const pct = Math.min(100, Math.round((c.points / c.next) * 100))
              return (
                <button
                  key={c.brand}
                  type="button"
                  onClick={() => toast.info(`Carte ${c.brand} — solde ${c.points} pts (démo).`)}
                  className="relative block w-full overflow-hidden rounded-2xl p-4 text-left text-white shadow-md transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
                  style={{ background: `linear-gradient(135deg, ${c.color}, ${c.dark})` }}
                  aria-label={`Carte de fidélité ${c.brand}`}
                >
                  <span aria-hidden className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/15" />
                  <span aria-hidden className="absolute -bottom-14 -left-6 h-28 w-28 rounded-full bg-white/10" />
                  <span className="relative flex items-center justify-between">
                    <span className="text-[15px] font-extrabold tracking-tight drop-shadow-sm">{c.brand}</span>
                    <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide backdrop-blur-sm">
                      {c.level}
                    </span>
                  </span>
                  <span className="relative mt-4 flex items-end justify-between">
                    <span>
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/75">Points cumulés</span>
                      <span className="text-[26px] font-extrabold leading-none tabular-nums">{c.points.toLocaleString("fr-FR")}</span>
                    </span>
                    <span className="font-mono text-[11px] tracking-[0.2em] text-white/70">{c.cardId}</span>
                  </span>
                  <span className="relative mt-2.5 block">
                    <span className="block h-1.5 overflow-hidden rounded-full bg-white/25">
                      <span className="block h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="mt-1 block text-[10px] text-white/85">
                      {c.next - c.points} pts avant le niveau {c.nextLevel}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* Offres personnalisées (B.2.8) */}
        <section className="mt-4">
          <SectionTitle icon={Star}>Offres personnalisées</SectionTitle>
          <div className="space-y-2">
            {PERSONAL_OFFERS.map(o => {
              const Icon = o.icon
              return (
                <div key={o.title} className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${o.tint}`}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-slate-800">{o.title}</p>
                    <p className="truncate text-[10.5px] text-slate-400">{o.sub}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toast.success("Offre activée sur votre compte (démo).")}
                    className="shrink-0 self-center rounded-full bg-emerald-600 px-3 py-1.5 text-[10.5px] font-bold text-white shadow-sm transition-colors hover:bg-emerald-700"
                  >
                    Activer
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
