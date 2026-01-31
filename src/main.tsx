import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ReaderProvider } from './context/ReaderContext';
import { InteractionProvider } from './context/InteractionContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ReaderProvider>
      <InteractionProvider>
        <App />
      </InteractionProvider>
    </ReaderProvider>
  </React.StrictMode>
);
