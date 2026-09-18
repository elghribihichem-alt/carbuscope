import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET() {
  const since = new Date()
  since.setMonth(since.getMonth() - 12)
  const movements = await db.movement.findMany({ where: { date: { gte: since } } })

  const months: string[] = []
  const counters = new Map<string, { OPENING: number; RENOVATION: number; CLOSURE: number; REBRAND: number }>()
  for (let i = 11; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const label = new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(d)
    months.push(label)
    counters.set(key, { OPENING: 0, RENOVATION: 0, CLOSURE: 0, REBRAND: 0 })
  }
  const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`

  const brandCounters = new Map<string, { brand: string; openings: number; renovations: number; closures: number }>()
  for (const m of movements) {
    const d = new Date(m.date)
    const c = counters.get(keyOf(d))
    if (c && m.type in c) (c as Record<string, number>)[m.type]++
    const bc = brandCounters.get(m.brand) ?? { brand: m.brand, openings: 0, renovations: 0, closures: 0 }
    if (m.type === "OPENING") bc.openings++
    else if (m.type === "RENOVATION") bc.renovations++
    else if (m.type === "CLOSURE") bc.closures++
    brandCounters.set(m.brand, bc)
  }

  const arr = [...counters.values()]
  return NextResponse.json({
    months,
    openings: arr.map(c => c.OPENING),
    renovations: arr.map(c => c.RENOVATION),
    closures: arr.map(c => c.CLOSURE),
    rebrands: arr.map(c => c.REBRAND),
    byBrand: [...brandCounters.values()]
      .sort((a, b) => b.openings + b.renovations - (a.openings + a.renovations))
      .slice(0, 6),
  })
}
