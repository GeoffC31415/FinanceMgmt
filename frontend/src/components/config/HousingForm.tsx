import { property_mortgage_balance, property_mortgage_monthly_payment } from "./formConverters";

type Props = {
  watched_properties: Array<{
    name?: string;
    value?: number;
    mortgage_ltv?: number;
    mortgage_rate?: number;
    mortgage_term_years?: number;
  }>;
  property_mortgage_balance_total: number;
  property_mortgage_payment_total: number;
  property_mortgage_balance: typeof property_mortgage_balance;
  property_mortgage_monthly_payment: typeof property_mortgage_monthly_payment;
};

/**
 * HousingForm — displays property mortgage information.
 * Shows total mortgage balance, estimated monthly payments, and per-property details.
 */
export function HousingForm({
  watched_properties,
  property_mortgage_balance_total,
  property_mortgage_payment_total,
  property_mortgage_balance,
  property_mortgage_monthly_payment,
}: Props) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <div className="text-sm font-semibold">Property Mortgages</div>
      <div className="mt-3 rounded border border-slate-800 bg-slate-950/30 p-4 text-sm text-slate-300">
        Mortgages are configured on each property in the `Properties` tab. Use `Mortgage LTV`, `Mortgage rate`, and `Mortgage term`.
        A term of `0` keeps the mortgage interest-only, while any positive term amortises it over that many years.
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300">
        <div className="rounded border border-slate-800 bg-slate-950/30 px-3 py-2">
          Total mortgage balance: <span className="font-semibold text-slate-100">£{Math.round(property_mortgage_balance_total).toLocaleString()}</span>
        </div>
        <div className="rounded border border-slate-800 bg-slate-950/30 px-3 py-2">
          Estimated monthly payments: <span className="font-semibold text-slate-100">£{Math.round(property_mortgage_payment_total).toLocaleString()}</span>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {watched_properties.filter((property) => property_mortgage_balance({
          value: Number(property?.value) || 0,
          mortgage_ltv: Number(property?.mortgage_ltv) || 0,
        }) > 0).length === 0 ? (
          <div className="rounded border border-slate-800 bg-slate-950/30 p-4 text-sm text-slate-400">
            No property mortgages configured yet.
          </div>
        ) : (
          watched_properties
            .filter((property) => property_mortgage_balance({
              value: Number(property?.value) || 0,
              mortgage_ltv: Number(property?.mortgage_ltv) || 0,
            }) > 0)
            .map((property, idx) => (
              <div key={`property-${idx}`} className="rounded border border-slate-800 bg-slate-950/30 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-100">{property?.name || `Property ${idx + 1}`}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {(Math.round((Number(property?.mortgage_ltv) || 0) * 1000) / 10).toLocaleString()}% LTV, {(Math.round((Number(property?.mortgage_rate) || 0) * 1000) / 10).toLocaleString()}% rate, {(Number(property?.mortgage_term_years) || 0) === 0 ? "interest-only" : `${Number(property?.mortgage_term_years)} years`}
                    </div>
                  </div>
                  <div className="text-right text-sm text-slate-300">
                    <div>£{Math.round(property_mortgage_balance({
                      value: Number(property?.value) || 0,
                      mortgage_ltv: Number(property?.mortgage_ltv) || 0,
                    })).toLocaleString()}</div>
                    <div className="text-xs text-slate-400">£{Math.round(property_mortgage_monthly_payment({
                      value: Number(property?.value) || 0,
                      mortgage_ltv: Number(property?.mortgage_ltv) || 0,
                      mortgage_rate: Number(property?.mortgage_rate) || 0,
                      mortgage_term_years: Number(property?.mortgage_term_years) || 0,
                    })).toLocaleString()}/mo</div>
                  </div>
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
