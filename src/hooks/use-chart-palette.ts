'use client'

import * as React from 'react'
import { useSyncExternalStore } from 'react'

/**
 * useChartPalette — lit les tokens --chart-* (hex littéraux) via
 * getComputedStyle pour Recharts/graphiques : les charts suivent le thème.
 * Réactif : un MutationObserver sur les classes de <html> relit la palette
 * dès que l'utilisateur change de thème (corporate / clair / café / espresso).
 *
 * Retourne aussi les couleurs d'axes/grille/tooltip/curseur, prêtes à injecter
 * dans les props CartesianGrid / XAxis / Tooltip / Cursor.
 */

const CHART_TOKENS = [
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--chart-6',
  '--chart-7',
  '--chart-8',
] as const

const META_TOKENS = [
  '--chart-axis',
  '--chart-grid',
  '--chart-axisline',
  '--chart-tooltip-bg',
  '--chart-tooltip-border',
  '--chart-cursor',
] as const

const emptySubscribe = () => () => {}
function useMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false)
}

function readPalette() {
  if (typeof window === 'undefined') return null
  const styles = getComputedStyle(document.documentElement)
  const palette = CHART_TOKENS.map(t => styles.getPropertyValue(t).trim()).filter(Boolean)
  const meta: Record<(typeof META_TOKENS)[number], string> = {} as never
  for (const t of META_TOKENS) {
    const v = styles.getPropertyValue(t).trim()
    if (v) meta[t] = v
  }
  return palette.length >= 6 ? { palette, meta } : null
}

export function useChartPalette() {
  const mounted = useMounted()
  const [themeStamp, setThemeStamp] = React.useState(0)
  const [colors, setColors] = React.useState<string[]>([
    '#8a4b1f',
    '#c98a2d',
    '#5f7a52',
    '#b0563b',
    '#7d6b58',
    '#a96e1e',
  ])
  const [meta, setMeta] = React.useState<Record<(typeof META_TOKENS)[number], string>>({
    '--chart-axis': '#8a7660',
    '--chart-grid': '#eee3d0',
    '--chart-axisline': '#e2d2b4',
    '--chart-tooltip-bg': '#fffdf9',
    '--chart-tooltip-border': '#e2d2b4',
    '--chart-cursor': 'rgba(138, 75, 31, 0.07)',
  })

  React.useEffect(() => {
    if (!mounted) return
    const apply = () => {
      const read = readPalette()
      if (read) {
        setColors(read.palette)
        setMeta(read.meta)
      }
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [mounted, themeStamp])

  return {
    colors,
    /** couleur i (1-based) avec repli circulaire */
    color: React.useCallback(
      (i: number) => colors[(i - 1) % Math.max(colors.length, 1)] ?? '#8a4b1f',
      [colors],
    ),
    axis: meta['--chart-axis'] ?? '#8a7660',
    grid: meta['--chart-grid'] ?? '#eee3d0',
    axisLine: meta['--chart-axisline'] ?? '#e2d2b4',
    tooltipBg: meta['--chart-tooltip-bg'] ?? '#fffdf9',
    tooltipBorder: meta['--chart-tooltip-border'] ?? '#e2d2b4',
    cursor: meta['--chart-cursor'] ?? 'rgba(138, 75, 31, 0.07)',
    /** force une relecture (après un changement de thème programmatique) */
    refresh: React.useCallback(() => setThemeStamp(s => s + 1), []),
  }
}
