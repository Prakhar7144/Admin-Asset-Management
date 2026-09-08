import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

function EmployeesPage({ employees, onRefresh }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');

  const handleUndoRelease = async (employee) => {
    const confirmed = window.confirm(
      `Undo the release of ${employee.empName}? Their released assets and access card will be reassigned to them where still available.`
    );
    if (!confirmed) return;

    setBusyId(employee.id);
    setNotice('');
    try {
      const response = await fetch(`http://localhost:5000/api/employees/${employee.id}/reactivate`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        setNotice(data.message || 'Unable to undo the release.');
        return;
      }

      const { summary } = data;
      const parts = [`${employee.empName} reactivated.`, `${summary.restoredAssets} asset(s) restored.`];
      if (summary.restoredCard) {
        parts.push(`Access card ${summary.restoredCard} restored.`);
      }
      if (summary.skippedAssets?.length) {
        const labels = summary.skippedAssets.map((asset) => asset.serialNumber || asset.id).join(', ');
        parts.push(`${summary.skippedAssets.length} asset(s) skipped (already reassigned or missing): ${labels}.`);
      }
      if (summary.skippedCard) {
        const where = summary.skippedCard.reason === 'reassigned'
          ? `now held by ${summary.skippedCard.employeeName || 'another employee'}`
          : 'not found';
        parts.push(`Access card ${summary.skippedCard.cardNumber} skipped (${where}).`);
      }
      setNotice(parts.join(' '));
      if (onRefresh) onRefresh();
    } catch (error) {
      setNotice('Unable to reach the server to undo the release.');
    } finally {
      setBusyId('');
    }
  };

  const statusClasses = {
    Active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    Released: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    Archived: 'border-slate-600 bg-slate-800 text-slate-300',
  };

  const filteredEmployees = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return employees;

    return employees.filter((employee) => {
      const haystack = [employee.empName, employee.empCode, employee.accessCard, employee.status].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [employees, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Employees</h2>
          <p className="mt-1 text-sm text-slate-400">Browse active and former employees, including archived records that remain visible.</p>
        </div>
        <div className="flex gap-3">
          <Link to="/employees/new" className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Add employee</Link>
        </div>
      </div>

      {notice ? (
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">{notice}</div>
      ) : null}

      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search employees by name, code, card, or status"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-0"
        />
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-950/70 text-slate-400">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Access card</th>
              <th className="px-4 py-3">Leaving date</th>
              <th className="px-4 py-3">Assets</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length ? filteredEmployees.map((employee) => (
              <tr key={employee.id} className="border-b border-slate-800/80">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-100">{employee.empName}</div>
                  <div className="text-xs text-slate-500">{employee.empCode}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[employee.status] || statusClasses.Active}`}>
                    {employee.status || 'Active'}
                  </span>
                </td>
                <td className="px-4 py-3">{employee.accessCard}</td>
                <td className="px-4 py-3">{employee.dateOfLeaving || '—'}</td>
                <td className="px-4 py-3">{employee.assets?.length || 0}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Link to={`/employees/${employee.id}`} className="text-sm font-semibold text-cyan-300">Open</Link>
                    {employee.status === 'Released' ? (
                      <button
                        type="button"
                        onClick={() => handleUndoRelease(employee)}
                        disabled={busyId === employee.id}
                        className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 disabled:opacity-50"
                      >
                        {busyId === employee.id ? 'Undoing…' : 'Undo release'}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="6" className="px-4 py-6 text-center text-sm text-slate-400">No employees match the current search.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default EmployeesPage;
