import { Link } from 'react-router-dom';

function DashboardPage({ employees, inventory, onRefresh }) {
  const activeCount = employees.filter((employee) => employee.status !== 'Released').length;
  const releasedCount = inventory.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Dashboard</h2>
          <p className="mt-1 text-sm text-slate-400">Overview of active employees and the shared inventory pool.</p>
        </div>
        <button onClick={onRefresh} className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200">Refresh</button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-sm text-slate-400">Active employees</div>
          <div className="mt-3 text-4xl font-semibold text-cyan-300">{activeCount}</div>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-sm text-slate-400">Returned assets</div>
          <div className="mt-3 text-4xl font-semibold text-emerald-300">{releasedCount}</div>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="text-sm text-slate-400">Quick actions</div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/employees/new" className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Add employee</Link>
            <Link to="/inventory" className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200">View inventory</Link>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold">Employees</h3>
          <Link to="/employees" className="text-sm text-cyan-300">Manage all</Link>
        </div>
        <div className="space-y-3">
          {employees.map((employee) => (
            <Link key={employee.id} to={`/employees/${employee.id}`} className="flex flex-wrap items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
              <div>
                <div className="font-medium text-slate-100">{employee.empName}</div>
                <div className="text-sm text-slate-400">{employee.empCode} • {employee.accessCard}</div>
              </div>
              <div className="text-sm text-slate-400">Leaving: {employee.dateOfLeaving || '—'}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
