import ExcelJS from "exceljs";
import type { SimulationResponse } from "../types";

/** Column definition with group membership for coloring */
type ColDef = {
  header: string;
  key: keyof SimulationResponse | string;
  format: "currency" | "percent" | "year";
};

type ColGroup = {
  label: string;
  /** ARGB fill color for header cells */
  fill: string;
  /** Lighter ARGB fill for data cells (alternating) */
  fill_light: string;
  columns: ColDef[];
};

const COLUMN_GROUPS: ColGroup[] = [
  {
    label: "Overview",
    fill: "FF475569",      // slate-600
    fill_light: "FF1e293b", // slate-800
    columns: [
      { header: "Year", key: "years", format: "year" },
      { header: "Net Worth (P10)", key: "net_worth_p10", format: "currency" },
      { header: "Net Worth (Median)", key: "net_worth_median", format: "currency" },
      { header: "Net Worth (P90)", key: "net_worth_p90", format: "currency" },
    ],
  },
  {
    label: "Income",
    fill: "FF166534",      // green-800
    fill_light: "FF14532d", // green-950
    columns: [
      { header: "Salary (Gross)", key: "salary_gross_median", format: "currency" },
      { header: "Salary (Net)", key: "salary_net_median", format: "currency" },
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
    fill: "FF92400e",      // amber-800
    fill_light: "FF451a03", // amber-950
    columns: [
      { header: "Total Expenses", key: "total_expenses_median", format: "currency" },
      { header: "Mortgage Payment", key: "mortgage_payment_median", format: "currency" },
      { header: "Pension Contributions", key: "pension_contributions_median", format: "currency" },
      { header: "Fun Fund", key: "fun_fund_median", format: "currency" },
    ],
  },
  {
    label: "Funding Sources",
    fill: "FF7c3aed",      // violet-600
    fill_light: "FF2e1065", // violet-950
    columns: [
      { header: "Income %", key: "_funding_income_pct", format: "percent" },
      { header: "ISA %", key: "_funding_isa_pct", format: "percent" },
      { header: "GIA %", key: "_funding_gia_pct", format: "percent" },
      { header: "Pension %", key: "_funding_pension_pct", format: "percent" },
    ],
  },
  {
    label: "Tax",
    fill: "FF9f1239",      // rose-800
    fill_light: "FF4c0519", // rose-950
    columns: [
      { header: "Income Tax", key: "income_tax_paid_median", format: "currency" },
      { header: "National Insurance", key: "ni_paid_median", format: "currency" },
      { header: "Total Tax", key: "total_tax_median", format: "currency" },
    ],
  },
  {
    label: "Asset Balances",
    fill: "FF1e40af",      // blue-800
    fill_light: "FF172554", // blue-950
    columns: [
      { header: "ISA", key: "isa_balance_median", format: "currency" },
      { header: "Pension", key: "pension_balance_median", format: "currency" },
      { header: "Cash", key: "cash_balance_median", format: "currency" },
      { header: "GIA", key: "gia_balance_median", format: "currency" },
      { header: "Total Assets", key: "total_assets_median", format: "currency" },
    ],
  },
  {
    label: "Asset Flows",
    fill: "FF4338ca",      // indigo-700
    fill_light: "FF1e1b4b", // indigo-950
    columns: [
      { header: "ISA Returns", key: "isa_returns_median", format: "currency" },
      { header: "GIA Returns", key: "gia_returns_median", format: "currency" },
      { header: "Cash Returns", key: "cash_returns_median", format: "currency" },
      { header: "Pension Returns", key: "pension_returns_median", format: "currency" },
      { header: "ISA Contributions", key: "isa_contributions_median", format: "currency" },
      { header: "GIA Contributions", key: "gia_contributions_median", format: "currency" },
      { header: "ISA Withdrawals", key: "isa_withdrawals_median", format: "currency" },
      { header: "GIA Withdrawals", key: "gia_withdrawals_median", format: "currency" },
      { header: "Pension Withdrawals", key: "pension_withdrawals_median", format: "currency" },
    ],
  },
  {
    label: "Liabilities",
    fill: "FF991b1b",      // red-800
    fill_light: "FF450a0a", // red-950
    columns: [
      { header: "Mortgage Balance", key: "mortgage_balance_median", format: "currency" },
      { header: "Debt Balance", key: "debt_balance_median", format: "currency" },
      { header: "Debt Interest Paid", key: "debt_interest_paid_median", format: "currency" },
      { header: "Total Liabilities", key: "total_liabilities_median", format: "currency" },
    ],
  },
  {
    label: "Risk Metrics",
    fill: "FF334155",      // slate-700
    fill_light: "FF0f172a", // slate-900
    columns: [
      { header: "Mortgage Paid Off (%)", key: "mortgage_paid_off_median", format: "percent" },
      { header: "Assets Depleted (%)", key: "is_depleted_median", format: "percent" },
      { header: "Bankrupt (%)", key: "is_bankrupt_median", format: "percent" },
    ],
  },
];

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 10,
  name: "Calibri",
};

const GROUP_HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 11,
  name: "Calibri",
};

const DATA_FONT: Partial<ExcelJS.Font> = {
  size: 10,
  name: "Calibri",
  color: { argb: "FF1e293b" }, // slate-800 (dark text on light bg)
};

