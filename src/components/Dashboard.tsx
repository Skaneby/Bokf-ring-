import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatCurrency } from '../lib/utils';
import { Wallet, TrendingUp, TrendingDown, Landmark } from 'lucide-react';

export function Dashboard() {
  const accounts = useLiveQuery(() => db.accounts.toArray());
  const transactions = useLiveQuery(() => db.transactions.toArray());

  if (!accounts || !transactions) return <div className="p-8 text-gray-500">Laddar data...</div>;

  // Calculate balances
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalRevenue = 0;
  let totalExpense = 0;

  const accountBalances = new Map<number, number>();
  
  transactions.forEach(t => {
    const current = accountBalances.get(t.accountId) || 0;
    accountBalances.set(t.accountId, current + t.amount);
  });

  accounts.forEach(acc => {
    const balance = accountBalances.get(acc.id) || 0;
    if (acc.type === 'asset') totalAssets += balance;
    if (acc.type === 'liability' || acc.type === 'equity') totalLiabilities -= balance; // Credit is negative, so -balance is positive
    if (acc.type === 'revenue') totalRevenue -= balance; // Credit is negative, so -balance is positive
    if (acc.type === 'expense') totalExpense += balance; // Debit is positive
  });

  const result = totalRevenue - totalExpense;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Översikt</h1>
      
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Landmark className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Tillgångar</dt>
                  <dd className="text-lg font-medium text-gray-900">{formatCurrency(totalAssets)}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Wallet className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Skulder & Eget kapital</dt>
                  <dd className="text-lg font-medium text-gray-900">{formatCurrency(totalLiabilities)}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <TrendingUp className="h-6 w-6 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Intäkter</dt>
                  <dd className="text-lg font-medium text-gray-900">{formatCurrency(totalRevenue)}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <TrendingDown className="h-6 w-6 text-red-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Kostnader</dt>
                  <dd className="text-lg font-medium text-gray-900">{formatCurrency(totalExpense)}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Årets resultat</h2>
        <div className={`flex items-baseline text-3xl font-bold ${result >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
          {formatCurrency(result)}
        </div>
        <p className="mt-1 text-sm text-gray-500">Intäkter minus kostnader</p>
      </div>
    </div>
  );
}
