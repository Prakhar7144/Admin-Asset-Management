import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

const initialForm = {
  empCode: '',
  empName: '',
  accessCard: '',
  dateOfLeaving: '',
  assets: [{ itemType: 'Laptop', serialNumber: '' }],
};

function EmployeeFormPage({ employees, onRefresh }) {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState('');

  const employee = useMemo(() => employees.find((entry) => entry.id === employeeId), [employeeId, employees]);

  useEffect(() => {
    if (employee) {
      setForm({
        empCode: employee.empCode || '',
        empName: employee.empName || '',
        accessCard: employee.accessCard || '',
        dateOfLeaving: employee.dateOfLeaving || '',
        assets: (employee.assets || []).map((asset) => ({
          id: asset.id,
          itemType: asset.itemType || 'Laptop',
          serialNumber: asset.serialNumber || '',
        })),
      });
    }
  }, [employee]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleAssetChange = (index, field, value) => {
    setForm((current) => {
      const assets = [...current.assets];
      assets[index] = { ...assets[index], [field]: value };
      return { ...current, assets };
    });
  };

  const addAssetRow = () => {
    setForm((current) => ({ ...current, assets: [...current.assets, { itemType: 'Headphone', serialNumber: '' }] }));
  };

  const removeAssetRow = (index) => {
    setForm((current) => ({ ...current, assets: current.assets.filter((_, currentIndex) => currentIndex !== index) }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const url = employeeId
        ? `http://localhost:5000/api/employees/${employeeId}`
        : 'http://localhost:5000/api/employees';
      const method = employeeId ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error('Failed to save');
      setMessage(employeeId ? 'Employee updated successfully.' : 'Employee created successfully.');
      onRefresh();
      if (!employeeId) {
        setForm(initialForm);
      }
      navigate('/employees');
    } catch (error) {
      setMessage('Unable to save the employee record.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">{employeeId ? 'Edit employee' : 'Create employee'}</h2>
          <p className="mt-1 text-sm text-slate-400">Update employee details, leaving date, and assigned assets.</p>
        </div>
        <Link to="/employees" className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200">Back</Link>
      </div>

      {message ? <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200">{message}</div> : null}

      <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="text-slate-300">Employee code</span>
            <input name="empCode" value={form.empCode} onChange={handleChange} required className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none" placeholder="EMP-101" />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-slate-300">Employee name</span>
            <input name="empName" value={form.empName} onChange={handleChange} required className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none" placeholder="Asha Rao" />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-slate-300">Access card</span>
            <input name="accessCard" value={form.accessCard} onChange={handleChange} required className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none" placeholder="AC-2048" />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-slate-300">Date of leaving</span>
            <input name="dateOfLeaving" type="date" value={form.dateOfLeaving} onChange={handleChange} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none" />
          </label>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">Assigned assets</h3>
            <button type="button" onClick={addAssetRow} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200">Add asset</button>
          </div>
          <div className="space-y-3">
            {form.assets.map((asset, index) => (
              <div key={asset.id || index} className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3 md:grid-cols-[1fr_1.2fr_auto]">
                <select value={asset.itemType} onChange={(event) => handleAssetChange(index, 'itemType', event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
                  <option>Laptop</option>
                  <option>Headphone</option>
                  <option>Monitor</option>
                  <option>Mobile</option>
                </select>
                <input value={asset.serialNumber} onChange={(event) => handleAssetChange(index, 'serialNumber', event.target.value)} placeholder="Serial number" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none" />
                <button type="button" onClick={() => removeAssetRow(index)} className="rounded-lg border border-rose-500/30 px-3 py-2 text-sm text-rose-200">Remove</button>
              </div>
            ))}
          </div>
        </div>

        <button type="submit" className="mt-6 w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400">Save employee</button>
      </form>
    </div>
  );
}

export default EmployeeFormPage;
