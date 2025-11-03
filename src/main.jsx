import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import '@/index.css';
import 'leaflet/dist/leaflet.css';
import { AuthProvider } from '@/contexts/SupabaseAuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { HelmetProvider } from 'react-helmet-async';

// Registrar service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <>
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <HelmetProvider>
            <App /> 
          </HelmetProvider>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  </>
);