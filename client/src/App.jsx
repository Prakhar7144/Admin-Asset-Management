import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import EmployeeFormPage from './pages/EmployeeFormPage';
import InventoryPage from './pages/InventoryPage';
import ItNocPage from './pages/ItNocPage';

const PASSWORD_HASH_KEY = 'app_password_hash';
const REMEMBERED_SESSION_KEY = 'app_remembered_session';
const APP_DATA_CACHE_KEY = 'asset_management_app_data';
const TIMEOUT_LIMIT = 5 * 60 * 1000;
// Initial credential is represented only by this precomputed SHA-256 digest.
const DEFAULT_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';

export async function hashPassword(plainText) {
  const bytes = new TextEncoder().encode(plainText);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function readCachedAppData() {
  try {
    const cachedData = JSON.parse(sessionStorage.getItem(APP_DATA_CACHE_KEY) || 'null');
    if (Array.isArray(cachedData?.employees) && cachedData?.inventory) return cachedData;
  } catch {
    // Ignore stale or malformed browser cache and use the API response instead.
  }
  return null;
}

function cacheAppData(employees, inventory) {
  try {
    sessionStorage.setItem(APP_DATA_CACHE_KEY, JSON.stringify({ employees, inventory, savedAt: Date.now() }));
  } catch {
    // A full or unavailable sessionStorage must not affect normal API loading.
  }
}

function LoginView({ onAuthenticate, notice }) {
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState('');

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    const enteredHash = await hashPassword(password);
    const activeHash = localStorage.getItem(PASSWORD_HASH_KEY) || DEFAULT_HASH;
    if (enteredHash !== activeHash) {
      setError('The password is incorrect. Please try again.');
      return;
    }
    onAuthenticate(rememberMe);
  };

  const handleReset = async (event) => {
    event.preventDefault();
    setResetError('');
    if (newPassword.length < 6) {
      setResetError('Your new password must contain at least 6 characters.');
      return;
    }
    const currentHash = await hashPassword(currentPassword);
    const activeHash = localStorage.getItem(PASSWORD_HASH_KEY) || DEFAULT_HASH;
    if (currentHash !== activeHash) {
      setResetError('Your current password is incorrect.');
      return;
    }
    localStorage.setItem(PASSWORD_HASH_KEY, await hashPassword(newPassword));
    localStorage.removeItem(REMEMBERED_SESSION_KEY);
    setPassword('');
    setCurrentPassword('');
    setNewPassword('');
    setShowReset(false);
    onAuthenticate(false, 'Password reset successfully. Please sign in with your new password.');
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 text-slate-100">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-black/30">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">MITL / MNT / F01</p>
        <h1 className="mt-3 text-3xl font-semibold">{showReset ? 'Reset password' : 'Welcome back'}</h1>
        <p className="mt-2 text-sm text-slate-400">{showReset ? 'Confirm your current password to choose a new one.' : 'Sign in to manage the IT asset inventory.'}</p>
        {notice ? <div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</div> : null}
        {showReset ? (
          <form className="mt-6 space-y-4" onSubmit={handleReset}>
            <label className="block text-sm font-medium">Current password<input autoFocus required type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400" /></label>
            <label className="block text-sm font-medium">New password<input required minLength="6" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400" /></label>
            {resetError ? <p className="text-sm text-rose-300">{resetError}</p> : null}
            <button className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 hover:bg-cyan-400">Update password</button>
            <button type="button" onClick={() => { setShowReset(false); setResetError(''); }} className="w-full text-sm text-slate-400 hover:text-cyan-300">Back to sign in</button>
          </form>
        ) : (
          <form className="mt-6 space-y-5" onSubmit={handleLogin}>
            <label className="block text-sm font-medium">Password<input autoFocus required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400" /></label>
            <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-300"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="h-4 w-4 accent-cyan-500" />Remember me on this device</label>
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            <button className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 hover:bg-cyan-400">Sign in</button>
            <button type="button" onClick={() => setShowReset(true)} className="w-full text-sm text-cyan-300 hover:text-cyan-200">Reset password</button>
          </form>
        )}
      </section>
    </main>
  );
}

