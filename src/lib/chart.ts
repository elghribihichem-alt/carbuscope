// CarbuScope — Helpers graphiques (palette sans bleu, styles recharts)

// Palette de repli alignée sur les tokens --chart-1..8 du thème « Café »
// (T41 phase 6) : premier rendu SSR cohérent, puis useChartPalette relit les
// vraies valeurs du thème actif (corporate / clair / café / espresso).
export const CHART_PALETTE = [
  "#8a4b1f", // brun torréfié (--chart-1)
  "#c98a2d", // ambre café (--chart-2)
  "#5f7a52", // vert forêt (--chart-3)
  "#b0563b", // terracotta (--chart-4)
  "#7d6b58", // taupe neutre (--chart-5)
  "#a96e1e", // or profond (--chart-6)
  "#9c8a72", // sable (--chart-7)
  "#c4854a", // caramel (--chart-8)
  "#8a7660", // taupe d'axe (complément, --chart-axis café)
]

export const AXIS_STYLE = {
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
  stroke: "var(--border)",
}

export const GRID_STROKE = "var(--border)"

export function tooltipStyle(): React.CSSProperties {
  return {
    backgroundColor: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--popover-foreground)",
    boxShadow: "0 4px 24px rgb(0 0 0 / 0.08)",
  }
}

export const num = (v: number): string => new Intl.NumberFormat("fr-FR").format(Math.round(v))
export const pct = (v: number): string => `${v.toFixed(1).replace(".", ",").replace(",0", "")} %`
