import { useEffect, useState } from 'react'
import { getRepositories } from '@/data'
import { listChatModels, testApiKey, type ModelChoice } from '@/ai/openaiEstimator'
import { DEFAULT_SETTINGS } from '@/config'
import { Link } from 'react-router-dom'
import { Card } from '../components/Card'
import { useDataRevision } from '../DataProvider'
import { TrialModelPicker } from '../components/TrialModelPicker'
import { signOut } from '@/data/session'
import type { AppSettings } from '@/data/repositories'

const label = 'block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted pb-1'
const field =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm outline-none focus:border-accent'

type TestState = { kind: 'idle' | 'testing' } | { kind: 'done'; ok: boolean; message: string }

export function Settings() {
  const { session, authAvailable, trial, refreshTrial } = useDataRevision()
  const [settings, setSettings] = useState<AppSettings>()
  const [keyInput, setKeyInput] = useState('')
  const [test, setTest] = useState<TestState>({ kind: 'idle' })
  const [saved, setSaved] = useState(false)
  const [models, setModels] = useState<ModelChoice[]>([])
  const [modelsError, setModelsError] = useState<string>()
  const [loadingModels, setLoadingModels] = useState(false)
  /** True when the chosen model is not in the account list — shows the text field. */
  const [customModel, setCustomModel] = useState(false)
  const [usage, setUsage] = useState<string>()

  useEffect(() => {
    // Browsers report this per origin; it is the honest answer to "how much of
    // my data is sitting in this browser".
    void navigator.storage?.estimate?.().then((estimate) => {
      if (estimate.usage != null) setUsage(`${Math.round(estimate.usage / 1024)} kB`)
    })
  }, [])

  useEffect(() => {
    void getRepositories().settings.get().then((loaded) => {
      setSettings(loaded)
      setKeyInput(loaded.apiKey ?? '')
      if (loaded.apiKey) void loadModels(loaded.apiKey)
    })
  }, [])

  if (!settings) return <p className="text-sm text-ink-muted">Loading…</p>

  const update = async (patch: Partial<AppSettings>) => {
    await getRepositories().settings.save(patch)
    setSettings((current) => ({ ...current!, ...patch }))
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  /** Pull the account's own model list, so the choice is real rather than guessed. */
  const loadModels = async (key: string) => {
    if (!key) return
    setLoadingModels(true)
    setModelsError(undefined)
    try {
      const result = await listChatModels(key)
      if (result.ok) {
        setModels(result.models)
      } else {
        setModels([])
        setModelsError(result.reason)
      }
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
        <Card label="Account">
          {!authAvailable ? (
            <p className="text-sm text-ink-muted">
              No backend is configured in this build, so everything stays in this browser.
            </p>
          ) : session.authenticated ? (
            <>
              <p className="text-sm">
                Signed in as <span className="font-medium">{session.email}</span>
              </p>
              <p className="pt-1 text-xs text-ink-muted">
                Your data is saved to your account and follows you between devices.
              </p>
              <button
                type="button"
                onClick={() => void signOut()}
                className="mt-3 rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-muted">
                Not signed in. Everything you log stays in this browser — clearing your browsing
                data erases it, and no other device can see it.
              </p>
              <Link
                to="/signin"
                className="mt-3 inline-block rounded-full bg-accent px-4 py-2 text-sm font-medium text-surface"
              >
                Sign in
              </Link>
            </>
          )}
        </Card>

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
              onClick={() => {
                const key = keyInput.trim()
                // Saving a key is exactly when the account's model list becomes
                // available — waiting for a separate Refresh click just looks
                // like the feature is broken.
                void update({ apiKey: key }).then(() => loadModels(key))
              }}
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

          {/*
            Shown only when there is no key: the steps matter exactly once, and
            the ChatGPT-Plus point is the misunderstanding almost everyone
            arrives with.
          */}
          {!settings.apiKey && (
            <div className="mt-4 rounded-xl border border-hairline p-3">
              <p className="text-sm font-medium">Don't have a key yet?</p>
              <ol className="list-decimal space-y-1 pl-4 pt-2 text-xs leading-relaxed text-ink-muted">
                <li>
                  Open{' '}
                  <a
                    className="underline"
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noreferrer"
                  >
                    platform.openai.com/api-keys
                  </a>{' '}
                  and sign in.
                </li>
                <li>
                  Add credit under{' '}
                  <a
                    className="underline"
                    href="https://platform.openai.com/settings/organization/billing"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Billing
                  </a>{' '}
                  — $5 is the minimum, and set a spending limit while you are there.
                </li>
                <li>
                  Create a new secret key and copy it straight away. OpenAI shows it once.
                </li>
              </ol>
              <p className="pt-2 text-xs leading-relaxed text-ink-muted">
                <strong>A ChatGPT subscription does not include this.</strong> The API is a
                separate product on separate billing, and paying for Plus grants no API access at
                all. The upside is that it is cheap: analysing a photo costs a fraction of a cent,
                so a few meals a day runs to pennies a month.
              </p>
            </div>
          )}

          <div className="pt-4 text-xs leading-relaxed text-ink-muted">
            <p>
              Your key is stored <strong>on this device only</strong>, in this browser. It is sent
              to OpenAI and nowhere else, and it is never included in any backup or sync.
            </p>
            <p className="pt-2">
              Anything able to run scripts in this browser could read it, so use a dedicated key
              with a{' '}
              <a
                className="underline"
                href="https://platform.openai.com/settings/organization/limits"
                target="_blank"
                rel="noreferrer"
              >
                spending limit
              </a>
              , and avoid shared computers. Photos you analyze are handled
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

        {trial && !trial.exhausted && (
          <Card label="Accuracy or speed">
            <p className="pb-3 text-sm text-ink-muted">
              More accurate models look harder at a crowded plate and take longer. Choose per
              your patience — you can change this any time.
            </p>
            <TrialModelPicker
              trial={trial}
              selected={settings.trialModel}
              onSelect={(model) => {
                void update({ trialModel: model })
                refreshTrial()
              }}
            />
          </Card>
        )}

        <Card label="Analysis">
          <div className="pb-4">
            <div className="flex items-baseline justify-between gap-3 pb-1">
              <label className={label.replace(' pb-1', '')} htmlFor="model">
                Model
              </label>
              {settings.apiKey && (
                <button
                  type="button"
                  onClick={() => void loadModels(settings.apiKey!)}
                  disabled={loadingModels}
                  className="text-xs text-ink-muted underline disabled:opacity-40"
                >
                  {loadingModels ? 'Loading…' : 'Refresh list'}
                </button>
              )}
            </div>

            {models.length > 0 && !customModel ? (
              <select
                id="model"
                className={field}
                value={models.some((m) => m.id === settings.model) ? settings.model : ''}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setCustomModel(true)
                    return
                  }
                  void update({ model: e.target.value })
                }}
              >
                {!models.some((m) => m.id === settings.model) && (
                  <option value="">{settings.model} (not in your account list)</option>
                )}
                <optgroup label="Can read photos">
                  {models
                    .filter((m) => m.vision)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id}
                        {m.note ? ` — ${m.note}` : ''}
                      </option>
                    ))}
                </optgroup>
                {/* Shown but unselectable: seeing why a model is missing beats
                    wondering where it went. */}
                <optgroup label="Text only — cannot read photos">
                  {models
                    .filter((m) => !m.vision)
                    .map((m) => (
                      <option key={m.id} value={m.id} disabled>
                        {m.id}
                      </option>
                    ))}
                </optgroup>
                <option value="__custom__">Type a model ID myself…</option>
              </select>
            ) : (
              <input
                id="model"
                className={field}
                value={settings.model}
                onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                onBlur={(e) => void update({ model: e.target.value.trim() || DEFAULT_SETTINGS.model })}
              />
            )}

            <p className="pt-1 text-xs text-ink-muted">
              {loadingModels
                ? 'Loading the models on your account…'
                : modelsError
                  ? modelsError
                  : models.length > 0
                    ? `${models.filter((m) => m.vision).length} of your ${models.length} chat models can read a photo. Capability is inferred from the name — OpenAI does not publish it — so a rejected model may just be mislabelled here.`
                    : settings.apiKey
                      ? 'Save your key and hit Refresh list to load the models on your account.'
                      : 'Add a key above to load the models on your account.'}{' '}
              Default is {DEFAULT_SETTINGS.model}. A larger model reads a plate more carefully and costs
              more per photo.
            </p>

            {models.length > 0 && customModel && (
              <button
                type="button"
                onClick={() => setCustomModel(false)}
                className="pt-1 text-xs text-ink-muted underline"
              >
                Pick from my account list instead
              </button>
            )}
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

        <Card label="Where your data is saved">
          {session.authenticated ? (
            <>
              <p className="text-sm">
                In your account. Every device you sign in on sees the same data, and it survives
                clearing this browser.
              </p>
              <p className="pt-2 text-xs text-ink-muted">
                Records are only ever added, never overwritten — corrections are new entries that
                supersede old ones, so nothing you log can be silently lost or rewritten. Your
                OpenAI key is the exception to all of this: it stays on this device and is never
                sent to your account.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm">
                In this browser only{usage ? `, currently ${usage}` : ''}.
              </p>
              <p className="pt-2 text-xs text-ink-muted">
                Clearing your browsing data erases it, and no other device can see it. Signing in
                copies it to your account and keeps it in step from then on.
              </p>
            </>
          )}

          <p className="pt-3 text-xs text-ink-muted">
            <span className="rounded-full bg-card-soft px-2 py-0.5 text-[0.65rem] font-medium">
              not built yet
            </span>{' '}
            Exporting everything as a JSON file, so you hold a copy independently of both this
            browser and the account.
          </p>
        </Card>
      </div>
    </div>
  )
}