function useInactivityLock(isAuthenticated, onLock) {
  const lastActive = useRef(Date.now());
  const lastRecordedEvent = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    lastActive.current = Date.now();
    const checkTimeout = () => {
      if (Date.now() - lastActive.current > TIMEOUT_LIMIT) onLock();
    };
    const recordActivity = () => {
      const now = Date.now();
      if (now - lastRecordedEvent.current >= 1000) {
        lastRecordedEvent.current = now;
        lastActive.current = now;
      }
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) checkTimeout();
    };
    const events = ['mousemove', 'keydown', 'click', 'scroll'];
    events.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(checkTimeout, 30 * 1000);
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, recordActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [isAuthenticated, onLock]);
}

function App() {
  const [employees, setEmployees] = useState(() => readCachedAppData()?.employees || []);
  const [inventory, setInventory] = useState(() => readCachedAppData()?.inventory || { accessCards: [], itAssets: [] });
  const [message, setMessage] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem(REMEMBERED_SESSION_KEY) === 'true');
  const [authNotice, setAuthNotice] = useState('');

  const authenticate = useCallback((rememberMe, nextNotice = '') => {
    if (nextNotice) {
      setIsAuthenticated(false);
      setAuthNotice(nextNotice);
      return;
    }
    if (rememberMe) localStorage.setItem(REMEMBERED_SESSION_KEY, 'true');
    else localStorage.removeItem(REMEMBERED_SESSION_KEY);
    setAuthNotice('');
    setIsAuthenticated(true);
  }, []);

  const lockSession = useCallback(() => {
    localStorage.removeItem(REMEMBERED_SESSION_KEY);
    setIsAuthenticated(false);
    setAuthNotice('Your session timed out after 5 minutes of inactivity. Reload the page if needed, then re-authenticate to continue.');
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(REMEMBERED_SESSION_KEY);
    setIsAuthenticated(false);
    setAuthNotice('You have been signed out. Re-authenticate to continue.');
  }, []);

  useInactivityLock(isAuthenticated, lockSession);

  const fetchData = async () => {
    try {
      const [employeesRes, inventoryRes] = await Promise.all([
        fetch('http://localhost:5000/api/employees'),
        fetch('http://localhost:5000/api/inventory'),
      ]);
      const employeesData = await employeesRes.json();
      const inventoryData = await inventoryRes.json();
      const nextInventory = {
        accessCards: Array.isArray(inventoryData?.accessCards) ? inventoryData.accessCards : [],
        itAssets: Array.isArray(inventoryData?.itAssets) ? inventoryData.itAssets : Array.isArray(inventoryData) ? inventoryData : [],
      };
      setEmployees(employeesData);
      setInventory(nextInventory);
      cacheAppData(employeesData, nextInventory);
    } catch (error) {
      setMessage('Unable to connect to the server. Start the backend with npm start inside the server folder.');
    }
  };

  useEffect(() => {
    if (isAuthenticated) fetchData();
  }, [isAuthenticated]);

  if (!isAuthenticated) return <LoginView onAuthenticate={authenticate} notice={authNotice} />;

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">IT ASSET INVENTORY</p>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">MITL / MNT / F01</p>
              <h1 className="mt-2 text-3xl font-semibold sm:text-3xl">Track staff, assigned devices and returned inventory</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">
                Past employees stay visible, and each asset keeps a recorded ownership history.
              </div>
              <button type="button" onClick={() => window.location.reload()} className="rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:border-cyan-400 hover:text-cyan-300">Reload page</button>
              <button type="button" onClick={signOut} className="rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:border-cyan-400 hover:text-cyan-300">Sign out</button>
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
            <NavLink to="/it-noc" className={({ isActive }) => `rounded-full px-4 py-2 text-sm font-medium ${isActive ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>
              IT NOC
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
            <Route path="/inventory" element={<InventoryPage inventory={inventory} employees={employees} onRefresh={fetchData} />} />
            <Route path="/it-noc" element={<ItNocPage onRefresh={fetchData} />} />
            <Route path="*" element={<div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center"><h2 className="text-xl font-semibold">Page not found</h2><p className="mt-2 text-sm text-slate-400">Return to the dashboard to continue.</p><Link to="/" className="mt-4 inline-block rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Go home</Link></div>} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
