import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { formatCurrency } from '../lib/utils';
import { exportSIE, importSIE } from '../lib/sie';
import { Download, Upload, FileText } from 'lucide-react';

export function Reports() {
  const accounts = useLiveQuery(() => db.accounts.toArray());
  const transactions = useLiveQuery(() => db.transactions.toArray());
  const vouchers = useLiveQuery(() => db.vouchers.orderBy('date').toArray());

  const [activeTab, setActiveTab] = useState<'huvudbok' | 'resultat' | 'balans' | 'export'>('resultat');

  if (!accounts || !transactions || !vouchers) return <div>Laddar...</div>;

  const accountBalances = new Map<number, number>();
  transactions.forEach(t => {
    const current = accountBalances.get(t.accountId) || 0;
    accountBalances.set(t.accountId, current + t.amount);
  });

  const handleExport = async () => {
    const sieData = await exportSIE();
    const blob = new Blob([sieData], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `export_${new Date().toISOString().split('T')[0]}.se`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        await importSIE(text);
        alert('Import lyckades!');
      } catch (err) {
        alert('Fel vid import av SIE-fil.');
        console.error(err);
      }
    };
    reader.readAsText(file);
  };

  const renderResultat = () => {
    const revenues = accounts.filter(a => a.type === 'revenue');
    const expenses = accounts.filter(a => a.type === 'expense');
    
    let totalRev = 0;
    let totalExp = 0;

    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Resultaträkning</h2>
        
        <h3 className="font-semibold text-gray-700 mt-4 mb-2 border-b pb-1">Intäkter</h3>
        {revenues.map(acc => {
          const bal = accountBalances.get(acc.id) || 0;
          if (bal === 0) return null;
          const displayBal = -bal; // Credit is negative, so -bal is positive revenue
          totalRev += displayBal;
          return (
            <div key={acc.id} className="flex justify-between py-1 text-sm">
              <span>{acc.id} {acc.name}</span>
              <span>{formatCurrency(displayBal)}</span>
            </div>
          );
        })}
        <div className="flex justify-between py-2 font-bold text-sm border-t mt-2">
          <span>Summa Intäkter</span>
          <span>{formatCurrency(totalRev)}</span>
        </div>

        <h3 className="font-semibold text-gray-700 mt-6 mb-2 border-b pb-1">Kostnader</h3>
        {expenses.map(acc => {
          const bal = accountBalances.get(acc.id) || 0;
          if (bal === 0) return null;
          totalExp += bal; // Debit is positive
          return (
            <div key={acc.id} className="flex justify-between py-1 text-sm">
              <span>{acc.id} {acc.name}</span>
              <span>{formatCurrency(bal)}</span>
            </div>
          );
        })}
        <div className="flex justify-between py-2 font-bold text-sm border-t mt-2">
          <span>Summa Kostnader</span>
          <span>{formatCurrency(totalExp)}</span>
        </div>

        <div className="flex justify-between py-3 font-bold text-lg border-t-2 border-gray-800 mt-6">
          <span>Årets Resultat</span>
          <span className={totalRev - totalExp >= 0 ? 'text-green-600' : 'text-red-600'}>
            {formatCurrency(totalRev - totalExp)}
          </span>
        </div>
      </div>
    );
  };

  const renderBalans = () => {
    const assets = accounts.filter(a => a.type === 'asset');
    const liabilities = accounts.filter(a => a.type === 'liability' || a.type === 'equity');
    
    let totalAssets = 0;
    let totalLiab = 0;
    let netIncome = 0;

    // Calculate net income for balance sheet
    accounts.forEach(acc => {
      const bal = accountBalances.get(acc.id) || 0;
      if (acc.type === 'revenue') netIncome += -bal;
      if (acc.type === 'expense') netIncome -= bal;
    });

    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Balansräkning</h2>
        
        <h3 className="font-semibold text-gray-700 mt-4 mb-2 border-b pb-1">Tillgångar</h3>
        {assets.map(acc => {
          const bal = accountBalances.get(acc.id) || 0;
          if (bal === 0) return null;
          totalAssets += bal;
          return (
            <div key={acc.id} className="flex justify-between py-1 text-sm">
              <span>{acc.id} {acc.name}</span>
              <span>{formatCurrency(bal)}</span>
            </div>
          );
        })}
        <div className="flex justify-between py-2 font-bold text-sm border-t mt-2">
          <span>Summa Tillgångar</span>
          <span>{formatCurrency(totalAssets)}</span>
        </div>

        <h3 className="font-semibold text-gray-700 mt-6 mb-2 border-b pb-1">Eget kapital och Skulder</h3>
        {liabilities.map(acc => {
          const bal = accountBalances.get(acc.id) || 0;
          if (bal === 0) return null;
          const displayBal = -bal; // Credit is negative
          totalLiab += displayBal;
          return (
            <div key={acc.id} className="flex justify-between py-1 text-sm">
              <span>{acc.id} {acc.name}</span>
              <span>{formatCurrency(displayBal)}</span>
            </div>
          );
        })}
        
        <div className="flex justify-between py-1 text-sm text-blue-600 mt-2">
          <span>Beräknat resultat</span>
          <span>{formatCurrency(netIncome)}</span>
        </div>
        
        <div className="flex justify-between py-2 font-bold text-sm border-t mt-2">
          <span>Summa Eget kapital och Skulder</span>
          <span>{formatCurrency(totalLiab + netIncome)}</span>
        </div>
      </div>
    );
  };

  const renderHuvudbok = () => {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Huvudbok / Verifikationer</h2>
        <div className="space-y-6">
          {vouchers.map(v => {
            const vTrans = transactions.filter(t => t.voucherId === v.id);
            return (
              <div key={v.id} className="border rounded-md p-4 bg-gray-50">
                <div className="flex justify-between font-semibold mb-2">
                  <span>Verifikation {v.id}</span>
                  <span>{v.date} - {v.description}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 border-b">
                        <th className="text-left py-1 min-w-[150px]">Konto</th>
                        <th className="text-right py-1 min-w-[80px]">Debet</th>
                        <th className="text-right py-1 min-w-[80px]">Kredit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vTrans.map(t => {
                        const acc = accounts.find(a => a.id === t.accountId);
                        return (
                          <tr key={t.id} className="border-b border-gray-100 last:border-0">
                            <td className="py-1">{acc?.id} {acc?.name}</td>
                            <td className="text-right py-1">{t.amount > 0 ? t.amount.toFixed(2) : ''}</td>
                            <td className="text-right py-1">{t.amount < 0 ? Math.abs(t.amount).toFixed(2) : ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Rapporter & Export</h1>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {['resultat', 'balans', 'huvudbok', 'export'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === 'resultat' && renderResultat()}
        {activeTab === 'balans' && renderBalans()}
        {activeTab === 'huvudbok' && renderHuvudbok()}
        {activeTab === 'export' && (
          <div className="bg-white shadow rounded-lg p-6 space-y-6">
            <h2 className="text-xl font-bold">SIE-hantering</h2>
            <p className="text-gray-600 text-sm">
              SIE (Standard Import Export) är ett svenskt standardformat för att flytta bokföringsdata mellan olika program.
            </p>
            
            <div className="flex space-x-4">
              <button
                onClick={handleExport}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                <Download className="h-4 w-4 mr-2" /> Exportera SIE4
              </button>
              
              <label className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer">
                <Upload className="h-4 w-4 mr-2" /> Importera SIE4
                <input type="file" accept=".se,.si" className="hidden" onChange={handleImport} />
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
