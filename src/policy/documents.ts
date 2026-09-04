/**
 * The privacy policy and the terms, as data.
 *
 * S5.1. Kept in the repository rather than on a marketing page for one
 * reason: **they are claims about what the code does**, and when the code
 * changes they have to change with it, in the same commit, reviewed by the
 * same person. A policy that lives somewhere else drifts into fiction within a
 * release or two — and a privacy policy that is wrong is worse than one that
 * is missing, because it is a statement someone relied on.
 *
 * Every factual assertion below is traceable to something in this repository.
 * Where a fact is not yet decided — the legal entity, the address, the
 * jurisdiction, the data region — it appears as an UNDECIDED marker rather
 * than a plausible guess. A placeholder that reads like an answer is how a
 * draft gets published by accident.
 *
 * Structured rather than Markdown because the project declines dependencies
 * for small jobs, and because sections are what the consent record points at.
 *
 * ⚠️ Drafted from the code, not by a lawyer. `docs/COMPLIANCE.md` sets out
 * what still needs professional review before anyone is charged.
 */

export type PolicyId = 'PRIVACY' | 'TERMS'

export interface PolicySection {
  heading: string
  /** Paragraphs. Plain text: no markup to render, and none to sanitise. */
  body?: string[]
  bullets?: string[]
}

export interface PolicyDocument {
  id: PolicyId
  title: string
  /**
   * Dated, not numbered.
   *
   * The question asked afterwards is always "what was in force in March", so
   * the version answers it directly. This string is what lands in the consent
   * record, and changing it is what asks everyone to agree again.
   */
  version: string
  sections: PolicySection[]
}

/**
 * A fact this document asserts that nobody has decided yet.
 *
 * Deliberately loud, and deliberately not a plausible default. "Tel Aviv,
 * Israel" would look finished and would be a claim nobody had checked.
 */
const UNDECIDED = (what: string) => `[UNDECIDED: ${what}]`

export const PRIVACY_POLICY: PolicyDocument = {
  id: 'PRIVACY',
  title: 'Privacy Policy',
  version: '2026-09-04',
  sections: [
    {
      heading: 'Who we are',
      body: [
        `This app is operated by ${UNDECIDED('legal entity name')}, at ${UNDECIDED('registered address')}. You can reach us about anything on this page at ${UNDECIDED('contact email')}.`,
        `We are the controller of the data described below: we decide what is collected and why.`,
      ],
    },
    {
      heading: 'What this app holds about you',
      body: [
        'All of the following is health data, in the sense every privacy law uses. It is not diagnoses or genetics, but it is nutrition and physiology tied to an identified person, and that is the category that gets the strictest treatment.',
      ],
      bullets: [
        'Meals — what you ate, when, and their calories and macronutrients, whether you typed them, described them, or photographed them.',
        'Body measurements — weight, body fat, and anything else you record.',
        'Activity and recovery — calories burned, steps, distance, resting heart rate, VO₂ max, respiration and stress, when you connect a Garmin watch.',
        'Sleep — duration and timing, from the same source.',
        'Goals — the programme you chose and any target you set.',
        'Your email address, if you create an account.',
        'The language you chose to read the app in.',
      ],
    },
    {
      heading: 'Meal photographs are not stored',
      body: [
        'This is the part people ask about, so it is stated plainly: a meal photograph is sent for analysis once and then discarded. It is not written to this device, not written to our database, and not kept by us in any form.',
        'What is kept is the result — the foods identified, the estimated amounts, how confident the model was, and a record of the photograph’s size and fingerprint so that an estimate can be traced back to the request that produced it.',
      ],
    },
    {
      heading: 'Why we hold it',
      bullets: [
        'To show you your own record and work out totals, trends and progress against your goals. Without this there is no app.',
        'To produce estimates from what you photograph or describe, which is the feature you came for.',
        'To keep your account working — signing in, and keeping devices in step.',
        'To meter free AI analyses, so the trial can be offered at all.',
      ],
      body: [
        'In the EU and UK, our basis for processing health data is your explicit consent (GDPR Art. 9(2)(a)). You give it when you create an account, we record which version of this policy you agreed to and when, and you can withdraw it at any time by deleting your account.',
      ],
    },
    {
      heading: 'Who else sees it',
      body: [
        'These are the only third parties involved. Each is a processor acting on our instructions, not a party we sell anything to. We do not sell your data, and we do not use it for advertising.',
      ],
      bullets: [
        `Supabase — hosts the database and handles sign-in. Everything in your account is stored there. Region: ${UNDECIDED('database region — see S5.5')}.`,
        'OpenAI — receives the meal photograph or description you ask us to analyse, and the weekly summary when you ask for an insight. It receives nothing else, and it is not given your name, your email, or any identifier for you.',
        'Cloudflare — serves the app itself.',
        `${UNDECIDED('payment provider')} — will receive billing details once the app is paid for. It receives no health data.`,
      ],
    },
    {
      heading: 'What we send to OpenAI, exactly',
      body: [
        'When you photograph or describe a meal, that photograph or description is sent, with the hints you supplied — the day, and anything you typed in "add details". When you ask for a weekly insight, a summary of that week’s totals is sent.',
        'The weekly summary carries no identity at all: no name, no email, no account id, no record ids. That is enforced in the code and there is a test asserting it.',
        'If you supply your own OpenAI key in Settings, requests go directly from your browser to OpenAI and never pass through our servers. That key is stored on your device only and is never uploaded, synced, or included in an export.',
      ],
    },
    {
      heading: 'Where it is held, and for how long',
      body: [
        'Signed out, everything stays in this browser and nowhere else. Signing in copies it to your account and keeps it in step from then on.',
        `Our database is hosted by Supabase in ${UNDECIDED('database region — see S5.5')}. OpenAI processes requests in the United States; for people in the EU or UK this is an international transfer, made under ${UNDECIDED('DPF participation or Standard Contractual Clauses — see COMPLIANCE.md')}.`,
        'We keep your records until you delete them or delete your account. We do not have a retention timer that quietly removes your history, because a health record that disappears on a schedule is not much of a record.',
      ],
    },
    {
      heading: 'What you can do',
      bullets: [
        'See everything we hold — Settings → Account & data → Download my data. It is a single JSON file, built in your browser, containing every record in your account.',
        'Delete everything — Settings → Account & data → Delete my account. This removes your account and every record in it, permanently and immediately. We cannot recover it afterwards.',
        'Correct anything — every number in the app is editable, and corrections are kept alongside what they replaced rather than overwriting it.',
        'Withdraw your consent — by deleting your account. The app cannot function without processing the data described here, so there is no partial version of this.',
        `Complain — in the EU or UK, to your local supervisory authority. In Israel, to the Privacy Protection Authority. We would rather you told us first: ${UNDECIDED('contact email')}.`,
      ],
    },
    {
      heading: 'Security',
      body: [
        'Access to your records is enforced by the database itself, per row, so a mistake in the app cannot expose another person’s data. Connections are encrypted. Device tokens — used to let a watch send readings — are stored hashed, never in the form the device holds.',
        'No system is perfect and we will not claim otherwise. If something happens that affects you, we will tell you.',
      ],
    },
    {
      heading: 'Children',
      body: [
        'This app is not for people under 16. We do not knowingly hold data about them, and we will delete it if we find it.',
      ],
    },
    {
      heading: 'Changes',
      body: [
        'When this policy changes in a way that affects you, we will ask you to read and agree to the new version before you carry on using the app. We keep a record of which version you agreed to and when.',
      ],
    },
  ],
}

