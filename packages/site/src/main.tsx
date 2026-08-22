import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { VariationHeroA } from './variations/VariationHeroA'
import Instrument from './surfaces/Hero'
import Landing from './surfaces/Landing'
import './styles/system.css'

// HashRouter so the site works on any static host with no server rewrites.
//
// Production surfaces:
//   "/"            the hero (Hero A · Reredos) — the official, animated poster.
//   "/landing"     the document.
//   "/instrument"  the static "instrument" sampler — operate the one line to
//                  decide which surface to pick; no scrollytelling.
// The old /hero-a, /hero-b variation review routes and the prototype Switcher
// are gone: Hero A is the winner, there is nothing left to switch between.

// Redirect bare paths (e.g. /landing -> /#/landing, /instrument -> /#/instrument)
// so direct URLs, bookmarks, and dev server refreshes land on the intended surface.
const barePathMatch = window.location.pathname.match(/^(.*)\/(landing|instrument)\/?$/)
if (barePathMatch) {
  const [, base, route] = barePathMatch
  const targetBase = base ? `${base}/` : '/'
  const target = `${targetBase}#/${route}${window.location.search}${window.location.hash}`
  window.history.replaceState(null, '', target)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<VariationHeroA />} />
        <Route path="/landing" element={<Landing />} />
        <Route path="/instrument" element={<Instrument />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>,
)
