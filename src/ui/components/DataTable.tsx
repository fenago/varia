import type { CSSProperties, ReactNode } from "react";

export interface Column<Row> {
  key: string;
  header: ReactNode;
  /** Render a cell. Defaults to `row[key]`. */
  render?: (row: Row, index: number) => ReactNode;
  width?: string;
  align?: "left" | "right" | "center";
}

export interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row, index: number) => string;
  onRowClick?: (row: Row, index: number) => void;
  selectedKey?: string | null;
  /** Rendered in a single full-width cell when rows is empty. */
  empty?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** Thin wrapper over the design system's `.table`, with clickable/selected rows. */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  empty,
  className,
  style,
}: DataTableProps<Row>) {
  return (
    <table className={["table", className].filter(Boolean).join(" ")} style={style}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} style={{ width: c.width, textAlign: c.align }}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && empty != null ? (
          <tr>
            <td colSpan={columns.length} className="text-muted">
              {empty}
            </td>
          </tr>
        ) : (
          rows.map((row, i) => {
            const k = rowKey(row, i);
            const cls = [onRowClick ? "va-row" : "", selectedKey === k ? "va-sel" : ""].filter(Boolean).join(" ");
            return (
              <tr
                key={k}
                className={cls || undefined}
                onClick={onRowClick ? () => onRowClick(row, i) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row, i);
                        }
                      }
                    : undefined
                }
              >
                {columns.map((c) => (
                  <td key={c.key} style={{ textAlign: c.align }}>
                    {c.render ? c.render(row, i) : String((row as Record<string, unknown>)[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
