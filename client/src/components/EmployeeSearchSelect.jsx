import { useMemo, useState } from 'react';

function EmployeeSearchSelect({ employees, employeeId, employeeName, onSelect, placeholder }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const displayValue = open ? query : (employeeName || '');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = employees || [];
    if (!q) return list.slice(0, 8);
    return list
      .filter((employee) => `${employee.empName} ${employee.empCode}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [employees, query]);

  const handleFocus = () => {
    setQuery(employeeName || '');
    setOpen(true);
  };

  const handleChange = (event) => {
    setQuery(event.target.value);
    if (employeeId) {
      onSelect(null);
    }
  };

  const handlePick = (employee) => {
    setOpen(false);
    onSelect(employee);
  };

  return (
    <div className="relative">
      <input
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || 'Search employee by name or code'}
        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${employeeId ? 'border-emerald-500/50 bg-slate-900' : 'border-slate-700 bg-slate-900'}`}
      />
      {employeeId ? (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-emerald-300">Linked</span>
      ) : null}
      {open && results.length ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 shadow-xl">
          {results.map((employee) => (
            <button
              key={employee.id}
              type="button"
              onMouseDown={() => handlePick(employee)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
            >
              <span className="font-medium">{employee.empName}</span>
              <span className="text-xs text-slate-400">{employee.empCode}</span>
            </button>
          ))}
        </div>
      ) : null}
      {open && query.trim() && !results.length ? (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-400 shadow-xl">
          No matching employee found.
        </div>
      ) : null}
    </div>
  );
}

export default EmployeeSearchSelect;
