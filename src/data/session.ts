/**
 * Who is using the app.
 *
 * Built in slice 3 step 0 as a single hardcoded user so that identity had one
 * home before auth existed; this is that promise being cashed. Screens never
 * changed, because they only ever asked this module.
 *
 * When no Supabase project is configured the app stays exactly as it was —
 * one local user, everything in the browser — so a checkout with no
 * `.env.local` still runs.
 */
import { asId, type UserId } from '@/domain'
import { getSupabaseClient, isSupabaseConfigured } from './supabase/client'

/** The single local user, used when signed out or when no project is configured. */
export const LOCAL_USER_ID = asId<'User'>('user-demo') as UserId

export interface Session {
  userId: UserId
  email?: string
  /** False when this is the local stand-in rather than a real account. */
  authenticated: boolean
}

export const LOCAL_SESSION: Session = { userId: LOCAL_USER_ID, authenticated: false }

/** Whether signing in is even possible in this build. */
export const isAuthAvailable = isSupabaseConfigured

/**
 * Cached so `currentUserId()` can stay synchronous for render paths.
 * Kept in step with Supabase by the subscription below.
 */
let current: Session = LOCAL_SESSION

const sessionFrom = (user: { id: string; email?: string } | undefined | null): Session =>
  user ? { userId: user.id as UserId, email: user.email, authenticated: true } : LOCAL_SESSION

export async function getSession(): Promise<Session> {
  if (!isAuthAvailable) return LOCAL_SESSION
  const supabase = await getSupabaseClient()
  const { data } = await supabase.auth.getSession()
  current = sessionFrom(data.session?.user)
  return current
}

/**
 * Synchronous access for code that cannot await.
 *
 * Returns the local user until the first `getSession()` resolves, which is why
 * `DataProvider` gates rendering on that call — otherwise a screen could read
 * one user's data and then re-read as another.
 */
export const currentUserId = (): UserId => current.userId
export const currentSession = (): Session => current

export function subscribeToSession(listener: (session: Session) => void): () => void {
  if (!isAuthAvailable) return () => {}
  // The client loads asynchronously, so the unsubscribe handle is returned
  // immediately and wired up once it arrives.
  let unsubscribe: (() => void) | undefined
  let cancelled = false

  void getSupabaseClient().then((supabase) => {
    if (cancelled) return
    const { data } = supabase.auth.onAuthStateChange((_event, supabaseSession) => {
      current = sessionFrom(supabaseSession?.user)
      listener(current)
    })
    unsubscribe = () => data.subscription.unsubscribe()
  })

  return () => {
    cancelled = true
    unsubscribe?.()
  }
}

/**
 * Starts sign-in. Supabase emails a link and — when the template includes
 * `{{ .Token }}` — a six-digit code. Either finishes the job: the link is
 * picked up automatically on return, the code is typed in.
 *
 * `shouldCreateUser` is on, so the first sign-in creates the account. For a
 * family app that is the whole signup flow.
 */
export async function sendSignInCode(email: string): Promise<void> {
  const supabase = await getSupabaseClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true },
  })
  if (error) throw new Error(error.message)
}

export async function verifySignInCode(email: string, code: string): Promise<Session> {
  const supabase = await getSupabaseClient()
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: 'email',
  })
  if (error) throw new Error(error.message)
  current = sessionFrom(data.session?.user)
  return current
}

export async function signOut(): Promise<void> {
  if (!isAuthAvailable) return
  const supabase = await getSupabaseClient()
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
  current = LOCAL_SESSION
}
