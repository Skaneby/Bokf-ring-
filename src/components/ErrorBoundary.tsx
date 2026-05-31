import React from 'react';

interface State { error: Error | null }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Uncaught render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="w-full max-w-md space-y-4 text-center">
            <h1 className="text-2xl font-bold text-slate-900">Något gick fel</h1>
            <p className="text-sm text-slate-500 font-mono bg-slate-100 rounded p-3 text-left break-all">
              {this.state.error.message}
            </p>
            <p className="text-xs text-slate-400">
              Om felet kvarstår kan du nollställa appen via{' '}
              <code className="bg-slate-100 px-1 rounded">?reset=1</code> i URL:en (raderar all data).
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
            >
              Ladda om
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
