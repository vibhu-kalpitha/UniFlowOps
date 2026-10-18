import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    try {
      sessionStorage.removeItem('uniflow_draft_po_general');
      sessionStorage.removeItem('uniflow_copy_source_po_id');
      sessionStorage.removeItem('uniflow_draft_po_shifts');
      sessionStorage.removeItem('uniflow_draft_po_configs');
      sessionStorage.removeItem('uniflow_draft_po_box_configs');
    } catch (e) {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '24px',
          maxWidth: '560px',
          margin: '40px auto',
          backgroundColor: 'var(--bg-surface-1, #0f242e)',
          border: '1.5px solid rgba(239, 68, 68, 0.4)',
          borderRadius: '16px',
          color: 'var(--text-primary, #ffffff)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          textAlign: 'center',
          alignItems: 'center'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ef4444'
          }}>
            <AlertTriangle size={26} />
          </div>

          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 6px 0' }}>
              {this.props.fallbackTitle || 'Something went wrong displaying this page'}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary, #94a3b8)', margin: 0 }}>
              {this.state.error?.message || 'An unexpected rendering error occurred.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '8px' }}>
            <button
              type="button"
              onClick={this.handleReset}
              className="btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 18px',
                fontSize: '13px',
                borderRadius: '10px'
              }}
            >
              <RefreshCw size={15} /> Clear Draft &amp; Reload
            </button>
            <button
              type="button"
              onClick={() => window.location.href = '/supervisor/home'}
              className="btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 18px',
                fontSize: '13px',
                borderRadius: '10px'
              }}
            >
              <Home size={15} /> Go to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
