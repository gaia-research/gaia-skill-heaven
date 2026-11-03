import React, { useState, useEffect, useRef, useCallback } from 'react'

export interface FigPreset {
  zoom: number
  x: number
  y: number
  origin: string
}

interface LucyTunerHUDProps {
  scene: 'zero' | 'heaven' | 'hell' | 'ultra'
  figBase: FigPreset
  rootRef: React.RefObject<HTMLDivElement | null>
  onReset?: () => void
  onSelectScene?: (scene: 'zero' | 'heaven' | 'hell' | 'ultra') => void
}

const ALL_PRESETS: Record<string, FigPreset> = {
  zero: { zoom: 1.5, x: 1.2, y: 2, origin: '47% 30%' },
  heaven: { zoom: 1.5, x: -2.1, y: 2, origin: '49% 27%' },
  hell: { zoom: 1.5, x: 1.8, y: 2, origin: '47% 30%' },
  ultra: { zoom: 1.4, x: 3.2, y: 3, origin: '45% 24%' },
}

export function LucyTunerHUD({
  scene,
  figBase,
  rootRef,
  onReset,
  onSelectScene,
}: LucyTunerHUDProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [dragMode, setDragMode] = useState(true)
  const [showViewfinder, setShowViewfinder] = useState(true)
  const [syncAll, setSyncAll] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  // Offsets in vh (relative to base preset)
  const [offsets, setOffsets] = useState<Record<string, { x: number; y: number }>>({
    zero: { x: 0, y: 0 },
    heaven: { x: 0, y: 0 },
    hell: { x: 0, y: 0 },
    ultra: { x: 0, y: 0 },
  })

  // Zoom multipliers
  const [zooms, setZooms] = useState<Record<string, number>>({
    zero: 1,
    heaven: 1,
    hell: 1,
    ultra: 1,
  })

  const currentOffset = offsets[scene] || { x: 0, y: 0 }
  const currentZoom = zooms[scene] || 1

  // Floating HUD position
  const [hudPos, setHudPos] = useState({ x: 20, y: 70 })
  const isDraggingHudRef = useRef(false)
  const hudDragStartRef = useRef({ clientX: 0, clientY: 0, hudX: 20, hudY: 70 })

  // References for dragging Lucy
  const isDraggingLucyRef = useRef(false)
  const lucyDragStartRef = useRef({ clientX: 0, clientY: 0, startX: 0, startY: 0 })

  // Listen to zoom changes from trackpad pinch in useHeroEngine
  useEffect(() => {
    const onZoomChange = (e: Event) => {
      const custom = e as CustomEvent<{ zoom: number }>
      if (typeof custom.detail?.zoom === 'number') {
        const next = custom.detail.zoom
        if (syncAll) {
          setZooms({ zero: next, heaven: next, hell: next, ultra: next })
        } else {
          setZooms((prev) => ({ ...prev, [scene]: next }))
        }
      }
    }
    window.addEventListener('lucy-user-zoom-change', onZoomChange)
    return () => window.removeEventListener('lucy-user-zoom-change', onZoomChange)
  }, [scene, syncAll])

  // Sync offsets with CSS variables
  const updateOffsets = useCallback(
    (newX: number, newY: number) => {
      if (syncAll) {
        setOffsets({
          zero: { x: newX, y: newY },
          heaven: { x: newX, y: newY },
          hell: { x: newX, y: newY },
          ultra: { x: newX, y: newY },
        })
      } else {
        setOffsets((prev) => ({ ...prev, [scene]: { x: newX, y: newY } }))
      }
      if (rootRef.current) {
        rootRef.current.style.setProperty('--lucy-offset-x', `${newX.toFixed(2)}vh`)
        rootRef.current.style.setProperty('--lucy-offset-y', `${newY.toFixed(2)}vh`)
      }
    },
    [rootRef, scene, syncAll],
  )

  const updateZoom = useCallback(
    (newZoom: number) => {
      if (syncAll) {
        setZooms({ zero: newZoom, heaven: newZoom, hell: newZoom, ultra: newZoom })
      } else {
        setZooms((prev) => ({ ...prev, [scene]: newZoom }))
      }
      if (rootRef.current) {
        rootRef.current.style.setProperty('--lucy-user-zoom', newZoom.toFixed(4))
      }
      window.dispatchEvent(new CustomEvent('lucy-set-zoom', { detail: { zoom: newZoom } }))
    },
    [rootRef, scene, syncAll],
  )

  // Keep CSS variables updated when scene changes
  useEffect(() => {
    const off = offsets[scene] || { x: 0, y: 0 }
    const zm = zooms[scene] || 1
    if (rootRef.current) {
      rootRef.current.style.setProperty('--lucy-offset-x', `${off.x.toFixed(2)}vh`)
      rootRef.current.style.setProperty('--lucy-offset-y', `${off.y.toFixed(2)}vh`)
      rootRef.current.style.setProperty('--lucy-user-zoom', zm.toFixed(4))
    }
  }, [scene, offsets, zooms, rootRef])

  const resetAll = useCallback(() => {
    setOffsets({
      zero: { x: 0, y: 0 },
      heaven: { x: 0, y: 0 },
      hell: { x: 0, y: 0 },
      ultra: { x: 0, y: 0 },
    })
    setZooms({ zero: 1, heaven: 1, hell: 1, ultra: 1 })
    if (rootRef.current) {
      rootRef.current.style.removeProperty('--lucy-offset-x')
      rootRef.current.style.removeProperty('--lucy-offset-y')
      rootRef.current.style.setProperty('--lucy-user-zoom', '1')
    }
    onReset?.()
    window.dispatchEvent(new CustomEvent('lucy-set-zoom', { detail: { zoom: 1 } }))
  }, [onReset, rootRef])

  // Dragging the HUD window itself
  const onHudHeaderPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    isDraggingHudRef.current = true
    hudDragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      hudX: hudPos.x,
      hudY: hudPos.y,
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onHudHeaderPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingHudRef.current) return
    const dx = e.clientX - hudDragStartRef.current.clientX
    const dy = e.clientY - hudDragStartRef.current.clientY
    setHudPos({
      x: Math.max(10, Math.min(window.innerWidth - 340, hudDragStartRef.current.hudX + dx)),
      y: Math.max(10, Math.min(window.innerHeight - 200, hudDragStartRef.current.hudY + dy)),
    })
  }

  const onHudHeaderPointerUp = (e: React.PointerEvent) => {
    isDraggingHudRef.current = false
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {}
  }

  // Pointer handling for dragging Lucy
  const onLucyPointerDown = (e: React.PointerEvent) => {
    if (!dragMode) return
    e.stopPropagation()
    e.preventDefault()
    isDraggingLucyRef.current = true
    lucyDragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startX: currentOffset.x,
      startY: currentOffset.y,
    }
    if (rootRef.current) {
      rootRef.current.style.setProperty('--lucy-drag-transition', 'none')
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onLucyPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingLucyRef.current) return
    e.stopPropagation()
    const dxPx = e.clientX - lucyDragStartRef.current.clientX
    const dyPx = e.clientY - lucyDragStartRef.current.clientY
    const vhInPx = window.innerHeight / 100
    const nextX = lucyDragStartRef.current.startX + dxPx / vhInPx
    const nextY = lucyDragStartRef.current.startY + dyPx / vhInPx
    updateOffsets(nextX, nextY)
  }

  const onLucyPointerUp = (e: React.PointerEvent) => {
    if (!isDraggingLucyRef.current) return
    isDraggingLucyRef.current = false
    if (rootRef.current) {
      rootRef.current.style.removeProperty('--lucy-drag-transition')
    }
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {}
  }

  // Computed final values for the active scene
  const effectiveZoom = Number((figBase.zoom * currentZoom).toFixed(2))
  const effectiveX = Number((figBase.x + currentOffset.x).toFixed(2))
  const effectiveY = Number((figBase.y + currentOffset.y).toFixed(2))

  const singleCodeSnippet = `${scene}: { zoom: ${effectiveZoom}, x: ${effectiveX}, y: ${effectiveY}, origin: '${figBase.origin}' }`

  const allConfigsSnippet = `export const FIG_CONFIG = {
  zero: { zoom: ${(ALL_PRESETS.zero.zoom * (zooms.zero ?? 1)).toFixed(2)}, x: ${(ALL_PRESETS.zero.x + (offsets.zero?.x ?? 0)).toFixed(2)}, y: ${(ALL_PRESETS.zero.y + (offsets.zero?.y ?? 0)).toFixed(2)}, origin: '${ALL_PRESETS.zero.origin}' },
  heaven: { zoom: ${(ALL_PRESETS.heaven.zoom * (zooms.heaven ?? 1)).toFixed(2)}, x: ${(ALL_PRESETS.heaven.x + (offsets.heaven?.x ?? 0)).toFixed(2)}, y: ${(ALL_PRESETS.heaven.y + (offsets.heaven?.y ?? 0)).toFixed(2)}, origin: '${ALL_PRESETS.heaven.origin}' },
  hell: { zoom: ${(ALL_PRESETS.hell.zoom * (zooms.hell ?? 1)).toFixed(2)}, x: ${(ALL_PRESETS.hell.x + (offsets.hell?.x ?? 0)).toFixed(2)}, y: ${(ALL_PRESETS.hell.y + (offsets.hell?.y ?? 0)).toFixed(2)}, origin: '${ALL_PRESETS.hell.origin}' },
  ultra: { zoom: ${(ALL_PRESETS.ultra.zoom * (zooms.ultra ?? 1)).toFixed(2)}, x: ${(ALL_PRESETS.ultra.x + (offsets.ultra?.x ?? 0)).toFixed(2)}, y: ${(ALL_PRESETS.ultra.y + (offsets.ultra?.y ?? 0)).toFixed(2)}, origin: '${ALL_PRESETS.ultra.origin}' },
} as const`

  const copyText = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).catch(() => {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    })
    setCopied(key)
    setTimeout(() => setCopied(null), 1600)
  }

  // Color accents per scene
  const sceneColors: Record<string, string> = {
    zero: '#EAE8E3',
    heaven: '#5FC2D6',
    hell: '#DB6F07',
    ultra: '#FFD24A',
  }
  const accent = sceneColors[scene] || '#5FC2D6'

  return (
    <>
      {/* Draggable Viewfinder Target around Lucy — restricted to upper 78vh so it NEVER overlaps the ladder at bottom */}
      {dragMode && (
        <div
          className="vha-lucy-drag-zone"
          onPointerDown={onLucyPointerDown}
          onPointerMove={onLucyPointerMove}
          onPointerUp={onLucyPointerUp}
          onPointerCancel={onLucyPointerUp}
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            width: 'min(70vw, 820px)',
            height: '75vh',
            translate: '-50% 0',
            transform: `translateX(calc(${figBase.x}vh + var(--lucy-offset-x, 0vh))) translateY(calc(${figBase.y}vh + var(--lucy-offset-y, 0vh)))`,
            transformOrigin: figBase.origin,
            zIndex: 4, // Below ladder and CTA plates (z-index 50)
            cursor: isDraggingLucyRef.current ? 'grabbing' : 'grab',
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {showViewfinder && (
            <div
              style={{
                position: 'absolute',
                inset: '10% 12% 8% 12%',
                border: `1.5px dashed ${accent}88`,
                borderRadius: '8px',
                background: `${accent}08`,
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: accent, fontSize: '12px', fontWeight: 'bold' }}>┌</span>
                <span
                  style={{
                    background: 'rgba(0,0,0,0.85)',
                    color: accent,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    letterSpacing: '0.08em',
                    border: `1px solid ${accent}44`,
                  }}
                >
                  ✥ DRAG LUCY · ({effectiveX}vh, {effectiveY}vh)
                </span>
                <span style={{ color: accent, fontSize: '12px', fontWeight: 'bold' }}>┐</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: accent, fontSize: '12px', fontWeight: 'bold' }}>└</span>
                <span
                  style={{
                    background: 'rgba(0,0,0,0.85)',
                    color: '#fff',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    opacity: 0.85,
                  }}
                >
                  Pinch trackpad to zoom ({effectiveZoom}×)
                </span>
                <span style={{ color: accent, fontSize: '12px', fontWeight: 'bold' }}>┘</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating HUD Controller */}
      <div
        className="vha-lucy-tuner"
        style={{
          position: 'fixed',
          left: `${hudPos.x}px`,
          top: `${hudPos.y}px`,
          zIndex: 9999,
          width: isOpen ? '340px' : 'auto',
          background: 'rgba(10, 12, 18, 0.94)',
          backdropFilter: 'blur(16px)',
          border: `1px solid ${accent}55`,
          borderRadius: '8px',
          boxShadow: '0 16px 40px rgba(0,0,0,0.7), 0 0 20px rgba(0,0,0,0.4)',
          color: '#EAE8E3',
          fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", monospace',
          userSelect: 'none',
          overflow: 'hidden',
          transition: 'width 180ms ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (Draggable Handle) */}
        <div
          onPointerDown={onHudHeaderPointerDown}
          onPointerMove={onHudHeaderPointerMove}
          onPointerUp={onHudHeaderPointerUp}
          style={{
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.04)',
            borderBottom: isOpen ? '1px solid rgba(255,255,255,0.08)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'move',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: accent,
                boxShadow: `0 0 8px ${accent}`,
              }}
            />
            <span style={{ fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.08em' }}>
              LUCY TUNER
            </span>
            <span
              style={{
                fontSize: '10px',
                background: `${accent}22`,
                color: accent,
                padding: '1px 6px',
                borderRadius: '3px',
                textTransform: 'uppercase',
                border: `1px solid ${accent}44`,
                fontWeight: 'bold',
              }}
            >
              {scene}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setIsOpen((o) => !o)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                opacity: 0.7,
                cursor: 'pointer',
                fontSize: '14px',
                padding: '0 4px',
              }}
              title={isOpen ? 'Minimize' : 'Expand'}
            >
              {isOpen ? '—' : '⛶'}
            </button>
          </div>
        </div>

        {isOpen && (
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '11px' }}>
            {/* Direct Scene Switcher in HUD */}
            <div>
              <div style={{ fontSize: '10px', opacity: 0.6, marginBottom: '5px', letterSpacing: '0.06em' }}>
                SWITCH SCENE (LADDER)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                {(['zero', 'heaven', 'hell', 'ultra'] as const).map((s) => {
                  const isSel = scene === s
                  const sColor = sceneColors[s]
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onSelectScene?.(s)}
                      style={{
                        ...btnStyle,
                        padding: '5px 2px',
                        fontSize: '10px',
                        textTransform: 'uppercase',
                        fontWeight: isSel ? 'bold' : 'normal',
                        color: isSel ? '#000' : sColor,
                        background: isSel ? sColor : 'rgba(255,255,255,0.05)',
                        borderColor: isSel ? sColor : 'rgba(255,255,255,0.12)',
                        boxShadow: isSel ? `0 0 10px ${sColor}66` : 'none',
                      }}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Live Metrics Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                background: 'rgba(0,0,0,0.35)',
                padding: '8px',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.06)',
                textAlign: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '9px', opacity: 0.6, letterSpacing: '0.06em' }}>ZOOM</div>
                <div style={{ fontSize: '15px', fontWeight: 'bold', color: accent }}>
                  {effectiveZoom.toFixed(2)}
                </div>
                <div style={{ fontSize: '9px', opacity: 0.5 }}>base: {figBase.zoom.toFixed(2)}</div>
              </div>
              <div>
                <div style={{ fontSize: '9px', opacity: 0.6, letterSpacing: '0.06em' }}>X (VH)</div>
                <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#fff' }}>
                  {effectiveX.toFixed(1)}
                </div>
                <div style={{ fontSize: '9px', opacity: 0.5 }}>
                  Δ {currentOffset.x >= 0 ? '+' : ''}
                  {currentOffset.x.toFixed(1)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '9px', opacity: 0.6, letterSpacing: '0.06em' }}>Y (VH)</div>
                <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#fff' }}>
                  {effectiveY.toFixed(1)}
                </div>
                <div style={{ fontSize: '9px', opacity: 0.5 }}>
                  Δ {currentOffset.y >= 0 ? '+' : ''}
                  {currentOffset.y.toFixed(1)}
                </div>
              </div>
            </div>

            {/* Zoom Slider & Steppers */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                <span style={{ opacity: 0.8 }}>Zoom Scale</span>
                <span style={{ color: accent, fontWeight: 'bold' }}>{effectiveZoom.toFixed(2)}×</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => updateZoom(Math.max(0.3, currentZoom - 0.05))}
                  style={btnStyle}
                >
                  -
                </button>
                <input
                  type="range"
                  min="0.3"
                  max="3.0"
                  step="0.02"
                  value={currentZoom}
                  onChange={(e) => updateZoom(parseFloat(e.target.value))}
                  style={{ flex: 1, accentColor: accent, cursor: 'pointer' }}
                />
                <button
                  type="button"
                  onClick={() => updateZoom(Math.min(3.0, currentZoom + 0.05))}
                  style={btnStyle}
                >
                  +
                </button>
              </div>
            </div>

            {/* X Position Steppers */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                <span style={{ opacity: 0.8 }}>X Position (Horizontal)</span>
                <span style={{ color: '#fff' }}>{effectiveX.toFixed(1)} vh</span>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => updateOffsets(currentOffset.x - 2, currentOffset.y)}
                  style={{ ...btnStyle, flex: 1 }}
                >
                  -2vh
                </button>
                <button
                  type="button"
                  onClick={() => updateOffsets(currentOffset.x - 0.5, currentOffset.y)}
                  style={{ ...btnStyle, flex: 1 }}
                >
                  -0.5
                </button>
                <button
                  type="button"
                  onClick={() => updateOffsets(currentOffset.x + 0.5, currentOffset.y)}
                  style={{ ...btnStyle, flex: 1 }}
                >
                  +0.5
                </button>
                <button
                  type="button"
                  onClick={() => updateOffsets(currentOffset.x + 2, currentOffset.y)}
                  style={{ ...btnStyle, flex: 1 }}
                >
                  +2vh
                </button>
              </div>
            </div>

            {/* Y Position Steppers */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                <span style={{ opacity: 0.8 }}>Y Position (Vertical)</span>
                <span style={{ color: '#fff' }}>{effectiveY.toFixed(1)} vh</span>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => updateOffsets(currentOffset.x, currentOffset.y - 2)}
                  style={{ ...btnStyle, flex: 1 }}
                >
                  -2vh
                </button>
                <button
                  type="button"
                  onClick={() => updateOffsets(currentOffset.x, currentOffset.y - 0.5)}
                  style={{ ...btnStyle, flex: 1 }}
                >
                  -0.5
                </button>
                <button
                  type="button"
                  onClick={() => updateOffsets(currentOffset.x, currentOffset.y + 0.5)}
                  style={{ ...btnStyle, flex: 1 }}
                >
                  +0.5
                </button>
                <button
                  type="button"
                  onClick={() => updateOffsets(currentOffset.x, currentOffset.y + 2)}
                  style={{ ...btnStyle, flex: 1 }}
                >
                  +2vh
                </button>
              </div>
            </div>

            {/* Drag Mode, Viewfinder & Sync Toggles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setDragMode((d) => !d)}
                style={{
                  ...btnStyle,
                  fontSize: '10px',
                  padding: '5px 2px',
                  background: dragMode ? `${accent}25` : 'rgba(255,255,255,0.06)',
                  borderColor: dragMode ? accent : 'rgba(255,255,255,0.15)',
                  color: dragMode ? accent : '#aaa',
                  fontWeight: dragMode ? 'bold' : 'normal',
                }}
              >
                ✥ Drag: {dragMode ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                onClick={() => setShowViewfinder((v) => !v)}
                style={{
                  ...btnStyle,
                  fontSize: '10px',
                  padding: '5px 2px',
                  background: showViewfinder ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
                  borderColor: showViewfinder ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
                  color: showViewfinder ? '#fff' : '#888',
                }}
              >
                ⛶ Box: {showViewfinder ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                onClick={() => setSyncAll((s) => !s)}
                style={{
                  ...btnStyle,
                  fontSize: '10px',
                  padding: '5px 2px',
                  background: syncAll ? 'rgba(46, 204, 113, 0.2)' : 'rgba(255,255,255,0.04)',
                  borderColor: syncAll ? '#2ecc71' : 'rgba(255,255,255,0.1)',
                  color: syncAll ? '#2ecc71' : '#888',
                }}
                title="Dynamically sync position offsets and zoom across all 4 scenes"
              >
                🔗 Sync: {syncAll ? 'ALL' : 'SOLO'}
              </button>
            </div>

            {/* Code Snippet Box */}
            <div
              style={{
                background: 'rgba(0,0,0,0.6)',
                padding: '7px 9px',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.08)',
                fontSize: '10px',
                color: '#A58AE0',
                wordBreak: 'break-all',
                lineHeight: '1.4',
              }}
            >
              {singleCodeSnippet}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={() => copyText(singleCodeSnippet, 'single')}
                style={{
                  ...btnStyle,
                  flex: 2,
                  background: copied === 'single' ? '#2ecc71' : accent,
                  borderColor: copied === 'single' ? '#2ecc71' : accent,
                  color: '#000',
                  fontWeight: 'bold',
                  padding: '6px 8px',
                  fontSize: '10px',
                }}
              >
                {copied === 'single' ? '✓ COPIED SCENE!' : '📋 COPY SCENE'}
              </button>
              <button
                type="button"
                onClick={() => copyText(allConfigsSnippet, 'all')}
                style={{
                  ...btnStyle,
                  flex: 2,
                  background: copied === 'all' ? '#2ecc71' : 'rgba(255,255,255,0.12)',
                  borderColor: copied === 'all' ? '#2ecc71' : 'rgba(255,255,255,0.25)',
                  color: copied === 'all' ? '#000' : '#fff',
                  fontWeight: 'bold',
                  padding: '6px 8px',
                  fontSize: '10px',
                }}
              >
                {copied === 'all' ? '✓ COPIED ALL!' : '📋 COPY ALL'}
              </button>
              <button
                type="button"
                onClick={resetAll}
                style={{
                  ...btnStyle,
                  flex: 1,
                  background: 'rgba(255,255,255,0.06)',
                  padding: '6px 4px',
                  fontSize: '10px',
                }}
                title="Reset to default presets"
              >
                ↺ Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.16)',
  borderRadius: '4px',
  color: '#fff',
  fontSize: '11px',
  padding: '4px 8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 120ms ease, border-color 120ms ease',
}
