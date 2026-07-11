import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { getManagerAccountId, getReadyRouteStaffTokenPayload } from './services/auth';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryKeyHashFn: (queryKey) => JSON.stringify([
        'manager-account',
        getManagerAccountId() || 'anonymous',
        getReadyRouteStaffTokenPayload()?.staff_user_id || 'no-staff',
        queryKey
      ])
    }
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