export const TERMS: PolicyDocument = {
  id: 'TERMS',
  title: 'Terms of Use',
  version: '2026-09-04',
  sections: [
    {
      heading: 'This is not medical advice',
      body: [
        'The most important sentence here. This app is a tool for recording and looking at your own data. It does not diagnose, treat, or advise, and nothing it shows you is a medical opinion.',
        'If something in your health worries you, talk to a doctor. Do not let a number in this app talk you out of that, and do not change medication, treatment, or how you eat in a way that matters on the strength of it.',
      ],
    },
    {
      heading: 'Estimates are estimates',
      body: [
        'When you photograph or describe a meal, the numbers you get back are a model’s best guess from a picture or a sentence. They can be wrong, sometimes badly — a hidden tablespoon of oil is invisible and worth two hundred calories.',
        'The app is built to say so: every estimate shows how confident it is, unconfirmed items are marked as unconfirmed, and you can correct any of it. Please treat the numbers accordingly.',
      ],
    },
    {
      heading: 'Your account',
      bullets: [
        'One account per person. Keep access to your email secure, because that is how signing in works.',
        'You are responsible for what you put in. Do not upload other people’s health data without their say-so.',
        'If you supply your own OpenAI key, what OpenAI charges you for it is between you and OpenAI. Set a spending limit.',
      ],
    },
    {
      heading: 'Free analyses',
      body: [
        'New accounts get a number of AI analyses on our account, so the app can be tried without setting anything up. That allowance is a courtesy, not an entitlement, and we may change it. When it runs out you can connect your own key and carry on, or keep logging by hand — nothing you have recorded is affected either way.',
      ],
    },
    {
      heading: 'What we owe you',
      body: [
        'We will make a genuine effort to keep the app working and your data safe, and we will not pretend to guarantee either. The app is provided as it is. We are not liable for what you decide on the basis of what it shows you.',
        'You can stop at any time, take your data with you, and delete your account. We would rather you did all three than felt stuck.',
      ],
    },
    {
      heading: 'Governing law',
      body: [
        `These terms are governed by the law of ${UNDECIDED('jurisdiction — follows from the legal entity')}. If you are a consumer in the EU or UK, this does not take away rights your own country’s law gives you.`,
      ],
    },
  ],
}

export const DOCUMENTS: Record<PolicyId, PolicyDocument> = {
  PRIVACY: PRIVACY_POLICY,
  TERMS: TERMS,
}

/**
 * The exact words, as one string.
 *
 * What gets fingerprinted for the consent record — so the proof is of the text
 * a person saw, not of the label attached to it.
 */
export const documentText = (document: PolicyDocument): string =>
  [
    document.title,
    document.version,
    ...document.sections.flatMap((section) => [
      section.heading,
      ...(section.body ?? []),
      ...(section.bullets ?? []),
    ]),
  ].join('\n')

/** True while any UNDECIDED marker is still in the text. */
export const isDraft = (document: PolicyDocument): boolean =>
  documentText(document).includes('[UNDECIDED:')
