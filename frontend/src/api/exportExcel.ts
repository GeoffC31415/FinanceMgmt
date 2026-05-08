import ExcelJS from "exceljs";
import type { SimulationResponse } from "../types";

type Format = "currency" | "percent" | "year" | "number" | "text";

type ColDef = {
  header: string;
  key: keyof SimulationResponse | string;
  format: Format;
  note?: string;
  transform?: (value: number, row_idx: number, result: SimulationResponse, computed: ComputedSeries) => number | string;
};

type ColGroup = {
  label: string;
  fill: string;
  columns: ColDef[];
};

type ComputedSeries = Record<string, number[]>;

type SummaryMetric = {
  label: string;
  value: number | string;
  format?: Format;
};

const COLORS = {
  navy: "FF1E3A5F",
  blue: "FF2563EB",
  slate: "FF475569",
  slateDark: "FF334155",
  slateText: "FF1E293B",
  slateLight: "FFE2E8F0",
  paleBlue: "FFDBEAFE",
  paleGreen: "FFDCFCE7",
  paleAmber: "FFFEF3C7",
  paleRose: "FFFFE4E6",
  paleSlate: "FFF1F5F9",
  green: "FF166534",
  amber: "FFB45309",
  rose: "FFE11D48",
  violet: "FF7C3AED",
  indigo: "FF4338CA",
  red: "FF991B1B",
  white: "FFFFFFFF",
};

