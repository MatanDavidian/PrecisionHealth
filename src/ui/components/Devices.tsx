import { useCallback, useEffect, useState } from 'react'
import {
  listDeviceTokens,
  mintDeviceToken,
  revokeDeviceToken,
  type DeviceToken,
  type MintedToken,
} from '@/data/deviceTokens'
import type { Session } from '@/data/session'
import { Card } from './Card'
import { useT } from '../i18n'

/**
 * Watches and other things that write to this account.
 *
 * S4.1. Until this screen existed, a Garmin token was minted by running a Node
 * script and pasting SQL into the Supabase console — which is a credential
 * exactly one person can have, and the reason the watch app cannot be
 * published.
 *
 * The whole design turns on one fact: **the token is shown once and is then
 * unrecoverable.** Everything else follows from saying so before it appears
 * rather than after.
 */
export function Devices({ session }: { session: Session }) {
  const t = useT()
  const [tokens, setTokens] = useState<DeviceToken[]>()
  const [label, setLabel] = useState('')
  const [minted, setMinted] = useState<MintedToken>()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string>()
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!session.authenticated) {
      setTokens([])
      return
    }
    setTokens((await listDeviceTokens(session.userId)) ?? [])
  }, [session])

  useEffect(() => {
    void load()
  }, [load])

  // A device belongs to an account, so there is nothing to show without one.
  // Said rather than hidden: an empty space explains nothing.
  if (!session.authenticated) {
    return (
      <Card label={t('devices.title')}>
        <p className="text-sm text-ink-muted">{t('devices.needAccount')}</p>
      </Card>
    )
  }

  const add = async () => {
    setBusy(true)
    setProblem(undefined)
    setCopied(false)
    const result = await mintDeviceToken(label.trim())
    setBusy(false)
    if (!result.ok) {
      setProblem(result.reason)
      return
    }
    setMinted(result.minted)
    setLabel('')
    void load()
  }

  const revoke = async (token: DeviceToken) => {
    setBusy(true)
    setProblem(undefined)
    try {
      await revokeDeviceToken(token.id)
      await load()
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : t('devices.revokeFailed'))
    } finally {
      setBusy(false)
    }
  }

  const live = (tokens ?? []).filter((token) => !token.revokedAt)

  return (
    <Card label={t('devices.title')}>
      <p className="text-sm text-ink-muted">{t('devices.body')}</p>

      {/*
        The token, shown exactly once.

        Above the list rather than in it, because it is not a device — it is a
        thing to copy right now. It stays until dismissed, and dismissing is
        explicit, so it cannot be scrolled past and lost.
      */}
      {minted && (
        <div className="mt-4 rounded-xl border border-accent bg-accent-soft/40 p-3">
          <p className="text-sm font-medium">{t('devices.copyNow', { label: minted.label })}</p>
          <p className="pt-1 text-xs leading-relaxed">{t('devices.onceOnly')}</p>
          <code className="mt-3 block overflow-x-auto rounded-lg bg-surface px-3 py-2 font-mono text-[11px] break-all">
            {minted.token}
          </code>
          <div className="flex flex-wrap gap-3 pt-3">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(minted.token).then(() => setCopied(true))
              }}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-surface"
            >
              {copied ? t('devices.copied') : t('devices.copy')}
            </button>
            <button
              type="button"
              onClick={() => setMinted(undefined)}
              className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
            >
              {t('devices.done')}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 pt-4">
        <label className="grow">
          <span className="block pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            {t('devices.nameLabel')}
          </span>
          <input
            className="w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder={t('devices.namePlaceholder')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={60}
          />
        </label>
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy || !label.trim()}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          {busy ? t('devices.adding') : t('devices.add')}
        </button>
      </div>

      {tokens && live.length > 0 && (
        <ul className="flex flex-col gap-2 pt-4">
          {live.map((token) => (
            <li
              key={token.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline px-3 py-2"
            >
              <span className="text-sm">
                {token.label}
                <span className="block text-xs text-ink-muted">
                  {token.lastUsedAt
                    ? t('devices.lastUsed', { date: shortDate(token.lastUsedAt) })
                    : t('devices.neverUsed')}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void revoke(token)}
                disabled={busy}
                className="rounded-full border border-accent px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-soft disabled:opacity-40"
              >
                {t('devices.revoke')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {tokens && live.length === 0 && !minted && (
        <p className="pt-3 text-xs text-ink-muted">{t('devices.none')}</p>
      )}

      {problem && <p className="pt-3 text-sm text-accent">{problem}</p>}
    </Card>
  )
}

const shortDate = (at: string) =>
  new Date(at).toLocaleDateString(document.documentElement.lang || undefined, {
    day: 'numeric',
    month: 'short',
  })
