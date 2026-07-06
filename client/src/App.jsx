import { useEffect, useState } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import EmployeeFormPage from './pages/EmployeeFormPage';
import InventoryPage from './pages/InventoryPage';

function App() {
  const [employees, setEmployees] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [message, setMessage] = useState('');

  const fetchData = async () => {
    try {
      const [employeesRes, inventoryRes] = await Promise.all([
        fetch('http://localhost:5000/api/employees'),
        fetch('http://localhost:5000/api/inventory'),
      ]);
      const employeesData = await employeesRes.json();
      const inventoryData = await inventoryRes.json();
      setEmployees(employeesData);
      setInventory(inventoryData);
    } catch (error) {
      setMessage('Unable to connect to the server. Start the backend with npm start inside the server folder.');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">Employee Asset Portal</p>
              <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Track staff, assigned devices, and returned inventory</h1>
            </div>
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
              Leaving dates automatically release assets into the unallocated inventory pool.
            </div>
          </div>

          <nav className="mx-auto flex max-w-7xl flex-wrap gap-3 px-6 pb-6">
            <NavLink to="/" end className={({ isActive }) => `rounded-full px-4 py-2 text-sm font-medium ${isActive ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>
              Dashboard
            </NavLink>
            <NavLink to="/employees" className={({ isActive }) => `rounded-full px-4 py-2 text-sm font-medium ${isActive ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>
              Employees
            </NavLink>
            <NavLink to="/inventory" className={({ isActive }) => `rounded-full px-4 py-2 text-sm font-medium ${isActive ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>
              Inventory
            </NavLink>
          </nav>
        </header>

        <main className="mx-auto max-w-7xl px-6 py-8">
          {message ? (
            <div className="mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {message}
            </div>
          ) : null}

          <Routes>
            <Route path="/" element={<DashboardPage employees={employees} inventory={inventory} onRefresh={fetchData} />} />
            <Route path="/employees" element={<EmployeesPage employees={employees} inventory={inventory} onRefresh={fetchData} />} />
            <Route path="/employees/new" element={<EmployeeFormPage employees={employees} onRefresh={fetchData} />} />
            <Route path="/employees/:employeeId" element={<EmployeeFormPage employees={employees} onRefresh={fetchData} />} />
            <Route path="/inventory" element={<InventoryPage inventory={inventory} onRefresh={fetchData} />} />
            <Route path="*" element={<div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center"><h2 className="text-xl font-semibold">Page not found</h2><p className="mt-2 text-sm text-slate-400">Return to the dashboard to continue.</p><Link to="/" className="mt-4 inline-block rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Go home</Link></div>} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
