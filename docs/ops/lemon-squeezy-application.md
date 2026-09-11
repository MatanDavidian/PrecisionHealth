# Lemon Squeezy: the browser-agent prompt

The owner has chosen Lemon Squeezy. This is the prompt for an agent driving a
browser to open the account and submit the merchant application.

**Fill in the details block before pasting.** The agent cannot know a tax ID, a
bank account or a home address, and it should not be asked to guess — those
values come from the owner, in the prompt, so they stay under the owner's
control and the application is filled with facts rather than plausible-looking
ones.

---

## The prompt

> I want you to open a **Lemon Squeezy** seller account for my product and take
> the merchant application as far as submission. Lemon Squeezy is a merchant of
> record: they become the legal seller, which is why I chose them — VAT and US
> sales tax become their obligation rather than mine.
>
> ### My details
>
> ```
> Product name        Vimetry
> Tagline             Understand your patterns over time
> Category            Software / SaaS — Health & Fitness
> What it is          See "How to describe Vimetry" below; use that wording
> Website             https://vimetry.app
> Support email       <MUST BE LIVE — vimetry.app has no MX records as of
>                     2026-09-11, so privacy@vimetry.app currently bounces>
> Account email       <the email to register with>
> Store name          Vimetry
> Store URL slug      vimetry
> Country             Israel
> Payout currency     <ILS or USD — see note below>
>
> Business type       <sole trader (עוסק פטור / עוסק מורשה) or company (ח.פ.)>
> Legal name          <exactly as registered>
> Registration no.    <עוסק/ח.פ. number>
> Registered address  <full address, as registered>
> Phone               <number with +972>
>
> Bank account        <IBAN or the details Lemon Squeezy asks for>
> Bank name           <>
> Account holder      <exactly as it appears on the account>
> ```
>
> ### What to do
>
> 1. Go to lemonsqueezy.com and **sign up** with the account email above. When
>    you reach the password step, **stop and let me type it** — I want it in my
>    password manager, not in a chat log. Same for any email verification code:
>    tell me when one is needed and I will read it out.
> 2. **Turn on two-factor authentication** as soon as the account exists. This
>    account will hold my customers' payment relationship; do not leave it on a
>    password alone. Stop and let me scan the QR code and save the recovery
>    codes myself.
> 3. **Create the store** using the store name, slug, country and currency
>    above. Tell me before you confirm the slug — it appears in checkout URLs
>    and is awkward to change later.
> 4. Fill in the **store details**: support email, website, and the product
>    description. **Use the wording I have given you below verbatim** — do not
>    improve it or make it more enthusiastic. It is written the way it is on
>    purpose: this is a wellness logging tool and not a medical one, and a
>    merchant application that implies otherwise is both wrong and a slower
>    review.
> 5. Work through **onboarding / store activation** and fill every field you
>    can from my details block. This includes the business type, legal name,
>    registration number, address and payout details.
> 6. When you reach the **tax form** (a W-8BEN for an individual or W-8BEN-E
>    for a company, since I am not a US person): fill in the parts you can from
>    my details, then **stop and show me the completed form before signing it**.
>    It is a declaration to a tax authority and I will be the one to sign it.
> 7. When you reach the **merchant agreement or terms of service**: stop, tell
>    me what I am agreeing to in three or four lines, and let me accept it.
> 8. Then **submit the application** and tell me what happens — whether it is
>    instant, under review, or asking for something else.
>
> ### Decide these yourself
>
> - Any purely cosmetic setting: logo placement, theme colours, email
>   templates. Match "Vimetry" and a clean, plain look.
> - Sensible defaults for anything optional that can be changed later.
>
> ### Ask me about these
>
> - **The subscription price.** I have not set one. Do not invent a number — if
>   a product is required to activate the store, ask me first.
> - **Anything where my details block does not give you the answer.** Never
>   guess at a legal name, a number, an address or an account. A wrong value on
>   a merchant application is a support ticket, not an edit.
> - **Anything that looks like it costs money** or commits me to a plan.
>
> ### Report back
>
> - What the application status is, and what happens next.
> - A list of every field you filled, with the value, so I can check it.
> - Anything Lemon Squeezy asked for that was not in my details block.
> - Screenshots of the final state before and after submission.

