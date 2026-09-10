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
> What it is          A personal health app — nutrition, training, recovery,
>                     body measurements — sold as a subscription
> Website             https://vimetry.app
> Support email       privacy@vimetry.app
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
> 4. Fill in the **store details**: support email, website, and a short product
>    description based on "what it is" above. Keep the description factual;
>    do not describe the app as providing medical advice, diagnosis or
>    treatment, because it does not and that wording would be wrong on a
>    merchant application.
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

**The entity is still the real gate.** If the business type in the details
block cannot be filled in, the application cannot be completed, and that is
S3.1's dependency showing up here rather than a problem with this prompt.
