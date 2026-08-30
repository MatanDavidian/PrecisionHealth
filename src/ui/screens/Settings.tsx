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
import { useLang, LANGUAGES } from '../i18n'
import type { StringKey } from '../i18n/strings'
import { YouSettings } from '../components/YouSettings'
import { useActions, useDay } from '../useHealthData'
import { useSelectedDay } from '../useSelectedDay'
import { convert, goalFor, isObjective } from '@/domain'

type SettingsTab = 'you' | 'ai' | 'account'

const TABS: { tab: SettingsTab; label: StringKey; blurb: StringKey }[] = [
  { tab: 'you', label: 'settings.tabYou', blurb: 'settings.blurbYou' },
  { tab: 'ai', label: 'settings.tabAi', blurb: 'settings.blurbAi' },
  { tab: 'account', label: 'settings.tabAccount', blurb: 'settings.blurbAccount' },
]

const label = 'block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ink-muted pb-1'
const field =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm outline-none focus:border-accent'

type TestState = { kind: 'idle' | 'testing' } | { kind: 'done'; ok: boolean; message: string }

export function Settings() {
  const { t, lang, setLang } = useLang()
  const [tab, setTab] = useState<SettingsTab>('you')
  const { today } = useSelectedDay()
  const { data } = useDay(today)
  const { recordObservation, setGoal, setObjective } = useActions()

  const goals = data?.goals ?? []
  const weightTarget = goalFor(goals, 'WEIGHT')
  const energyGoal = goalFor(goals, 'ENERGY')
  const objective = isObjective(energyGoal?.objective) ? energyGoal.objective : undefined
  const weight = data?.effective.WEIGHT
  const weightKg = weight ? convert(weight.value, 'kg') : undefined
  const targetKg = weightTarget ? convert(weightTarget.target, 'kg') : undefined
  const weightRecordedOn =
    weight?.time.kind === 'instant'
      ? new Date(weight.time.at).toLocaleDateString(document.documentElement.lang || undefined, {
          day: 'numeric',
          month: 'short',
        })
      : undefined
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

  if (!settings) return <p className="text-sm text-ink-muted">{t('settings.loading')}</p>

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
        <h1 className="font-display text-4xl">{t('settings.title')}</h1>
        {/*
          All three blurbs are laid on top of each other in one grid cell, with
          two of them invisible.

          They are different lengths — in Hebrew on a phone some wrap to two
          lines and some to one — so rendering only the current one made the
          header change height, which pushed the tab row down as you moved
          between tabs. A control that moves when you use it is the one thing a
          tab row must never do. Stacking them makes the header as tall as the
          tallest blurb, always, in any language, without a magic number that
          the next translation would break.
        */}
        <div className="grid pt-1">
          {TABS.map((option) => (
            <p
              key={option.tab}
              aria-hidden={option.tab !== tab}
              className={`col-start-1 row-start-1 text-sm text-ink-muted ${
                option.tab === tab ? '' : 'invisible'
              }`}
            >
              {t(option.blurb)}
            </p>
          ))}
        </div>
      </header>

      {/*
        Three groups, because the screen had grown to seven cards with nothing
        saying which belonged together. The split is by what a person came to
        do: change something about themselves, change how photos are read, or
        deal with the account.
      */}
      <div className="flex flex-wrap items-start gap-x-7 gap-y-5">
        {/*
          Two shapes for one nav. On a phone it is a pill row like every other
          switch in the app, because 188px of vertical list would eat the screen
          before the settings started. From `sm` up it is the vertical list the
          design draws, where the selected entry is filled `card` rather than
          `card-soft` — a shade deeper than the app's own sidebar, so a second
          level of navigation reads as underneath the first instead of beside it.
        */}
        <nav className="flex w-full shrink-0 gap-1 rounded-full bg-card p-1 sm:w-[188px] sm:flex-col sm:rounded-none sm:bg-transparent sm:p-0">
          {TABS.map((option) => (
            <button
              key={option.tab}
              type="button"
              onClick={() => setTab(option.tab)}
              aria-current={tab === option.tab ? 'page' : undefined}
              className={`flex-1 rounded-full py-2 text-center text-[12.5px] transition-colors sm:flex-none sm:rounded-xl sm:px-3.5 sm:py-[9px] sm:text-start sm:text-sm ${
                tab === option.tab
                  ? 'bg-ink font-medium text-canvas sm:bg-card sm:text-ink'
                  : 'text-ink-soft sm:text-ink-muted sm:hover:bg-card-soft/60'
              }`}
            >
              {t(option.label)}
            </button>
          ))}
        </nav>

        <div className="grid min-w-[300px] flex-1 gap-4">
          {tab === 'you' && (
            <>
              <YouSettings
                objective={objective}
                weightKg={weightKg}
                targetKg={targetKg}
                weightRecordedOn={weightRecordedOn}
                onObjective={(next) => void setObjective(next)}
                onWeight={(kg) =>
                  void recordObservation({ code: 'WEIGHT', value: kg, unit: 'kg', day: today })
                }
                onTarget={(kg) =>
                  void setGoal({ metric: 'WEIGHT', target: kg, unit: 'kg', direction: 'REACH' })
                }
              />
              <Card label={t('settings.language')}>
              <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((option) => (
              <button
              key={option.value}
              type="button"
              onClick={() => setLang(option.value)}
              aria-pressed={lang === option.value}
              lang={option.value}
              className={`rounded-full border px-[15px] py-[7px] text-[13.5px] transition-colors ${
              lang === option.value
              ? 'border-ink bg-ink font-medium text-canvas'
              : 'border-hairline bg-surface hover:bg-card-soft'
              }`}
              >
              {option.label}
              </button>
              ))}
              </div>
              <p className="pt-3 text-xs text-ink-muted">{t('settings.languageHint')}</p>
              </Card>
            </>
          )}

          {tab === 'ai' && (
            <>
              <Card label={t('settings.apiKey')}>
              <div className="pb-3">
              <label className={label} htmlFor="apiKey">
              {t('settings.key')}
              </label>
              <input
              id="apiKey"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className={field}
              placeholder={t('settings.keyPlaceholder')}
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
              {t('settings.saveKey')}
              </button>
              <button
              type="button"
              disabled={!keyInput.trim() || test.kind === 'testing'}
              onClick={() => void runTest()}
              className="rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft disabled:opacity-40"
              >
              {test.kind === 'testing' ? t('settings.testing') : t('settings.testKey')}
              </button>
              {test.kind === 'done' && (
              <span className={`text-xs ${test.ok ? 'text-leaf' : 'text-accent'}`}>
              {test.message}
              </span>
              )}
              {saved && <span className="text-xs text-leaf">{t('settings.saved')}</span>}
              </div>

              {/*
              Shown only when there is no key: the steps matter exactly once, and
              the ChatGPT-Plus point is the misunderstanding almost everyone
              arrives with.
              */}
              {!settings.apiKey && (
              <div className="mt-4 rounded-xl border border-hairline p-3">
              <p className="text-sm font-medium">{t('settings.noKeyTitle')}</p>
              <ol className="list-decimal space-y-1 ps-4 pt-2 text-xs leading-relaxed text-ink-muted">
              <li>
              {t('settings.step1Open')}{' '}
              <a
              className="underline"
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noreferrer"
              >
              platform.openai.com/api-keys
              </a>{' '}
              {t('settings.step1')}
              </li>
              <li>
              {t('settings.step2Add')}{' '}
              <a
              className="underline"
              href="https://platform.openai.com/settings/organization/billing"
              target="_blank"
              rel="noreferrer"
              >
              {t('settings.billing')}
              </a>{' '}
              {t('settings.step2Tail')}
              </li>
              <li>{t('settings.step3')}</li>
              </ol>
              <p className="pt-2 text-xs leading-relaxed text-ink-muted">
              <strong>{t('settings.notIncludedBold')}</strong> {t('settings.notIncluded')}
              </p>
              </div>
              )}

              <div className="pt-4 text-xs leading-relaxed text-ink-muted">
              <p>
              {t('settings.storedHead')} <strong>{t('settings.storedBold')}</strong>
              {t('settings.storedTail')}
              </p>
              <p className="pt-2">
              {t('settings.scriptsHead')}{' '}
              <a
              className="underline"
              href="https://platform.openai.com/settings/organization/limits"
              target="_blank"
              rel="noreferrer"
              >
              {t('settings.spendingLimit')}
              </a>
              {t('settings.scriptsTail')}{' '}
              <a
              className="underline"
              href="https://openai.com/policies/api-data-usage-policies"
              target="_blank"
              rel="noreferrer"
              >
              {t('settings.dataPolicies')}
              </a>
              .
              </p>
              </div>
              </Card>
              {trial && !trial.exhausted && (
              <Card label={t('settings.accuracyOrSpeed')}>
              <p className="pb-3 text-sm text-ink-muted">{t('settings.accuracyBody')}</p>
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
              <Card label={t('settings.analysis')}>
              <div className="pb-4">
              <div className="flex items-baseline justify-between gap-3 pb-1">
              <label className={label.replace(' pb-1', '')} htmlFor="model">
              {t('settings.model')}
              </label>
              {settings.apiKey && (
              <button
              type="button"
              onClick={() => void loadModels(settings.apiKey!)}
              disabled={loadingModels}
              className="text-xs text-ink-muted underline disabled:opacity-40"
              >
              {loadingModels ? t('settings.loading') : t('settings.refreshList')}
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
              <option value="">{t('settings.notInList', { model: settings.model })}</option>
              )}
              <optgroup label={t('settings.canRead')}>
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
              <optgroup label={t('settings.textOnly')}>
              {models
              .filter((m) => !m.vision)
              .map((m) => (
              <option key={m.id} value={m.id} disabled>
              {m.id}
              </option>
              ))}
              </optgroup>
              <option value="__custom__">{t('settings.typeMyself')}</option>
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
              ? t('settings.loadingModels')
              : modelsError
              ? modelsError
              : models.length > 0
              ? t('settings.modelsCount', {
              vision: models.filter((m) => m.vision).length,
              total: models.length,
              })
              : settings.apiKey
              ? t('settings.saveThenRefresh')
              : t('settings.addKeyToLoad')}{' '}
              {t('settings.defaultIs', { model: DEFAULT_SETTINGS.model })}
              </p>

              {models.length > 0 && customModel && (
              <button
              type="button"
              onClick={() => setCustomModel(false)}
              className="pt-1 text-xs text-ink-muted underline"
              >
              {t('settings.pickFromList')}
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
              {t('settings.autoAnalyze')}
              <span className="block text-xs text-ink-muted">{t('settings.autoAnalyzeHint')}</span>
              </span>
              </label>
              </Card>
              <Card label={t('settings.photos')}>
              <p className="text-sm text-ink-muted">{t('settings.photosBody')}</p>
              </Card>
            </>
          )}

          {tab === 'account' && (
            <>
              <Card label={t('settings.account')}>
              {!authAvailable ? (
              <p className="text-sm text-ink-muted">{t('settings.noBackend')}</p>
              ) : session.authenticated ? (
              <>
              <p className="text-sm">
              {t('settings.signedInAs')} <span className="font-medium">{session.email}</span>
              </p>
              <p className="pt-1 text-xs text-ink-muted">{t('settings.followsYou')}</p>
              <button
              type="button"
              onClick={() => void signOut()}
              className="mt-3 rounded-full border border-hairline px-4 py-2 text-sm transition-colors hover:bg-card-soft"
              >
              {t('settings.signOut')}
              </button>
              </>
              ) : (
              <>
              <p className="text-sm text-ink-muted">{t('settings.notSignedIn')}</p>
              <Link
              to="/signin"
              className="mt-3 inline-block rounded-full bg-accent px-4 py-2 text-sm font-medium text-surface"
              >
              {t('settings.signIn')}
              </Link>
              </>
              )}
              </Card>
              <Card label={t('settings.storage')}>
              {session.authenticated ? (
              <>
              <p className="text-sm">{t('settings.storageAccount')}</p>
              <p className="pt-2 text-xs text-ink-muted">{t('settings.storageAccountNote')}</p>
              </>
              ) : (
              <>
              <p className="text-sm">
              {t('settings.storageLocal', {
              usage: usage ? t('settings.storageUsage', { usage }) : '',
              })}
              </p>
              <p className="pt-2 text-xs text-ink-muted">{t('settings.storageLocalNote')}</p>
              </>
              )}

              <p className="pt-3 text-xs text-ink-muted">
              <span className="rounded-full bg-card-soft px-2 py-0.5 text-[0.65rem] font-medium">
              {t('settings.notBuiltYet')}
              </span>{' '}
              {t('settings.exportNote')}
              </p>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

