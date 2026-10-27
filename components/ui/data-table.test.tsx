import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTable, getPaginationItems, type DataTableColumn } from "./data-table";

type Row = { id: string; name: string; dept: string };
const rows: Row[] = [
  { id: "a", name: "Backend Engineer", dept: "Eng" },
  { id: "b", name: "Designer", dept: "Design" },
];
const columns: DataTableColumn<Row>[] = [
  { key: "name", header: "Position", cell: (r) => r.name, rowHeader: true, sortable: true },
  { key: "dept", header: "Department", cell: (r) => r.dept },
];
const base = { caption: "Positions", columns, rows, getRowId: (r: Row) => r.id };

describe("DataTable", () => {
  it("renders semantic table with caption, scoped headers and row headers", () => {
    const html = renderToStaticMarkup(<DataTable {...base} />);
    expect(html).toContain("<caption");
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect(html).toContain("Backend Engineer");
  });

  it("exposes aria-sort on sortable columns", () => {
    const html = renderToStaticMarkup(
      <DataTable {...base} sort={{ key: "name", direction: "asc" }} onSortChange={() => {}} />,
    );
    expect(html).toContain('aria-sort="ascending"');
  });

  it("labels selection checkboxes and shows the bulk bar", () => {
    const html = renderToStaticMarkup(
      <DataTable {...base} selectable selectedIds={new Set(["a"])} onSelectionChange={() => {}} bulkActions={<button>Close</button>} />,
    );
    expect(html).toContain('aria-label="Select all rows on this page"');
    expect(html).toContain('aria-label="Select row a"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("1 selected");
  });

  it("renders loading, empty and error states", () => {
    expect(renderToStaticMarkup(<DataTable {...base} loading />)).toContain('aria-busy="true"');
    expect(renderToStaticMarkup(<DataTable {...base} rows={[]} emptyTitle="No positions" />)).toContain("No positions");
    const err = renderToStaticMarkup(<DataTable {...base} error="Network down" onRetry={() => {}} />);
    expect(err).toContain('role="alert"');
    expect(err).toContain("Retry");
  });
});

describe("getPaginationItems", () => {
  it("collapses long ranges with ellipses", () => {
    expect(getPaginationItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPaginationItems(6, 12)).toEqual([1, "…", 5, 6, 7, "…", 12]);
  });
});
