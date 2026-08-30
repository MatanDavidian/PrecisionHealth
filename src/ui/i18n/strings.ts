/**
 * Every word the app says, in both languages.
 *
 * English is written first and the dictionary type is derived from it, so
 * Hebrew is not allowed to be incomplete: a missing key is a compile error
 * rather than a silent fallback nobody notices until a screen is half
 * translated. Adding an English string and forgetting the Hebrew one will not
 * build.
 *
 * Keys are dotted paths naming where the string lives, not the English text —
 * so rewording a sentence is a one-line change here rather than a rename
 * across the codebase.
 *
 * `{placeholders}` are substituted at call time. A string that varies with a
 * number is written as `{ one, other }` and chosen by `count`.
 */
export type Lang = 'en' | 'he'

/** A string that changes shape with a number. */
export interface Plural {
  one: string
  other: string
}

export const LANGUAGES: { value: Lang; label: string; english: string }[] = [
  { value: 'en', label: 'English', english: 'English' },
  { value: 'he', label: 'עברית', english: 'Hebrew' },
]

/** Which way each language runs. Only used to set `dir` on the document. */
export const DIRECTION: Record<Lang, 'ltr' | 'rtl'> = { en: 'ltr', he: 'rtl' }

const en = {
  // ---------------------------------------------------------------- shell --
  'nav.log': 'Log',
  'nav.today': 'Today',
  'nav.food': 'Food',
  'nav.settings': 'Settings',
  'nav.overview': 'Overview',
  'nav.track': 'Track',
  'nav.app': 'App',
  'nav.training': 'Training',
  'nav.recovery': 'Recovery',
  'nav.body': 'Body',
  'nav.health': 'Health',

  // ----------------------------------------------------------------- log ---
  'log.title': 'Log',
  'log.subtitle': 'Three ways in. Photo is the default.',
  'log.mode.photo': 'Photo',
  'log.mode.write': 'Write',
  'log.mode.again': 'Again',
  'log.mode.photo.description': 'Photograph what you are eating',
  'log.mode.write.description': 'Describe what you ate in words',
  'log.mode.again.description': 'Log something you have eaten before',
  'log.modes.label': 'How to log this meal',

  'log.photo.take': 'Take a photo',
  'log.photo.orLibrary': 'or choose one from your library',
  'log.photo.addNote': 'Add a note',
  'log.photo.noteHint': 'Optional, and it goes to the model with the photo — "no oil", "half portion".',
  'log.photo.notePlaceholder': 'No oil, half portion, sauce on the side…',
  'log.photo.noteLabel': 'A note about this meal',
  'log.photo.noteSent': 'Sent with the next photo you take, and treated as fact rather than a guess.',
  'log.photo.usualNow': 'Usual now',
  'log.photo.usualHint': 'The one thing you eat at this hour most often — one tap, no camera.',
  'log.photo.usualHintLink': 'Everything else you repeat is under',

  'log.write.placeholder': 'Two eggs on sourdough toast and a black coffee',
  'log.write.label': 'What you ate',
  'log.write.estimate': 'Estimate',
  'log.write.hint': 'A couple of seconds, and a wider margin than a photo.',
  'log.write.recent': 'Things you have described before, ready to send again.',
  'log.write.forget': 'Forget this',

  'log.analyzing.reading': 'Reading your plate…',
  'log.analyzing.usually': 'usually about 15 seconds',
  'log.analyzing.working': 'Working it out…',
  'log.analyzing.cancel': 'Cancel',
  'log.analyzing.leave': 'Leave this open',
  'log.analyzing.whyTitle': 'Why this looks like this',
  'log.analyzing.why':
    "The wait is put where your eyes already are — on the photo — rather than in a line of small text under it. Leaving the screen doesn't cancel anything: the work carries on and a bar stays docked above the tab bar until it's done.",
  'log.photoAlt': 'The meal you photographed',

  'log.details.show': 'Add details (optional)',
  'log.details.hide': 'Hide details',
  'log.details.what': 'What is it',
  'log.details.whatHint': 'Naming it stops the model guessing the identification.',
  'log.details.grams': 'Total grams',
  'log.details.gramsHint': 'Weighing it is the biggest accuracy win.',
  'log.details.time': 'Time',
  'log.details.meal': 'Meal',

  'log.action.analyze': 'Analyze',
  'log.action.tryAgain': 'Try again',
  'log.action.discardPhoto': 'Discard photo',
  'log.action.startOver': 'Start over',
  'log.action.edit': 'Edit',
  'log.saved': 'Saved.',
  'log.savedLink': 'See today',

  'log.error.photo': 'Something went wrong reading the photo',
  'log.error.text': 'Something went wrong reading your description',
  'log.error.stillHereText': 'What you wrote is',
  'log.error.stillHerePhoto': 'Your photo and details are',
  'log.error.retryOr': 'still here — retry, or',
  'log.error.logByHand': 'log it by hand',

  // -------------------------------------------------------------- estimate --
  'estimate.label': 'Estimate',
  'estimate.labelFromText': 'Estimate from your words',
  'estimate.calories': 'Calories',
  'estimate.protein': 'Protein',
  'estimate.carbs': 'Carbs',
  'estimate.fat': 'Fat',
  'estimate.assumed': 'assumed',
  'estimate.yours': 'yours',
  'estimate.adjust': 'Adjust these numbers',
  'estimate.adjustAgain': 'Adjust again',
  'estimate.food': 'Food',
  'estimate.grams': 'Grams',
  'estimate.proteinG': 'Protein g',
  'estimate.carbsG': 'Carbs g',
  'estimate.fatG': 'Fat g',
  'estimate.removeFood': 'Remove this food',
  'estimate.keepFood': 'Keep this food',
  'estimate.allRemoved':
    'Every food is removed — there is nothing left to save. Keep one, or discard the whole estimate.',
  'estimate.savedNote': 'Saved as an estimate you can confirm, correct or delete in Food.',
  'estimate.savedNoteCorrected':
    'Your corrections are saved as entered; anything you left alone stays an estimate you can confirm in Food.',
  'estimate.lowConfidence': 'Low confidence — worth checking the numbers before you trust them.',
  'estimate.fromTextNote':
    "Confidence is lower than a photo's — nothing was seen, so portions were assumed.",
  'estimate.downgraded': 'Read by the quicker model — your most-accurate analyses are used up.',
  'estimate.save': 'Save meal',
  'estimate.saving': 'Saving…',
  'estimate.discard': 'Discard',
  'estimate.tryAnotherPhoto': 'Try another photo',
  'estimate.describeSomethingElse': 'Describe something else',

  'estimate.question.label': 'Your answer',

  // --------------------------------------------------------------- usuals --
  'usuals.forSlot': 'Usual for {slot}',
  'usuals.everything': 'Everything you log',
  'usuals.oneTap': 'One tap logs it — no photo, no waiting, no estimate to review.',
  'usuals.none': 'Nothing usual for {slot} yet — photograph one and it will be here next time.',
  'usuals.seeAll': 'See all usuals',
  'usuals.backTo': 'Back to {slot}',
  'usuals.search': "Search anything you've logged before",
  'usuals.noMatch': 'Nothing logged matches "{query}".',
  'usuals.yesterday': 'Yesterday',
  'usuals.repeatDay': 'Repeat the day',
  'usuals.repeatSoFar': 'Repeat today so far',
  'usuals.laterLeftOut': 'Later meals are left out until their time comes round.',
  'usuals.singleFoods': 'Single foods, tap to add',
  'usuals.logThem': 'Log them',
  'usuals.cancel': 'Cancel',
  'usuals.selected': '{count} selected',
  'usuals.unconfirmed': 'unconfirmed estimate',
  'usuals.loggedTimes': { one: 'logged {count}× recently', other: 'logged {count}× recently' } as Plural,
  'usuals.mealCount': { one: '{count} meal', other: '{count} meals' } as Plural,
  'usuals.logged': '{label} logged',
  'usuals.loggedNote': 'no photo, no estimate to review.',
  'usuals.undo': 'Undo',
  'usuals.dismiss': 'Dismiss',
  'usuals.fromYesterday': '{count} from yesterday',
  'usuals.looking': 'Looking through what you have logged…',

  'when.today': 'Today, {time}',
  'when.yesterday': 'Yesterday, {time}',
  'when.weeksAgo': { one: '{count} week ago', other: '{count} weeks ago' } as Plural,

  // -------------------------------------------------------------- nutrition --
  'nutrition.title': 'Food',
  'nutrition.todaysTotal': "Today's total",
  'nutrition.logAMeal': 'Log a meal',
  'nutrition.byHand': 'By hand',
  'nutrition.addAnotherFood': 'Add another food',
  'nutrition.confirm': 'Confirm',
  'nutrition.editMeal': 'Edit {slot}',
  'nutrition.deleteMeal': 'Delete {slot}',
  'nutrition.nothingLogged': 'Nothing logged for this day yet.',
  'nutrition.loggedCount': 'Logged ({count})',
  'nutrition.gProtein': '{grams} g protein',
  'nutrition.deleted': '{slot} deleted · {kcal} kcal came off today’s total',

  'editor.editing': 'Editing {slot}',
  'editor.loggedAt': 'Logged {time}, {origin}',
  'editor.originHand': 'entered by hand',
  'editor.originUnconfirmed': 'estimated, not yet confirmed',
  'editor.originConfirmed': 'from an estimate you confirmed',
  'editor.allRemoved': 'Every food is removed — saving now deletes the meal. It can be undone.',
  'editor.ratioHint':
    'Refill adds 10% to the grams and every value follows by ratio. Type over any number to break the link.',
  'editor.refill': 'Refill',
  'editor.refillTitle': 'Refill — add 10% to every value',
  'editor.backTo': 'Back to {grams} g',
  'editor.saveChanges': 'Save changes',
  'editor.cancel': 'Cancel',
  'editor.delete': 'Delete meal',

  // --------------------------------------------------------------- today ----
  'today.nutrition': 'Nutrition',
  'today.activity': 'Activity',
  'today.recovery': 'Recovery',
  'today.body': 'Body',
  'today.meals': 'Meals',
  'today.previousDay': 'Previous day',
  'today.nextDay': 'Next day',
  'today.backToToday': 'Back to today',

  // ------------------------------------------------------------- settings ---
  'settings.title': 'Settings',
  'settings.tabYou': 'You',
  'settings.tabAi': 'Photo analysis',
  'settings.tabAccount': 'Account & data',
  'settings.blurbYou': 'Your goal, your weight, and the language everything speaks.',
  'settings.blurbAi': 'Which model reads your photos, and on whose key.',
  'settings.blurbAccount': 'Where your data lives, and who it belongs to.',
  'settings.yourGoal': 'Your goal',
  'settings.goalTail':
    'It sets the daily line on Today and what the week is measured against — nothing else changes.',
  'settings.weight': 'Weight',
  'settings.current': 'Current',
  'settings.target': 'Target',
  'settings.lastRead': 'Last recorded {date}.',
  'settings.notRecorded': 'Not recorded yet.',

  'settings.account': 'Account',
  'settings.language': 'Language',
  'settings.languageHint':
    'Changes the app immediately, and asks the model to answer in the same language. Kept on this device.',
  'settings.apiKey': 'OpenAI API key',
  'settings.accuracyOrSpeed': 'Accuracy or speed',
  'settings.analysis': 'Analysis',
  'settings.photos': 'Photos',
  'settings.storage': 'Where your data is saved',
  'settings.saved': 'Saved',

  // --------------------------------------------------------------- common ---
  'common.gotIt': 'Got it',
  'common.retry': 'Try again',
  'common.slot.NIGHT': 'Night',
  'common.slot.BREAKFAST': 'Breakfast',
  'common.slot.LUNCH': 'Lunch',
  'common.slot.DINNER': 'Dinner',
  'common.slot.SNACK': 'Snack',
  'common.slotWord.NIGHT': 'tonight',
  'common.slotWord.BREAKFAST': 'breakfast',
  'common.slotWord.LUNCH': 'lunch',
  'common.slotWord.DINNER': 'dinner',
  'common.slotWord.SNACK': 'a snack',
  'common.slotLabel.NIGHT': 'night meal',
  'common.slotLabel.BREAKFAST': 'breakfast',
  'common.slotLabel.LUNCH': 'lunch',
  'common.slotLabel.DINNER': 'dinner',
  'common.slotLabel.SNACK': 'snack',

  // ---------------------------------------------------------------- app ----
  'app.storageUnavailable': 'Storage unavailable',
  'app.storageUnavailableBody':
    'This app stores your data in the browser, and the browser refused. {error}',
  'app.opening': 'Opening your data…',
  'app.notBuilt': 'Not built yet — {phase}.',
  'phase.training': 'a later slice — workout logging',
  'phase.recovery': 'slice 4 — Garmin import',
  'phase.body': 'a later slice — body measurements',
  'phase.health': 'a later slice — clinical data',

  'day.today': 'Today',
  'day.yesterday': 'Yesterday',

  // ----------------------------------------------------------- docked bar --
  'bar.analyzing': 'Analyzing your {label}',
  'bar.estimated': '{label} estimated',
  'bar.view': 'View',
  'bar.review': 'Review',

  // ------------------------------------------------------------ conflicts --
  'conflict.twoSources': 'Two sources disagree',
  'conflict.showing': 'Showing {source} until you confirm one.',
  'conflict.mealTwoPlaces': 'This meal was edited in two places',
  'conflict.mealBoth':
    'Both edits started from version {version}. Pick the one to keep — the other stays in your history either way.',
  'conflict.itemCount': { one: '{count} item', other: '{count} items' } as Plural,
  'conflict.noItems': 'No items',

  // ------------------------------------------------------------- failures --
  'unavailable.title': 'Can’t reach your data',
  'unavailable.signedIn':
    'Your records are in your account, and this device could not load them. Nothing is lost.',
  'unavailable.local': 'This browser would not give up its stored data. Nothing is lost.',
  'write.failed': 'Couldn’t save {what}',
  'write.failedBody': '{message}. Nothing was lost — try again.',

  // ------------------------------------------------------------- sources ---
  'source.USER': 'Manual',
  'source.GARMIN': 'Garmin',
  'source.APPLE_HEALTH': 'Apple Health',
  'source.HEALTH_CONNECT': 'Health Connect',
  'source.SMART_SCALE': 'Scale',
  'source.AI_ESTIMATE': 'AI estimate',
  'source.LAB_DOCUMENT': 'Lab report',

  // ------------------------------------------------------------ adoption ---
  'adopt.title': 'Bring your data with you',
  'adopt.moving': 'Moving your records…',
  'adopt.offer':
    'This browser holds {records} you logged{days}. Move them into your account so they follow you between devices?',
  'adopt.recordCount': { one: '{count} record', other: '{count} records' } as Plural,
  'adopt.acrossDays': ' across {days}',
  'adopt.dayCount': { one: '{count} day', other: '{count} days' } as Plural,
  'adopt.sampleStays': 'The sample day stays behind, and your local copies are not deleted.',
  'adopt.moved': 'Moved {what} into your account.',
  'adopt.mealCount': { one: '{count} meal', other: '{count} meals' } as Plural,
  'adopt.measurementCount': { one: '{count} measurement', other: '{count} measurements' } as Plural,
  'adopt.and': '{meals} and {measurements}',
  'adopt.alreadyThere': '{count} were already there.',
  'adopt.untouched': 'The copies in this browser are left untouched.',
  'adopt.move': 'Move my data',
  'adopt.movingButton': 'Moving…',
  'adopt.notNow': 'Not now',
  'adopt.failed': '{message} — nothing was lost, try again.',

  // ------------------------------------------------------- model picker ----
  'trial.left': '{count} left',
  'trial.usedUp': 'used up',
  'trial.availableAgain': 'Available again with your own key, or on a plan later.',

  // ---------------------------------------------------------- manual form --
  'form.foodPlaceholder': 'Grilled chicken breast',
  'form.kcal': 'kcal',

  // ------------------------------------------------------------- sign in ---
  'signin.title': 'Sign in',
  'signin.subtitle': 'So your data follows you between devices instead of living in one browser.',
  'signin.email': 'Email',
  'signin.emailPlaceholder': 'you@example.com',
  'signin.firstTime': 'First time signing in creates your account. No password to remember.',
  'signin.sending': 'Sending…',
  'signin.emailMeCode': 'Email me a code',
  'signin.check': 'Check {email} and click the link — that signs you in on this device.',
  'signin.closePage': 'You can close this page; the link brings you back signed in.',
  'signin.orCode': 'Or enter a code, if your email shows one',
  'signin.codePlaceholder': '123456',
  'signin.checking': 'Checking…',
  'signin.withCode': 'Sign in with code',
  'signin.anotherEmail': 'Use another email',
  'signin.signedOutNote':
    'Signed out, the app still works — everything stays in this browser, and nothing is sent anywhere. Your API key never syncs either way.',
  'signin.errSend': 'Could not send the code',
  'signin.errCode': 'That code was not accepted',

  // --------------------------------------------------------------- today ---
  'today.steps': 'Steps',
  'today.workout': 'Workout',
  'today.strength': 'Strength · {minutes} min',
  'today.restDay': 'Rest day',
  'today.activeKcal': 'Active kcal',
  'today.burnedTotal': 'Burned, total',
  'today.yoursToSet': 'Yours to set',
  'today.trackerRead': 'the tracker read {count}',
  'today.setIt': 'Set it',
  'today.untilYouSet': 'Until you set this, nothing is compared against it',
  'today.lessBurned': 'Less burned',
  'today.moreBurned': 'More burned',

  'today.sleep': 'Sleep',
  'today.hrv': 'HRV',
  'today.restingHr': 'Resting HR',
  'today.weight': 'Weight',
  'today.bodyFat': 'Body fat',
  'today.nothingToday': 'Nothing logged yet today.',
  'today.nothingThatDay': 'Nothing was logged on this day.',
  'today.unconfirmed': {
    one: 'One item is an unconfirmed AI estimate —',
    other: '{count} items are unconfirmed AI estimates —',
  } as Plural,
  'today.reviewInNutrition': 'review in Food',
  'today.aiTitle': 'See what changed this week',

  // ------------------------------------------------------- log, remainder --
  'log.notice.accuracyTitle': 'Accuracy or speed — your choice',
  'log.notice.accuracyBody':
    'Photos are read by the most accurate model to start with, which takes up to a minute. You can trade some accuracy for a much faster answer in Settings, any time.',
  'log.notice.seeOptions': 'See the options',
  'log.notice.switchedTitle': 'Switched to {model}',
  'log.notice.switchedBody':
    'Your next photos are read by a quicker model — about fifteen seconds instead of a minute, and still good. You have {count} analyses left on the most accurate one; save them for a crowded plate.',
  'log.notice.changeIt': 'Change it',
  'log.exhausted.title': 'That was the last one on us',
  'log.exhausted.body':
    'The first {count} analyses were run on our account, so you could try the app without setting anything up. To keep going, connect your own OpenAI key — it takes a couple of minutes, and analysing a meal costs a fraction of a cent.',
  'log.exhausted.connectKey': 'Connect my key',
  'log.exhausted.byHand': 'Log by hand instead',
  'log.exhausted.stillText': 'What you wrote is still here — connect a key and press Try again.',
  'log.exhausted.stillPhoto':
    'Your photo is still here — connect a key and press Analyze to pick up where you left off.',
  'log.setup.label': 'One-time setup',
  'log.setup.body':
    'Photo and text estimates run on your own OpenAI key, so add one to switch them on. A meal costs a fraction of a cent to analyze.',
  'log.setup.addKey': 'Add API key',
  'log.details.whatPlaceholder': 'Cottage cheese 5%',
  'log.details.gramsPlaceholder': '250',

  // ------------------------------------------------------------ settings ---
  'settings.noBackend': 'No backend is configured in this build, so everything stays in this browser.',
  'settings.signedInAs': 'Signed in as',
  'settings.followsYou': 'Your data is saved to your account and follows you between devices.',
  'settings.signOut': 'Sign out',
  'settings.notSignedIn':
    'Not signed in. Everything you log stays in this browser — clearing your browsing data erases it, and no other device can see it.',
  'settings.signIn': 'Sign in',
  'settings.key': 'Key',
  'settings.keyPlaceholder': 'sk-…',
  'settings.saveKey': 'Save key',
  'settings.testKey': 'Test key',
  'settings.testing': 'Testing…',
  'settings.noKeyTitle': 'Don’t have a key yet?',
  'settings.step1': 'and sign in.',
  'settings.step1Open': 'Open',
  'settings.step2Add': 'Add credit under',
  'settings.step2Tail': '— $5 is the minimum, and set a spending limit while you are there.',
  'settings.billing': 'Billing',
  'settings.step3': 'Create a new secret key and copy it straight away. OpenAI shows it once.',
  'settings.notIncludedBold': 'A ChatGPT subscription does not include this.',
  'settings.notIncluded':
    'The API is a separate product on separate billing, and paying for Plus grants no API access at all. The upside is that it is cheap: analysing a photo costs a fraction of a cent, so a few meals a day runs to pennies a month.',
  'settings.storedHead': 'Your key is stored',
  'settings.storedBold': 'on this device only',
  'settings.storedTail':
    ', in this browser. It is sent to OpenAI and nowhere else, and it is never included in any backup or sync.',
  'settings.scriptsHead':
    'Anything able to run scripts in this browser could read it, so use a dedicated key with a',
  'settings.spendingLimit': 'spending limit',
  'settings.scriptsTail': ', and avoid shared computers. Photos you analyze are handled under',
  'settings.dataPolicies': 'OpenAI’s API data policies',
  'settings.accuracyBody':
    'More accurate models look harder at a crowded plate and take longer. Choose per your patience — you can change this any time.',
  'settings.model': 'Model',
  'settings.refreshList': 'Refresh list',
  'settings.loading': 'Loading…',
  'settings.notInList': '{model} (not in your account list)',
  'settings.canRead': 'Can read photos',
  'settings.textOnly': 'Text only — cannot read photos',
  'settings.typeMyself': 'Type a model ID myself…',
  'settings.pickFromList': 'Pick from my account list instead',
  'settings.loadingModels': 'Loading the models on your account…',
  'settings.modelsCount':
    '{vision} of your {total} chat models can read a photo. Capability is inferred from the name — OpenAI does not publish it — so a rejected model may just be mislabelled here.',
  'settings.saveThenRefresh': 'Save your key and hit Refresh list to load the models on your account.',
  'settings.addKeyToLoad': 'Add a key above to load the models on your account.',
  'settings.defaultIs':
    'Default is {model}. A larger model reads a plate more carefully and costs more per photo.',
  'settings.autoAnalyze': 'Analyze automatically after taking a photo',
  'settings.autoAnalyzeHint': 'Off means one extra tap, and no request you did not ask for.',
  'settings.photosBody':
    'Meal photos are never saved — not on this device, not anywhere else. Each photo is sent for analysis once and then discarded. What is kept is the estimate, its confidence, and a record of the photo’s size and fingerprint.',
  'settings.storageAccount':
    'In your account. Every device you sign in on sees the same data, and it survives clearing this browser.',
  'settings.storageAccountNote':
    'Records are only ever added, never overwritten — corrections are new entries that supersede old ones, so nothing you log can be silently lost or rewritten. Your OpenAI key is the exception to all of this: it stays on this device and is never sent to your account.',
  'settings.storageLocal': 'In this browser only{usage}.',
  'settings.storageUsage': ', currently {usage}',
  'settings.storageLocalNote':
    'Clearing your browsing data erases it, and no other device can see it. Signing in copies it to your account and keeps it in step from then on.',
  'settings.notBuiltYet': 'not built yet',
  'settings.exportNote':
    'Exporting everything as a JSON file, so you hold a copy independently of both this browser and the account.',

  // ------------------------------------------------------------ sample day --
  // Written into the store once, on first run, so a fresh install has a day to
  // look at. Frozen in whatever language was chosen then — which is correct:
  // once written they are records like any other, exactly as a real meal is.
  'seed.eggsAndOats': 'Eggs and oats',
  'seed.grilledChicken': 'Grilled chicken breast',
  'seed.riceAndVegetables': 'Rice and vegetables',
  'seed.salmonPotatoesSalad': 'Salmon, potatoes, salad',
  'seed.benchPress': 'Bench press',
  'seed.barbellRow': 'Barbell row',

  // ------------------------------------------------------------- adjusting --
  'adjust.readFromPhoto': 'Read from your photo a moment ago.',
  'adjust.lead':
    'Change the weights before this becomes a meal — nutrients follow whatever you set, and nothing is saved yet.',
  'adjust.yourNumbers': 'Your numbers',
  'adjust.unchanged': 'unchanged',
  'adjust.deltaKcal': '{sign}{count} kcal vs the estimate',
  'adjust.asEstimated': 'as estimated',
  'adjust.deltaGrams': '{sign}{count} g',
  'adjust.sureOfThis': '{count}% sure of this one',
  'adjust.notOnPlate': 'Not on the plate',
  'adjust.putBack': 'Put it back',
  'adjust.somethingMissed': 'Something it missed',
  'adjust.newFoodName': 'What was it?',
  'adjust.ratios':
    'Your weights, the model’s ratios: setting 200 g of chicken scales that row’s protein, carbs and fat by the same amount. The confidence figure stays the model’s — it does not follow your edit.',
  'adjust.backToEstimate': 'Back to the estimate',
  'adjust.letItAsk': 'Let it ask instead',
  'adjust.grams': 'Grams of {food}',
  'adjust.less': 'Less {food}',
  'adjust.more': 'More {food}',

  // ------------------------------------------------------------- insights --
  'insights.reading': 'Reading your week…',
  'insights.takesAMoment': 'Seven days of meals, your totals and your goal — usually under a minute.',
  'insights.willSend': 'Sends {meals} meals across 7 days, your totals and your goal. No name, no account, nothing that says who you are.',
  'insights.observations': 'What is in the data',
  'insights.suggestions': 'Worth trying',
  'insights.nothingToSuggest': 'Nothing worth changing on this evidence.',
  'insights.confidence': '{count}% sure',
  'insights.lowConfidence': 'Thin week — worth reading as a hint rather than a verdict.',
  'insights.askAgain': 'Ask again',
  'insights.dismiss': 'Close',
  'insights.failed': 'Could not read your week',
  'insights.tryAgain': 'Try again',


  // ------------------------------------------------- the week, when blocked --
  'week.blockedBurnTitle': 'Set what you burn first',
  'week.blockedBurnBody':
    'The week compares what you ate against what you burned. Without a burn figure there is nothing to compare, so the chart and the summary stay away rather than guess at one.',
  'week.blockedGoalTitle': 'Pick what you are working towards',
  'week.blockedGoalBody':
    'A week can be added up without a goal, but not judged. Choose one and the same seven days get a target to be measured against.',
  'week.setItOnTheDay': 'Set it on the day',


  // ---------------------------------------------------------- the week view --
  'week.day': 'Day',
  'week.week': 'Week',
  'week.title': 'This week',
  'week.kcalUnit': 'kcal',
  'week.chartTitle': 'Eaten against burned',
  'week.eaten': 'Eaten',
  'week.burned': 'Burned',
  'week.perDay': '{total} · {average}/day',
  'week.levelSentence': 'You ate exactly what you burned across the seven days.',
  'week.underSentence': 'You ate {count} kcal less than you burned across the seven days.',
  'week.overSentence': 'You ate {count} kcal more than you burned across the seven days.',
  'week.againstGoal': 'Against your goal',
  'week.aimsFor': 'Aims for {aim}, and you landed at {net}.',
  'week.levelWeek': 'a level week',
  'week.aimOver': '{count} kcal over the week',
  'week.noTarget': 'No calorie target on this goal — the balance is here for context, not as a score.',
  'week.noGoalYet': 'No goal set yet. Pick one on the day view and the week gets something to measure against.',
  'week.onTrack': 'On track',
  'week.short': '{count} kcal short',
  'week.off': '{count} kcal off',
  'week.ungraded': 'Nothing to grade',
  'week.openTheWeek': 'Open the week',
  'week.sevenDays': 'Eaten against burned, seven days at a time.',
  'week.insightsTitle': 'Insights on this week',
  'week.insightsBody':
    'Sends these seven days and your goal, and reads back what to change. Nothing is sent until you ask.',
  'week.askForInsights': 'Ask for insights',
  'week.noBurnData':
    'No calories burned recorded this week — set them on the day view and the balance becomes real.',
  'week.partialBurn': 'Burn recorded on {count} of 7 days; the target is scaled to match.',


  // ------------------------------------------------------------- the plan --
  'plan.youAreThere': 'You are there.',
  'plan.toLose': '{count} kg to lose',
  'plan.toGain': '{count} kg to gain',
  'plan.less': 'Less {name}',
  'plan.more': 'More {name}',

  'objective.LOSE_WEIGHT': 'Lose weight',
  'objective.LOSE_FAT': 'Lose fat, keep muscle',
  'objective.BUILD_MUSCLE': 'Build muscle',
  'objective.MAINTAIN': 'Keep this weight',
  'objective.FITNESS': 'General fitness',
  'objective.aim.LOSE_WEIGHT': 'A 500 kcal deficit a day — about 0.5 kg a week.',
  'objective.aim.LOSE_FAT': 'A gentler 350 kcal deficit with protein held high.',
  'objective.aim.BUILD_MUSCLE': 'A small 250 kcal surplus, heaviest on training days.',
  'objective.aim.MAINTAIN': 'Eat what you burn, week over week.',
  'objective.aim.FITNESS': 'No calorie target — move most days, eat evenly.',
  'objective.none': 'Not set',
  'objective.chooseAim': 'Pick what you are working towards.',


  // ------------------------------------------------------- entering by hand --


  // ------------------------------------------------------ language prompt --
  'chooseLang.title': 'Which language should this be in?',
  'chooseLang.body':
    'It applies everywhere, including the answers the model gives you, and follows you to any device you sign in on. You can change it in Settings whenever you like.',
  'chooseLang.later': 'Decide later',


  // ---------------------------------------------------------- conversation --
  'ask.summaryKcal': '{kcal} kcal',
  'ask.usable': 'A usable estimate already. One thing would sharpen it, and answering takes a tap.',
  'ask.appName': 'Timeline',
  'ask.justNow': 'just now',
  'ask.ownWords': 'Or say it in your own words — anything about the plate helps',
  'ask.send': 'Send',
  'ask.skip': 'Skip — save as it is',
  'ask.neverBlocks': 'Questions never block saving. Skipping keeps the estimate exactly as read.',
  'ask.answerOrCorrect': 'Answer, correct me, or add something else',

  'revised.label': 'Estimate · revision {count}',
  'revised.updated': 'Updated from your answer',
  'revised.unchanged': 'unchanged',
  'revised.delta': '{sign}{count}',
  'revised.deltaG': '{sign}{count} g',
  'revised.addedFrom': 'Added from what you said',
  'revised.noExtra': 'No extra item needed',
  'revised.adjustByHand': 'Adjust by hand',
  'revised.howItGotHere': 'How it got here',
  'revised.oneConversation':
    'Each answer re-estimates from the photo plus everything said so far — it is one conversation, not a new guess. Only the last revision is saved, with the exchange kept beside it.',


} as const

