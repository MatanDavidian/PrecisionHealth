import { describe, expect, it } from 'vitest'
import { canonical, directionToward, type Goal, type UserId } from '@/domain'
import { userEntered } from '@/domain/provenance'
import { evaluateGoal } from '../analytics'

const USER = 'user-demo' as UserId

const goal = (overrides: Partial<Goal>): Goal => ({
  id: 'goal-1' as Goal['id'],
  userId: USER,
  metric: 'WEIGHT',
  direction: 'AT_MOST',
  target: canonical(75, 'kg'),
  startsOn: '2026-08-01',
  active: true,
  provenance: userEntered('2026-08-01T08:00:00.000Z'),
  ...overrides,
})

/**
 * `evaluateGoal` had no tests, which is how a weight goal nobody could ever
 * meet stayed in the code: the arithmetic is only wrong at a scale the protein
 * goal — the one call site — never reaches.
 */
describe('grading a goal', () => {
  it('reads a floor as a floor', () => {
    const protein = goal({ metric: 'PROTEIN', direction: 'AT_LEAST', target: canonical(145, 'g') })
    expect(evaluateGoal(protein, canonical(145, 'g').value).attained).toBe(true)
    expect(evaluateGoal(protein, canonical(144.9, 'g').value).attained).toBe(false)
    expect(evaluateGoal(protein, canonical(200, 'g').value).attained).toBe(true)
  })

  it('reads a ceiling as a ceiling', () => {
    const weight = goal({ direction: 'AT_MOST', target: canonical(75, 'kg') })
    expect(evaluateGoal(weight, canonical(74.2, 'kg').value).attained).toBe(true)
    expect(evaluateGoal(weight, canonical(75, 'kg').value).attained).toBe(true)
    expect(evaluateGoal(weight, canonical(75.4, 'kg').value).attained).toBe(false)
  })

  describe('REACH, which has to know how big the number is', () => {
    /*
      Values are canonical (D8), so a 73 kg target is 73000 g. The old fixed
      0.001 epsilon therefore asked for a thousandth of a gram — every weight
      goal in the app was unattainable, however precisely someone hit it.
    */
    const weight = goal({ direction: 'REACH', target: canonical(73, 'kg') })

    it('counts standing exactly on the number', () => {
      expect(evaluateGoal(weight, canonical(73, 'kg').value).attained).toBe(true)
    })

    it('counts what a bathroom scale would call the same weight', () => {
      // A tenth of a percent of 73 kg is 73 g — inside one scale reading.
      expect(evaluateGoal(weight, canonical(73.05, 'kg').value).attained).toBe(true)
      expect(evaluateGoal(weight, canonical(72.95, 'kg').value).attained).toBe(true)
    })

    it('still says no to a weight that is plainly not the target', () => {
      expect(evaluateGoal(weight, canonical(73.5, 'kg').value).attained).toBe(false)
      expect(evaluateGoal(weight, canonical(71, 'kg').value).attained).toBe(false)
    })

    it('keeps an absolute floor for targets near zero', () => {
      // A proportional tolerance alone would collapse to nothing at zero, and
      // MAINTAIN writes exactly that: an ENERGY goal with a target of 0.
      const level = goal({ metric: 'ENERGY', direction: 'REACH', target: canonical(0, 'kcal') })
      expect(evaluateGoal(level, 0).attained).toBe(true)
      expect(evaluateGoal(level, 50).attained).toBe(false)
    })
  })

  it('is attainable for a weight goal set the way the app sets one', () => {
    // The whole point, end to end: Settings derives the direction from where
    // you are, so arriving at the target reads as arrived.
    const reached = goal({
      direction: directionToward(80, 75),
      target: canonical(75, 'kg'),
    })
    expect(reached.direction).toBe('AT_MOST')
    expect(evaluateGoal(reached, canonical(75, 'kg').value).attained).toBe(true)
    expect(evaluateGoal(reached, canonical(74.5, 'kg').value).attained).toBe(true)
    expect(evaluateGoal(reached, canonical(76, 'kg').value).attained).toBe(false)
  })
})