const DATA_FONT_LIGHT: Partial<ExcelJS.Font> = {
  size: 10,
  name: "Calibri",
  color: { argb: "FFe2e8f0" }, // slate-200 (light text on dark bg)
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF334155" } },
  bottom: { style: "thin", color: { argb: "FF334155" } },
  left: { style: "thin", color: { argb: "FF334155" } },
  right: { style: "thin", color: { argb: "FF334155" } },
};

export async function exportExcel(
  result: SimulationResponse,
  scenario_name: string,
  percentile: number,
  is_real_values: boolean,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Finances Simulator";
  workbook.created = new Date();

  const value_label = is_real_values ? "real" : "nominal";
  const sheet_name = `P${percentile} (${value_label})`;
  const ws = workbook.addWorksheet(sheet_name, {
    views: [{ state: "frozen", ySplit: 2, xSplit: 1 }],
  });

  // Flatten all column definitions
  const all_cols = COLUMN_GROUPS.flatMap((g) => g.columns);
  const n_years = result.years.length;

  // Compute funding source percentages (where did each year's money come from?)
  const computed: Record<string, number[]> = {
    _funding_income_pct: [],
    _funding_isa_pct: [],
    _funding_gia_pct: [],
    _funding_pension_pct: [],
  };
  for (let i = 0; i < n_years; i++) {
    const income =
      (result.salary_net_median[i] ?? 0) +
      (result.rental_income_median[i] ?? 0) +
      (result.gift_income_median[i] ?? 0) +
      (result.state_pension_income_median[i] ?? 0);
    const isa = result.isa_withdrawals_median[i] ?? 0;
    const gia = result.gia_withdrawals_median[i] ?? 0;
    const pension = result.pension_income_median[i] ?? 0;
    const total = income + isa + gia + pension;

    if (total > 0) {
      computed._funding_income_pct.push((income / total) * 100);
      computed._funding_isa_pct.push((isa / total) * 100);
      computed._funding_gia_pct.push((gia / total) * 100);
      computed._funding_pension_pct.push((pension / total) * 100);
    } else {
      computed._funding_income_pct.push(0);
      computed._funding_isa_pct.push(0);
      computed._funding_gia_pct.push(0);
      computed._funding_pension_pct.push(0);
    }
  }

  // ── Row 1: Group headers (merged) ──
  const group_row = ws.getRow(1);
  group_row.height = 24;
  let col_offset = 1;
  for (const group of COLUMN_GROUPS) {
    const start = col_offset;
    const end = col_offset + group.columns.length - 1;

    if (group.columns.length > 1) {
      ws.mergeCells(1, start, 1, end);
    }

    const cell = ws.getCell(1, start);
    cell.value = group.label;
    cell.font = GROUP_HEADER_FONT;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: group.fill },
    };
    cell.border = THIN_BORDER;

    // Apply fill to all merged cells (exceljs needs this)
    for (let c = start; c <= end; c++) {
      const mc = ws.getCell(1, c);
      mc.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: group.fill },
      };
      mc.border = THIN_BORDER;
    }

    col_offset = end + 1;
  }

  // ── Row 2: Column headers ──
  const header_row = ws.getRow(2);
  header_row.height = 20;
  col_offset = 1;
  for (const group of COLUMN_GROUPS) {
    for (const col of group.columns) {
      const cell = ws.getCell(2, col_offset);
      cell.value = col.header;
      cell.font = HEADER_FONT;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: group.fill },
      };
      cell.border = THIN_BORDER;
      col_offset++;
    }
  }

  // ── Data rows ──
  for (let row_idx = 0; row_idx < n_years; row_idx++) {
    const excel_row = row_idx + 3; // data starts at row 3
    const data_row = ws.getRow(excel_row);

    col_offset = 1;
    let group_idx = 0;
    for (const group of COLUMN_GROUPS) {
      for (const col of group.columns) {
        const arr = (computed[col.key] ??
          result[col.key as keyof SimulationResponse]) as number[] | undefined;
        const value = arr?.[row_idx] ?? 0;
        const cell = ws.getCell(excel_row, col_offset);

        const has_dark_bg = group_idx % 2 === 1;

        cell.value = value;
        cell.font = has_dark_bg ? DATA_FONT_LIGHT : DATA_FONT;
        cell.border = THIN_BORDER;

        if (col.format === "currency") {
          cell.numFmt = "£#,##0";
          cell.alignment = { horizontal: "right" };
        } else if (col.format === "percent") {
          cell.numFmt = "0.0"%"";
          cell.alignment = { horizontal: "right" };
        } else {
          cell.numFmt = "0";
          cell.alignment = { horizontal: "center" };
        }

        // Alternating group background on data rows
        if (has_dark_bg) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF0f172a" }, // slate-900
          };
        }

        col_offset++;
      }
      group_idx++;
    }
  }

  // ── Column widths ──
  col_offset = 1;
  for (const group of COLUMN_GROUPS) {
    for (const col of group.columns) {
      const ws_col = ws.getColumn(col_offset);
      if (col.format === "year") {
        ws_col.width = 7;
      } else if (col.format === "percent") {
        ws_col.width = 14;
      } else {
        // Currency: size based on header length, min 14
        ws_col.width = Math.max(14, col.header.length + 4);
      }
      col_offset++;
    }
  }

  // ── Auto-filter on header row ──
  ws.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: 2, column: all_cols.length },
  };

  // ── Generate and download ──
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safe_name = scenario_name.replace(/[^\w-]+/g, "_");
  anchor.href = url;
  anchor.download = `simulation_${safe_name}_P${percentile}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
