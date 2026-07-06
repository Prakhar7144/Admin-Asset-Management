function InventoryPage({ inventory, onRefresh }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Inventory</h2>
          <p className="mt-1 text-sm text-slate-400">View all unallocated assets that are available for reassignment.</p>
        </div>
        <button onClick={onRefresh} className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200">Refresh</button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {inventory.map((asset) => (
          <div key={asset.id} className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between">
              <div className="font-medium text-slate-100">{asset.itemType}</div>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">{asset.status}</span>
            </div>
            <div className="mt-3 text-sm text-slate-400">Serial: {asset.serialNumber}</div>
            <div className="mt-2 text-sm text-slate-500">Released from {asset.employeeName || 'employee'} • {asset.employeeCode || '—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default InventoryPage;
