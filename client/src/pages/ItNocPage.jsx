import { useEffect, useState } from 'react';

const emptyOutcomes = {};

function ItNocPage({ onRefresh }) {
  const [queue, setQueue] = useState([]);
  const [outcomes, setOutcomes] = useState(emptyOutcomes);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState('');

  const loadQueue = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/it-noc');
      if (!response.ok) throw new Error('failed');
      setQueue(await response.json());
    } catch {
      setMessage('Unable to load the IT NOC queue.');
    }
  };

  useEffect(() => { loadQueue(); }, []);

  const setOutcome = (employeeId, type, itemId, outcome) => {
    setOutcomes((current) => ({ ...current, [employeeId]: { ...(current[employeeId] || {}), [`${type}:${itemId}`]: outcome } }));
  };

  const complete = async (employee) => {
    const values = outcomes[employee.id] || {};
    const assets = employee.assets.map((asset) => ({ id: asset.id, outcome: values[`asset:${asset.id}`] }));
    const accessCards = employee.accessCards.map((card) => ({ id: card.id, outcome: values[`card:${card.id}`] }));
    if ([...assets, ...accessCards].some((item) => !item.outcome)) {
      setMessage(`Choose an outcome for every item assigned to ${employee.empName}.`);
      return;
    }
    try {
      setBusyId(employee.id);
      const response = await fetch(`http://localhost:5000/api/it-noc/${employee.id}/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assets, accessCards }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to complete IT NOC.');
      setMessage(`${employee.empName} has been released. Returned items are now available in inventory.`);
      await Promise.all([loadQueue(), onRefresh()]);
    } catch (error) {
      setMessage(error.message || 'Unable to complete IT NOC.');
    } finally {
      setBusyId('');
    }
  };

  const outcomeSelect = (employee, type, item) => (
    <select value={outcomes[employee.id]?.[`${type}:${item.id}`] || ''} onChange={(event) => setOutcome(employee.id, type, item.id, event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
      <option value="">Choose outcome</option>
      <option value="Returned">Returned and usable</option>
      <option value="Damaged">Returned but damaged</option>
      <option value="Missing">Not returned / missing</option>
    </select>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">IT NOC</h2>
        <p className="mt-1 text-sm text-slate-400">Verify every asset and access card before completing an employee’s release.</p>
      </div>
      {message ? <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}
      {queue.length ? queue.map((employee) => (
        <section key={employee.id} className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="text-xl font-semibold">{employee.empName}</h3><p className="text-sm text-slate-400">{employee.empCode} · Leaving date: {employee.dateOfLeaving}</p></div>
            <button type="button" onClick={() => complete(employee)} disabled={busyId === employee.id} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60">{busyId === employee.id ? 'Completing…' : 'Complete IT NOC & release'}</button>
          </div>
          <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-800 text-slate-400"><tr><th className="px-3 py-2">Type</th><th className="px-3 py-2">Item</th><th className="px-3 py-2">Serial / card no.</th><th className="px-3 py-2">NOC outcome</th></tr></thead><tbody>
            {employee.assets.map((asset) => <tr key={asset.id} className="border-b border-slate-800/80"><td className="px-3 py-3">IT asset</td><td className="px-3 py-3 font-medium">{asset.itemType}</td><td className="px-3 py-3">{asset.serialNumber}</td><td className="px-3 py-3">{outcomeSelect(employee, 'asset', asset)}</td></tr>)}
            {employee.accessCards.map((card) => <tr key={card.id} className="border-b border-slate-800/80"><td className="px-3 py-3">Access card</td><td className="px-3 py-3 font-medium">Access card</td><td className="px-3 py-3">{card.cardNumber}</td><td className="px-3 py-3">{outcomeSelect(employee, 'card', card)}</td></tr>)}
          </tbody></table></div>
        </section>
      )) : <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">No employees currently have items awaiting IT NOC.</div>}
    </div>
  );
}

export default ItNocPage;
