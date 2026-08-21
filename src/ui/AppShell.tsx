import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { WriteFailureBanner } from './components/WriteFailureBanner'

const TRACK = [
  { to: '/log', label: 'Log' },
  { to: '/today', label: 'Today' },
  { to: '/nutrition', label: 'Nutrition' },
  { to: '/training', label: 'Training' },
  { to: '/recovery', label: 'Recovery' },
  { to: '/body', label: 'Body' },
  { to: '/health', label: 'Health' },
]

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-2 pt-6 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">
      {children}
    </p>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full">
      <aside className="hidden w-60 shrink-0 border-r border-hairline bg-surface px-4 py-6 md:block">
        <div className="flex items-center gap-3 px-3">
          <span className="size-7 rounded-full bg-accent" />
          <span className="font-display text-xl">Timeline</span>
        </div>

        <SectionLabel>Overview</SectionLabel>
        <nav className="flex flex-col gap-1">
          {TRACK.slice(0, 2).map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>

        <SectionLabel>Track</SectionLabel>
        <nav className="flex flex-col gap-1">
          {TRACK.slice(2).map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>

        <SectionLabel>App</SectionLabel>
        <nav className="flex flex-col gap-1">
          <NavItem to="/settings" label="Settings" />
        </nav>
      </aside>

      {/* pb-20 keeps the last card clear of the mobile bar. */}
      <main className="flex-1 overflow-y-auto px-6 py-8 pb-20 md:px-10 md:pb-8">{children}</main>
      <BottomNav />
      <WriteFailureBanner />
    </div>
  )
}

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          'rounded-xl px-3 py-2 text-sm transition-colors',
          isActive ? 'bg-card-soft font-medium text-ink' : 'text-ink-muted hover:bg-card-soft/60',
        ].join(' ')
      }
    >
      {label}
    </NavLink>
  )
}
