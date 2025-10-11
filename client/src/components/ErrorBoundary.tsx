import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';

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
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
            <div className="text-center">
              <div className="text-6xl mb-4">⚠️</div>
              <h1 className="text-2xl font-bold text-red-600 mb-2">
                Something Went Wrong
              </h1>
              <p className="text-gray-600 mb-4">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
              <div className="bg-gray-100 rounded p-3 mb-4 text-left">
                <p className="text-xs text-gray-700 font-mono">
                  {this.state.error?.stack?.split('\n').slice(0, 3).join('\n')}
                </p>
              </div>
              <div className="space-y-2">
                <Button
                  onClick={() => window.location.reload()}
                  className="w-full"
                  data-testid="button-reload"
                >
                  Reload Page
                </Button>
                <Button
                  onClick={() => {
                    this.setState({ hasError: false, error: null });
                    window.location.href = '/';
                  }}
                  variant="outline"
                  className="w-full"
                  data-testid="button-home"
                >
                  Go to Home
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-4">
                If this issue persists, check your database connection.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
