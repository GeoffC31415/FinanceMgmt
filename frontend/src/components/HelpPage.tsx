export function HelpPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Help: how the simulation works</h1>
        <p className="mt-2 text-slate-300">
          The simulator runs year-by-year. Each year it applies income, expenses, taxes, then moves any surplus into
          assets (or withdraws from assets to cover a shortfall).
        </p>
      </div>

      <div className="rounded border border-slate-800 bg-slate-900/30 p-4 space-y-3">
        <div className="text-sm font-semibold">High-level yearly sequence</div>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-200">
          <li>Salary income is applied for each person who is not retired (can be limited by income start/end year).</li>
          <li>Salary tax/NI is calculated; net salary is what hits cash.</li>
          <li>Mortgage and expenses are stepped (expenses may inflate each year if inflation-linked).</li>
          <li>Cash pays outflows (expenses + mortgage + any extra retirement spend needed to reach the target).</li>
          <li>
            If cash is negative, withdrawals happen from assets in priority order (and pension drawdown if needed).
          </li>
          <li>
            If cash is above the emergency-fund target, surplus is allocated to investments (ISA first, then GIA).
          </li>
          <li>Growth is applied to assets and pensions at the end of the year.</li>
        </ol>
      </div>

      <div className="rounded border border-slate-800 bg-slate-900/30 p-4 space-y-3">
        <div className="text-sm font-semibold">Excess income: how it is allocated (saving / investing)</div>
        <p className="text-sm text-slate-300">
          After paying yearly outflows, the simulator keeps a cash buffer and invests any remaining surplus.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-200">
          <li>
            <span className="font-semibold">Emergency fund first:</span> cash is topped up until it reaches{" "}
            <span className="font-mono">emergency_fund_months × (annual_outflows / 12)</span>.
          </li>
          <li>
            <span className="font-semibold">ISA next (tax-free wrapper):</span> remaining surplus is deposited into ISA
            assets up to <span className="font-mono">isa_annual_limit</span> each year.
          </li>
          <li>
            <span className="font-semibold">Then GIA:</span> any remaining surplus is deposited into GIA assets.
          </li>
          <li>
            <span className="font-semibold">Per-asset caps:</span> if an ISA/GIA asset has an{" "}
            <span className="font-mono">annual_contribution</span> set, it is treated as a per-year deposit cap for that
            asset.
          </li>
        </ul>
      </div>

      <div className="rounded border border-slate-800 bg-slate-900/30 p-4 space-y-3">
        <div className="text-sm font-semibold">Shortfall: how the simulator pays when expenses exceed income</div>
        <p className="text-sm text-slate-300">
          If cash goes negative after paying yearly outflows, the simulator covers the shortfall by withdrawing from
          assets.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-200">
          <li>
            <span className="font-semibold">Asset withdrawal order:</span> assets are sorted by{" "}
            <span className="font-mono">withdrawal_priority</span> (lower number = used earlier).
          </li>
          <li>
            <span className="font-semibold">ISA withdrawals:</span> treated as tax-free.
          </li>
          <li>
            <span className="font-semibold">GIA withdrawals:</span> a simplified CGT model applies (annual allowance,
            then a flat CGT rate on realized gains).
          </li>
          <li>
            <span className="font-semibold">Pension drawdown (if still short):</span> pension is drawn down to cover any
            remaining gap, using the <span className="font-mono">25% tax-free</span> and{" "}
            <span className="font-mono">75% taxable</span> split, with income tax calculated using personal allowance and
            basic/higher rates.
          </li>
        </ul>
      </div>

      <div className="rounded border border-slate-800 bg-slate-900/30 p-4 space-y-3">
        <div className="text-sm font-semibold">Retirement spending target</div>
        <p className="text-sm text-slate-300">
          In retirement, <span className="font-mono">annual_spend_target</span> is treated as a{" "}
          <span className="font-semibold">total non-mortgage spend target</span>. If your explicit expenses already
          exceed the target, the simulator does not add extra spend.
        </p>
      </div>

      <div className="rounded border border-slate-800 bg-slate-900/30 p-4 space-y-3">
        <div className="text-sm font-semibold">Notes / simplifications</div>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-200">
          <li>UK tax is simplified: salary uses income tax + NI; pension drawdown uses income tax; GIA uses a simplified CGT model.</li>
          <li>Real-world details like dividend tax, full CGT rules, tapered personal allowance, etc. are not modeled.</li>
        </ul>
      </div>
    </div>
  );
}

