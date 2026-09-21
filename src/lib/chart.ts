// CarbuScope — Helpers graphiques (palette sans bleu, styles recharts)

export const CHART_PALETTE = [
  "#059669", // émeraude
  "#d97706", // ambre
  "#dc2626", // rouge
  "#9333ea", // prune
  "#d9a514", // or
  "#e07856", // terracotta
  "#64748b", // ardoise
  "#4d7c0f", // olive
  "#be185d", // framboise
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
