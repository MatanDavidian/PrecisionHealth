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
  'nav.nutrition': 'Nutrition',
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
  'estimate.doneAdjusting': 'Done adjusting',
  'estimate.adjustHint':
    'Change the grams and the rest follows by ratio. Type over any number to break the link. What you change is saved as your own figure, not an estimate to confirm later.',
  'estimate.modelSaid': 'the model said {grams} g · {kcal} kcal',
  'estimate.food': 'Food',
  'estimate.grams': 'Grams',
  'estimate.proteinG': 'Protein g',
  'estimate.carbsG': 'Carbs g',
  'estimate.fatG': 'Fat g',
  'estimate.removeFood': 'Remove this food',
  'estimate.keepFood': 'Keep this food',
  'estimate.allRemoved':
    'Every food is removed — there is nothing left to save. Keep one, or discard the whole estimate.',
  'estimate.savedNote': 'Saved as an estimate you can confirm, correct or delete in Nutrition.',
  'estimate.savedNoteCorrected':
    'Your corrections are saved as entered; anything you left alone stays an estimate you can confirm in Nutrition.',
  'estimate.lowConfidence': 'Low confidence — worth checking the numbers before you trust them.',
  'estimate.fromTextNote':
    "Confidence is lower than a photo's — nothing was seen, so portions were assumed.",
  'estimate.downgraded': 'Read by the quicker model — your most-accurate analyses are used up.',
  'estimate.save': 'Save meal',
  'estimate.saving': 'Saving…',
  'estimate.discard': 'Discard',
  'estimate.tryAnotherPhoto': 'Try another photo',
  'estimate.describeSomethingElse': 'Describe something else',

  'estimate.question.hint':
    'Answering sharpens the numbers below. Skipping keeps them as they are — this is not a question you have to answer.',
  'estimate.question.placeholder': 'Grilled, no oil',
  'estimate.question.label': 'Your answer',
  'estimate.question.send': 'Send answer',
  'estimate.question.skip': 'Skip',

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
  'nutrition.title': 'Nutrition',
  'nutrition.todaysTotal': "Today's total",
  'nutrition.logAMeal': 'Log a meal',
  'nutrition.meal': 'Meal',
  'nutrition.addAnotherFood': 'Add another food',
  'nutrition.saveMeal': 'Save meal',
  'nutrition.confirm': 'Confirm',
  'nutrition.aiEstimate': 'AI estimate',
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
  'editor.ratioHint': 'Change the grams and the rest follows by ratio. Type over any number to break the link.',
  'editor.saveChanges': 'Save changes',
  'editor.cancel': 'Cancel',
  'editor.delete': 'Delete meal',

  // --------------------------------------------------------------- today ----
  'today.title': 'Today',
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
  'settings.account': 'Account',
  'settings.language': 'Language',
  'settings.languageHint':
    'Changes the app immediately, and asks the model to answer in the same language. Kept on this device.',
  'settings.apiKey': 'OpenAI API key',
  'settings.accuracyOrSpeed': 'Accuracy or speed',
  'settings.analysis': 'Analysis',
  'settings.photos': 'Photos',
  'settings.storage': 'Where your data is saved',
  'settings.save': 'Save',
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
  'nav.nutrition': 'תזונה',
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
  'estimate.doneAdjusting': 'סיימתי לתקן',
  'estimate.adjustHint':
    'שינוי הגרמים גורר את השאר ביחס ישר. הקלדה על מספר כלשהו מנתקת אותו מהחישוב. מה שתשנו יישמר כנתון שלכם, ולא כהערכה שצריך לאשר בהמשך.',
  'estimate.modelSaid': 'המודל אמר {grams} גרם · {kcal} קלוריות',
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

  'estimate.question.hint':
    'תשובה תחדד את המספרים למטה. דילוג ישאיר אותם כמו שהם — זו לא שאלה שחייבים לענות עליה.',
  'estimate.question.placeholder': 'בגריל, בלי שמן',
  'estimate.question.label': 'התשובה שלכם',
  'estimate.question.send': 'שליחת תשובה',
  'estimate.question.skip': 'דילוג',

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
  'nutrition.title': 'תזונה',
  'nutrition.todaysTotal': 'הסך הכל להיום',
  'nutrition.logAMeal': 'רישום ארוחה',
  'nutrition.meal': 'ארוחה',
  'nutrition.addAnotherFood': 'הוספת מזון נוסף',
  'nutrition.saveMeal': 'שמירת הארוחה',
  'nutrition.confirm': 'אישור',
  'nutrition.aiEstimate': 'הערכת AI',
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
  'editor.ratioHint': 'שינוי הגרמים גורר את השאר ביחס ישר. הקלדה על מספר כלשהו מנתקת אותו.',
  'editor.saveChanges': 'שמירת השינויים',
  'editor.cancel': 'ביטול',
  'editor.delete': 'מחיקת הארוחה',

  // --------------------------------------------------------------- today ----
  'today.title': 'היום',
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
  'settings.account': 'חשבון',
  'settings.language': 'שפה',
  'settings.languageHint':
    'משנה את האפליקציה מיד, ומבקש מהמודל לענות באותה שפה. נשמר במכשיר הזה.',
  'settings.apiKey': 'מפתח API של OpenAI',
  'settings.accuracyOrSpeed': 'דיוק או מהירות',
  'settings.analysis': 'ניתוח',
  'settings.photos': 'תמונות',
  'settings.storage': 'איפה הנתונים שלכם נשמרים',
  'settings.save': 'שמירה',
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
}

export const STRINGS: Record<Lang, Dictionary> = { en, he }
