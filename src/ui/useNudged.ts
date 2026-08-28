import { useEffect, useRef, useState } from 'react'

/**
 * A number the user nudges, written once they stop.
 *
 * A stepper fires on every tap, and each tap is an append-only record — so
 * five taps to move a weight by half a kilo would leave five observations, four
 * of them meaningless, and four writes crossing the network. The screen follows
 * every tap; the store hears the last one.
 *
 * The pending value is held until the store catches up with it rather than
 * being cleared on commit, so the number never flickers back to the old one
 * while the write is in flight.
 */
export function useNudged(
  stored: number | undefined,
  commit: (value: number) => void,
  delay = 700,
): [number | undefined, (value: number) => void] {
  const [pending, setPending] = useState<number>()
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const latest = useRef(commit)
  latest.current = commit

  // Once the store agrees, this is no longer pending — it is just the value.
  useEffect(() => {
    if (pending !== undefined && stored !== undefined && Math.abs(stored - pending) < 0.0001) {
      setPending(undefined)
    }
  }, [stored, pending])

  useEffect(() => () => clearTimeout(timer.current), [])

  const set = (value: number) => {
    setPending(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => latest.current(value), delay)
  }

  return [pending ?? stored, set]
}
