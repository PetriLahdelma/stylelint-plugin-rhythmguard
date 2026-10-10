import { cn } from "./cn";

type Stat = { label: string; value: string; trend: "up" | "down" };
type Row = { id: string; customer: string; amount: string; status: "paid" | "due" | "late" };

const pill = {
  paid: "bg-green-100 text-green-800",
  due: "bg-amber-100 text-amber-800",
  late: "bg-red-100 text-red-800",
};

const buttonSize = {
  sm: "px-3 py-1 text-sm",
  md: "px-4 py-2",
};

export function Button({ size = "md", children }: { size?: keyof typeof buttonSize; children: React.ReactNode }) {
  return (
    <button className={cn("inline-flex items-center gap-2 rounded-md bg-brand text-white", buttonSize[size])}>
      {children}
    </button>
  );
}

function StatCard({ stat }: { stat: Stat }) {
  return (
    <div className="rounded-lg border p-6">
      <p className="text-sm text-gray-500">{stat.label}</p>
      <p className="mt-2 text-3xl font-semibold">{stat.value}</p>
      <p className={cn("mt-1 text-sm", stat.trend === "up" ? "text-green-700" : "text-red-700")}>{stat.trend}</p>
    </div>
  );
}

function Sidebar() {
  return (
    <nav className="w-60 border-r px-3 py-4">
      <div className="space-y-1">
        <a className="block rounded-md px-3 py-2 font-medium" href="#">Overview</a>
        <a className="block rounded-md px-3 py-2" href="#">Invoices</a>
        <a className="block rounded-md px-3 py-2" href="#">Customers</a>
      </div>
      <div className="mt-6 space-y-1">
        <p className="px-3 text-xs uppercase text-gray-500">Settings</p>
        <a className="block rounded-md px-3 py-2" href="#">Team</a>
        <a className="block rounded-md px-3 py-2" href="#">Billing</a>
      </div>
    </nav>
  );
}

function InvoiceTable({ rows }: { rows: Row[] }) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b">
          <th className="px-4 pb-2 font-medium">Customer</th>
          <th className="px-4 pb-2 font-medium">Amount</th>
          <th className="px-4 pb-2 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b last:border-0">
            <td className="px-4 py-3">{row.customer}</td>
            <td className="px-4 py-3">{row.amount}</td>
            <td className="px-4 py-3">
              <span className={cn("rounded-full px-2 py-0.5 text-xs", pill[row.status])}>{row.status}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Dashboard({ stats, rows }: { stats: Stat[]; rows: Row[] }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-8 py-6">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Overview</h1>
          <div className="flex gap-3">
            <Button size="sm">Export</Button>
            <Button>New invoice</Button>
          </div>
        </header>
        <section className="grid grid-cols-3 gap-6">
          {stats.map((stat) => (
            <StatCard key={stat.label} stat={stat} />
          ))}
        </section>
        <section className="mt-8 rounded-lg border p-6">
          <h2 className="mb-4 text-lg font-semibold">Recent invoices</h2>
          <InvoiceTable rows={rows} />
        </section>
      </main>
    </div>
  );
}
