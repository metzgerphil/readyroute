import { Component } from 'react';

import { EmptyState } from './PortalDesignSystem';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ReadyRoute portal render failed:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <EmptyState
          className="page-error-card"
          title="Something went wrong"
          description="Refresh the page and try again. If this keeps happening, contact ReadyRoute support."
          actions={(
            <button className="primary-cta" onClick={() => window.location.reload()} type="button">
              Refresh Page
            </button>
          )}
        />
      );
    }

    return this.props.children;
  }
}
