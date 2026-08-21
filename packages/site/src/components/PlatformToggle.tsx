import type { Platform } from '../product'
import './platform-toggle.css'

export interface PlatformToggleProps {
  platform: Platform
  onToggle: (platform: Platform) => void
  className?: string
}

export function PlatformToggle({ platform, onToggle, className = '' }: PlatformToggleProps) {
  return (
    <div
      className={`sh-platform-toggle ${className}`.trim()}
      role="group"
      aria-label="Platform"
    >
      <button
        type="button"
        className={`sh-platform-toggle__btn${platform === 'posix' ? ' is-on' : ''}`}
        aria-pressed={platform === 'posix'}
        onClick={() => onToggle('posix')}
      >
        POSIX
      </button>
      <button
        type="button"
        className={`sh-platform-toggle__btn${platform === 'windows' ? ' is-on' : ''}`}
        aria-pressed={platform === 'windows'}
        onClick={() => onToggle('windows')}
      >
        Windows
      </button>
    </div>
  )
}
