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
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4">
          <div className="bg-brand-card p-6 rounded-xl shadow-xl max-w-md w-full border border-red-500/20">
            <div className="flex items-center gap-3 text-red-500 mb-4">
              <AlertTriangle className="w-8 h-8" />
              <h1 className="text-xl font-bold">Algo deu errado</h1>
            </div>
            <p className="text-slate-400 mb-4">
              O aplicativo encontrou um erro inesperado. Isso pode acontecer devido a configurações de tradução automática do navegador.
            </p>
            <div className="bg-brand-black p-3 rounded text-xs font-mono text-slate-500 mb-4 overflow-auto max-h-32 border border-brand-border">
              {this.state.error?.toString()}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-brand-primary text-brand-black py-2 px-4 rounded-lg font-bold hover:bg-brand-primary-hover transition-colors"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
