/** Branded ids: a MealId can never be passed where a WorkoutId is expected. */
export type Id<T extends string> = string & { readonly __brand: T }

/** Cast a raw string into a branded id. Used at the persistence boundary only. */
export const asId = <T extends string>(raw: string): Id<T> => raw as Id<T>
