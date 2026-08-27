import { NavLink } from 'react-router-dom'
import { useAnalysis } from '../AnalysisProvider'
import { useT } from '../i18n'
import type { StringKey } from '../i18n/strings'

/**
 * Mobile navigation, added with slice 2.
 *
 * The sidebar is hidden below `md` and nothing replaced it — survivable while
 * the app was a desktop dashboard, not survivable now that the phone is the
 * camera and the primary device.
 */
const ITEMS: { to: string; label: StringKey; icon: () => JSX.Element }[] = [
  { to: '/log', label: 'nav.log', icon: CameraIcon },
  { to: '/today', label: 'nav.today', icon: SunIcon },
  { to: '/nutrition', label: 'nav.food', icon: PlateIcon },
  { to: '/settings', label: 'nav.settings', icon: GearIcon },
]

export function BottomNav() {
  const { analysis } = useAnalysis()
  const t = useT()
  /**
   * A dot on the Log tab: terracotta while a photo is being read, sage once a
   * result is waiting. Small enough to ignore, present enough to answer "did
   * that actually do anything?" without opening the tab.
   */
  const dot =
    analysis?.status === 'running'
      ? 'bg-accent'
      : analysis?.status === 'done'
        ? 'bg-leaf'
        : undefined

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.65rem] ${
              isActive ? 'text-accent' : 'text-ink-muted'
            }`
          }
        >
          <span className="relative">
            <Icon />
            {to === '/log' && dot && (
              <span
                className={`absolute -end-1.5 -top-0.5 size-2 rounded-full ${dot} ${
                  dot === 'bg-accent' ? 'animate-pulse' : ''
                }`}
              />
            )}
          </span>
          {t(label)}
        </NavLink>
      ))}
    </nav>
  )
}

const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  'aria-hidden': true,
} as const

function CameraIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8a1 1 0 0 0 .8-.4l1-1.3a1 1 0 0 1 .8-.4h4.2a1 1 0 0 1 .8.4l1 1.3a1 1 0 0 0 .8.4h1.8A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </svg>
  )
}

function PlateIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  )
}
