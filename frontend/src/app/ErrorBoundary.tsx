import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Route error', error, info.componentStack); }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" data-testid="route-error" className="empty">
        <div>😕</div>
        <b>Something went wrong on this page</b>
        <p>{this.state.error.message}</p>
        <button type="button" className="btn sm" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
