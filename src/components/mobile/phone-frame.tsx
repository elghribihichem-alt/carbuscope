'use client'

// CarbuScope Mobile — maquette de téléphone réaliste
// Cadre métal/noir, encoche « dynamic island », barre de statut (heure réelle),
// indicateur home. Ratio ~9/19,5 — 390 × min(844px, 100vh−220px).

import { useEffect, useState } from "react"
import { BatteryFull, Signal, Wifi } from "lucide-react"

function StatusBar() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(id)
  }, [])
  const hhmm = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  return (
    <div className="relative z-30 flex h-[44px] shrink-0 items-end justify-between px-7 pb-[8px] text-slate-900">
      <span className="text-[13.5px] font-semibold tabular-nums tracking-tight">{hhmm}</span>
      <span className="flex items-center gap-[5px]">
        <span className="text-[10px] font-semibold leading-none">4G+</span>
        <Signal className="h-[15px] w-[15px]" strokeWidth={2.4} />
        <Wifi className="h-[15px] w-[15px]" strokeWidth={2.4} />
        <BatteryFull className="h-[17px] w-[17px]" strokeWidth={2.2} />
      </span>
    </div>
  )
}

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-[min(390px,calc(100vw-3rem))]">
      {/* Boutons latéraux (silence, volume, power) */}
      <div aria-hidden className="absolute -left-[4px] top-[118px] h-[24px] w-[4px] rounded-l-full bg-neutral-600" />
      <div aria-hidden className="absolute -left-[4px] top-[150px] h-[44px] w-[4px] rounded-l-full bg-neutral-700" />
      <div aria-hidden className="absolute -right-[4px] top-[146px] h-[64px] w-[4px] rounded-r-full bg-neutral-700" />

      {/* Châssis */}
      <div className="relative h-[min(844px,calc(100vh-220px))] min-h-[600px] rounded-[3.2rem] bg-gradient-to-b from-neutral-500 via-neutral-800 to-neutral-900 p-[3px] shadow-[0_35px_90px_-25px_rgba(6,78,59,0.55),0_12px_35px_-12px_rgba(0,0,0,0.5)] ring-1 ring-black/30">
        <div className="h-full w-full rounded-[2.95rem] bg-black p-[8px]">
          {/* Écran */}
          <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[2.4rem] bg-[#f6f7f5]">
            {/* Dynamic island */}
            <div aria-hidden className="absolute left-1/2 top-[9px] z-40 h-[26px] w-[100px] -translate-x-1/2 rounded-full bg-black">
              <span className="absolute right-[11px] top-1/2 h-[9px] w-[9px] -translate-y-1/2 rounded-full bg-neutral-800 ring-1 ring-neutral-700/60">
                <span className="absolute inset-[2.5px] rounded-full bg-emerald-900/60" />
              </span>
            </div>

            <StatusBar />

            <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>

            {/* Indicateur home */}
            <div aria-hidden className="pointer-events-none absolute bottom-[6px] left-1/2 z-40 h-[4px] w-[112px] -translate-x-1/2 rounded-full bg-slate-900/60" />
          </div>
        </div>
      </div>
    </div>
  )
}
