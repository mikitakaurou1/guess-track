import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import RoomChat from './components/RoomChat';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    <ErrorBoundary>
      <RoomChat />
    </ErrorBoundary>
  </React.StrictMode>,
);
