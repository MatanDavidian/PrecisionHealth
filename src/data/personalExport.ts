/**
 * Everything the app holds about you, in one file you can keep.
 *
 * S5.3, and a promise the app had already made: the Account tab has described
 * this feature since before it existed, sitting behind a "not built yet" badge.
 *
 * Two properties matter more than the format.
 *
 * **Complete.** Assembled from `account.everything`, which reads whole stores,
 * rather than from the day- and range-scoped reads the screens use. A range is
 * a way of quietly missing whatever falls outside it, and an export that is
 * silently short is worse than none: it looks like an answer.
 *
 * **Not a credential.** The API key is the one thing deliberately left out —
 * see `redactSettings`.
 */
import type { AppSettings, HealthRepositories, PersonalRecords } from './repositories'
import type { UserId } from '@/domain'

export const EXPORT_FORMAT = 'timeline-personal-export'
export const EXPORT_VERSION = 1

/**
 * Settings, minus the secret.
 *
 * An export is a file people put in Dropbox, email to themselves, and hand to
 * a support agent. A live OpenAI key inside it is a credential leak with a
 * bill attached, and nobody would think to check. The key is device-local and
 * was never part of "your health data" in the first place, so leaving it out
 * costs the export nothing — but it has to SAY it left something out, or the
 * omission looks like data loss.
 */
export interface RedactedSettings extends Omit<AppSettings, 'apiKey'> {
  /** True when a key was set on this device. The key itself is never written. */
  apiKeySet: boolean
}

export const redactSettings = (settings: AppSettings): RedactedSettings => {
  const { apiKey, ...rest } = settings
  return { ...rest, apiKeySet: Boolean(apiKey) }
}

export interface PersonalExport extends PersonalRecords {
  format: typeof EXPORT_FORMAT
  version: typeof EXPORT_VERSION
  exportedAt: string
  account: {
    userId: UserId
    email?: string
    /** False for the local-only user, so a re-import knows what it is holding. */
    authenticated: boolean
  }
  /**
   * What is in the file, counted.
   *
   * Not decoration. It is the only way someone can tell an export that is
   * genuinely empty from one that failed halfway and wrote a valid-looking
   * file with nothing in it.
   */
  counts: Record<string, number>
  settings: RedactedSettings
  /** Said in the file itself, because a reader will not have this comment. */
  notes: string[]
}

export function buildPersonalExport(
  records: PersonalRecords,
  settings: AppSettings,
  account: { userId: UserId; email?: string; authenticated: boolean },
  exportedAt: string = new Date().toISOString(),
): PersonalExport {
  const counts = Object.fromEntries(
    Object.entries(records)
      .filter(([, value]) => Array.isArray(value))
      .map(([key, value]) => [key, (value as unknown[]).length]),
  )

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt,
    account,
    counts: { ...counts, profile: records.profile ? 1 : 0 },
    ...records,
    settings: redactSettings(settings),
    notes: [
      'Every record this app holds for the account named above.',
      'Your OpenAI API key is deliberately not included — it is a credential, not health data, and it stays on the device that set it.',
      'Meal photos are never stored, so none appear here. What is kept of a photo is the estimate it produced and a record of its size and fingerprint, under "inferences".',
      'Records are append-only: several entries for the same meal, goal or measurement are versions of it, not duplicates.',
    ],
  }
}

/** A filename that sorts, and says whose it is without saying who they are. */
export const exportFilename = (exportedAt: string): string =>
  `timeline-export-${exportedAt.slice(0, 10)}.json`

/**
 * Reads the store and assembles the file.
 *
 * Takes its repositories rather than reaching for the composition root, so a
 * test can hand it either adapter — the export has to be identical whichever
 * store a person's data happens to be in, and that is only checkable if both
 * can be passed in.
 */
export async function collectPersonalExport(
  repositories: HealthRepositories,
  account: { userId: UserId; email?: string; authenticated: boolean },
  exportedAt: string = new Date().toISOString(),
): Promise<PersonalExport> {
  const [records, settings] = await Promise.all([
    repositories.account.everything(account.userId),
    repositories.settings.get(),
  ])
  return buildPersonalExport(records, settings, account, exportedAt)
}
