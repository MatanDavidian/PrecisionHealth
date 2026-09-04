import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { WriteFailureBanner } from './components/WriteFailureBanner'
import { AnalysisBar } from './components/AnalysisBar'
import { Interruptions } from './components/ConsentGate'
import { useLocation } from 'react-router-dom'
import { useT } from './i18n'
import type { StringKey } from './i18n/strings'
import { PRODUCT_NAME } from '@/brand'

const TRACK: { to: string; label: StringKey }[] = [
  { to: '/log', label: 'nav.log' },
  { to: '/today', label: 'nav.today' },
  { to: '/nutrition', label: 'nav.nutrition' },
  { to: '/training', label: 'nav.training' },
  { to: '/recovery', label: 'nav.recovery' },
  { to: '/body', label: 'nav.body' },
  { to: '/health', label: 'nav.health' },
]

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-2 pt-6 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-muted">
      {children}
    </p>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT()
  return (
    <div className="flex min-h-full">
      {/* border-e, not border-r: the sidebar sits on the other side in Hebrew. */}
      <aside className="hidden w-60 shrink-0 border-e border-hairline bg-surface px-4 py-6 md:block">
        <div className="flex items-center gap-3 px-3">
          <span className="size-7 rounded-full bg-accent" />
          <span className="font-display text-xl">{PRODUCT_NAME}</span>
        </div>

        <SectionLabel>{t('nav.overview')}</SectionLabel>
        <nav className="flex flex-col gap-1">
          {TRACK.slice(0, 2).map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>

        <SectionLabel>{t('nav.track')}</SectionLabel>
        <nav className="flex flex-col gap-1">
          {TRACK.slice(2).map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>

        <SectionLabel>{t('nav.app')}</SectionLabel>
        <nav className="flex flex-col gap-1">
          <NavItem to="/settings" label="nav.settings" />
        </nav>
      </aside>

      {/* pb-20 keeps the last card clear of the mobile bar. */}
      <main className="flex-1 overflow-y-auto px-6 py-8 pb-20 md:px-10 md:pb-8">{children}</main>
      <BottomNav />
      <AnalysisBar />
      <WriteFailureBanner />
      <Interruptions />
    </div>
  )
}

function NavItem({ to, label }: { to: string; label: StringKey }) {
  const t = useT()
  const location = useLocation()
  /**
   * Today's entry reads "Week" while the week is showing.
   *
   * The sidebar names the thing on screen, and calling it "Today" when the
   * page says "This week" makes the highlighted item look like it is lying
   * about where you are.
   */
  const showing: StringKey =
    to === '/today' &&
    location.pathname === '/today' &&
    new URLSearchParams(location.search).get('view') === 'week'
      ? 'week.week'
      : label
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
      {t(showing)}
    </NavLink>
  )
}
