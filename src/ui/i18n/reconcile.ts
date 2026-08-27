/**
 * Deciding what to do when the device and the account disagree about language.
 *
 * Pulled out of the provider because it is the only part worth arguing about:
 * five inputs, four outcomes, and every one of them a judgement rather than
 * wiring. Testable without a session, a store or a rendered tree.
 */
import type { Lang } from './strings'

export interface LanguageState {
  authenticated: boolean
  /** What the account has chosen, if it ever has. */
  onAccount?: Lang
  /** What this device last used, chosen or merely defaulted into. */
  onDevice?: Lang
  /**
   * Whether the account's preference was actually readable.
   *
   * False means we could not reach the table, which is NOT the same as "no
   * preference stored" — and the difference decides whether we interrupt.
   */
  reachable: boolean
}

export interface LanguageDecision {
  /** The language to switch to, if it should change. */
  use?: Lang
  /** Write this to the device's own settings. */
  saveToDevice?: Lang
  /** Write this to the account, so it follows them to the next device. */
  saveToAccount?: Lang
  /** Show the chooser. */
  ask: boolean
}

/**
 * The rules, in the order they matter:
 *
 * 1. Signed out, there is no account to consult. The device decides, and
 *    nobody is asked — there would be nowhere to keep the answer.
 * 2. The account wins over the device, because it is the one a person
 *    deliberately chose; the device copy is a cache that happens to work
 *    alone, and is brought back into step.
 * 3. A device choice with an empty account is carried UP rather than thrown
 *    away. Someone who set this before ever signing in has answered the
 *    question, and asking again would be forgetting.
 * 4. Only when neither knows, and we are sure the account really is empty, is
 *    anyone interrupted. A failed read is "we do not know", and treating that
 *    as "ask" would nag on every flaky connection.
 */
export function decideLanguage(state: LanguageState): LanguageDecision {
  if (!state.authenticated) {
    return { use: state.onDevice, ask: false }
  }

  if (state.onAccount) {
    return {
      use: state.onAccount,
      saveToDevice: state.onAccount === state.onDevice ? undefined : state.onAccount,
      ask: false,
    }
  }

  if (state.onDevice) {
    return { use: state.onDevice, saveToAccount: state.onDevice, ask: false }
  }

  return { ask: state.reachable }
}