/** Every key the app may ask for, and the shape its value must have. */
export type StringKey = keyof typeof en
export type Dictionary = { [K in StringKey]: (typeof en)[K] extends Plural ? Plural : string }

const he: Dictionary = {
  // ---------------------------------------------------------------- shell --
  'nav.log': 'רישום',
  'nav.today': 'היום',
  'nav.food': 'אוכל',
  'nav.settings': 'הגדרות',
  'nav.overview': 'סקירה',
  'nav.track': 'מעקב',
  'nav.app': 'אפליקציה',
  'nav.training': 'אימונים',
  'nav.recovery': 'התאוששות',
  'nav.body': 'גוף',
  'nav.health': 'בריאות',

  // ----------------------------------------------------------------- log ---
  'log.title': 'רישום',
  'log.subtitle': 'שלוש דרכים להתחיל. תמונה היא ברירת המחדל.',
  'log.mode.photo': 'תמונה',
  'log.mode.write': 'כתיבה',
  'log.mode.again': 'שוב',
  'log.mode.photo.description': 'לצלם את מה שאתם אוכלים',
  'log.mode.write.description': 'לתאר במילים מה אכלתם',
  'log.mode.again.description': 'לרשום משהו שכבר אכלתם בעבר',
  'log.modes.label': 'איך לרשום את הארוחה הזו',

  'log.photo.take': 'צילום תמונה',
  'log.photo.orLibrary': 'או בחירה מגלריית התמונות',
  'log.photo.addNote': 'הוספת הערה',
  'log.photo.noteHint': 'לא חובה, ונשלח למודל יחד עם התמונה — "בלי שמן", "חצי מנה".',
  'log.photo.notePlaceholder': 'בלי שמן, חצי מנה, הרוטב בצד…',
  'log.photo.noteLabel': 'הערה על הארוחה הזו',
  'log.photo.noteSent': 'יישלח עם התמונה הבאה שתצלמו, ויתייחסו אליו כעובדה ולא כניחוש.',
  'log.photo.usualNow': 'הרגיל עכשיו',
  'log.photo.usualHint': 'הדבר שאתם אוכלים בשעה הזו לרוב — הקשה אחת, בלי מצלמה.',
  'log.photo.usualHintLink': 'כל השאר שאתם חוזרים עליו נמצא תחת',

  'log.write.placeholder': 'שתי ביצים על טוסט מחמצת וקפה שחור',
  'log.write.label': 'מה אכלתם',
  'log.write.estimate': 'הערכה',
  'log.write.hint': 'כמה שניות, ובטווח שגיאה רחב יותר מתמונה.',
  'log.write.recent': 'דברים שתיארתם בעבר, מוכנים לשליחה חוזרת.',
  'log.write.forget': 'שכחו את זה',

  'log.analyzing.reading': 'קוראים את הצלחת…',
  'log.analyzing.usually': 'בדרך כלל בערך 15 שניות',
  'log.analyzing.working': 'מחשבים…',
  'log.analyzing.cancel': 'ביטול',
  'log.analyzing.leave': 'אפשר לצאת',
  'log.analyzing.whyTitle': 'למה זה נראה ככה',
  'log.analyzing.why':
    'ההמתנה מוצגת במקום שהעיניים שלכם כבר נמצאות בו — על התמונה — ולא בשורת טקסט קטנה מתחתיה. יציאה מהמסך לא מבטלת כלום: העבודה ממשיכה, ופס נשאר מעוגן מעל סרגל הלשוניות עד שהיא נגמרת.',
  'log.photoAlt': 'הארוחה שצילמתם',

  'log.details.show': 'הוספת פרטים (לא חובה)',
  'log.details.hide': 'הסתרת פרטים',
  'log.details.what': 'מה זה',
  'log.details.whatHint': 'ציון השם מונע מהמודל לנחש את הזיהוי.',
  'log.details.grams': 'סך הגרמים',
  'log.details.gramsHint': 'שקילה היא השיפור הגדול ביותר בדיוק.',
  'log.details.time': 'שעה',
  'log.details.meal': 'ארוחה',

  'log.action.analyze': 'ניתוח',
  'log.action.tryAgain': 'ניסיון נוסף',
  'log.action.discardPhoto': 'ביטול התמונה',
  'log.action.startOver': 'להתחיל מחדש',
  'log.action.edit': 'עריכה',
  'log.saved': 'נשמר.',
  'log.savedLink': 'לצפייה בהיום',

  'log.error.photo': 'משהו השתבש בקריאת התמונה',
  'log.error.text': 'משהו השתבש בקריאת התיאור שלכם',
  'log.error.stillHereText': 'מה שכתבתם',
  'log.error.stillHerePhoto': 'התמונה והפרטים שלכם',
  'log.error.retryOr': 'עדיין כאן — אפשר לנסות שוב, או',
  'log.error.logByHand': 'לרשום ידנית',

  // -------------------------------------------------------------- estimate --
  'estimate.label': 'הערכה',
  'estimate.labelFromText': 'הערכה מהמילים שלכם',
  'estimate.calories': 'קלוריות',
  'estimate.protein': 'חלבון',
  'estimate.carbs': 'פחמימות',
  'estimate.fat': 'שומן',
  'estimate.assumed': 'בהנחה של',
  'estimate.yours': 'שלכם',
  'estimate.adjust': 'תיקון המספרים',
  'estimate.adjustAgain': 'תיקון נוסף',
  'estimate.food': 'מזון',
  'estimate.grams': 'גרם',
  'estimate.proteinG': 'חלבון בגרמים',
  'estimate.carbsG': 'פחמימות בגרמים',
  'estimate.fatG': 'שומן בגרמים',
  'estimate.removeFood': 'הסרת המזון הזה',
  'estimate.keepFood': 'להשאיר את המזון הזה',
  'estimate.allRemoved': 'כל המזונות הוסרו — לא נשאר מה לשמור. השאירו אחד, או בטלו את ההערכה כולה.',
  'estimate.savedNote': 'נשמר כהערכה שאפשר לאשר, לתקן או למחוק במסך התזונה.',
  'estimate.savedNoteCorrected':
    'התיקונים שלכם נשמרים כפי שהוזנו; מה שלא נגעתם בו נשאר הערכה שאפשר לאשר במסך התזונה.',
  'estimate.lowConfidence': 'ביטחון נמוך — כדאי לבדוק את המספרים לפני שסומכים עליהם.',
  'estimate.fromTextNote': 'הביטחון נמוך מזה של תמונה — שום דבר לא נראה, ולכן המנות הן הנחה.',
  'estimate.downgraded': 'נקרא על ידי המודל המהיר — הניתוחים המדויקים ביותר שלכם נוצלו.',
  'estimate.save': 'שמירת הארוחה',
  'estimate.saving': 'שומרים…',
  'estimate.discard': 'ביטול',
  'estimate.tryAnotherPhoto': 'תמונה אחרת',
  'estimate.describeSomethingElse': 'לתאר משהו אחר',

  'estimate.question.label': 'התשובה שלכם',

  // --------------------------------------------------------------- usuals --
  'usuals.forSlot': 'הרגיל ל{slot}',
  'usuals.everything': 'כל מה שרשמתם',
  'usuals.oneTap': 'הקשה אחת רושמת — בלי תמונה, בלי המתנה, בלי הערכה לאשר.',
  'usuals.none': 'עוד אין רגיל ל{slot} — צלמו אחד והוא יופיע כאן בפעם הבאה.',
  'usuals.seeAll': 'כל הרגילים',
  'usuals.backTo': 'חזרה ל{slot}',
  'usuals.search': 'חיפוש בכל מה שרשמתם',
  'usuals.noMatch': 'שום דבר שרשמתם לא תואם ל"{query}".',
  'usuals.yesterday': 'אתמול',
  'usuals.repeatDay': 'לחזור על היום',
  'usuals.repeatSoFar': 'לחזור על היום עד עכשיו',
  'usuals.laterLeftOut': 'ארוחות מאוחרות יותר יושמטו עד שיגיע זמנן.',
  'usuals.singleFoods': 'מזונות בודדים, הקישו להוספה',
  'usuals.logThem': 'לרשום אותם',
  'usuals.cancel': 'ביטול',
  'usuals.selected': '{count} נבחרו',
  'usuals.unconfirmed': 'הערכה לא מאושרת',
  'usuals.loggedTimes': { one: 'נרשם {count} פעם לאחרונה', other: 'נרשם {count} פעמים לאחרונה' },
  'usuals.mealCount': { one: 'ארוחה {count}', other: '{count} ארוחות' },
  'usuals.logged': '{label} נרשם',
  'usuals.loggedNote': 'בלי תמונה, בלי הערכה לאשר.',
  'usuals.undo': 'ביטול',
  'usuals.dismiss': 'סגירה',
  'usuals.fromYesterday': '{count} מאתמול',
  'usuals.looking': 'מחפשים במה שרשמתם…',

  'when.today': 'היום, {time}',
  'when.yesterday': 'אתמול, {time}',
  'when.weeksAgo': { one: 'לפני שבוע', other: 'לפני {count} שבועות' },

  // -------------------------------------------------------------- nutrition --
  'nutrition.title': 'אוכל',
  'nutrition.todaysTotal': 'הסך הכל להיום',
  'nutrition.logAMeal': 'רישום ארוחה',
  'nutrition.byHand': 'ידנית',
  'nutrition.addAnotherFood': 'הוספת מזון נוסף',
  'nutrition.confirm': 'אישור',
  'nutrition.editMeal': 'עריכת {slot}',
  'nutrition.deleteMeal': 'מחיקת {slot}',
  'nutrition.nothingLogged': 'עוד לא נרשם דבר ליום הזה.',
  'nutrition.loggedCount': 'נרשמו ({count})',
  'nutrition.gProtein': '{grams} גרם חלבון',
  'nutrition.deleted': '{slot} נמחקה · {kcal} קלוריות ירדו מהסך הכל של היום',

  'editor.editing': 'עריכת {slot}',
  'editor.loggedAt': 'נרשם ב{time}, {origin}',
  'editor.originHand': 'הוזן ידנית',
  'editor.originUnconfirmed': 'הוערך, טרם אושר',
  'editor.originConfirmed': 'מהערכה שאישרתם',
  'editor.allRemoved': 'כל המזונות הוסרו — שמירה עכשיו תמחק את הארוחה. אפשר לבטל.',
  'editor.ratioHint':
    'מילוי מוסיף 10% לגרמים וכל הערכים נגררים ביחס ישר. הקלדה על מספר כלשהו מנתקת אותו.',
  'editor.refill': 'מילוי',
  'editor.refillTitle': 'מילוי — הוספת 10% לכל ערך',
  'editor.backTo': 'חזרה ל-{grams} גרם',
  'editor.saveChanges': 'שמירת השינויים',
  'editor.cancel': 'ביטול',
  'editor.delete': 'מחיקת הארוחה',

  // --------------------------------------------------------------- today ----
  'today.nutrition': 'תזונה',
  'today.activity': 'פעילות',
  'today.recovery': 'התאוששות',
  'today.body': 'גוף',
  'today.meals': 'ארוחות',
  'today.previousDay': 'היום הקודם',
  'today.nextDay': 'היום הבא',
  'today.backToToday': 'חזרה להיום',

  // ------------------------------------------------------------- settings ---
  'settings.title': 'הגדרות',
  'settings.tabYou': 'אתם',
  'settings.tabAi': 'ניתוח תמונות',
  'settings.tabAccount': 'חשבון ונתונים',
  'settings.blurbYou': 'היעד שלכם, המשקל שלכם, והשפה שהכל מדבר בה.',
  'settings.blurbAi': 'איזה מודל קורא את התמונות שלכם, ועל חשבון איזה מפתח.',
  'settings.blurbAccount': 'איפה הנתונים שלכם נמצאים, ולמי הם שייכים.',
  'settings.yourGoal': 'היעד שלכם',
  'settings.goalTail': 'זה קובע את הקו היומי במסך היום ומול מה השבוע נמדד — שום דבר אחר לא משתנה.',
  'settings.weight': 'משקל',
  'settings.current': 'נוכחי',
  'settings.target': 'יעד',
  'settings.lastRead': 'נרשם לאחרונה ב{date}.',
  'settings.notRecorded': 'עוד לא נרשם.',

  'settings.account': 'חשבון',
  'settings.language': 'שפה',
  'settings.languageHint':
    'משנה את האפליקציה מיד, ומבקש מהמודל לענות באותה שפה. נשמר במכשיר הזה.',
  'settings.apiKey': 'מפתח API של OpenAI',
  'settings.accuracyOrSpeed': 'דיוק או מהירות',
  'settings.analysis': 'ניתוח',
  'settings.photos': 'תמונות',
  'settings.storage': 'איפה הנתונים שלכם נשמרים',
  'settings.saved': 'נשמר',

  // --------------------------------------------------------------- common ---
  'common.gotIt': 'הבנתי',
  'common.retry': 'ניסיון נוסף',
  'common.slot.NIGHT': 'לילה',
  'common.slot.BREAKFAST': 'ארוחת בוקר',
  'common.slot.LUNCH': 'ארוחת צהריים',
  'common.slot.DINNER': 'ארוחת ערב',
  'common.slot.SNACK': 'חטיף',
  'common.slotWord.NIGHT': 'הלילה',
  'common.slotWord.BREAKFAST': 'ארוחת בוקר',
  'common.slotWord.LUNCH': 'ארוחת צהריים',
  'common.slotWord.DINNER': 'ארוחת ערב',
  'common.slotWord.SNACK': 'חטיף',
  'common.slotLabel.NIGHT': 'ארוחת לילה',
  'common.slotLabel.BREAKFAST': 'ארוחת בוקר',
  'common.slotLabel.LUNCH': 'ארוחת צהריים',
  'common.slotLabel.DINNER': 'ארוחת ערב',
  'common.slotLabel.SNACK': 'חטיף',

  // ---------------------------------------------------------------- app ----
  'app.storageUnavailable': 'האחסון אינו זמין',
  'app.storageUnavailableBody':
    'האפליקציה שומרת את הנתונים שלכם בדפדפן, והדפדפן סירב. {error}',
  'app.opening': 'פותחים את הנתונים שלכם…',
  'app.notBuilt': 'עוד לא נבנה — {phase}.',
  'phase.training': 'שלב מאוחר יותר — רישום אימונים',
  'phase.recovery': 'שלב 4 — ייבוא מגרמין',
  'phase.body': 'שלב מאוחר יותר — מדידות גוף',
  'phase.health': 'שלב מאוחר יותר — נתונים קליניים',

  'day.today': 'היום',
  'day.yesterday': 'אתמול',

  // ----------------------------------------------------------- docked bar --
  'bar.analyzing': 'מנתחים את {label}',
  'bar.estimated': '{label} הוערכה',
  'bar.view': 'הצגה',
  'bar.review': 'סקירה',

  // ------------------------------------------------------------ conflicts --
  'conflict.twoSources': 'שני מקורות חלוקים',
  'conflict.showing': 'מוצג {source} עד שתאשרו אחד.',
  'conflict.mealTwoPlaces': 'הארוחה הזו נערכה בשני מקומות',
  'conflict.mealBoth':
    'שתי העריכות יצאו מגרסה {version}. בחרו את זו שנשמרת — השנייה נשארת בהיסטוריה שלכם כך או כך.',
  'conflict.itemCount': { one: 'פריט {count}', other: '{count} פריטים' },
  'conflict.noItems': 'אין פריטים',

  // ------------------------------------------------------------- failures --
  'unavailable.title': 'לא מצליחים להגיע לנתונים שלכם',
  'unavailable.signedIn':
    'הרשומות שלכם נמצאות בחשבון, והמכשיר הזה לא הצליח לטעון אותן. שום דבר לא אבד.',
  'unavailable.local': 'הדפדפן הזה לא מסר את הנתונים השמורים בו. שום דבר לא אבד.',
  'write.failed': 'לא הצלחנו לשמור {what}',
  'write.failedBody': '{message}. שום דבר לא אבד — אפשר לנסות שוב.',

  // ------------------------------------------------------------- sources ---
  'source.USER': 'ידני',
  'source.GARMIN': 'גרמין',
  'source.APPLE_HEALTH': 'Apple Health',
  'source.HEALTH_CONNECT': 'Health Connect',
  'source.SMART_SCALE': 'משקל',
  'source.AI_ESTIMATE': 'הערכת AI',
  'source.LAB_DOCUMENT': 'דוח מעבדה',

  // ------------------------------------------------------------ adoption ---
  'adopt.title': 'קחו את הנתונים שלכם אתכם',
  'adopt.moving': 'מעבירים את הרשומות שלכם…',
  'adopt.offer':
    'בדפדפן הזה שמורות {records} שרשמתם{days}. להעביר אותן לחשבון שלכם כדי שילוו אתכם בין מכשירים?',
  'adopt.recordCount': { one: 'רשומה {count}', other: '{count} רשומות' },
  'adopt.acrossDays': ' על פני {days}',
  'adopt.dayCount': { one: 'יום {count}', other: '{count} ימים' },
  'adopt.sampleStays': 'יום הדוגמה נשאר מאחור, והעותקים המקומיים שלכם לא נמחקים.',
  'adopt.moved': 'הועברו {what} לחשבון שלכם.',
  'adopt.mealCount': { one: 'ארוחה {count}', other: '{count} ארוחות' },
  'adopt.measurementCount': { one: 'מדידה {count}', other: '{count} מדידות' },
  'adopt.and': '{meals} ו{measurements}',
  'adopt.alreadyThere': '{count} כבר היו שם.',
  'adopt.untouched': 'העותקים בדפדפן הזה נשארים כמו שהם.',
  'adopt.move': 'להעביר את הנתונים שלי',
  'adopt.movingButton': 'מעבירים…',
  'adopt.notNow': 'לא עכשיו',
  'adopt.failed': '{message} — שום דבר לא אבד, אפשר לנסות שוב.',

  // ------------------------------------------------------- model picker ----
  'trial.left': 'נותרו {count}',
  'trial.usedUp': 'נוצל',
  'trial.availableAgain': 'יהיה זמין שוב עם מפתח משלכם, או במסלול בהמשך.',

  // ---------------------------------------------------------- manual form --
  'form.foodPlaceholder': 'חזה עוף בגריל',
  'form.kcal': 'קלוריות',

  // ------------------------------------------------------------- sign in ---
  'signin.title': 'כניסה',
  'signin.subtitle': 'כדי שהנתונים שלכם ילוו אתכם בין מכשירים ולא יישארו בדפדפן אחד.',
  'signin.email': 'אימייל',
  'signin.emailPlaceholder': 'you@example.com',
  'signin.firstTime': 'הכניסה הראשונה יוצרת לכם חשבון. אין סיסמה לזכור.',
  'signin.sending': 'שולחים…',
  'signin.emailMeCode': 'שלחו לי קוד במייל',
  'signin.check': 'בדקו את {email} ולחצו על הקישור — זה מכניס אתכם במכשיר הזה.',
  'signin.closePage': 'אפשר לסגור את הדף; הקישור יחזיר אתכם מחוברים.',
  'signin.orCode': 'או הזינו קוד, אם הוא מופיע במייל',
  'signin.codePlaceholder': '123456',
  'signin.checking': 'בודקים…',
  'signin.withCode': 'כניסה עם קוד',
  'signin.anotherEmail': 'אימייל אחר',
  'signin.signedOutNote':
    'גם בלי כניסה האפליקציה עובדת — הכל נשאר בדפדפן הזה, ושום דבר לא נשלח לשום מקום. מפתח ה-API שלכם לא מסתנכרן בשום מצב.',
  'signin.errSend': 'לא הצלחנו לשלוח את הקוד',
  'signin.errCode': 'הקוד הזה לא התקבל',

  // --------------------------------------------------------------- today ---
  'today.steps': 'צעדים',
  'today.workout': 'אימון',
  'today.strength': 'כוח · {minutes} דקות',
  'today.restDay': 'יום מנוחה',
  'today.activeKcal': 'קלוריות פעילות',
  'today.burnedTotal': 'נשרף, סך הכל',
  'today.yoursToSet': 'אתם קובעים',
  'today.trackerRead': 'המכשיר הראה {count}',
  'today.setIt': 'להזין',
  'today.untilYouSet': 'עד שתזינו את זה, שום דבר לא מושווה מולו',
  'today.lessBurned': 'פחות נשרף',
  'today.moreBurned': 'יותר נשרף',

  'today.sleep': 'שינה',
  'today.hrv': 'HRV',
  'today.restingHr': 'דופק במנוחה',
  'today.weight': 'משקל',
  'today.bodyFat': 'אחוז שומן',
  'today.nothingToday': 'עוד לא נרשם דבר היום.',
  'today.nothingThatDay': 'לא נרשם דבר ביום הזה.',
  'today.unconfirmed': {
    one: 'פריט אחד הוא הערכת AI לא מאושרת —',
    other: '{count} פריטים הם הערכות AI לא מאושרות —',
  },
  'today.reviewInNutrition': 'לסקירה במסך האוכל',
  'today.aiTitle': 'לראות מה השתנה השבוע',

  // ------------------------------------------------------- log, remainder --
  'log.notice.accuracyTitle': 'דיוק או מהירות — אתם בוחרים',
  'log.notice.accuracyBody':
    'תמונות נקראות בהתחלה על ידי המודל המדויק ביותר, וזה לוקח עד דקה. אפשר להחליף קצת דיוק בתשובה הרבה יותר מהירה בהגדרות, בכל רגע.',
  'log.notice.seeOptions': 'לראות את האפשרויות',
  'log.notice.switchedTitle': 'עברנו ל{model}',
  'log.notice.switchedBody':
    'התמונות הבאות שלכם ייקראו על ידי מודל מהיר יותר — בערך חמש עשרה שניות במקום דקה, ועדיין טוב. נותרו לכם {count} ניתוחים במודל המדויק ביותר; שמרו אותם לצלחת עמוסה.',
  'log.notice.changeIt': 'לשנות',
  'log.exhausted.title': 'זו הייתה האחרונה על חשבוננו',
  'log.exhausted.body':
    '{count} הניתוחים הראשונים רצו על החשבון שלנו, כדי שתוכלו לנסות את האפליקציה בלי להגדיר שום דבר. כדי להמשיך, חברו מפתח OpenAI משלכם — זה לוקח כמה דקות, וניתוח ארוחה עולה שבריר סנט.',
  'log.exhausted.connectKey': 'לחבר את המפתח שלי',
  'log.exhausted.byHand': 'לרשום ידנית במקום',
  'log.exhausted.stillText': 'מה שכתבתם עדיין כאן — חברו מפתח ולחצו על ניסיון נוסף.',
  'log.exhausted.stillPhoto':
    'התמונה שלכם עדיין כאן — חברו מפתח ולחצו על ניתוח כדי להמשיך מאיפה שהפסקתם.',
  'log.setup.label': 'הגדרה חד־פעמית',
  'log.setup.body':
    'הערכות מתמונה ומטקסט רצות על מפתח OpenAI משלכם, אז הוסיפו אחד כדי להפעיל אותן. ניתוח ארוחה עולה שבריר סנט.',
  'log.setup.addKey': 'הוספת מפתח API',
  'log.details.whatPlaceholder': 'גבינת קוטג\' 5%',
  'log.details.gramsPlaceholder': '250',

  // ------------------------------------------------------------ settings ---
  'settings.noBackend': 'לא הוגדר שרת בגרסה הזו, ולכן הכל נשאר בדפדפן הזה.',
  'settings.signedInAs': 'מחוברים כ',
  'settings.followsYou': 'הנתונים שלכם נשמרים בחשבון ומלווים אתכם בין מכשירים.',
  'settings.signOut': 'התנתקות',
  'settings.notSignedIn':
    'לא מחוברים. כל מה שתרשמו נשאר בדפדפן הזה — ניקוי נתוני הגלישה מוחק אותו, ואף מכשיר אחר לא רואה אותו.',
  'settings.signIn': 'כניסה',
  'settings.key': 'מפתח',
  'settings.keyPlaceholder': 'sk-…',
  'settings.saveKey': 'שמירת המפתח',
  'settings.testKey': 'בדיקת המפתח',
  'settings.testing': 'בודקים…',
  'settings.noKeyTitle': 'עוד אין לכם מפתח?',
  'settings.step1': 'והתחברו.',
  'settings.step1Open': 'פתחו את',
  'settings.step2Add': 'הוסיפו אשראי תחת',
  'settings.step2Tail': '— 5$ הוא המינימום, וכדאי להגדיר שם גם מגבלת הוצאה.',
  'settings.billing': 'חיוב',
  'settings.step3': 'צרו מפתח סודי חדש והעתיקו אותו מיד. OpenAI מציגה אותו פעם אחת בלבד.',
  'settings.notIncludedBold': 'מנוי ChatGPT אינו כולל את זה.',
  'settings.notIncluded':
    'ה-API הוא מוצר נפרד עם חיוב נפרד, ותשלום על Plus אינו מקנה גישה ל-API כלל. הצד החיובי הוא שזה זול: ניתוח תמונה עולה שבריר סנט, כך שכמה ארוחות ביום מסתכמות בפרוטות בחודש.',
  'settings.storedHead': 'המפתח שלכם נשמר',
  'settings.storedBold': 'במכשיר הזה בלבד',
  'settings.storedTail':
    ', בדפדפן הזה. הוא נשלח ל-OpenAI ולשום מקום אחר, ואף פעם לא נכלל בגיבוי או בסנכרון.',
  'settings.scriptsHead':
    'כל דבר שיכול להריץ סקריפטים בדפדפן הזה יכול לקרוא אותו, אז השתמשו במפתח ייעודי עם',
  'settings.spendingLimit': 'מגבלת הוצאה',
  'settings.scriptsTail': ', והימנעו ממחשבים משותפים. תמונות שאתם מנתחים מטופלות תחת',
  'settings.dataPolicies': 'מדיניות הנתונים של OpenAI ל-API',
  'settings.accuracyBody':
    'מודלים מדויקים יותר מסתכלים חזק יותר על צלחת עמוסה ולוקחים יותר זמן. בחרו לפי הסבלנות שלכם — אפשר לשנות בכל רגע.',
  'settings.model': 'מודל',
  'settings.refreshList': 'רענון הרשימה',
  'settings.loading': 'טוענים…',
  'settings.notInList': '{model} (לא ברשימת החשבון שלכם)',
  'settings.canRead': 'יכולים לקרוא תמונות',
  'settings.textOnly': 'טקסט בלבד — לא יכולים לקרוא תמונות',
  'settings.typeMyself': 'להקליד מזהה מודל בעצמי…',
  'settings.pickFromList': 'לבחור מרשימת החשבון שלי במקום',
  'settings.loadingModels': 'טוענים את המודלים שבחשבון שלכם…',
  'settings.modelsCount':
    '{vision} מתוך {total} מודלי הצ׳אט שלכם יכולים לקרוא תמונה. היכולת מוסקת מהשם — OpenAI לא מפרסמת אותה — כך שמודל שנדחה עשוי פשוט להיות מסומן כאן לא נכון.',
  'settings.saveThenRefresh': 'שמרו את המפתח ולחצו על רענון הרשימה כדי לטעון את המודלים שבחשבון.',
  'settings.addKeyToLoad': 'הוסיפו מפתח למעלה כדי לטעון את המודלים שבחשבון שלכם.',
  'settings.defaultIs':
    'ברירת המחדל היא {model}. מודל גדול יותר קורא צלחת בקפידה רבה יותר ועולה יותר לכל תמונה.',
  'settings.autoAnalyze': 'לנתח אוטומטית אחרי צילום התמונה',
  'settings.autoAnalyzeHint': 'כיבוי משמעו הקשה אחת נוספת, ואף בקשה שלא ביקשתם.',
  'settings.photosBody':
    'תמונות של ארוחות אף פעם לא נשמרות — לא במכשיר הזה ולא בשום מקום אחר. כל תמונה נשלחת לניתוח פעם אחת ואז נזרקת. מה שנשמר הוא ההערכה, רמת הביטחון שלה, ורישום של גודל התמונה וטביעת האצבע שלה.',
  'settings.storageAccount':
    'בחשבון שלכם. כל מכשיר שתתחברו בו רואה את אותם נתונים, והם שורדים ניקוי של הדפדפן הזה.',
  'settings.storageAccountNote':
    'רשומות רק נוספות, אף פעם לא נדרסות — תיקונים הם רשומות חדשות שמחליפות ישנות, כך ששום דבר שתרשמו לא יכול ללכת לאיבוד או להישכתב בשקט. מפתח ה-OpenAI שלכם הוא היוצא מן הכלל: הוא נשאר במכשיר הזה ואף פעם לא נשלח לחשבון.',
  'settings.storageLocal': 'בדפדפן הזה בלבד{usage}.',
  'settings.storageUsage': ', כרגע {usage}',
  'settings.storageLocalNote':
    'ניקוי נתוני הגלישה מוחק אותם, ואף מכשיר אחר לא רואה אותם. כניסה לחשבון מעתיקה אותם לחשבון ושומרת על סנכרון מכאן ואילך.',
  'settings.notBuiltYet': 'עוד לא נבנה',
  'settings.exportNote':
    'ייצוא של הכל כקובץ JSON, כדי שיהיה לכם עותק בלתי תלוי גם בדפדפן הזה וגם בחשבון.',

  // ------------------------------------------------------------ sample day --
  'seed.eggsAndOats': 'ביצים ושיבולת שועל',
  'seed.grilledChicken': 'חזה עוף בגריל',
  'seed.riceAndVegetables': 'אורז וירקות',
  'seed.salmonPotatoesSalad': 'סלמון, תפוחי אדמה, סלט',
  'seed.benchPress': 'לחיצת חזה',
  'seed.barbellRow': 'חתירה עם מוט',

  // ------------------------------------------------------------- adjusting --
  'adjust.readFromPhoto': 'נקרא מהתמונה שלכם לפני רגע.',
  'adjust.lead':
    'שנו את המשקלים לפני שזה הופך לארוחה — הערכים התזונתיים עוקבים אחרי מה שתקבעו, ושום דבר עוד לא נשמר.',
  'adjust.yourNumbers': 'המספרים שלכם',
  'adjust.unchanged': 'ללא שינוי',
  'adjust.deltaKcal': '{sign}{count} קלוריות מול ההערכה',
  'adjust.asEstimated': 'כפי שהוערך',
  'adjust.deltaGrams': '{sign}{count} גרם',
  'adjust.sureOfThis': 'בטוח ב-{count}% לגבי זה',
  'adjust.notOnPlate': 'לא היה בצלחת',
  'adjust.putBack': 'להחזיר',
  'adjust.somethingMissed': 'משהו שהוא פספס',
  'adjust.newFoodName': 'מה זה היה?',
  'adjust.ratios':
    'המשקלים שלכם, היחסים של המודל: קביעת 200 גרם עוף משנה את החלבון, הפחמימות והשומן של אותה שורה באותו יחס. רמת הביטחון נשארת של המודל — היא לא עוקבת אחרי העריכה שלכם.',
  'adjust.backToEstimate': 'חזרה להערכה',
  'adjust.letItAsk': 'שהוא ישאל במקום',
  'adjust.grams': 'גרמים של {food}',
  'adjust.less': 'פחות {food}',
  'adjust.more': 'יותר {food}',

  // ------------------------------------------------------------- insights --
  'insights.reading': 'קוראים את השבוע שלכם…',
  'insights.takesAMoment': 'שבעה ימים של ארוחות, הסיכומים והיעד שלכם — בדרך כלל פחות מדקה.',
  'insights.willSend': 'נשלחות {meals} ארוחות מ-7 ימים, הסיכומים שלכם והיעד. בלי שם, בלי חשבון, בלי שום דבר שמזהה אתכם.',
  'insights.observations': 'מה שרואים בנתונים',
  'insights.suggestions': 'שווה לנסות',
  'insights.nothingToSuggest': 'אין מה לשנות על סמך הנתונים האלה.',
  'insights.confidence': 'ביטחון {count}%',
  'insights.lowConfidence': 'שבוע דל — כדאי לקרוא את זה כרמז ולא כפסק דין.',
  'insights.askAgain': 'לשאול שוב',
  'insights.dismiss': 'סגירה',
  'insights.failed': 'לא הצלחנו לקרוא את השבוע שלכם',
  'insights.tryAgain': 'ניסיון נוסף',


  // ------------------------------------------------- the week, when blocked --
  'week.blockedBurnTitle': 'קודם הזינו כמה אתם שורפים',
  'week.blockedBurnBody':
    'השבוע משווה בין מה שאכלתם למה ששרפתם. בלי נתון שריפה אין מה להשוות, ולכן הגרף והסיכום נשארים בחוץ במקום לנחש אותו.',
  'week.blockedGoalTitle': 'בחרו למה אתם חותרים',
  'week.blockedGoalBody':
    'אפשר לסכם שבוע בלי יעד, אבל אי אפשר לשפוט אותו. בחרו אחד ואותם שבעה ימים יקבלו יעד להימדד מולו.',
  'week.setItOnTheDay': 'להזין בתצוגת היום',


  // ---------------------------------------------------------- the week view --
  'week.day': 'יום',
  'week.week': 'שבוע',
  'week.title': 'השבוע',
  'week.kcalUnit': 'קלוריות',
  'week.chartTitle': 'נאכל מול נשרף',
  'week.eaten': 'נאכל',
  'week.burned': 'נשרף',
  'week.perDay': '{total} · {average} ליום',
  'week.levelSentence': 'אכלתם בדיוק את מה ששרפתם לאורך שבעת הימים.',
  'week.underSentence': 'אכלתם {count} קלוריות פחות ממה ששרפתם לאורך שבעת הימים.',
  'week.overSentence': 'אכלתם {count} קלוריות יותר ממה ששרפתם לאורך שבעת הימים.',
  'week.againstGoal': 'מול היעד שלכם',
  'week.aimsFor': 'שואף ל{aim}, ונחתתם על {net}.',
  'week.levelWeek': 'שבוע מאוזן',
  'week.aimOver': '{count} קלוריות לשבוע',
  'week.noTarget': 'אין יעד קלורי ביעד הזה — המאזן כאן להקשר, לא כציון.',
  'week.noGoalYet': 'עוד לא הוגדר יעד. בחרו אחד בתצוגת היום ולשבוע יהיה מול מה להימדד.',
  'week.onTrack': 'בכיוון',
  'week.short': 'חסרות {count} קלוריות',
  'week.off': 'סטייה של {count} קלוריות',
  'week.ungraded': 'אין מה לדרג',
  'week.openTheWeek': 'לפתוח את השבוע',
  'week.sevenDays': 'נאכל מול נשרף, שבעה ימים בכל פעם.',
  'week.insightsTitle': 'תובנות על השבוע',
  'week.insightsBody':
    'שולח את שבעת הימים האלה ואת היעד שלכם, ומחזיר מה כדאי לשנות. שום דבר לא נשלח עד שתבקשו.',
  'week.askForInsights': 'לבקש תובנות',
  'week.noBurnData': 'לא נרשמו קלוריות שנשרפו השבוע — הזינו אותן בתצוגת היום והמאזן יהפוך לאמיתי.',
  'week.partialBurn': 'נרשמה שריפה ב-{count} מתוך 7 ימים; היעד מותאם בהתאם.',


  // ------------------------------------------------------------- the plan --
  'plan.youAreThere': 'אתם שם.',
  'plan.toLose': 'נותרו {count} ק״ג לרדת',
  'plan.toGain': 'נותרו {count} ק״ג לעלות',
  'plan.less': 'פחות {name}',
  'plan.more': 'יותר {name}',

  'objective.LOSE_WEIGHT': 'לרדת במשקל',
  'objective.LOSE_FAT': 'לרדת באחוז שומן, לשמור על שריר',
  'objective.BUILD_MUSCLE': 'לבנות שריר',
  'objective.MAINTAIN': 'לשמור על המשקל',
  'objective.FITNESS': 'כושר כללי',
  'objective.aim.LOSE_WEIGHT': 'גירעון של 500 קלוריות ביום — בערך חצי ק״ג בשבוע.',
  'objective.aim.LOSE_FAT': 'גירעון מתון יותר של 350 קלוריות, עם חלבון גבוה.',
  'objective.aim.BUILD_MUSCLE': 'עודף קטן של 250 קלוריות, בעיקר בימי אימון.',
  'objective.aim.MAINTAIN': 'לאכול מה ששורפים, שבוע אחרי שבוע.',
  'objective.aim.FITNESS': 'בלי יעד קלורי — לזוז ברוב הימים, לאכול באופן אחיד.',
  'objective.none': 'לא הוגדר',
  'objective.chooseAim': 'בחרו למה אתם חותרים.',


  // ------------------------------------------------------- entering by hand --


  // ------------------------------------------------------ language prompt --
  'chooseLang.title': 'באיזו שפה שנציג את זה?',
  'chooseLang.body':
    'זה חל בכל מקום, כולל התשובות שהמודל נותן לכם, ומלווה אתכם לכל מכשיר שתתחברו בו. אפשר לשנות בהגדרות בכל רגע.',
  'chooseLang.later': 'להחליט אחר כך',


  // ---------------------------------------------------------- conversation --
  'ask.summaryKcal': '{kcal} קלוריות',
  'ask.usable': 'זו כבר הערכה שאפשר להשתמש בה. דבר אחד יחדד אותה, ותשובה לוקחת הקשה.',
  'ask.appName': 'Timeline',
  'ask.justNow': 'ממש עכשיו',
  'ask.ownWords': 'או ספרו במילים שלכם — כל דבר על הצלחת עוזר',
  'ask.send': 'שליחה',
  'ask.skip': 'דילוג — לשמור כמו שזה',
  'ask.neverBlocks': 'שאלות אף פעם לא חוסמות שמירה. דילוג משאיר את ההערכה בדיוק כפי שנקראה.',
  'ask.answerOrCorrect': 'ענו, תקנו אותי, או הוסיפו משהו אחר',

  'revised.label': 'הערכה · גרסה {count}',
  'revised.updated': 'עודכן מהתשובה שלכם',
  'revised.unchanged': 'ללא שינוי',
  'revised.delta': '{sign}{count}',
  'revised.deltaG': '{sign}{count} גרם',
  'revised.addedFrom': 'נוסף ממה שאמרתם',
  'revised.noExtra': 'לא נדרש פריט נוסף',
  'revised.adjustByHand': 'תיקון ידני',
  'revised.howItGotHere': 'איך הגענו לכאן',
  'revised.oneConversation':
    'כל תשובה מעריכה מחדש מהתמונה ומכל מה שנאמר עד כה — זו שיחה אחת, לא ניחוש חדש. רק הגרסה האחרונה נשמרת, עם חילופי הדברים לצדה.',


}

export const STRINGS: Record<Lang, Dictionary> = { en, he }
