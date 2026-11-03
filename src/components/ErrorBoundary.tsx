import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: '#fb7185', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          Ошибка приложения:{'\n'}
          {this.state.error.message}
          {'\n\n'}
          {this.state.error.stack}
        </div>
      );
    }
    return this.props.children;
  }
}