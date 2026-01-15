import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/admin/data-table";

import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

export type Subscription = {
  id: number;
  name: string;
  description: string;
  price: number;
  created_at: string;
  updated_at: string;
};

const columnHelper = createColumnHelper<Subscription>();

const columns: ColumnDef<Subscription>[] = [
  columnHelper.accessor("id", {
    header: "ID",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("name", {
    header: "Name",
    cell: (info) => {
      return (
        <a
          className="text-primary underline"
          href={`/admin/subscriptions/${info.row.original.id}`}
        >
          {info.getValue()}
        </a>
      );
    },
  }),
  columnHelper.accessor("description", {
    header: "Description",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("price", {
    header: "Price",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("created_at", {
    header: "Created At",
    cell: (info) => new Date(info.getValue()).toLocaleDateString(),
  }),
  columnHelper.accessor("updated_at", {
    header: "Updated At",
    cell: (info) => new Date(info.getValue()).toLocaleDateString(),
  }),
];

interface DataTableProps {
  data: Subscription[];
}

export function SubscriptionsTable({ data }: DataTableProps) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-md border">
      <DataTable table={table} />
    </div>
  );
}
