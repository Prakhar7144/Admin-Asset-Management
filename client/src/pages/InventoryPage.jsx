import { useState } from 'react';

function InventoryPage({ inventory, onRefresh }) {
  const [activeTab, setActiveTab] = useState('itAssets');
  const [selectedItem, setSelectedItem] = useState(null);

  const accessCards = inventory.accessCards || [];
  const itAssets = inventory.itAssets || [];

  const renderJourney = (item) => {
    const history = Array.isArray(item?.history) ? item.history : [];
    if (!history.length) return 'No history yet';
    return history.map((entry) => entry.employeeName || entry.employeeCode || 'Unknown').join(' → ');
  };

  const renderTimeline = (item) => {
    if (!item) return [];
    return (item.history || []).slice().sort((a, b) => (a.assignedAt || '').localeCompare(b.assignedAt || ''));
  };

  const currentLabel = activeTab === 'accessCards' ? 'Access cards' : 'IT assets';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Inventory</h2>
          <p className="mt-1 text-sm text-slate-400">Switch between access cards and IT assets, then open any row to view the full ownership timeline.</p>
        </div>
        <button onClick={onRefresh} className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200">Refresh</button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-full border border-slate-800 bg-slate-900 p-2">
        <button type="button" onClick={() => setActiveTab('accessCards')} className={`rounded-full px-4 py-2 text-sm font-semibold ${activeTab === 'accessCards' ? 'bg-cyan-500 text-slate-950' : 'text-slate-300'}`}>
          Access cards
        </button>
        <button type="button" onClick={() => setActiveTab('itAssets')} className={`rounded-full px-4 py-2 text-sm font-semibold ${activeTab === 'itAssets' ? 'bg-cyan-500 text-slate-950' : 'text-slate-300'}`}>
          IT assets
        </button>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-100">{currentLabel}</h3>
          <span className="text-sm text-slate-400">{activeTab === 'accessCards' ? `${accessCards.length} cards` : `${itAssets.length} assets`}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-950/70 text-slate-400">
              <tr>
                {activeTab === 'accessCards' ? (
                  <>
                    <th className="px-3 py-3">Card</th>
                    <th className="px-3 py-3">Employee</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Returned on</th>
                  </>
                ) : (
                  <>
                    <th className="px-3 py-3">Asset</th>
                    <th className="px-3 py-3">Serial</th>
                    <th className="px-3 py-3">Current holder</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Journey</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {activeTab === 'accessCards' ? (
                accessCards.map((card) => (
                  <tr key={card.id} className="cursor-pointer border-b border-slate-800/80 hover:bg-slate-800/70" onClick={() => setSelectedItem(card)}>
                    <td className="px-3 py-3 font-medium text-slate-100">{card.cardNumber}</td>
                    <td className="px-3 py-3">{card.employeeName || 'Unassigned'}</td>
                    <td className="px-3 py-3">{card.status}</td>
                    <td className="px-3 py-3">{card.returnedAt || '—'}</td>
                  </tr>
                ))
              ) : (
                itAssets.map((asset) => (
                  <tr key={asset.id} className="cursor-pointer border-b border-slate-800/80 align-top hover:bg-slate-800/70" onClick={() => setSelectedItem(asset)}>
                    <td className="px-3 py-3 font-medium text-slate-100">{asset.itemType}</td>
                    <td className="px-3 py-3">{asset.serialNumber}</td>
                    <td className="px-3 py-3">{asset.employeeName || 'Unassigned'}</td>
                    <td className="px-3 py-3">{asset.status}</td>
                    <td className="px-3 py-3 max-w-[18rem] text-slate-400">{renderJourney(asset)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-slate-100">{selectedItem.cardNumber || selectedItem.itemType}</h3>
                <p className="mt-1 text-sm text-slate-400">{selectedItem.serialNumber ? `Serial: ${selectedItem.serialNumber}` : `Employee: ${selectedItem.employeeName || 'Unassigned'}`}</p>
              </div>
              <button type="button" onClick={() => setSelectedItem(null)} className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300">Close</button>
            </div>

            <div className="mt-6 space-y-3">
              {renderTimeline(selectedItem).length ? (
                renderTimeline(selectedItem).map((entry, index) => (
                  <div key={`${entry.employeeId || 'entry'}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-100">{entry.employeeName || 'Unassigned'}</div>
                        <div className="text-sm text-slate-400">{entry.employeeCode || '—'}</div>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${entry.returnedAt ? 'border border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
                        {entry.returnedAt ? 'Returned' : 'Current'}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-slate-400 md:grid-cols-2">
                      <div>Assigned: {entry.assignedAt ? new Date(entry.assignedAt).toLocaleDateString() : '—'}</div>
                      <div>Returned: {entry.returnedAt ? new Date(entry.returnedAt).toLocaleDateString() : 'Still in use'}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">No journey data is available yet.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default InventoryPage;
