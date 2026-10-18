/** Tool index, shared by the Tools page and the command palette (kept separate so the palette doesn't load the Tools bundle). */
export const TOOLS: { id: string; title: string; sub: string; to?: string }[] = [
  { id: 'affordability', title: 'How much can I safely borrow?', sub: 'Comfortable EMI and loan, not the lender maximum' },
  { id: 'stress', title: 'EMI stress test', sub: 'Rate rises, income drops, big expenses' },
  { id: 'rate-rise', title: 'My rate went up — what now?', sub: 'Higher EMI, longer tenure, or prepay' },
  { id: 'foreclosure', title: 'Should I close my loan early?', sub: 'Net benefit vs keeping your cash' },
  { id: 'loan-from-emi', title: 'Loan amount from an EMI', sub: 'What EMI ₹X buys at a rate and tenure' },
  { id: 'tenure', title: 'How long will my loan run?', sub: 'Tenure from amount, rate and EMI' },
  { id: 'rate-from-emi', title: 'What rate am I really paying?', sub: 'Rate implied by amount, EMI and tenure' },
  { id: 'flat-rate', title: 'Flat rate converter', sub: 'Convert a flat rate to its reducing-balance equivalent' },
  { id: 'redflags', title: 'Offer red-flag checklist', sub: 'Tick what applies; see why it matters' },
  { id: 'ask', title: 'Ask the lender', sub: 'Questions for your loan type' },
  { id: '', title: 'EMI calculator & amortisation', sub: 'Full cost, charts and schedule', to: '/new' },
  { id: '', title: 'Prepayment planner', sub: 'Reduce EMI vs tenure, many prepayments', to: '/prepay' },
  { id: '', title: 'Refinancing & break-even', sub: 'Balance transfer after switching costs', to: '/refinance' },
  { id: '', title: 'Compare offers', sub: 'Rank by total cost', to: '/compare' },
  { id: '', title: 'Rate sensitivity', sub: 'EMI and interest at nearby rates', to: '/rates?tab=understand' },
]
