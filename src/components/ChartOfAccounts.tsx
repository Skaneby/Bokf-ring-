import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Account } from '../db';
import { Plus, Save, Trash2 } from 'lucide-react';

export function ChartOfAccounts() {
  const accounts = useLiveQuery(() => db.accounts.orderBy('id').toArray());
  const [isAdding, setIsAdding] = useState(false);
  const [newAccount, setNewAccount] = useState<Partial<Account>>({ type: 'expense' });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccount.id || !newAccount.name || !newAccount.type) return;
    
    try {
      await db.accounts.add(newAccount as Account);
      setIsAdding(false);
      setNewAccount({ type: 'expense' });
    } catch (err) {
      alert('Kunde inte lägga till konto. Kanske kontonumret redan finns?');
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Är du säker på att du vill radera kontot? Det kan orsaka problem om det finns transaktioner kopplade till det.')) {
      await db.accounts.delete(id);
    }
  };

  const typeLabels = {
    asset: 'Tillgång',
    liability: 'Skuld',
    equity: 'Eget kapital',
    revenue: 'Intäkt',
    expense: 'Kostnad'
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Kontoplan (BAS)</h1>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" /> Nytt konto
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAdd} className="bg-gray-50 p-4 rounded-lg border border-gray-200 grid grid-cols-1 sm:grid-cols-5 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700">Kontonr</label>
            <input
              type="number"
              required
              value={newAccount.id || ''}
              onChange={(e) => setNewAccount({ ...newAccount, id: parseInt(e.target.value) })}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Namn</label>
            <input
              type="text"
              required
              value={newAccount.name || ''}
              onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Typ</label>
            <select
              required
              value={newAccount.type}
              onChange={(e) => setNewAccount({ ...newAccount, type: e.target.value as any })}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm"
            >
              <option value="asset">Tillgång</option>
              <option value="liability">Skuld</option>
              <option value="equity">Eget kapital</option>
              <option value="revenue">Intäkt</option>
              <option value="expense">Kostnad</option>
            </select>
          </div>
          <div>
            <button type="submit" className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700">
              <Save className="h-4 w-4 mr-2" /> Spara
            </button>
          </div>
        </form>
      )}

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Konto</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Namn</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Typ</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Åtgärd</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {accounts?.map((acc) => (
                <tr key={acc.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{acc.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{acc.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      {typeLabels[acc.type]}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={() => handleDelete(acc.id)} className="text-red-600 hover:text-red-900 p-2">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
