import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import './style.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container not found');
}

createRoot(container).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/student/:studentId" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
