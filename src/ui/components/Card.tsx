import type { ReactNode } from 'react'

export function Card({
  label,
  children,
  tone = 'default',
  action,
}: {
  label?: string
  children: ReactNode
  tone?: 'default' | 'leaf'
  /** A control on the eyebrow row, opposite the label. */
  action?: ReactNode
}) {
  const bg = tone === 'leaf' ? 'bg-leaf-soft' : 'bg-card'
  return (
    <section className={`${bg} rounded-card p-5`}>
      {(label || action) && (
        <div className="flex items-center justify-between gap-3 pb-3">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            {label}
          </p>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function StatRow({
  name,
  value,
  tone,
}: {
  name: string
  value: string
  tone?: 'good'
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-ink-muted">{name}</span>
      {/* "72.8 kg" must not be reordered to "kg 72.8" in an RTL page. */}
      <span
        className={`tabular ltr-nums text-sm font-medium ${tone === 'good' ? 'text-leaf' : ''}`}
      >
        {value}
      </span>
    </div>
  )
}
