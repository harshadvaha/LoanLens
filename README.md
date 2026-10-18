# LoanLens

A loan decision and understanding tool for India. See what a loan will actually cost, compare offers by total cost, find out how much interest you can save, and check whether refinancing is worth it.

Static site. No backend, no accounts, no tracking, no paid APIs. Everything you enter stays in your browser (localStorage). It does not sell loans or receive commissions.

## What's in it

| Area | What it does |
|---|---|
| **New loan** | EMI, true cost (interest + fees + GST + insurance), all-in annual rate (IRR-based, comparable to APR), flat/monthly-rate conversion, balloon payments, rate sensitivity, yearly/monthly amortisation with CSV export |
| **My loans** | Save existing loans and offers once; every tool can start from them. Loan health (vs the best rate you've been quoted), "interest in your next 12 EMIs", benchmark + spread check, estimated history, JSON export/import |
| **Optimise** | Lump sum, extra EMI, yearly step-up, periodic prepayments, target payoff date — side by side with badges (lowest interest, fastest, lowest monthly, most liquidity-friendly) and a cash-buffer check |
| **Prepayment** | Reduce EMI vs reduce tenure, multiple prepayments, effective return on prepaid money |
| **Compare** | 2–4 offers ranked by cost of borrowing, with a "how long will you keep it" horizon that adds foreclosure costs |
| **Refinance** | Switching costs, break-even month (counting balance differences), net saving at your expected holding period |
| **Interest rates** | "Understand a rate" (what a quote means, sensitivity) and an interactive floating-rate explainer. No lender rate tables — users enter the rates they are quoted |
| **Tools** | Affordability, EMI stress test, rate-rise decision, foreclosure, loan-from-EMI, tenure, implied rate, flat-rate converter, red-flag checklist, ask-the-lender questions |
| **Learn** | 21 concepts (plain English → example → why it matters → common mistake → what to ask), RBI borrower rules and tax notes with source dates |

## v3 interface

- macOS-style design: system font (SF Pro on Apple devices, self-hosted Inter elsewhere — no Google Fonts call), cool neutrals, grouped cards, an inspector panel for inputs, light/dark/auto.
- Logo: a lens holding the loan — principal (white) and interest (coral) split by the falling balance curve.
- Slider-first inputs: every amount, rate and tenure has a slider (log scale for amounts, snapping to round numbers), loan-type presets, and amounts shown in lakh/crore inside the field.
- ⌘K / Ctrl+K command palette for pages, tools, saved loans and actions.

## Run locally

Requires Node 18+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 66 calculation tests (incl. independent reference checks)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository (branch `main`).
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) runs tests, builds and publishes on every push to `main`.

The site works at `https://<user>.github.io/<repo>/` with no configuration: Vite uses a relative base (`base: './'`) and routing uses the URL hash (`#/compare`), so refreshing any page never needs a server rewrite.

Manual alternative: `npm run build` and upload the contents of `dist/` to any static host.

## Architecture

```
src/
  core/            Country-agnostic loan maths. No UI, no locale imports.
    amortize.ts    EMI, schedule simulation (prepayments, rate changes, step-ups, balloon), inverses
    cost.ts        Upfront charges, tax on charges, IRR, true cost / all-in rate
    scenarios.ts   Optimiser, prepayment, refinance, offer comparison, rate rise, foreclosure, liquidity
    household.ts   Affordability and stress test (thresholds passed in as policy)
    core.test.ts   Engine tests
    reference.test.ts  Independent re-derivation: 300 random loans vs a float simulation, numpy-financial EMI/IRR values, edge cases
  locale/          Everything India-specific
    in.ts          Currency, GST rate, lakh/crore units, repo-rate benchmark, loan types,
                   ask-the-lender questions, affordability/stress thresholds, RBI rules, tax notes
    learn.in.ts    Learning-centre content (+ learn.test.ts checks every number it quotes)
    index.ts       Active locale + formatting (₹, Indian digit grouping, durations)
  store/loans.ts   Central Loan model + localStorage, export/import
  insights.ts      Calculated insights and loan health (uses core + locale + data)
  ui/              Inputs, charts (hand-built SVG), schedule table, shared loan picker, router
  pages/           Screens
```

**Adding a country:** copy `locale/in.ts` (and `learn.in.ts`), change currency, tax-on-charges, units, benchmark, policies and content, and point `locale/index.ts` at it. `core/` does not change.

## Calculation conventions

- Reducing balance, monthly rate = annual ÷ 12. Simulated in integer paise, so every schedule reconciles exactly (principal + interest = everything paid).
- EMI rounded **up** to the next rupee; the final EMI is smaller.
- Events are applied "after N instalments" (0 = today, before the next EMI).
- GST (18%) is applied to processing and other lender charges, not insurance premiums.
- All-in annual rate = monthly IRR of (amount − upfront charges) against EMIs, × 12.
- Refinance break-even counts cumulative EMI difference **plus** the difference in outstanding balance, minus switching costs, so a longer new tenure can't masquerade as savings.
- Affordability and stress thresholds are rules of thumb defined in `locale/in.ts`, not lender or RBI rules.

## Rates: user-entered by design

LoanLens ships no lender rate tables. Every calculation uses the rate the user was quoted, and loan health compares a saved loan with the best quote the user has received elsewhere. This keeps the app maintenance-free and avoids looking like a lender marketplace.

The one external number is the **RBI repo rate** (`benchmark` in `src/locale/in.ts`, with date and source). It drives the floating-rate explainer and reset checks. Users can override it from the home page; the app nudges them when the built-in value is more than ~2.5 months old. Update the built-in value after RBI policy meetings (about six a year).

## Not in this version

- PDF/loan-document parsing (the "understand my offer" flow is covered by manual entry + red-flag checklist + ask-the-lender).
- Moratorium modelling for education loans; step-down/bullet repayment structures for gold loans.
