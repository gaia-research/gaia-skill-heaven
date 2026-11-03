import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { VariationHeroA } from './variations/VariationHeroA'
import Instrument from './surfaces/Hero'
import Landing from './surfaces/Landing'
import Live from './surfaces/Live'
import Start from './surfaces/Start'
import Console from './surfaces/Console'
import './styles/system.css'

// HashRouter so the site works on any static host with no server rewrites.
//
// Production surfaces:
//   "/"            the hero (Hero A · Reredos) — the official, animated poster.
//   "/landing"     the document.
//   "/instrument"  the static "instrument" sampler — operate the one line to
//                  decide which surface to pick; no scrollytelling.
//   "/live"        the production update: what shipped, the clean-install
//                  receipt, and what stays provisional.
//   "/start"       install & onboarding: pick your harness, get its exact path.
//   "/console"     the inspectable prototype of every status/Lens/receipt
//                  projection, rendered from FIXTURE data and labelled so.
// The old /hero-a, /hero-b variation review routes and the prototype Switcher
// are gone: Hero A is the winner, there is nothing left to switch between.

// Redirect bare paths (e.g. /landing -> /#/landing, /live -> /#/live)
// so direct URLs, bookmarks, and dev server refreshes land on the intended surface.
const barePathMatch = window.location.pathname.match(/^(.*)\/(landing|instrument|live|start|console)\/?$/)
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
        <Route path="/live" element={<Live />} />
        <Route path="/start" element={<Start />} />
        <Route path="/console" element={<Console />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>,
)