const COLUMN_GROUPS: ColGroup[] = [
  {
    label: "Overview",
    fill: COLORS.slate,
    columns: [
      { header: "Year", key: "years", format: "year", note: "Projection calendar year." },
      { header: "Net Worth P10", key: "net_worth_p10", format: "currency" },
      { header: "Net Worth Median", key: "net_worth_median", format: "currency" },
      { header: "Net Worth P90", key: "net_worth_p90", format: "currency" },
    ],
  },
  {
    label: "Income",
    fill: COLORS.green,
    columns: [
      { header: "Salary Gross", key: "salary_gross_median", format: "currency" },
      { header: "Salary Net", key: "salary_net_median", format: "currency" },
      { header: "Rental Income", key: "rental_income_median", format: "currency" },
      { header: "Gift Income", key: "gift_income_median", format: "currency" },
      { header: "Pension Income", key: "pension_income_median", format: "currency" },
      { header: "State Pension", key: "state_pension_income_median", format: "currency" },
      { header: "Investment Returns", key: "investment_returns_median", format: "currency" },
      { header: "Total Income", key: "total_income_median", format: "currency" },
    ],
  },
  {
    label: "Expenses",
    fill: COLORS.amber,
    columns: [
      { header: "Total Expenses", key: "total_expenses_median", format: "currency" },
      { header: "Mortgage Payment", key: "mortgage_payment_median", format: "currency" },
      { header: "Pension Contributions", key: "pension_contributions_median", format: "currency" },
      { header: "Fun Fund", key: "fun_fund_median", format: "currency" },
      { header: "Property Maintenance", key: "property_maintenance_median", format: "currency" },
    ],
  },
  {
    label: "Cashflow Analysis",
    fill: COLORS.violet,
    columns: [
      { header: "Net Cashflow", key: "_net_cashflow", format: "currency", note: "Total income minus total expenses and total tax." },
      { header: "Savings Rate", key: "_savings_rate", format: "percent", note: "Positive net cashflow divided by total income." },
      { header: "Effective Tax Rate", key: "_effective_tax_rate", format: "percent", note: "Total tax divided by taxable/gross income proxy." },
      { header: "Withdrawal Rate", key: "_withdrawal_rate", format: "percent", note: "ISA + GIA + pension withdrawals divided by prior-year investable assets." },
      { header: "Spending Coverage", key: "_spending_coverage", format: "number", note: "Total income divided by total expenses." },
    ],
  },
  {
    label: "Funding Sources",
    fill: COLORS.indigo,
    columns: [
      { header: "Income %", key: "_funding_income_pct", format: "percent" },
      { header: "ISA %", key: "_funding_isa_pct", format: "percent" },
      { header: "GIA %", key: "_funding_gia_pct", format: "percent" },
      { header: "Pension %", key: "_funding_pension_pct", format: "percent" },
    ],
  },
  {
    label: "Tax",
    fill: COLORS.rose,
    columns: [
      { header: "Income Tax", key: "income_tax_paid_median", format: "currency" },
      { header: "Salary Tax", key: "salary_income_tax_paid_median", format: "currency" },
      { header: "Salary PA Used", key: "salary_income_tax_personal_allowance_used_median", format: "currency" },
      { header: "Salary PA Lost", key: "salary_income_tax_personal_allowance_lost_median", format: "currency" },
      { header: "Salary Basic Band Amount", key: "salary_income_tax_basic_band_amount_median", format: "currency" },
      { header: "Salary Basic Band Tax", key: "salary_income_tax_basic_band_tax_median", format: "currency" },
      { header: "Salary Higher Band Amount", key: "salary_income_tax_higher_band_amount_median", format: "currency" },
      { header: "Salary Higher Band Tax", key: "salary_income_tax_higher_band_tax_median", format: "currency" },
      { header: "Salary Additional Band Amount", key: "salary_income_tax_additional_band_amount_median", format: "currency" },
      { header: "Salary Additional Band Tax", key: "salary_income_tax_additional_band_tax_median", format: "currency" },
      { header: "Salary Allowance Taper Tax", key: "salary_income_tax_allowance_taper_tax_median", format: "currency" },
      { header: "Rental Tax", key: "rental_income_tax_paid_median", format: "currency" },
      { header: "Pension Drawdown Tax", key: "pension_drawdown_tax_paid_median", format: "currency" },
      { header: "Capital Gains Tax", key: "capital_gains_tax_paid_median", format: "currency" },
      { header: "GIA CGT", key: "gia_cgt_paid_median", format: "currency" },
      { header: "Property CGT", key: "property_cgt_paid_median", format: "currency" },
      { header: "State Pension Tax", key: "state_pension_tax_paid_median", format: "currency" },
      { header: "National Insurance", key: "ni_paid_median", format: "currency" },
      { header: "Total Tax", key: "total_tax_median", format: "currency" },
    ],
  },
  {
    label: "Asset Balances",
    fill: COLORS.blue,
    columns: [
      { header: "ISA", key: "isa_balance_median", format: "currency" },
      { header: "Pension", key: "pension_balance_median", format: "currency" },
      { header: "Cash", key: "cash_balance_median", format: "currency" },
      { header: "GIA", key: "gia_balance_median", format: "currency" },
      { header: "Property", key: "property_value_median", format: "currency" },
      { header: "Liquid Assets", key: "_liquid_assets", format: "currency" },
      { header: "Investable Assets", key: "_investable_assets", format: "currency" },
      { header: "Total Assets", key: "total_assets_median", format: "currency" },
    ],
  },
  {
    label: "Asset Flows",
    fill: COLORS.indigo,
    columns: [
      { header: "ISA Returns", key: "isa_returns_median", format: "currency" },
      { header: "GIA Returns", key: "gia_returns_median", format: "currency" },
      { header: "Cash Returns", key: "cash_returns_median", format: "currency" },
      { header: "Pension Returns", key: "pension_returns_median", format: "currency" },
      { header: "Property Returns", key: "property_returns_median", format: "currency" },
      { header: "ISA Contributions", key: "isa_contributions_median", format: "currency" },
      { header: "GIA Contributions", key: "gia_contributions_median", format: "currency" },
      { header: "ISA Withdrawals", key: "isa_withdrawals_median", format: "currency" },
      { header: "GIA Withdrawals", key: "gia_withdrawals_median", format: "currency" },
      { header: "Pension Withdrawals", key: "pension_withdrawals_median", format: "currency" },
    ],
  },
  {
    label: "Liabilities",
    fill: COLORS.red,
    columns: [
      { header: "Mortgage Balance", key: "mortgage_balance_median", format: "currency" },
      { header: "Debt Balance", key: "debt_balance_median", format: "currency" },
      { header: "Debt Interest Paid", key: "debt_interest_paid_median", format: "currency" },
      { header: "Total Liabilities", key: "total_liabilities_median", format: "currency" },
      { header: "Debt / Assets", key: "_debt_to_assets", format: "percent" },
    ],
  },
  {
    label: "Risk Metrics",
    fill: COLORS.slateDark,
    columns: [
      { header: "Mortgage Paid Off", key: "mortgage_paid_off_median", format: "percent", transform: (value) => value / 100 },
      { header: "Assets Depleted", key: "is_depleted_median", format: "percent", transform: (value) => value / 100 },
      { header: "Bankrupt", key: "is_bankrupt_median", format: "percent", transform: (value) => value / 100 },
    ],
  },
];

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: COLORS.white },
  size: 10,
  name: "Calibri",
};

