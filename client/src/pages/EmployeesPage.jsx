import { Link } from 'react-router-dom';

function EmployeesPage({ employees, onRefresh }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Employees</h2>
          <p className="mt-1 text-sm text-slate-400">Browse all employees and edit their details or assigned assets.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onRefresh} className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200">Refresh</button>
          <Link to="/employees/new" className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Add employee</Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-950/70 text-slate-400">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Access card</th>
              <th className="px-4 py-3">Leaving date</th>
              <th className="px-4 py-3">Assets</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id} className="border-b border-slate-800/80">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-100">{employee.empName}</div>
                  <div className="text-xs text-slate-500">{employee.empCode}</div>
                </td>
                <td className="px-4 py-3">{employee.accessCard}</td>
                <td className="px-4 py-3">{employee.dateOfLeaving || '—'}</td>
                <td className="px-4 py-3">{employee.assets?.length || 0}</td>
                <td className="px-4 py-3">
                  <Link to={`/employees/${employee.id}`} className="text-sm font-semibold text-cyan-300">Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default EmployeesPage;
