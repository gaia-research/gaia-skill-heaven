import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Switcher } from './components/Switcher'
import { VariationHeroA } from './variations/VariationHeroA'
import { VariationHeroB } from './variations/VariationHeroB'
import './styles/tokens.css'
import './styles/switcher.css'

// HashRouter so the prototype works on any static host with no server rewrites.
// Hero A is the current winner — "/" and unmatched routes land there.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <Switcher />
      <Routes>
        <Route path="/" element={<Navigate to="/hero-a" replace />} />
        <Route path="/hero-a" element={<VariationHeroA />} />
        <Route path="/hero-b" element={<VariationHeroB />} />
        <Route path="*" element={<Navigate to="/hero-a" replace />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>,
)
