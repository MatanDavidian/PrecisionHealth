# Brief: choosing and opening a payment provider

A task for a browser agent, and the reason it stops where it does.

**Goal:** find out exactly what Vimetry needs in order to take money, from
Israel, for a subscription sold worldwide — and get as far as an account that
is ready for the owner to finish.

---

## Why this is a research task, not a signup task

Merchant onboarding is not a form. It is a set of **legal declarations** — a
tax residency certification (W-8BEN or W-8BEN-E for a non-US seller), a
business identity, and a bank account. Each is something the owner is
personally liable for, and each is awkward to unwind once submitted: tax
declarations become records, KYC creates an identity file, and a wrong entity
type on an application is a support ticket rather than an edit.

So the agent does the part that is reversible and tedious, and stops at the
part that is neither.

**S6.1/S6.2 in `PHASE-1.md` — and it is gated on the legal entity, which is
the thing this brief exists to specify.**

---

## The prompt

> You are helping me research payment providers for a small software product I
> sell as a subscription. I am based in **Israel**. The product is a personal
> health app sold worldwide, including to the EU and the US.
>
> I want a **merchant of record** — a provider that becomes the legal seller,
> so that VAT and US sales tax are their obligation rather than mine. Compare
> **Lemon Squeezy** and **Stripe Managed Payments**, which is Stripe's own
> merchant-of-record product built after it acquired Lemon Squeezy in 2024.
>
> **Answer these, with a link to the page you found each on:**
>
> 1. **Is Israel a supported seller country** for each? Not "can Israelis buy"
>    — can an Israeli seller open a store and receive payouts.
> 2. **What entity does a seller need?** Specifically: is a sole trader
>    (עוסק פטור / עוסק מורשה) accepted, or is a registered company (ח.פ.)
>    required? This is the single answer I most need.
> 3. **What documents does onboarding ask for?** Tax forms, ID, proof of
>    address, bank details, business registration.
> 4. **What is the total cost** on a $10/month subscription — percentage, fixed
>    fee, currency conversion, and payout fee. Give the real number, not the
>    headline rate.
> 5. **How do payouts to an Israeli bank account work?** Currency, frequency,
>    minimum, and whether ILS is supported or it converts.
> 6. **Does either handle EU VAT MOSS and US sales tax nexus for me**, and does
>    that include issuing compliant invoices to EU customers?
> 7. **Is Lemon Squeezy still open to new sellers**, and has any migration to
>    Stripe Managed Payments been announced? Look for a sunset date.
> 8. **What is the refund and chargeback policy**, and who bears the cost.
>
> **You may:** browse public documentation and pricing pages, create a free
> account using the email I give you if that is needed to see the seller
> dashboard, and take screenshots of the onboarding steps so I can see what is
> asked before I start.
>
> **Stop and ask me before:** entering any tax identification number, national
> ID, or bank details; uploading any identity document; submitting a W-8BEN or
> any tax form; accepting terms of service or a merchant agreement; or
> completing any KYC or verification step. Those are legal declarations and I
> will make them myself.
>
> **Report back as:** a comparison table answering 1–8 for both providers, then
> a one-line recommendation and the single biggest reason for it. If Israel is
> not supported by one of them, say so first and stop comparing that one.

---

## What to do with the answer

Question 2 is the one that unblocks everything else. If a sole trader is
accepted, the owner registers as **עוסק פטור** or **עוסק מורשה** depending on
turnover, and that same registration also fills the privacy policy's
`[UNDECIDED: legal entity name]` and satisfies Meta Business verification. If a
company is required, that is a different decision with an accountant in it.

Either way the answer feeds four blocked things at once — see
`vimetry-owner-todo` and `PHASES.md`.

## The alternatives, if both say no

`Paddle` is the other established merchant of record for software. Stripe
direct is not an alternative for this purpose: it is a payment processor, and
the VAT and sales-tax registrations stay with the seller — which for one person
selling to the EU and US is the problem this whole choice exists to avoid.
