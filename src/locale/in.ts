/**
 * India configuration. Everything country-specific lives here (plus the rate
 * data file and learn content). The core engine never imports this file.
 * To add a country: copy this file, change values, and register it in locale/index.ts.
 */
import type { LocaleConfig } from './types'

const RBI_RESET = {
  label: 'RBI circular, Reset of Floating Interest Rate on EMI-based Personal Loans (18 Aug 2023)',
  url: 'https://rbi.org.in/Scripts/BS_CircularIndexDisplay.aspx?Id=12529',
}

export const IN: LocaleConfig = {
  country: 'India',
  currency: { code: 'INR', symbol: '₹' },
  numberLocale: 'en-IN',
  chargeTax: { label: 'GST', pct: 18 },
  compactUnits: [
    { value: 1e7, short: 'Cr', long: 'crore' },
    { value: 1e5, short: 'L', long: 'lakh' },
    { value: 1e3, short: 'k', long: 'thousand' },
  ],
  benchmark: {
    name: 'RBI repo rate',
    value: 5.5,
    change: 0.25,
    asOf: '2026-10-07',
    source: {
      label: 'Business Standard, RBI policy highlights (7 Oct 2026)',
      url: 'https://www.business-standard.com/finance/news/rbi-policy-highlights-repo-rate-rises-25-bps-as-inflation-risks-broaden-126100700304_1.html',
    },
    note: 'Raised by 0.25% from 5.25% on 7 Oct 2026. Most bank floating-rate retail loans are linked to the repo rate (EBLR/RLLR) and reset on the lender\'s schedule.',
  },
  loanTypes: [
    {
      id: 'home', label: 'Home loan', short: 'Home', secured: true, defaultAmount: 5_000_000, defaultRate: 8.5, defaultMonths: 240, maxYears: 30, amountRange: [500000, 50000000], presets: [2500000, 5000000, 7500000, 10000000, 15000000], rateRange: [6, 14],
      hasDownPayment: true, hasBalloon: false,
      askLender: [
        'Is the rate the same for my loan amount slab and credit score, or is the advertised rate for a narrower profile?',
        'Is home-loan insurance optional? What is the premium, and is it added to the loan amount?',
        'What legal, technical and valuation charges apply, and are they refundable if the loan is not sanctioned?',
        'Will you finance a takeover later, and what would you charge me if I move the loan out?',
      ],
    },
    {
      id: 'car', label: 'Car loan', short: 'Car', secured: true, defaultAmount: 800_000, defaultRate: 9, defaultMonths: 60, maxYears: 8, amountRange: [100000, 5000000], presets: [500000, 800000, 1200000, 2000000], rateRange: [7, 16],
      hasDownPayment: true, hasBalloon: true,
      askLender: [
        'Is this rate fixed for the full tenure?',
        'What are the foreclosure and part-payment charges on a fixed-rate car loan?',
        'Is the dealer-arranged insurance mandatory, or can I buy my own?',
        'Is there a balloon or residual payment at the end?',
      ],
    },
    {
      id: 'personal', label: 'Personal loan', short: 'Personal', secured: false, defaultAmount: 500_000, defaultRate: 12, defaultMonths: 48, maxYears: 7, amountRange: [25000, 4000000], presets: [100000, 300000, 500000, 1000000], rateRange: [9, 30],
      hasDownPayment: false, hasBalloon: false,
      askLender: [
        'Is the quoted rate per year (p.a.) or per month? Is it on a reducing balance or a flat rate?',
        'Is the processing fee deducted from the amount credited to my account?',
        'Are there part-payment or foreclosure charges, and after how many EMIs can I prepay?',
        'Is any insurance being added to this loan, and can I decline it?',
      ],
    },
    {
      id: 'education', label: 'Education loan', short: 'Education', secured: false, defaultAmount: 1_500_000, defaultRate: 10, defaultMonths: 120, maxYears: 15, amountRange: [100000, 15000000.0], presets: [500000, 1000000, 2000000, 4000000], rateRange: [7, 16],
      hasDownPayment: false, hasBalloon: false,
      askLender: [
        'How long is the moratorium, and is interest during it simple or compounded into the loan?',
        'Is there a rate concession if interest is paid during the course?',
        'What collateral or co-borrower is needed above which loan amount?',
        'Is the rate linked to a benchmark, and how often does it reset?',
      ],
    },
    {
      id: 'twowheeler', label: 'Two-wheeler loan', short: 'Two-wheeler', secured: true, defaultAmount: 120_000, defaultRate: 12, defaultMonths: 36, maxYears: 5, amountRange: [20000, 500000], presets: [50000, 100000, 150000, 250000], rateRange: [8, 24],
      hasDownPayment: true, hasBalloon: false,
      askLender: ['Is the advertised rate a flat rate? What is the reducing-balance equivalent?', 'Are there document or hypothecation charges?'],
    },
    {
      id: 'business', label: 'Business loan', short: 'Business', secured: false, defaultAmount: 1_000_000, defaultRate: 14, defaultMonths: 36, maxYears: 10, amountRange: [100000, 20000000], presets: [500000, 1000000, 2500000, 5000000], rateRange: [10, 26],
      hasDownPayment: false, hasBalloon: false,
      askLender: [
        'Is this loan classified as a business loan to an individual or MSE, and what prepayment rules apply to it?',
        'Is a personal guarantee or collateral required?',
        'Are there charges for statements, renewals or limit enhancement?',
      ],
    },
    {
      id: 'lap', label: 'Loan against property', short: 'LAP', secured: true, defaultAmount: 3_000_000, defaultRate: 10, defaultMonths: 180, maxYears: 20, amountRange: [500000, 50000000], presets: [2000000, 3000000, 5000000, 10000000], rateRange: [8, 16],
      hasDownPayment: false, hasBalloon: false,
      askLender: ['What loan-to-value ratio applies to my property type?', 'Is the end-use restricted?', 'What are valuation and legal charges?'],
    },
    {
      id: 'gold', label: 'Gold loan', short: 'Gold', secured: true, defaultAmount: 200_000, defaultRate: 10, defaultMonths: 12, maxYears: 3, amountRange: [10000, 5000000], presets: [50000, 100000, 200000, 500000], rateRange: [8, 20],
      hasDownPayment: false, hasBalloon: false,
      askLender: [
        'Is this an EMI loan, or interest-only with principal at the end (bullet repayment)?',
        'What happens if the gold price falls — will you ask for a top-up or extra margin?',
        'What are the auction rules and notice period if I miss payments?',
      ],
    },
    {
      id: 'other', label: 'Other loan', short: 'Other', secured: false, defaultAmount: 500_000, defaultRate: 11, defaultMonths: 60, maxYears: 30, amountRange: [10000, 50000000], presets: [100000, 500000, 1000000, 2500000], rateRange: [6, 30],
      hasDownPayment: false, hasBalloon: true, askLender: [],
    },
  ],
  commonAskLender: [
    'Please give me the Key Facts Statement (KFS). What is the APR?',
    'What is the full list of charges — processing, documentation, legal, technical, stamp duty?',
    'Is GST charged on top of these fees?',
    'How long is this rate offer valid?',
    'What are late-payment and cheque/ECS bounce charges?',
    'Can I prepay part of the loan any time? Is there a minimum amount?',
  ],
  floatingAskLender: [
    'Which benchmark is this rate linked to (repo/EBLR, MCLR, or something else)?',
    'What exactly is the spread over the benchmark? Can it change during the loan, and on what conditions?',
    'How often does my rate reset, and on which dates?',
    'When the rate rises, do you increase my EMI or my tenure by default? Can I choose?',
    'Can I switch to a fixed rate at a reset? What does switching cost?',
  ],
  affordability: {
    lenderCapPct: 50,
    comfortablePct: 35,
    comfortableSurplusPct: 60,
    conservativePct: 25,
    conservativeSurplusPct: 40,
    perDependentPct: 2.5,
    emergencyMonths: 6,
  },
  stress: { watchSharePct: 35, stretchedSharePct: 45, highRiskSharePct: 55, minBufferMonths: 3 },
  regulatory: [
    {
      title: 'No prepayment charges on floating-rate personal loans',
      body:
        'Under RBI\'s Pre-payment Charges on Loans Directions, effective 1 Jan 2026, banks, co-operative banks and NBFCs cannot charge for prepaying a floating-rate loan taken by an individual for non-business purposes, whatever the source of funds and without any lock-in. Larger lenders also cannot charge on floating-rate business loans to individuals and MSEs; some smaller lenders are barred only up to ₹50 lakh. Fixed-rate loans can still carry charges as per the lender\'s policy, applied only to the amount prepaid.',
      asOf: '2025-09-30',
      source: { label: 'AZB & Partners summary of RBI Pre-payment Charges Directions, 2025', url: 'https://www.azbpartners.com/bank/rbi-issues-directions-on-pre-payment-charges-for-loans/' },
    },
    {
      title: 'Key Facts Statement (KFS) and APR',
      body:
        'For retail and MSME term loans sanctioned from 1 Oct 2024, lenders must give a standard Key Facts Statement showing the APR (interest plus all charges, including third-party charges collected by the lender), an APR computation sheet and the repayment schedule. Charges not listed in the KFS cannot be levied without your explicit consent. The KFS must stay valid for at least three working days for loans of seven days or longer.',
      asOf: '2024-04-15',
      source: { label: 'RBI circular RBI/2024-25/18, Key Facts Statement for Loans & Advances', url: 'https://www.rbi.org.in/Scripts/BS_CircularIndexDisplay.aspx?Id=12663' },
    },
    {
      title: 'Your choices when a floating rate resets',
      body:
        'For EMI-based personal-segment floating loans, lenders must explain at sanction how benchmark changes affect EMI or tenure, tell you promptly about any increase, and let you choose a higher EMI, a longer tenure, or both, and prepay. Lenders may offer a switch to a fixed rate under their policy. Extending tenure must not cause negative amortisation, and you should get a quarterly statement of principal and interest paid.',
      asOf: '2023-08-18',
      source: RBI_RESET,
    },
  ],
  tax: [
    {
      title: 'Home loan: interest on a self-occupied house',
      body:
        'Under the old tax regime, interest on a home loan for a self-occupied house has commonly been deductible up to ₹2,00,000 a year (Section 24(b) of the Income-tax Act, 1961). This deduction is generally not available under the new regime for self-occupied property. The Income-tax Act, 2025 renumbers sections; check the current section and limit for your assessment year.',
      asOf: '2026-03-30',
      source: { label: 'IncorpX, Home loan tax benefits under the new Income Tax Act 2025', url: 'https://www.incorpx.io/blog/home-loan-tax-benefits-new-income-tax-act-2025' },
    },
    {
      title: 'Home loan: principal repayment',
      body:
        'Under the old regime, principal repaid on a home loan has counted toward the ₹1,50,000 Section 80C limit (shared with other investments). Not available under the new regime. Prepaying principal can change how much interest you can deduct in future years, so the after-tax saving from prepayment can be lower than the headline number.',
      asOf: '2026-03-30',
      source: { label: 'IncorpX, Home loan tax benefits under the new Income Tax Act 2025', url: 'https://www.incorpx.io/blog/home-loan-tax-benefits-new-income-tax-act-2025' },
    },
  ],
}
