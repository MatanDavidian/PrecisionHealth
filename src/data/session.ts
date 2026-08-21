/**
 * Who is using the app.
 *
 * Every read and write is scoped to a user id, and until now each screen
 * reached into the demo seed data to get one. That works with a single
 * hardcoded user and stops working the moment auth exists — so identity gets
 * one module now, and Supabase auth replaces the body of this file in slice 3
 * without any screen changing.
 *
 * Deliberately async: real auth resolves a session over the network, and a
 * synchronous accessor here would force every caller to be rewritten later
 * (the same reasoning as the async repositories in D3).
 */
import { asId, type UserId } from '@/domain'

/** The single local user, until accounts exist. */
export const LOCAL_USER_ID = asId<'User'>('user-demo') as UserId

export interface Session {
  userId: UserId
  /** False once real accounts exist and nobody is signed in. */
  authenticated: boolean
}

const LOCAL_SESSION: Session = { userId: LOCAL_USER_ID, authenticated: true }

/**
 * The current session.
 *
 * Slice 3 replaces this with a Supabase session lookup; callers already await
 * it, so the change is contained here.
 */
export const getSession = async (): Promise<Session> => LOCAL_SESSION

/**
 * Synchronous access for render paths that cannot await.
 *
 * Kept separate and explicit so the places that need a session *before* an
 * await are visible — they are the ones that need a loading state when auth
 * becomes real.
 */
export const currentUserId = (): UserId => LOCAL_SESSION.userId
