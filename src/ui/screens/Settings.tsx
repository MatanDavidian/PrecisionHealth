import { useEffect, useState } from 'react'
import { repositories } from '@/data'
import { DEFAULT_MODEL, listChatModels, testApiKey } from '@/ai/openaiEstimator'
import { Card } from '../components/Card'
import type { AppSettings } from '@/data/repositories'

const label = 'block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted pb-1'
const field =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm outline-none focus:border-accent'

type TestState = { kind: 'idle' | 'testing' } | { kind: 'done'; ok: boolean; message: string }

export function Settings() {
  const [settings, setSettings] = useState<AppSettings>()
  const [keyInput, setKeyInput] = useState('')
  const [test, setTest] = useState<TestState>({ kind: 'idle' })
  const [saved, setSaved] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)

  useEffect(() => {
    void repositories.settings.get().then((loaded) => {
      setSettings(loaded)
      setKeyInput(loaded.apiKey ?? '')
      if (loaded.apiKey) void loadModels(loaded.apiKey)
    })
  }, [])

  if (!settings) return <p className="text-sm text-ink-muted">Loading…</p>

  const update = async (patch: Partial<AppSettings>) => {
    await repositories.settings.save(patch)
    setSettings((current) => ({ ...current!, ...patch }))
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  /** Pull the account's own model list, so the choice is real rather than guessed. */
  const loadModels = async (key: string) => {
    if (!key) return
    setLoadingModels(true)
    try {
      setModels(await listChatModels(key))
    } finally {
      setLoadingModels(false)
    }
  }

  const runTest = async () => {
    setTest({ kind: 'testing' })
    const result = await testApiKey(keyInput.trim())
    setTest({
      kind: 'done',
      ok: result.ok,
      message: result.ok ? 'Key works.' : result.reason,
    })
    if (result.ok) void loadModels(keyInput.trim())
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="pb-6">
        <h1 className="font-display text-4xl">Settings</h1>
        <p className="pt-1 text-sm text-ink-muted">
          Photo analysis runs on your own OpenAI account.
        </p>
      </header>

      <div className="grid gap-4">
        <Card label="OpenAI API key">
          <div className="pb-3">
            <label className={label} htmlFor="apiKey">
              Key
            </label>
            <input
              id="apiKey"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className={field}
              placeholder="sk-…"
              value={keyInput}
              onChange={(e) => {
                setKeyInput(e.target.value)
                setTest({ kind: 'idle' })
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void update({ apiKey: keyInput.trim() })}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-surface"
            >
              Save key
            </button>
            <button
              type="button"
              disabled={!keyInput.trim() || test.kind === 'testing'}
              onClick={() => void runTest()}
              className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft disabled:opacity-40"
            >
              {test.kind === 'testing' ? 'Testing…' : 'Test key'}
            </button>
            {test.kind === 'done' && (
              <span className={`text-xs ${test.ok ? 'text-leaf' : 'text-accent'}`}>
                {test.message}
              </span>
            )}
            {saved && <span className="text-xs text-leaf">Saved.</span>}
          </div>

          <div className="pt-4 text-xs leading-relaxed text-ink-muted">
            <p>
              Your key is stored <strong>on this device only</strong>, in this browser. It is sent
              to OpenAI and nowhere else, and it is never included in any backup or sync.
            </p>
            <p className="pt-2">
              Anything able to run scripts in this browser could read it, so use a{' '}
              <a
                className="underline"
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noreferrer"
              >
                dedicated key
              </a>{' '}
              with a spending limit, and avoid shared computers. Photos you analyze are handled
              under{' '}
              <a
                className="underline"
                href="https://openai.com/policies/api-data-usage-policies"
                target="_blank"
                rel="noreferrer"
              >
                OpenAI's API data policies
              </a>
              .
            </p>
          </div>
        </Card>

        <Card label="Analysis">
          <div className="pb-4">
            <label className={label} htmlFor="model">
              Model
            </label>
            <input
              id="model"
              className={field}
              list="account-models"
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              onBlur={(e) => void update({ model: e.target.value.trim() || DEFAULT_MODEL })}
            />
            <datalist id="account-models">
              {models.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
            <p className="pt-1 text-xs text-ink-muted">
              {loadingModels
                ? 'Loading the models on your account…'
                : models.length > 0
                  ? `Click the field to pick from the ${models.length} models on your account. It must be vision-capable, or analysis will fail.`
                  : 'Any vision-capable model on your account.'}{' '}
              Default is {DEFAULT_MODEL}. A larger model reads a plate more
              carefully and costs more per photo — still fractions of a cent.
            </p>
          </div>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={settings.autoAnalyze}
              onChange={(e) => void update({ autoAnalyze: e.target.checked })}
            />
            <span>
              Analyze automatically after taking a photo
              <span className="block text-xs text-ink-muted">
                Off means one extra tap, and no request you did not ask for.
              </span>
            </span>
          </label>
        </Card>

        <Card label="Photos">
          <p className="text-sm text-ink-muted">
            Meal photos are never saved — not on this device, not anywhere else. Each photo is sent
            for analysis once and then discarded. What is kept is the estimate, its confidence, and
            a record of the photo's size and fingerprint.
          </p>
        </Card>
      </div>
    </div>
  )
}
