import type { ReactNode } from 'react'

export function Card({
  label,
  children,
  tone = 'default',
}: {
  label?: string
  children: ReactNode
  tone?: 'default' | 'leaf'
}) {
  const bg = tone === 'leaf' ? 'bg-leaf-soft' : 'bg-card'
  return (
    <section className={`${bg} rounded-card p-5`}>
      {label && (
        <p className="pb-3 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          {label}
        </p>
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
      <span className={`tabular text-sm font-medium ${tone === 'good' ? 'text-leaf' : ''}`}>
        {value}
      </span>
    </div>
  )
}
