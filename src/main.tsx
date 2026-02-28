import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { InteractionProvider } from './context/InteractionContext';
import { ReaderProvider } from './context/ReaderContext';
import { AuthProvider } from './contexts/AuthContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ReaderProvider>
          <InteractionProvider>
            <App />
          </InteractionProvider>
        </ReaderProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
