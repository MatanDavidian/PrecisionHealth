export function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-4xl">{title}</h1>
      <p className="pt-2 text-sm text-ink-muted">Not built yet — {phase}.</p>
    </div>
  )
}
