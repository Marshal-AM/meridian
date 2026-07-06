import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { DetailList, DetailRow } from "./DetailList";
import { EmptyState } from "./Alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./Table";
import { cn } from "../../lib/utils";

export interface DataTableDetailField {
  label: string;
  value: ReactNode;
  mono?: boolean;
}

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  /** Action columns are excluded from row-click detail dialogs. */
  isAction?: boolean;
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  pageSize?: number;
  /** Rows visible in the fixed-height viewport before internal scrolling. */
  visibleRows?: number;
  emptyMessage?: ReactNode;
  detailTitle?: (row: T) => string;
  detailDescription?: (row: T) => string | undefined;
  detailFields?: (row: T) => DataTableDetailField[];
  renderDetail?: (row: T) => ReactNode;
  className?: string;
  disableRowDetail?: boolean;
}

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_VISIBLE_ROWS = 10;

export function DataTable<T>({
  data,
  columns,
  rowKey,
  pageSize = DEFAULT_PAGE_SIZE,
  visibleRows = DEFAULT_VISIBLE_ROWS,
  emptyMessage = "No records to display.",
  detailTitle,
  detailDescription,
  detailFields,
  renderDetail,
  className,
  disableRowDetail = false,
}: DataTableProps<T>) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<T | null>(null);

  const pageCount = Math.max(1, Math.ceil(data.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);

  useEffect(() => {
    if (page >= pageCount) {
      setPage(Math.max(0, pageCount - 1));
    }
  }, [page, pageCount]);

  const pageData = useMemo(() => {
    const start = safePage * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, safePage, pageSize]);

  const showPagination = data.length > pageSize;
  const rangeStart = data.length === 0 ? 0 : safePage * pageSize + 1;
  const rangeEnd = Math.min((safePage + 1) * pageSize, data.length);

  const detailColumns = columns.filter((col) => !col.isAction);

  function openDetail(row: T) {
    if (disableRowDetail) return;
    if (!detailFields && !renderDetail) return;
    setSelected(row);
  }

  const selectedTitle = selected
    ? (detailTitle?.(selected) ?? "Record details")
    : "Record details";
  const selectedDescription = selected ? detailDescription?.(selected) : undefined;

  return (
    <>
      <div
        className={cn(
          "data-table",
          visibleRows <= 2 ? "data-table--compact" : "data-table--default",
          className
        )}
        style={{ "--data-table-visible-rows": visibleRows } as React.CSSProperties}
      >
        {data.length === 0 ? (
          <div className="data-table__empty">
            <EmptyState>{emptyMessage}</EmptyState>
          </div>
        ) : (
          <>
            <div className="data-table__viewport">
              <Table className="data-table__table">
                <TableHeader className="data-table__head">
                  <TableRow className="hover:bg-transparent">
                    {columns.map((col) => (
                      <TableHead
                        key={col.id}
                        className={cn(
                          col.align === "right" && "text-right",
                          col.align === "center" && "text-center",
                          col.className
                        )}
                      >
                        {col.header}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageData.map((row) => (
                    <TableRow
                      key={rowKey(row)}
                      className={cn(
                        !disableRowDetail &&
                          (detailFields || renderDetail) &&
                          "cursor-pointer data-table__row--interactive"
                      )}
                      onClick={() => openDetail(row)}
                    >
                      {columns.map((col) => (
                        <TableCell
                          key={col.id}
                          className={cn(
                            col.align === "right" && "text-right",
                            col.align === "center" && "text-center",
                            col.className
                          )}
                          onClick={
                            col.isAction
                              ? (e) => e.stopPropagation()
                              : undefined
                          }
                        >
                          {col.cell(row)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {showPagination && (
              <footer className="data-table__footer">
                <p className="data-table__range">
                  Showing {rangeStart}–{rangeEnd} of {data.length}
                </p>
                <div className="data-table__pager">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={safePage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="data-table__page-indicator">
                    Page {safePage + 1} of {pageCount}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    aria-label="Next page"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </footer>
            )}
          </>
        )}
      </div>

      <Dialog
        open={selected != null}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selectedTitle}
        description={selectedDescription}
        className="max-w-xl"
      >
        {selected && renderDetail ? (
          renderDetail(selected)
        ) : selected && detailFields ? (
          <div className="space-y-5">
            {detailColumns.length > 0 && (
              <DetailList>
                {detailColumns.map((col) => (
                  <DetailRow
                    key={col.id}
                    term={String(col.header)}
                    value={col.cell(selected)}
                  />
                ))}
              </DetailList>
            )}
            <DetailList>
              {detailFields(selected).map((field) => (
                <DetailRow
                  key={field.label}
                  term={field.label}
                  value={field.value}
                  mono={field.mono}
                />
              ))}
            </DetailList>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
