import React from 'react'
import ReactDOM from 'react-dom/client'
import { VariationHeroB } from './variations/VariationHeroB'
import './styles/tokens.css'

// Hero B is the selected design. Prototype switcher removed.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <VariationHeroB />
  </React.StrictMode>,
)
