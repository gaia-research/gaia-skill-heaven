import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Switcher } from './components/Switcher'
import { VariationDefault } from './variations/VariationDefault'
import { VariationOverdrive } from './variations/VariationOverdrive'
import { VariationPrism } from './variations/VariationPrism'
import { VariationManifesto } from './variations/VariationManifesto'
import { VariationInstrument } from './variations/VariationInstrument'
import { VariationOneBit } from './variations/VariationOneBit'
import './styles/tokens.css'
import './styles/switcher.css'

// HashRouter so the prototype works on any static host with no server rewrites.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <Switcher />
      <Routes>
        <Route path="/" element={<Navigate to="/overdrive" replace />} />
        <Route path="/default" element={<VariationDefault />} />
        <Route path="/overdrive" element={<VariationOverdrive />} />
        <Route path="/prism" element={<VariationPrism />} />
        <Route path="/manifesto" element={<VariationManifesto />} />
        <Route path="/instrument" element={<VariationInstrument />} />
        <Route path="/onebit" element={<VariationOneBit />} />
        <Route path="*" element={<Navigate to="/overdrive" replace />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>,
)
