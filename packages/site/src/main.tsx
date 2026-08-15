import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { Switcher } from './components/Switcher'
import { VariationHeroA } from './variations/VariationHeroA'
import { VariationHeroB } from './variations/VariationHeroB'
import Hero from './surfaces/Hero'
import Landing from './surfaces/Landing'
import './styles/system.css'
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

// HashRouter so the site works on any static host with no server rewrites.
//
// Production surfaces:  "/" is the hero (the poster), "/landing" the document.
// The `/hero-a`, `/hero-b` routes are retained prototype review routes and are
// reachable only by direct URL — the Switcher no longer advertises them.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <Switcher />
      <Routes>
        <Route path="/" element={<Hero />} />
        <Route path="/landing" element={<Landing />} />
        <Route path="/hero-a" element={<VariationHeroA />} />
        <Route path="/hero-b" element={<VariationHeroB />} />
        <Route path="/hero-a/:assetSet" element={<HeroAReviewRoute />} />
        <Route path="/hero-b/:assetSet" element={<HeroBReviewRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>,
)
