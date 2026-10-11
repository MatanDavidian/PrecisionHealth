/**
 * Runs real meal photos through every offered model and scores them — the
 * model evaluation in docs/ops/model-evaluation.md.
 *
 *   npx vite-node scripts/eval-models.ts <photos-dir> [out-dir]
 *
 * <photos-dir> holds the photos (.jpg, .jpeg, .png, .heic is not supported —
 * export as JPEG). Optionally, a `truth.csv` beside them gives what each
 * plate really was:
 *
 *   file,kcal,protein_g,items
 *   lunch-1.jpg,640,42,"chicken breast; rice; salad"
 *
 * For each photo and model:
 * - the photo is downscaled to 1280 px, as the app does
 * - it is sent with the production prompt (_shared/prompt.ts), as
 *   estimate-food sends it
 * - the reply is read with the app's own validator
 * - we record calories, protein, items, latency, tokens and cost
 *
 * Writes `results.csv` and a `report.md`. The report scores every model
 * against GPT-6.1 Sol (the baseline), and against the truth where given:
 * within ±20% on calories and protein.
 *
 * Uses OPENAI_API_KEY from .env.local (the owner's key). Each photo costs a
 * few cents across both models. Photos are sent to OpenAI and nowhere else,
 * and are not copied anywhere by this script.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import {
  MODEL_SOL, SYSTEM_PROMPT, TRIAL_MODELS, costMicros, hintText, languageRule,
} from '../supabase/functions/_shared/prompt'
import { validateEstimate } from '../src/ai/validate'

const [PHOTOS, OUT = 'model-eval'] = process.argv.slice(2)
if (!PHOTOS) throw new Error('usage: npx vite-node scripts/eval-models.ts <photos-dir> [out-dir]')

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
)
if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing from .env.local')

interface Truth { kcal?: number; protein?: number; items?: string }
const truth = new Map<string, Truth>()
const truthFile = join(PHOTOS, 'truth.csv')
if (existsSync(truthFile)) {
  for (const line of readFileSync(truthFile, 'utf8').split('\n').slice(1)) {
    const match = line.match(/^([^,]+),([^,]*),([^,]*),?(.*)$/)
    if (!match) continue
    const [, file, kcal, protein, items] = match
    truth.set(file.trim(), {
      kcal: kcal ? Number(kcal) : undefined,
      protein: protein ? Number(protein) : undefined,
      items: items.replace(/^"|"$/g, '').trim() || undefined,
    })
  }
}

const photos = readdirSync(PHOTOS).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort()
if (photos.length === 0) throw new Error(`no .jpg or .png photos in ${PHOTOS}`)
mkdirSync(OUT, { recursive: true })
const scratch = mkdtempSync(join(tmpdir(), 'vimetry-eval-'))

/** As the app does: longest edge 1280, JPEG. macOS `sips`. */
function prepared(file: string): string {
  const out = join(scratch, `${basename(file, extname(file))}.jpg`)
  execFileSync('sips', ['-Z', '1280', '-s', 'format', 'jpeg', join(PHOTOS, file), '--out', out], { stdio: 'ignore' })
  return `data:image/jpeg;base64,${readFileSync(out).toString('base64')}`
}

interface Row {
  file: string; model: string; ok: boolean; error?: string
  kcal?: number; protein?: number; items?: string; question?: string
  seconds: number; inTokens?: number; outTokens?: number; costUsd?: number
}

async function analyse(file: string, photo: string, model: string): Promise<Row> {
  const started = Date.now()
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + languageRule('en') },
          { role: 'user', content: [
            { type: 'text', text: hintText({}) },
            { type: 'image_url', image_url: { url: photo, detail: 'auto' } },
          ] },
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 4000,
      }),
    })
    const body = await response.json()
    const seconds = (Date.now() - started) / 1000
    if (!response.ok) return { file, model, ok: false, error: body?.error?.code ?? String(response.status), seconds }
    const result = validateEstimate(JSON.parse(body.choices[0].message.content), model)
    const inTokens = body.usage?.prompt_tokens ?? 0
    const outTokens = body.usage?.completion_tokens ?? 0
    return {
      file, model, ok: true, seconds, inTokens, outTokens,
      kcal: Math.round(result.items.reduce((t, i) => t + i.energyKcal, 0)),
      protein: Math.round(result.items.reduce((t, i) => t + i.proteinG, 0)),
      items: result.refusal ? `(not food: ${result.refusal})` : result.items.map((i) => `${i.name} ${Math.round(i.amountG)}g`).join('; '),
      question: result.question,
      costUsd: costMicros(model, inTokens, outTokens) / 1e6,
    }
  } catch (cause) {
    return { file, model, ok: false, error: cause instanceof Error ? cause.message : String(cause), seconds: (Date.now() - started) / 1000 }
  }
}