const TITLE_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: COLORS.navy },
  size: 18,
  name: "Calibri",
};

const SUBTITLE_FONT: Partial<ExcelJS.Font> = {
  color: { argb: COLORS.slateText },
  size: 11,
  name: "Calibri",
};

const DATA_FONT: Partial<ExcelJS.Font> = {
  size: 10,
  name: "Calibri",
  color: { argb: COLORS.slateText },
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFCBD5E1" } },
  bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
  left: { style: "thin", color: { argb: "FFCBD5E1" } },
  right: { style: "thin", color: { argb: "FFCBD5E1" } },
};

const SECTION_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: COLORS.paleBlue },
};

function allColumns(): ColDef[] {
  return COLUMN_GROUPS.flatMap((group) => group.columns);
}

function columnGroupsByLabel(labels: string[]): ColGroup[] {
  return COLUMN_GROUPS.filter((group) => labels.includes(group.label));
}

function safeSheetName(name: string): string {
  return name.replace(/[\\/*?:\[\]]/g, " ").slice(0, 31);
}

function getSeries(result: SimulationResponse, computed: ComputedSeries, key: keyof SimulationResponse | string): number[] | undefined {
  return computed[key] ?? (result[key as keyof SimulationResponse] as number[] | undefined);
}

function rawNumericValue(result: SimulationResponse, computed: ComputedSeries, key: keyof SimulationResponse | string, row_idx: number): number {
  const arr = getSeries(result, computed, key);
  return arr?.[row_idx] ?? 0;
}

function valueForColumn(col: ColDef, row_idx: number, result: SimulationResponse, computed: ComputedSeries): number | string {
  const raw = rawNumericValue(result, computed, col.key, row_idx);
  return col.transform ? col.transform(raw, row_idx, result, computed) : raw;
}

function applyNumberFormat(cell: ExcelJS.Cell, format: Format): void {
  if (format === "currency") {
    cell.numFmt = "£#,##0;[Red]-£#,##0";
    cell.alignment = { horizontal: "right", vertical: "middle" };
  } else if (format === "percent") {
    cell.numFmt = "0.0%";
    cell.alignment = { horizontal: "right", vertical: "middle" };
  } else if (format === "number") {
    cell.numFmt = "0.00";
    cell.alignment = { horizontal: "right", vertical: "middle" };
  } else if (format === "year") {
    cell.numFmt = "0";
    cell.alignment = { horizontal: "center", vertical: "middle" };
  } else {
    cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  }
}

function styleTitle(ws: ExcelJS.Worksheet, title: string, subtitle?: string): void {
  ws.mergeCells("A1:H1");
  const titleCell = ws.getCell("A1");
  titleCell.value = title;
  titleCell.font = TITLE_FONT;
  titleCell.alignment = { vertical: "middle" };
  ws.getRow(1).height = 28;

  if (subtitle) {
    ws.mergeCells("A2:H2");
    const subtitleCell = ws.getCell("A2");
    subtitleCell.value = subtitle;
    subtitleCell.font = SUBTITLE_FONT;
    subtitleCell.alignment = { vertical: "middle", wrapText: true };
    ws.getRow(2).height = 22;
  }
}

function styleSectionHeader(ws: ExcelJS.Worksheet, row: number, from_col = 1, to_col = 4): void {
  for (let col = from_col; col <= to_col; col++) {
    const cell = ws.getCell(row, col);
    cell.fill = SECTION_FILL;
    cell.font = { bold: true, color: { argb: COLORS.navy } };
    cell.border = THIN_BORDER;
  }
}

function styleWorksheetDefaults(ws: ExcelJS.Worksheet): void {
  ws.properties.defaultRowHeight = 18;
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cell.font = cell.font ?? DATA_FONT;
    });
  });
}

function computeSeries(result: SimulationResponse): ComputedSeries {
  const n_years = result.years.length;
  const computed: ComputedSeries = {
    _funding_income_pct: [],
    _funding_isa_pct: [],
    _funding_gia_pct: [],
    _funding_pension_pct: [],
    _net_cashflow: [],
    _savings_rate: [],
    _effective_tax_rate: [],
    _withdrawal_rate: [],
    _spending_coverage: [],
    _liquid_assets: [],
    _investable_assets: [],
    _debt_to_assets: [],
  };

  for (let i = 0; i < n_years; i++) {
    const income =
      (result.salary_net_median[i] ?? 0) +
      (result.rental_income_median[i] ?? 0) +
      (result.gift_income_median[i] ?? 0) +
      (result.state_pension_income_median[i] ?? 0);
    const isa_withdrawals = result.isa_withdrawals_median[i] ?? 0;
    const gia_withdrawals = result.gia_withdrawals_median[i] ?? 0;
    const pension_withdrawals = result.pension_withdrawals_median[i] ?? 0;
    const pension_income = result.pension_income_median[i] ?? pension_withdrawals;
    const funding_total = income + isa_withdrawals + gia_withdrawals + pension_income;

    computed._funding_income_pct.push(funding_total > 0 ? income / funding_total : 0);
    computed._funding_isa_pct.push(funding_total > 0 ? isa_withdrawals / funding_total : 0);
    computed._funding_gia_pct.push(funding_total > 0 ? gia_withdrawals / funding_total : 0);
    computed._funding_pension_pct.push(funding_total > 0 ? pension_income / funding_total : 0);

    const total_income = result.total_income_median[i] ?? 0;
    const total_expenses = result.total_expenses_median[i] ?? 0;
    const total_tax = result.total_tax_median[i] ?? 0;
    const net_cashflow = total_income - total_expenses - total_tax;
    const gross_income_proxy =
      (result.salary_gross_median[i] ?? 0) +
      (result.rental_income_median[i] ?? 0) +
      (result.pension_income_median[i] ?? 0) +
      (result.state_pension_income_median[i] ?? 0);
    const prior_investable =
      i > 0
        ? (result.isa_balance_median[i - 1] ?? 0) +
          (result.gia_balance_median[i - 1] ?? 0) +
          (result.pension_balance_median[i - 1] ?? 0) +
          (result.cash_balance_median[i - 1] ?? 0)
        : (result.isa_balance_median[i] ?? 0) +
          (result.gia_balance_median[i] ?? 0) +
          (result.pension_balance_median[i] ?? 0) +
          (result.cash_balance_median[i] ?? 0);
    const withdrawals = isa_withdrawals + gia_withdrawals + pension_withdrawals;
    const liquid_assets =
      (result.isa_balance_median[i] ?? 0) + (result.gia_balance_median[i] ?? 0) + (result.cash_balance_median[i] ?? 0);
    const investable_assets = liquid_assets + (result.pension_balance_median[i] ?? 0);
    const total_assets = result.total_assets_median[i] ?? 0;
    const total_liabilities = result.total_liabilities_median[i] ?? 0;

    computed._net_cashflow.push(net_cashflow);
    computed._savings_rate.push(total_income > 0 && net_cashflow > 0 ? net_cashflow / total_income : 0);
    computed._effective_tax_rate.push(gross_income_proxy > 0 ? total_tax / gross_income_proxy : 0);
    computed._withdrawal_rate.push(prior_investable > 0 ? withdrawals / prior_investable : 0);
    computed._spending_coverage.push(total_expenses > 0 ? total_income / total_expenses : 0);
    computed._liquid_assets.push(liquid_assets);
    computed._investable_assets.push(investable_assets);
    computed._debt_to_assets.push(total_assets > 0 ? total_liabilities / total_assets : 0);
  }

  return computed;
}

function sumSeries(values: number[] | undefined): number {
  return values?.reduce((sum, value) => sum + (value ?? 0), 0) ?? 0;
}

function firstYearWhere(years: number[], values: number[] | undefined, predicate: (value: number) => boolean): string | number {
  if (!values) return "Not available";
  const idx = values.findIndex((value) => predicate(value ?? 0));
  return idx >= 0 ? years[idx] : "Not observed";
}

function minValueWithYear(years: number[], values: number[]): { year: number | string; value: number } {
  if (values.length === 0) return { year: "Not available", value: 0 };
  let min_idx = 0;
  for (let i = 1; i < values.length; i++) {
    if ((values[i] ?? 0) < (values[min_idx] ?? 0)) min_idx = i;
  }
  return { year: years[min_idx] ?? "Not available", value: values[min_idx] ?? 0 };
}

function addKeyValueRows(ws: ExcelJS.Worksheet, start_row: number, title: string, metrics: SummaryMetric[]): number {
  ws.getCell(start_row, 1).value = title;
  styleSectionHeader(ws, start_row, 1, 3);

  let row = start_row + 1;
  for (const metric of metrics) {
    ws.getCell(row, 1).value = metric.label;
    ws.getCell(row, 1).font = { bold: true, color: { argb: COLORS.slateText } };
    ws.getCell(row, 2).value = metric.value;
    ws.getCell(row, 1).border = THIN_BORDER;
    ws.getCell(row, 2).border = THIN_BORDER;
    ws.getCell(row, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.paleSlate } };
    applyNumberFormat(ws.getCell(row, 2), metric.format ?? "text");
    row++;
  }
  return row + 1;
}

function addSummaryWorksheet(
  workbook: ExcelJS.Workbook,
  result: SimulationResponse,
  computed: ComputedSeries,
  scenario_name: string,
  percentile: number,
  is_real_values: boolean,
): void {
  const ws = workbook.addWorksheet("Summary", { views: [{ state: "frozen", ySplit: 3 }] });
  const value_label = is_real_values ? "Real/inflation-adjusted values" : "Nominal values";
  styleTitle(ws, "Financial Projection Summary", `${scenario_name} • P${percentile} view • ${value_label}`);

  const years = result.years;
  const last_idx = Math.max(0, years.length - 1);
  const min_net_worth = minValueWithYear(years, result.net_worth_median);
  const mortgage_payoff_year = firstYearWhere(years, result.mortgage_balance_median, (value) => value <= 0);
  const depletion_year = firstYearWhere(years, result.is_depleted_median, (value) => value > 0);
  const bankruptcy_year = firstYearWhere(years, result.is_bankrupt_median, (value) => value > 0);
  const first_retirement_year = result.retirement_years.length > 0 ? Math.min(...result.retirement_years) : "Not configured";

  let row = 4;
  row = addKeyValueRows(ws, row, "Workbook", [
    { label: "Scenario", value: scenario_name },
    { label: "Exported", value: new Date().toLocaleString() },
    { label: "Displayed basis", value: value_label },
    { label: "Selected percentile", value: `P${percentile}` },
    { label: "Projection years", value: years.length, format: "number" },
  ]);

  row = addKeyValueRows(ws, row, "Headline Metrics", [
    { label: "Start year", value: years[0] ?? "Not available", format: "year" },
    { label: "Final year", value: years[last_idx] ?? "Not available", format: "year" },
    { label: "Starting median net worth", value: result.net_worth_median[0] ?? 0, format: "currency" },
    { label: "Final net worth P10", value: result.net_worth_p10[last_idx] ?? 0, format: "currency" },
    { label: "Final net worth median", value: result.net_worth_median[last_idx] ?? 0, format: "currency" },
    { label: "Final net worth P90", value: result.net_worth_p90[last_idx] ?? 0, format: "currency" },
    { label: "Lowest median net worth", value: min_net_worth.value, format: "currency" },
    { label: "Lowest median net worth year", value: min_net_worth.year, format: typeof min_net_worth.year === "number" ? "year" : "text" },
  ]);

  row = addKeyValueRows(ws, row, "Milestones & Risks", [
    { label: "First retirement year", value: first_retirement_year, format: typeof first_retirement_year === "number" ? "year" : "text" },
    { label: "Mortgage payoff year", value: mortgage_payoff_year, format: typeof mortgage_payoff_year === "number" ? "year" : "text" },
    { label: "First year with depletion risk", value: depletion_year, format: typeof depletion_year === "number" ? "year" : "text" },
    { label: "First year with bankruptcy risk", value: bankruptcy_year, format: typeof bankruptcy_year === "number" ? "year" : "text" },
    { label: "Final depletion risk", value: (result.is_depleted_median[last_idx] ?? 0) / 100, format: "percent" },
    { label: "Final bankruptcy risk", value: (result.is_bankrupt_median[last_idx] ?? 0) / 100, format: "percent" },
  ]);

  row = addKeyValueRows(ws, row, "Lifetime Totals", [
    { label: "Total income", value: sumSeries(result.total_income_median), format: "currency" },
    { label: "Total expenses", value: sumSeries(result.total_expenses_median), format: "currency" },
    { label: "Total tax", value: sumSeries(result.total_tax_median), format: "currency" },
    { label: "Total ISA withdrawals", value: sumSeries(result.isa_withdrawals_median), format: "currency" },
    { label: "Total GIA withdrawals", value: sumSeries(result.gia_withdrawals_median), format: "currency" },
    { label: "Total pension withdrawals", value: sumSeries(result.pension_withdrawals_median), format: "currency" },
  ]);

  ws.getCell(4, 5).value = "Headline insights";
  styleSectionHeader(ws, 4, 5, 8);
  const insights = [
    min_net_worth.value >= 0
      ? "Median net worth stays positive throughout the projection."
      : `Median net worth falls below zero; the low point is ${min_net_worth.year}.`,
    mortgage_payoff_year === "Not observed"
      ? "Mortgage balance does not reach zero within the projection horizon."
      : `Mortgage is projected to be paid off by ${mortgage_payoff_year}.`,
    depletion_year === "Not observed"
      ? "No asset-depletion risk is visible in the exported projection."
      : `Asset-depletion risk first appears in ${depletion_year}.`,
    bankruptcy_year === "Not observed"
      ? "No bankruptcy-risk year is visible in the exported projection."
      : `Bankruptcy risk first appears in ${bankruptcy_year}.`,
  ];
  insights.forEach((insight, idx) => {
    const cell = ws.getCell(5 + idx, 5);
    ws.mergeCells(5 + idx, 5, 5 + idx, 8);
    cell.value = `• ${insight}`;
    cell.alignment = { wrapText: true, vertical: "top" };
    cell.border = THIN_BORDER;
  });

  ws.getCell(11, 5).value = "Sheet guide";
  styleSectionHeader(ws, 11, 5, 8);
  const guide = [
    ["Timeline", "Compact net-worth and risk timeline."],
    ["Cashflow", "Income, spending, tax, withdrawals and derived cashflow metrics."],
    ["Assets & Liabilities", "Balances, debt, and allocation-style metrics."],
    ["Tax", "Tax timeline and effective tax rates."],
    ["Risk", "Net-worth percentiles and risk indicators."],
    ["Raw Data", "Full detailed data extract for audit/pivot-table use."],
    ["Help", "Definitions, limitations and usage notes."],
  ];
  guide.forEach(([sheet, description], idx) => {
    const r = 12 + idx;
    ws.getCell(r, 5).value = sheet;
    ws.getCell(r, 5).font = { bold: true, color: { argb: COLORS.blue } };
    ws.getCell(r, 6).value = description;
    ws.mergeCells(r, 6, r, 8);
    for (let c = 5; c <= 8; c++) ws.getCell(r, c).border = THIN_BORDER;
  });

  ws.columns = [
    { width: 28 },
    { width: 20 },
    { width: 4 },
    { width: 4 },
    { width: 24 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
  ];
  ws.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  styleWorksheetDefaults(ws);
}

function addGroupedDataWorksheet(
  workbook: ExcelJS.Workbook,
  sheet_name: string,
  title: string,
  subtitle: string,
  groups: ColGroup[],
  result: SimulationResponse,
  computed: ComputedSeries,
): void {
  const ws = workbook.addWorksheet(safeSheetName(sheet_name), {
    views: [{ state: "frozen", ySplit: 4, xSplit: 1 }],
  });
  styleTitle(ws, title, subtitle);

  const columns = groups.flatMap((group) => group.columns);
  const n_years = result.years.length;

  let col_offset = 1;
  for (const group of groups) {
    const start = col_offset;
    const end = col_offset + group.columns.length - 1;
    if (group.columns.length > 1) ws.mergeCells(3, start, 3, end);
    const cell = ws.getCell(3, start);
    cell.value = group.label;
    cell.font = HEADER_FONT;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    for (let c = start; c <= end; c++) {
      const groupCell = ws.getCell(3, c);
      groupCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: group.fill } };
      groupCell.border = THIN_BORDER;
    }
    col_offset = end + 1;
  }

  col_offset = 1;
  for (const group of groups) {
    for (const col of group.columns) {
      const cell = ws.getCell(4, col_offset);
      cell.value = col.header;
      cell.font = HEADER_FONT;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: group.fill } };
      cell.border = THIN_BORDER;
      if (col.note) cell.note = col.note;
      col_offset++;
    }
  }

  for (let row_idx = 0; row_idx < n_years; row_idx++) {
    const excel_row = row_idx + 5;
    const row = ws.getRow(excel_row);
    row.height = 18;
    col_offset = 1;

    for (const col of columns) {
      const cell = ws.getCell(excel_row, col_offset);
      cell.value = valueForColumn(col, row_idx, result, computed);
      cell.font = DATA_FONT;
      cell.border = THIN_BORDER;
      applyNumberFormat(cell, col.format);
      if (row_idx % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.paleSlate } };
      }

      if (col.key === "net_worth_median" && typeof cell.value === "number" && cell.value < 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.paleRose } };
        cell.font = { ...DATA_FONT, color: { argb: COLORS.rose }, bold: true };
      }
      col_offset++;
    }
  }

  ws.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: columns.length },
  };

  col_offset = 1;
  for (const col of columns) {
    const ws_col = ws.getColumn(col_offset);
    if (col.format === "year") ws_col.width = 8;
    else if (col.format === "percent") ws_col.width = 15;
    else if (col.format === "number") ws_col.width = 16;
    else ws_col.width = Math.max(14, Math.min(24, col.header.length + 4));
    col_offset++;
  }

  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  styleWorksheetDefaults(ws);
}

function addHelpWorksheet(workbook: ExcelJS.Workbook, is_real_values: boolean): void {
  const ws = workbook.addWorksheet("Help");
  styleTitle(ws, "Workbook Help", "How to read this financial projection export.");

  const sections: Array<[string, string[]]> = [
    [
      "Important notes",
      [
        "This workbook is a projection, not financial advice.",
        "Model outputs depend on the scenario inputs, assumptions, tax policy and simulation method used in the application.",
        is_real_values
          ? "Values in this export are shown in real/inflation-adjusted terms using the simulation inflation settings."
          : "Values in this export are nominal, meaning they include the effect of inflation over time.",
      ],
    ],
    [
      "Percentiles",
      [
        "P10 means the 10th percentile outcome: 10% of simulated outcomes are lower and 90% are higher.",
        "Median/P50 means the middle outcome.",
        "P90 means the 90th percentile outcome: 90% of simulated outcomes are lower and 10% are higher.",
      ],
    ],
    [
      "Worksheet guide",
      [
        "Summary: key metrics, milestones, high-level risks and lifetime totals.",
        "Timeline: compact overview of yearly net worth, income, expenses and risk.",
        "Cashflow: income, spending, tax, funding source mix and derived cashflow metrics.",
        "Assets & Liabilities: portfolio/property/debt balances and debt ratios.",
        "Tax: tax paid and effective tax-rate analysis.",
        "Risk: net-worth percentiles and yearly depletion/bankruptcy indicators.",
        "Raw Data: full detailed extract for audit, filtering and pivot-table analysis.",
      ],
    ],
    [
      "Derived metrics",
      [
        "Net cashflow = total income - total expenses - total tax.",
        "Savings rate = positive net cashflow / total income.",
        "Effective tax rate = total tax / gross-income proxy.",
        "Withdrawal rate = ISA + GIA + pension withdrawals / prior-year investable assets.",
        "Spending coverage = total income / total expenses.",
        "Debt / assets = total liabilities / total assets.",
      ],
    ],
    [
      "Known limitations",
      [
        "The export can only show data currently returned by the simulation API.",
        "Detailed source-by-source taxes, realised gains and tax-policy metadata should be added when backend fields are available.",
        "Excel charts are not generated yet; the workbook is structured so users can add charts or pivot tables easily.",
      ],
    ],
  ];

  let row = 4;
  for (const [title, bullets] of sections) {
    ws.getCell(row, 1).value = title;
    styleSectionHeader(ws, row, 1, 4);
    row++;
    for (const bullet of bullets) {
      ws.getCell(row, 1).value = "•";
      ws.getCell(row, 2).value = bullet;
      ws.mergeCells(row, 2, row, 4);
      ws.getCell(row, 2).alignment = { wrapText: true, vertical: "top" };
      row++;
    }
    row++;
  }

  ws.columns = [{ width: 4 }, { width: 38 }, { width: 38 }, { width: 38 }];
  styleWorksheetDefaults(ws);
}

export async function exportExcel(
  result: SimulationResponse,
  scenario_name: string,
  percentile: number,
  is_real_values: boolean,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Finances Simulator";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = "Financial projection export";
  workbook.title = `Financial Projection - ${scenario_name}`;
  workbook.description = "Scenario simulation results exported from Finances Simulator.";

  const value_label = is_real_values ? "real" : "nominal";
  const subtitle = `${scenario_name} • P${percentile} • ${value_label} values`;
  const computed = computeSeries(result);

  addSummaryWorksheet(workbook, result, computed, scenario_name, percentile, is_real_values);
  addGroupedDataWorksheet(
    workbook,
    "Timeline",
    "Projection Timeline",
    subtitle,
    columnGroupsByLabel(["Overview", "Income", "Expenses", "Risk Metrics"]),
    result,
    computed,
  );
  addGroupedDataWorksheet(
    workbook,
    "Cashflow",
    "Cashflow Analysis",
    subtitle,
    columnGroupsByLabel(["Overview", "Income", "Expenses", "Tax", "Cashflow Analysis", "Funding Sources"]),
    result,
    computed,
  );
  addGroupedDataWorksheet(
    workbook,
    "Assets & Liabilities",
    "Assets & Liabilities",
    subtitle,
    columnGroupsByLabel(["Overview", "Asset Balances", "Asset Flows", "Liabilities"]),
    result,
    computed,
  );
  addGroupedDataWorksheet(
    workbook,
    "Tax",
    "Tax Analysis",
    subtitle,
    columnGroupsByLabel(["Overview", "Income", "Tax", "Cashflow Analysis"]),
    result,
    computed,
  );
  addGroupedDataWorksheet(
    workbook,
    "Risk",
    "Risk Timeline",
    subtitle,
    columnGroupsByLabel(["Overview", "Asset Balances", "Liabilities", "Risk Metrics"]),
    result,
    computed,
  );
  addGroupedDataWorksheet(workbook, "Raw Data", "Raw Data Extract", subtitle, COLUMN_GROUPS, result, computed);
  addHelpWorksheet(workbook, is_real_values);

  workbook.views = [
    {
      x: 0,
      y: 0,
      width: 16000,
      height: 9000,
      firstSheet: 0,
      activeTab: 0,
      visibility: "visible",
    },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safe_name = scenario_name.replace(/[^\w-]+/g, "_");
  anchor.href = url;
  anchor.download = `simulation_${safe_name}_P${percentile}_${value_label}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
