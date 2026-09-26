'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

/**
 * DataTable — tableau standardisé du design system café :
 * en-tête sur tint (xs uppercase, encre estompée), lignes séparées par le
 * filet le plus discret, listes longues en max-h-96 + scroll-coffee,
 * pagination compacte, squelettes de chargement.
 *
 * Générique sur les colonnes — le parent reste maître des cellules
 * (render de nœuds React), la DataTable fournit la structure visuelle.
 */
export interface DataTableColumn<Row> {
  key: string
  header: React.ReactNode
  align?: 'left' | 'right' | 'center'
  width?: string
  sticky?: boolean
  render: (row: Row, index: number) => React.ReactNode
}

export function DataTable<Row,>({
  columns,
  rows,
  rowKey,
  loading = false,
  empty,
  maxHeight = 'max-h-96',
  paginated = true,
  pageSize = 12,
  className,
  onRowClick,
}: {
  columns: DataTableColumn<Row>[]
  rows: Row[]
  rowKey: (row: Row, index: number) => string
  loading?: boolean
  empty?: React.ReactNode
  /** Conteneur scrollable — max-h-96 par défaut (listes longues) */
  maxHeight?: string
  paginated?: boolean
  pageSize?: number
  className?: string
  onRowClick?: (row: Row, index: number) => void
}) {
  const { t } = useI18n()
  const [page, setPage] = React.useState(0)
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const visible = React.useMemo(
    () => (paginated ? rows.slice(safePage * pageSize, (safePage + 1) * pageSize) : rows),
    [rows, paginated, safePage, pageSize],
  )

  const alignCls = (a?: string) =>
    a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left'

  return (
    <div className={cn('overflow-hidden rounded-lg border border-[var(--c-line)] bg-[var(--c-card)]', className)}>
      <div className={cn('overflow-auto scroll-coffee', maxHeight)}>
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    'border-b border-[var(--c-line-2)] bg-[var(--c-tint)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]',
                    alignCls(col.align),
                    col.sticky && 'sticky left-0 z-20 bg-[var(--c-tint)]',
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b border-[var(--c-line-faint)] last:border-b-0">
                  {columns.map(col => (
                    <td key={col.key} className="px-3 py-2.5">
                      <Skeleton className="h-4 w-full max-w-[140px]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center">
                  {empty ?? <p className="text-sm text-[var(--c-ink-muted)]">Aucune donnée.</p>}
                </td>
              </tr>
            ) : (
              visible.map((row, i) => (
                <tr
                  key={rowKey(row, i)}
                  onClick={onRowClick ? () => onRowClick(row, i) : undefined}
                  className={cn(
                    'border-b border-[var(--c-line-faint)] transition-colors last:border-b-0',
                    onRowClick && 'cursor-pointer hover:bg-[var(--c-tint)]',
                  )}
                >
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={cn('px-3 py-2.5 align-middle', alignCls(col.align))}
                    >
                      {col.render(row, safePage * pageSize + i)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {paginated && !loading && rows.length > pageSize ? (
        <div className="flex items-center justify-between border-t border-[var(--c-line-faint)] bg-[var(--c-card)] px-3 py-1.5">
          <p className="text-[11px] text-[var(--c-ink-muted)]">
            {visible.length > 0 ? `${safePage * pageSize + 1}–${safePage * pageSize + visible.length}` : 0} sur{' '}
            {rows.length}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={safePage === 0}
              aria-label={t('action.prevPage')}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-1 text-[11px] font-medium text-[var(--c-ink-muted)]">
              {safePage + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              aria-label={t('action.nextPage')}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
