import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { Switcher } from './components/Switcher'
import { VariationHeroA } from './variations/VariationHeroA'
import { VariationHeroB } from './variations/VariationHeroB'
import './styles/tokens.css'
import './styles/switcher.css'

function HeroAReviewRoute() {
  const { assetSet } = useParams()
  return <VariationHeroA assetSet={assetSet} />
}

function HeroBReviewRoute() {
  const { assetSet } = useParams()
  return <VariationHeroB assetSet={assetSet} />
}

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
        <Route path="/hero-a/:assetSet" element={<HeroAReviewRoute />} />
        <Route path="/hero-b/:assetSet" element={<HeroBReviewRoute />} />
        <Route path="*" element={<Navigate to="/hero-a" replace />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>,
)
