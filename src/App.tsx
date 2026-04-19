import React, { useState, useEffect } from 'react';
import { Dashboard } from './components/Dashboard';
import { VoucherEntry } from './components/VoucherEntry';
import { ChartOfAccounts } from './components/ChartOfAccounts';
import { Reports } from './components/Reports';
import { initializeDb } from './db';
import { LayoutDashboard, BookOpen, FileText, Settings, Menu, X } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    initializeDb().catch(console.error);
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Översikt', icon: LayoutDashboard },
    { id: 'voucher', label: 'Bokför', icon: BookOpen },
    { id: 'accounts', label: 'Kontoplan', icon: Settings },
    { id: 'reports', label: 'Rapporter', icon: FileText },
  ];

  const handleNavClick = (id: string) => {
    setActiveTab(id);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-gray-900 text-white p-4 flex justify-between items-center z-20">
        <div>
          <h1 className="text-lg font-bold tracking-wider">Lokal Bokföring</h1>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 hover:bg-gray-800 rounded-md"
        >
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Sidebar */}
      <div className={`
        ${isMobileMenuOpen ? 'block' : 'hidden'} 
        md:flex w-full md:w-64 bg-gray-900 text-white flex-col md:min-h-screen
        absolute md:relative z-10
      `}>
        <div className="hidden md:block p-6">
          <h1 className="text-xl font-bold tracking-wider">Lokal Bokföring</h1>
          <p className="text-xs text-gray-400 mt-1">Privat & Enkel</p>
        </div>
        
        <nav className="flex-1 px-4 py-4 md:py-0 space-y-2 mt-0 md:mt-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === item.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5 mr-3" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto w-full">
        <main className="p-4 md:p-8 max-w-7xl mx-auto">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'voucher' && <VoucherEntry />}
          {activeTab === 'accounts' && <ChartOfAccounts />}
          {activeTab === 'reports' && <Reports />}
        </main>
      </div>
    </div>
  );
}
