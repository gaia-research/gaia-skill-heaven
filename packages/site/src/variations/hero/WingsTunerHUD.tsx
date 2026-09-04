import React, { useState, useEffect, useRef, useCallback } from 'react'

export interface WingPreset {
  scale: number
  x: number // vh (spread offset: positive moves inward towards Lucy, negative spreads outward)
  y: number // vh (vertical offset: positive moves upward)
  rot: number // degrees (symmetric rotation)
  opacity?: number
}

interface WingsTunerHUDProps {
  scene: 'zero' | 'heaven' | 'hell' | 'ultra'
  rootRef: React.RefObject<HTMLDivElement | null>
  onSelectScene?: (scene: 'zero' | 'heaven' | 'hell' | 'ultra') => void
}

const DEFAULT_WING_PRESETS: Record<string, WingPreset> = {
  heaven: { scale: 1.0, x: 0, y: 0, rot: 0, opacity: 0.55 },
  hell: { scale: 1.0, x: 0, y: 0, rot: 0, opacity: 0.55 },
  ultra: { scale: 1.0, x: 0, y: 0, rot: 0, opacity: 0.55 },
}

export function WingsTunerHUD({ scene, rootRef, onSelectScene }: WingsTunerHUDProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [dragMode, setDragMode] = useState(true)
  const [showViewfinder, setShowViewfinder] = useState(true)
  const [syncAll, setSyncAll] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  // Per-scene wing values
  const [presets, setPresets] = useState<Record<string, WingPreset>>(DEFAULT_WING_PRESETS)

  const current = presets[scene] || { scale: 1.0, x: 0, y: 0, rot: 0, opacity: 0.55 }

  // Floating HUD position
  const [hudPos, setHudPos] = useState({ x: 20, y: 70 })
  const isDraggingHudRef = useRef(false)
  const hudDragStartRef = useRef({ clientX: 0, clientY: 0, hudX: 20, hudY: 70 })

  // References for dragging wings
  const isDraggingWingRef = useRef<null | 'left' | 'right'>(null)
  const wingDragStartRef = useRef({ clientX: 0, clientY: 0, startX: 0, startY: 0, side: 'left' })

  // Synchronize CSS variables with active wing values
  const applyCSSVariables = useCallback(
    (cfg: WingPreset) => {
      if (!rootRef.current) return
      rootRef.current.style.setProperty('--wing-scale', cfg.scale.toFixed(3))
      rootRef.current.style.setProperty('--wing-x', `${cfg.x.toFixed(2)}vh`)
      rootRef.current.style.setProperty('--wing-y', `${cfg.y.toFixed(2)}vh`)
      rootRef.current.style.setProperty('--wing-rot', `${cfg.rot.toFixed(1)}deg`)
      if (typeof cfg.opacity === 'number') {
        rootRef.current.style.setProperty('--wing-opacity-mul', (cfg.opacity / 0.55).toFixed(3))
      }
    },
    [rootRef],
  )

  useEffect(() => {
    if (scene !== 'zero') {
      applyCSSVariables(current)
    }
  }, [scene, current, applyCSSVariables])

  const updateCurrent = useCallback(
    (updater: (prev: WingPreset) => WingPreset) => {
      setPresets((all) => {
        if (syncAll) {
          const nextVal = updater(all[scene] || { scale: 1, x: 0, y: 0, rot: 0 })
          const updated: Record<string, WingPreset> = {}
          for (const key of ['heaven', 'hell', 'ultra']) {
            updated[key] = { ...nextVal }
          }
          applyCSSVariables(nextVal)
          return updated
        } else {
          const nextVal = updater(all[scene] || { scale: 1, x: 0, y: 0, rot: 0 })
          applyCSSVariables(nextVal)
          return { ...all, [scene]: nextVal }
        }
      })
    },
    [applyCSSVariables, scene, syncAll],
  )

  const resetAll = useCallback(() => {
    setPresets(DEFAULT_WING_PRESETS)
    applyCSSVariables({ scale: 1.0, x: 0, y: 0, rot: 0, opacity: 0.55 })
  }, [applyCSSVariables])

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
      x: Math.max(10, Math.min(window.innerWidth - 350, hudDragStartRef.current.hudX + dx)),
      y: Math.max(10, Math.min(window.innerHeight - 200, hudDragStartRef.current.hudY + dy)),
    })
  }

  const onHudHeaderPointerUp = (e: React.PointerEvent) => {
    isDraggingHudRef.current = false
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {}
  }

  // Pointer handling for dragging wings
  const startWingDrag = (side: 'left' | 'right', e: React.PointerEvent) => {
    if (!dragMode) return
    e.stopPropagation()
    e.preventDefault()
    isDraggingWingRef.current = side
    wingDragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startX: current.x,
      startY: current.y,
      side,
    }
    if (rootRef.current) {
      rootRef.current.style.setProperty('--wing-drag-transition', 'none')
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onWingDragMove = (e: React.PointerEvent) => {
    if (!isDraggingWingRef.current) return
    e.stopPropagation()
    const dxPx = e.clientX - wingDragStartRef.current.clientX
    const dyPx = e.clientY - wingDragStartRef.current.clientY
    const vhInPx = window.innerHeight / 100

    // Symmetrical spread: moving left wing right (dx > 0) or right wing left (dx < 0) moves wings inward
    const dir = wingDragStartRef.current.side === 'left' ? 1 : -1
    const deltaX_vh = (dxPx / vhInPx) * dir
    const deltaY_vh = -(dyPx / vhInPx) // dragging up increases Y

    const nextX = Number((wingDragStartRef.current.startX + deltaX_vh).toFixed(2))
    const nextY = Number((wingDragStartRef.current.startY + deltaY_vh).toFixed(2))

    updateCurrent((p) => ({ ...p, x: nextX, y: nextY }))
  }

  const stopWingDrag = (e: React.PointerEvent) => {
    if (!isDraggingWingRef.current) return
    isDraggingWingRef.current = null
    if (rootRef.current) {
      rootRef.current.style.removeProperty('--wing-drag-transition')
    }
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {}
  }

  // Code snippets
  const singleSnippet = `${scene}: { scale: ${current.scale.toFixed(2)}, x: ${current.x.toFixed(1)}, y: ${current.y.toFixed(1)}, rot: ${current.rot.toFixed(1)} }`

  const allSnippet = `export const WING_CONFIG = {
  heaven: { scale: ${presets.heaven.scale.toFixed(2)}, x: ${presets.heaven.x.toFixed(1)}, y: ${presets.heaven.y.toFixed(1)}, rot: ${presets.heaven.rot.toFixed(1)} },
  hell:   { scale: ${presets.hell.scale.toFixed(2)}, x: ${presets.hell.x.toFixed(1)}, y: ${presets.hell.y.toFixed(1)}, rot: ${presets.hell.rot.toFixed(1)} },
  ultra:  { scale: ${presets.ultra.scale.toFixed(2)}, x: ${presets.ultra.x.toFixed(1)}, y: ${presets.ultra.y.toFixed(1)}, rot: ${presets.ultra.rot.toFixed(1)} },
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

  const sceneColors: Record<string, string> = {
    zero: '#EAE8E3',
    heaven: '#5FC2D6',
    hell: '#DB6F07',
    ultra: '#FFD24A',
  }
  const accent = sceneColors[scene] || '#5FC2D6'

  return (
    <>
      {/* Draggable Viewfinder Target Zones over Left and Right Wings */}
      {scene !== 'zero' && dragMode && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 4, // Behind ladder/CTAs (z-index 50) but above wings (z-index 1)
          }}
        >
          {/* Left Wing Dragger */}
          <div
            onPointerDown={(e) => startWingDrag('left', e)}
            onPointerMove={onWingDragMove}
            onPointerUp={stopWingDrag}
            onPointerCancel={stopWingDrag}
            style={{
              position: 'absolute',
              left: `calc(2% + var(--wing-x, 0vh))`,
              bottom: `calc(0vh + var(--wing-y, 0vh))`,
              width: 'min(42vw, 560px)',
              height: '75vh',
              transformOrigin: 'bottom center',
              transform: `scale(calc(var(--wing-scale, 1))) rotate(calc(0deg - var(--wing-rot, 0deg)))`,
              cursor: isDraggingWingRef.current ? 'grabbing' : 'grab',
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
                  inset: '8% 10% 8% 6%',
                  border: `1.5px dashed ${accent}88`,
                  borderRadius: '8px',
                  background: `${accent}0a`,
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
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      border: `1px solid ${accent}44`,
                    }}
                  >
                    ✥ DRAG WINGS · (Spread: {current.x > 0 ? '+' : ''}{current.x.toFixed(1)}vh, Y: {current.y > 0 ? '+' : ''}{current.y.toFixed(1)}vh)
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
                      fontSize: '9px',
                      fontFamily: 'monospace',
                      opacity: 0.85,
                    }}
                  >
                    Scale: {current.scale.toFixed(2)}× · Rot: {current.rot.toFixed(1)}°
                  </span>
                  <span style={{ color: accent, fontSize: '12px', fontWeight: 'bold' }}>┘</span>
                </div>
              </div>
            )}
          </div>

          {/* Right Wing Dragger */}
          <div
            onPointerDown={(e) => startWingDrag('right', e)}
            onPointerMove={onWingDragMove}
            onPointerUp={stopWingDrag}
            onPointerCancel={stopWingDrag}
            style={{
              position: 'absolute',
              right: `calc(2% + var(--wing-x, 0vh))`,
              bottom: `calc(0vh + var(--wing-y, 0vh))`,
              width: 'min(42vw, 560px)',
              height: '75vh',
              transformOrigin: 'bottom center',
              transform: `scale(calc(var(--wing-scale, 1))) rotate(calc(0deg + var(--wing-rot, 0deg)))`,
              cursor: isDraggingWingRef.current ? 'grabbing' : 'grab',
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
                  inset: '8% 6% 8% 10%',
                  border: `1.5px dashed ${accent}88`,
                  borderRadius: '8px',
                  background: `${accent}0a`,
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
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      border: `1px solid ${accent}44`,
                    }}
                  >
                    ✥ DRAG WINGS
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
                      fontSize: '9px',
                      fontFamily: 'monospace',
                      opacity: 0.85,
                    }}
                  >
                    Symmetric drag
                  </span>
                  <span style={{ color: accent, fontSize: '12px', fontWeight: 'bold' }}>┘</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating HUD Controller */}
      <div
        className="vha-wings-tuner"
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
        {/* Header */}
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
              WINGS TUNER
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
            {/* Scene Switcher */}
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

            {scene === 'zero' ? (
              <div
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  padding: '12px',
                  borderRadius: '6px',
                  textAlign: 'center',
                  fontSize: '11px',
                  opacity: 0.7,
                }}
              >
                Zero carries no wings (canon). Switch to Heaven, Hell, or Ultra to position wings.
              </div>
            ) : (
              <>
                {/* Live Metrics Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '6px',
                    background: 'rgba(0,0,0,0.35)',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.06)',
                    textAlign: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '8px', opacity: 0.6, letterSpacing: '0.06em' }}>SCALE</div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: accent }}>
                      {current.scale.toFixed(2)}×
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '8px', opacity: 0.6, letterSpacing: '0.06em' }}>SPREAD</div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>
                      {current.x > 0 ? '+' : ''}{current.x.toFixed(1)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '8px', opacity: 0.6, letterSpacing: '0.06em' }}>Y (VH)</div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>
                      {current.y > 0 ? '+' : ''}{current.y.toFixed(1)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '8px', opacity: 0.6, letterSpacing: '0.06em' }}>TILT</div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: accent }}>
                      {current.rot.toFixed(1)}°
                    </div>
                  </div>
                </div>

                {/* Scale Slider & Steppers */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                    <span style={{ opacity: 0.8 }}>Wing Scale / Size</span>
                    <span style={{ color: accent, fontWeight: 'bold' }}>{current.scale.toFixed(2)}×</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => updateCurrent((p) => ({ ...p, scale: Math.max(0.3, p.scale - 0.05) }))}
                      style={btnStyle}
                    >
                      -
                    </button>
                    <input
                      type="range"
                      min="0.3"
                      max="2.5"
                      step="0.02"
                      value={current.scale}
                      onChange={(e) => updateCurrent((p) => ({ ...p, scale: parseFloat(e.target.value) }))}
                      style={{ flex: 1, accentColor: accent, cursor: 'pointer' }}
                    />
                    <button
                      type="button"
                      onClick={() => updateCurrent((p) => ({ ...p, scale: Math.min(2.5, p.scale + 0.05) }))}
                      style={btnStyle}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Spread (X) Controls */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                    <span style={{ opacity: 0.8 }}>Spread / Inward Gap (X)</span>
                    <span style={{ color: '#fff' }}>{current.x > 0 ? '+' : ''}{current.x.toFixed(1)} vh</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => updateCurrent((p) => ({ ...p, x: p.x - 2 }))}
                      style={{ ...btnStyle, flex: 1 }}
                      title="Spread further outward"
                    >
                      -2vh
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrent((p) => ({ ...p, x: p.x - 0.5 }))}
                      style={{ ...btnStyle, flex: 1 }}
                    >
                      -0.5
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrent((p) => ({ ...p, x: p.x + 0.5 }))}
                      style={{ ...btnStyle, flex: 1 }}
                    >
                      +0.5
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrent((p) => ({ ...p, x: p.x + 2 }))}
                      style={{ ...btnStyle, flex: 1 }}
                      title="Move inward closer to Lucy"
                    >
                      +2vh
                    </button>
                  </div>
                </div>

                {/* Height (Y) Controls */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                    <span style={{ opacity: 0.8 }}>Vertical Height (Y)</span>
                    <span style={{ color: '#fff' }}>{current.y > 0 ? '+' : ''}{current.y.toFixed(1)} vh</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => updateCurrent((p) => ({ ...p, y: p.y - 2 }))}
                      style={{ ...btnStyle, flex: 1 }}
                      title="Move lower"
                    >
                      -2vh
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrent((p) => ({ ...p, y: p.y - 0.5 }))}
                      style={{ ...btnStyle, flex: 1 }}
                    >
                      -0.5
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrent((p) => ({ ...p, y: p.y + 0.5 }))}
                      style={{ ...btnStyle, flex: 1 }}
                    >
                      +0.5
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrent((p) => ({ ...p, y: p.y + 2 }))}
                      style={{ ...btnStyle, flex: 1 }}
                      title="Move higher"
                    >
                      +2vh
                    </button>
                  </div>
                </div>

                {/* Rotation Tilt Controls */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                    <span style={{ opacity: 0.8 }}>Symmetric Rotation</span>
                    <span style={{ color: accent }}>{current.rot.toFixed(1)}°</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => updateCurrent((p) => ({ ...p, rot: p.rot - 2 }))}
                      style={{ ...btnStyle, flex: 1 }}
                    >
                      -2°
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrent((p) => ({ ...p, rot: p.rot - 0.5 }))}
                      style={{ ...btnStyle, flex: 1 }}
                    >
                      -0.5°
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrent((p) => ({ ...p, rot: p.rot + 0.5 }))}
                      style={{ ...btnStyle, flex: 1 }}
                    >
                      +0.5°
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCurrent((p) => ({ ...p, rot: p.rot + 2 }))}
                      style={{ ...btnStyle, flex: 1 }}
                    >
                      +2°
                    </button>
                  </div>
                </div>

                {/* Toggles */}
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
                    title="Dynamically sync wing adjustments across Heaven, Hell, and Ultra"
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
                  {singleSnippet}
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => copyText(singleSnippet, 'single')}
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
                    onClick={() => copyText(allSnippet, 'all')}
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
              </>
            )}
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
