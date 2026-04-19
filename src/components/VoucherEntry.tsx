import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Plus, Trash2, Save } from 'lucide-react';
import { format } from 'date-fns';

export function VoucherEntry() {
  const accounts = useLiveQuery(() => db.accounts.orderBy('id').toArray());
  
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState([{ accountId: 1930, debit: '', credit: '' }, { accountId: '', debit: '', credit: '' }]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const addRow = () => {
    setRows([...rows, { accountId: '', debit: '', credit: '' }]);
  };

  const removeRow = (index: number) => {
    if (rows.length > 2) {
      setRows(rows.filter((_, i) => i !== index));
    }
  };

  const updateRow = (index: number, field: string, value: string | number) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    
    // Auto-clear opposite field
    if (field === 'debit' && value !== '') newRows[index].credit = '';
    if (field === 'credit' && value !== '') newRows[index].debit = '';
    
    setRows(newRows);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!date || !description) {
      setError('Datum och beskrivning krävs.');
      return;
    }

    let totalDebit = 0;
    let totalCredit = 0;
    const validRows = [];

    for (const row of rows) {
      if (!row.accountId) continue;
      
      const debit = parseFloat(row.debit as string) || 0;
      const credit = parseFloat(row.credit as string) || 0;
      
      if (debit === 0 && credit === 0) continue;
      
      totalDebit += debit;
      totalCredit += credit;
      
      validRows.push({
        accountId: Number(row.accountId),
        amount: debit > 0 ? debit : -credit
      });
    }

    if (validRows.length < 2) {
      setError('Minst två konteringsrader krävs.');
      return;
    }

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      setError(`Debet (${totalDebit.toFixed(2)}) och Kredit (${totalCredit.toFixed(2)}) balanserar inte! Diff: ${(totalDebit - totalCredit).toFixed(2)}`);
      return;
    }

    setIsSaving(true);
    try {
      // Dexie transactions are atomic. If any part fails, the whole transaction rolls back.
      await db.transaction('rw', db.vouchers, db.transactions, async () => {
        const voucherId = await db.vouchers.add({
          date,
          description,
          created_at: Date.now()
        });

        for (const row of validRows) {
          await db.transactions.add({
            voucherId,
            accountId: row.accountId,
            amount: row.amount
          });
        }
      });

      setSuccess('Verifikation bokförd och säkert sparad i databasen!');
      setDescription('');
      setRows([{ accountId: 1930, debit: '', credit: '' }, { accountId: '', debit: '', credit: '' }]);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError('Ett kritiskt fel uppstod. Transaktionen kunde inte sparas.');
      console.error('Transaction failed:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const totalDebit = rows.reduce((sum, row) => sum + (parseFloat(row.debit as string) || 0), 0);
  const totalCredit = rows.reduce((sum, row) => sum + (parseFloat(row.credit as string) || 0), 0);
  const diff = totalDebit - totalCredit;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Ny Verifikation</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-4 md:p-6 space-y-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Datum</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Beskrivning</label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="T.ex. Inköp kontorsmaterial"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>
        </div>

        <div className="mt-8 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-2 md:px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[200px]">Konto</th>
                <th className="px-2 md:px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">Debet</th>
                <th className="px-2 md:px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">Kredit</th>
                <th className="px-2 md:px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows.map((row, index) => (
                <tr key={index}>
                  <td className="px-2 md:px-3 py-2">
                    <select
                      value={row.accountId}
                      onChange={(e) => updateRow(index, 'accountId', e.target.value)}
                      className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                      <option value="">Välj konto...</option>
                      {accounts?.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.id} - {acc.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 md:px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.debit}
                      onChange={(e) => updateRow(index, 'debit', e.target.value)}
                      disabled={row.credit !== ''}
                      className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
                    />
                  </td>
                  <td className="px-2 md:px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.credit}
                      onChange={(e) => updateRow(index, 'credit', e.target.value)}
                      disabled={row.debit !== ''}
                      className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100"
                    />
                  </td>
                  <td className="px-2 md:px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      disabled={rows.length <= 2}
                      className="text-red-600 hover:text-red-900 disabled:opacity-50 p-2"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50">
                <td className="px-2 md:px-3 py-3 text-sm font-medium text-gray-900 text-right">Summa:</td>
                <td className="px-2 md:px-3 py-3 text-sm font-medium text-gray-900">{totalDebit.toFixed(2)}</td>
                <td className="px-2 md:px-3 py-3 text-sm font-medium text-gray-900">{totalCredit.toFixed(2)}</td>
                <td></td>
              </tr>
              {Math.abs(diff) > 0.01 && (
                <tr>
                  <td colSpan={4} className="px-2 md:px-3 py-2 text-sm text-red-600 text-right">
                    Differens: {Math.abs(diff).toFixed(2)}
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
          
          <div className="mt-4">
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Plus className="h-4 w-4 mr-1" /> Lägg till rad
            </button>
          </div>
        </div>

        {error && <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 font-medium">{error}</div>}
        {success && <div className="rounded-md bg-green-50 p-4 text-sm text-green-700 font-medium">{success}</div>}

        <div className="pt-5 flex justify-end">
          <button
            type="submit"
            disabled={Math.abs(diff) > 0.01 || validRowsLengthCheck(rows) < 2 || isSaving}
            className="inline-flex justify-center items-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isSaving ? (
              <>Sparar...</>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" /> Bokför
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function validRowsLengthCheck(rows: any[]) {
  return rows.filter(r => r.accountId && (r.debit || r.credit)).length;
}