---

## How to describe Vimetry

Paste these into the prompt where the agent needs them. Written to be accurate
first: every claim below is something the app actually does, and the "what it
is not" section exists because a health product that overclaims gets a slower
merchant review and a worse regulatory position.

### One line

> A personal health and fitness log that keeps your food, training, sleep and
> body measurements in one timeline, so you can see what actually changes.

### Short — store description, up to about 200 characters

> Log meals by photo or in words, import your watch data, and see your
> nutrition, training and recovery together over time. Honest estimates you can
> correct, not a black box.

### Long — product description

> **Vimetry is a personal health and fitness log.** It keeps what you eat, how
> you train, how you sleep and how your body is doing in one continuous
> timeline, so patterns become visible over weeks rather than guessed at day to
> day.
>
> **Log a meal in seconds.** Photograph it, describe it in a sentence, or enter
> it by hand. A model estimates the foods and their calories and macronutrients
> — and tells you how confident it is, so you know which numbers to trust. Every
> estimate can be corrected before or after you save it, and a correction is
> kept alongside what it replaced rather than overwriting it.
>
> **Bring in your watch.** A Garmin Connect IQ app — in development, not yet
> published to the Connect IQ Store — sends calories burned, steps, sleep,
> resting heart rate and VO2 max, so what you ate sits next to what you did.
>
> **See the week, not just the day.** Eaten against burned, protein against your
> goal, weight over time, and a written summary of what the week actually
> showed.
>
> **Built to be honest about what it knows.** Estimates are marked as estimates.
> When two sources disagree — a scale and a phone reporting different weights —
> it says so instead of quietly picking one. Nothing is overwritten, so your
> history stays true.
>
> **Your data is yours.** Download everything as a single file whenever you
> want, and delete your account and every record in it permanently, from inside
> the app. We do not store your meal photographs: each is sent for analysis once
> and then discarded.
>
> Available in English and Hebrew.

### Verified against the code on 2026-09-11

Every claim above was checked rather than assumed, and three did not survive:

| Claim | Verdict |
| --- | --- |
| "personal health record" | **Changed to "health and fitness log".** PHR is a term of art in health IT and reads as a regulated product — the opposite of the positioning. |
| Garmin integration | **Qualified.** It works, but it is sideloaded; nothing is published to the Connect IQ Store. Naming a live integration that is not live is a review question waiting to happen. |
| "photographs are never stored" | **Qualified to "we do not store".** True of us; OpenAI retain API inputs for up to 30 days for abuse monitoring. The unqualified sentence claimed something about a pipeline we do not control. |
| Confidence shown per estimate | ✅ `EstimateCard` |
| Disagreeing sources surfaced | ✅ `ConflictNotice`, `MealConflictNotice` |
| Export everything | ✅ shipped |
| Delete account permanently | ✅ shipped, function deployed |
| English and Hebrew | ✅ both live |

### What it is not — say this if asked, and keep it true

> Vimetry is a wellness and fitness logging tool. It does not diagnose, treat or
> give medical advice, it is not a medical device, and it makes no health
> outcome claims. Calorie and macronutrient figures produced from a photograph
> or a description are estimates and are presented as such.

---

## Notes for the owner, before pasting

**Payout currency.** ILS avoids a conversion on the way into the bank; USD
avoids one on the way in from customers and is what most of the revenue will
be denominated in. Whichever you pick, one conversion happens somewhere — the
question is only who does it and at what spread.

**The store slug is the one hard-to-change field.** `vimetry` is the obvious
choice and it is worth taking now, before the account is even finished.

**A price is not decided yet.** Lemon Squeezy may require a product before it
will activate a store. If it does, the agent has been told to stop rather than
invent one — but it is worth having a number in mind before you start, even a
placeholder you change later.

**`privacy@vimetry.app` does not exist yet.** `vimetry.app` has no MX records,
so mail to it bounces. Set the forwarding up at Porkbun *before* submitting:
Lemon Squeezy's verification correspondence would otherwise go nowhere, and the
published privacy policy already names that address as the contact.

**The entity is still the real gate.** If the business type in the details
block cannot be filled in, the application cannot be completed, and that is
S3.1's dependency showing up here rather than a problem with this prompt.
