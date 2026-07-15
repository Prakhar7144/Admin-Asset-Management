import { useMemo, useState } from 'react';

const initialCardForm = { cardNumber: '', employeeName: '', employeeCode: '', status: 'Assigned', returnedAt: '' };
const initialAssetForm = { itemType: 'Laptop', serialNumber: '', employeeName: '', employeeCode: '', status: 'Unallocated' };

function InventoryPage({ inventory, onRefresh }) {
  const [activeTab, setActiveTab] = useState('itAssets');
  const [selectedItem, setSelectedItem] = useState(null);
  const [cardForm, setCardForm] = useState(initialCardForm);
  const [assetForm, setAssetForm] = useState(initialAssetForm);
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const accessCards = inventory.accessCards || [];
  const itAssets = inventory.itAssets || [];

  const filteredAccessCards = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return accessCards;

    return accessCards.filter((card) => {
      const haystack = [card.cardNumber, card.employeeName, card.employeeCode, card.status].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [accessCards, searchTerm]);

  const filteredItAssets = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return itAssets;

    return itAssets.filter((asset) => {
      const haystack = [asset.itemType, asset.serialNumber, asset.employeeName, asset.employeeCode, asset.status, (asset.history || []).map((entry) => entry.employeeName || entry.employeeCode).filter(Boolean).join(' ')].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [itAssets, searchTerm]);

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

  const handleDeleteCard = async (cardId) => {
    const confirmed = window.confirm('Delete this access card?');
    if (!confirmed) return;

    try {
      const response = await fetch(`http://localhost:5000/api/inventory/access-cards/${cardId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('failed');
      setMessage('Access card deleted.');
      onRefresh();
    } catch (error) {
      setMessage('Unable to delete access card.');
    }
  };

  const handleDeleteAsset = async (assetId) => {
    const confirmed = window.confirm('Delete this IT asset?');
    if (!confirmed) return;

    try {
      const response = await fetch(`http://localhost:5000/api/inventory/it-assets/${assetId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('failed');
      setMessage('IT asset deleted.');
      onRefresh();
    } catch (error) {
      setMessage('Unable to delete IT asset.');
    }
  };

  const handleCardSubmit = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch('http://localhost:5000/api/inventory/access-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cardForm),
      });
      if (!response.ok) throw new Error('failed');
      setCardForm(initialCardForm);
      setMessage('Access card added.');
      onRefresh();
    } catch (error) {
      setMessage('Unable to add access card.');
    }
  };

  const handleAssetSubmit = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch('http://localhost:5000/api/inventory/it-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assetForm),
      });
      if (!response.ok) throw new Error('failed');
      setAssetForm(initialAssetForm);
      setMessage('IT asset added.');
      onRefresh();
    } catch (error) {
      setMessage('Unable to add IT asset.');
    }
  };

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

      {message ? <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-100">{currentLabel}</h3>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={`Search ${activeTab === 'accessCards' ? 'cards' : 'assets'}`}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none"
            />
            <span className="text-sm text-slate-400">{activeTab === 'accessCards' ? `${filteredAccessCards.length} cards` : `${filteredItAssets.length} assets`}</span>
          </div>
        </div>

        {activeTab === 'accessCards' ? (
          <form onSubmit={handleCardSubmit} className="mb-4 grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 md:grid-cols-4">
            <input value={cardForm.cardNumber} onChange={(event) => setCardForm({ ...cardForm, cardNumber: event.target.value })} placeholder="Card number" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" required />
            <input value={cardForm.employeeName} onChange={(event) => setCardForm({ ...cardForm, employeeName: event.target.value })} placeholder="Employee name" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
            <input value={cardForm.employeeCode} onChange={(event) => setCardForm({ ...cardForm, employeeCode: event.target.value })} placeholder="Employee code" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
            <button type="submit" className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950">Add card</button>
          </form>
        ) : (
          <form onSubmit={handleAssetSubmit} className="mb-4 grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 md:grid-cols-4">
            <select value={assetForm.itemType} onChange={(event) => setAssetForm({ ...assetForm, itemType: event.target.value })} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm">
              <option>Laptop</option>
              <option>Monitor</option>
              <option>Mobile</option>
              <option>Headphone</option>
            </select>
            <input value={assetForm.serialNumber} onChange={(event) => setAssetForm({ ...assetForm, serialNumber: event.target.value })} placeholder="Serial number" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" required />
            <input value={assetForm.employeeName} onChange={(event) => setAssetForm({ ...assetForm, employeeName: event.target.value })} placeholder="Current holder" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
            <button type="submit" className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950">Add asset</button>
          </form>
        )}

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
                    <th className="px-3 py-3">Action</th>
                  </>
                ) : (
                  <>
                    <th className="px-3 py-3">Asset</th>
                    <th className="px-3 py-3">Serial</th>
                    <th className="px-3 py-3">Current holder</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Journey</th>
                    <th className="px-3 py-3">Action</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {activeTab === 'accessCards' ? (
                filteredAccessCards.length ? filteredAccessCards.map((card) => (
                  <tr key={card.id} className="cursor-pointer border-b border-slate-800/80 hover:bg-slate-800/70" onClick={() => setSelectedItem(card)}>
                    <td className="px-3 py-3 font-medium text-slate-100">{card.cardNumber}</td>
                    <td className="px-3 py-3">{card.employeeName || 'Unassigned'}</td>
                    <td className="px-3 py-3">{card.status}</td>
                    <td className="px-3 py-3">{card.returnedAt || '—'}</td>
                    <td className="px-3 py-3">
                      <button type="button" onClick={(event) => { event.stopPropagation(); handleDeleteCard(card.id); }} className="text-sm font-semibold text-rose-300">Delete</button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="5" className="px-3 py-6 text-center text-sm text-slate-400">No cards match the current search.</td>
                  </tr>
                )
              ) : (
                filteredItAssets.length ? filteredItAssets.map((asset) => (
                  <tr key={asset.id} className="cursor-pointer border-b border-slate-800/80 align-top hover:bg-slate-800/70" onClick={() => setSelectedItem(asset)}>
                    <td className="px-3 py-3 font-medium text-slate-100">{asset.itemType}</td>
                    <td className="px-3 py-3">{asset.serialNumber}</td>
                    <td className="px-3 py-3">{asset.employeeName || 'Unassigned'}</td>
                    <td className="px-3 py-3">{asset.status}</td>
                    <td className="px-3 py-3 max-w-[18rem] text-slate-400">{renderJourney(asset)}</td>
                    <td className="px-3 py-3">
                      <button type="button" onClick={(event) => { event.stopPropagation(); handleDeleteAsset(asset.id); }} className="text-sm font-semibold text-rose-300">Delete</button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="6" className="px-3 py-6 text-center text-sm text-slate-400">No assets match the current search.</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedItem ? (
        <div onClick={() => setSelectedItem(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-slate-100">{selectedItem.cardNumber || selectedItem.itemType}</h3>
                <p className="mt-1 text-sm text-slate-400">{selectedItem.serialNumber ? `Serial: ${selectedItem.serialNumber}` : `Employee: ${selectedItem.employeeName || 'Unassigned'}`}</p>
              </div>
              <button type="button" onClick={() => setSelectedItem(null)} className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300">Close</button>
            </div>

            <div className="mt-6 space-y-3">
              {renderTimeline(selectedItem).length ? (
                <div className="space-y-3">
                  {renderTimeline(selectedItem).map((entry, index) => (
                    <div key={`${entry.employeeId || 'entry'}-${index}`} className="flex flex-col gap-2 md:flex-row md:items-center">
                      <div className="flex min-w-12 flex-col items-center md:items-start">
                        <div className={`h-3 w-3 rounded-full ${entry.returnedAt ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                        {index < renderTimeline(selectedItem).length - 1 ? <div className="mt-2 hidden h-8 w-px bg-slate-700 md:block" /> : null}
                      </div>
                      <div className="flex-1 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-100">{entry.employeeName || 'Unassigned'}</div>
                            <div className="text-sm text-slate-400">{entry.employeeCode || '—'}</div>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${entry.returnedAt ? 'border border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
                            {entry.returnedAt ? 'Returned' : 'Assigned'}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-slate-400 md:grid-cols-2">
                          <div>From: {entry.assignedAt ? new Date(entry.assignedAt).toLocaleDateString() : '—'}</div>
                          <div>To: {entry.returnedAt ? new Date(entry.returnedAt).toLocaleDateString() : 'Still in use'}</div>
                        </div>
                      </div>
                      {index < renderTimeline(selectedItem).length - 1 ? <div className="hidden text-slate-500 md:block">→</div> : null}
                    </div>
                  ))}
                </div>
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