const rows: Row[] = []
for (const file of photos) {
  const photo = prepared(file)
  for (const model of TRIAL_MODELS) {
    const row = await analyse(file, photo, model)
    rows.push(row)
    console.log(`${file}  ${model}  ${row.ok ? `${row.kcal} kcal, ${row.protein} g protein, ${row.seconds.toFixed(1)}s` : `FAILED ${row.error}`}`)
  }
}

const csv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
writeFileSync(join(OUT, 'results.csv'), [
  'file,model,ok,kcal,protein_g,items,question,seconds,in_tokens,out_tokens,cost_usd,error',
  ...rows.map((r) => [r.file, r.model, r.ok, r.kcal, r.protein, r.items, r.question, r.seconds.toFixed(1),
    r.inTokens, r.outTokens, r.costUsd?.toFixed(5), r.error].map(csv).join(',')),
].join('\n'))

const within = (value: number | undefined, target: number | undefined) =>
  value !== undefined && target !== undefined && target > 0 && Math.abs(value - target) / target <= 0.2
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
const pct = (hits: number, of: number) => (of ? `${Math.round((100 * hits) / of)}% (${hits}/${of})` : '—')

const lines = [
  `# Model evaluation — ${new Date().toISOString().slice(0, 10)}`,
  '',
  `${photos.length} photos; baseline **${MODEL_SOL}**; ±20% counts as agreeing. Per-photo detail in \`results.csv\`.`,
  '',
  '| Model | Answered | Calories within 20% of baseline | Protein within 20% of baseline | Calories within 20% of truth | Protein within 20% of truth | Questions asked | Mean seconds | Mean cost |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
]
for (const model of TRIAL_MODELS) {
  const mine = rows.filter((r) => r.model === model)
  const ok = mine.filter((r) => r.ok)
  const base = (file: string) => rows.find((r) => r.model === MODEL_SOL && r.file === file && r.ok)
  const vsBase = ok.filter((r) => base(r.file))
  const withTruth = ok.filter((r) => truth.get(r.file)?.kcal !== undefined)
  const withProtein = ok.filter((r) => truth.get(r.file)?.protein !== undefined)
  lines.push(`| ${model} | ${pct(ok.length, mine.length)} | ${model === MODEL_SOL ? 'baseline' : pct(vsBase.filter((r) => within(r.kcal, base(r.file)!.kcal)).length, vsBase.length)} | ${model === MODEL_SOL ? 'baseline' : pct(vsBase.filter((r) => within(r.protein, base(r.file)!.protein)).length, vsBase.length)} | ${pct(withTruth.filter((r) => within(r.kcal, truth.get(r.file)!.kcal)).length, withTruth.length)} | ${pct(withProtein.filter((r) => within(r.protein, truth.get(r.file)!.protein)).length, withProtein.length)} | ${ok.filter((r) => r.question).length} | ${mean(ok.map((r) => r.seconds)).toFixed(1)} | $${mean(ok.map((r) => r.costUsd ?? 0)).toFixed(4)} |`)
}
lines.push('', '## Items named, side by side', '')
for (const file of photos) {
  lines.push(`**${file}**${truth.get(file)?.items ? ` — truth: ${truth.get(file)!.items}` : ''}`, '')
  for (const r of rows.filter((x) => x.file === file)) {
    lines.push(`- ${r.model}: ${r.ok ? `${r.kcal} kcal · ${r.protein} g protein — ${r.items}` : `failed (${r.error})`}`)
  }
  lines.push('')
}
writeFileSync(join(OUT, 'report.md'), lines.join('\n'))
console.log(`\nWrote ${join(OUT, 'report.md')} and ${join(OUT, 'results.csv')}`)
