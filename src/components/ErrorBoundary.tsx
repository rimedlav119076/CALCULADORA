import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-100 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-xl shadow-xl max-w-md w-full border border-red-200">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle className="w-8 h-8" />
              <h1 className="text-xl font-bold">Algo deu errado</h1>
            </div>
            <p className="text-zinc-600 mb-4">
              O aplicativo encontrou um erro inesperado. Isso pode acontecer devido a configurações de tradução automática do navegador.
            </p>
            <div className="bg-zinc-100 p-3 rounded text-xs font-mono text-zinc-500 mb-4 overflow-auto max-h-32">
              {this.state.error?.toString()}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-red-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-red-700 transition-colors"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return (this.props as any).children;
  }
}
