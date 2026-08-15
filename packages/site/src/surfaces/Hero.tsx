import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './hero.css';

import {
  INSTALL,
  LADDER_WIP,
  MECHANIC,
  RUNGS,
  SITE,
  SURFACES,
  type RungId,
  type SurfaceId,
} from '../product';

import zeroMaster from '../assets/lucy/v4-approved/set-a/masters/lucy-zero.webp';
import heavenMaster from '../assets/lucy/v4-approved/set-a/masters/lucy-heaven.webp';
import hellMaster from '../assets/lucy/v4-approved/set-a/masters/lucy-hell.webp';
import ultraMaster from '../assets/lucy/v4-approved/set-a/masters/lucy-ultra.webp';


import bgZero from '../assets/lucy/backgrounds/lucy-bg-zero-desktop.webp';
import bgHeaven from '../assets/lucy/backgrounds/lucy-bg-heaven-desktop.webp';
import bgHell from '../assets/lucy/backgrounds/lucy-bg-hell-desktop.webp';
import bgUltra from '../assets/lucy/backgrounds/lucy-bg-ultra-desktop.webp';

/**
 * Approved character art, per state. The Hell master is already a full
 * RGB inversion of Heaven — the page inverts around it, the art never does.
 * Zero carries no wings, by canon.
 */
const ART: Record<SurfaceId, { figure: string; bg: string; alt: string }> = {
  zero: {
    figure: zeroMaster,
    bg: bgZero,
    alt: 'The line’s figure in its Zero state — seated, eyes closed, no wings, one katana at rest.',
  },
  heaven: {
    figure: heavenMaster,
    bg: bgHeaven,
    alt: 'The line’s figure in its Heaven state — falling with gravity inverted, both diamond eyes open, ordered glass shards.',
  },
  hell: {
    figure: hellMaster,
    bg: bgHell,
    alt: 'The line’s figure in its Hell state — the Heaven render fully inverted, eyes closed, a single red tear.',
  },
  ultra: {
    figure: ultraMaster,
    bg: bgUltra,
    alt: 'The line’s figure in its Ultra state — gold refraction, one diamond eye open and one closed, two matching katanas.',
  },
};

const RUNG_IDS = RUNGS.map((r) => r.id);

export default function Hero() {
  const [dir, setDir] = useState<SurfaceId>('zero');
  const [rungs, setRungs] = useState<Record<'heaven' | 'hell', RungId>>({
    heaven: 'low',
    hell: 'high',
  });
  const [impact, setImpact] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const impactTimer = useRef<number | undefined>(undefined);

  const surface = useMemo(() => SURFACES.find((s) => s.id === dir)!, [dir]);
  const hasLadder = surface.ladder !== null;
  const activeRung = hasLadder ? rungs[dir as 'heaven' | 'hell'] : null;
  const slots = activeRung ? RUNGS.find((r) => r.id === activeRung)!.slots : 0;

  /* the impact frame — a 46ms cut on every direction change */
  const fire = useCallback(() => {
    window.clearTimeout(impactTimer.current);
    setImpact(true);
    impactTimer.current = window.setTimeout(() => setImpact(false), 60);
  }, []);

  useEffect(() => () => window.clearTimeout(impactTimer.current), []);

  const pick = useCallback(
    (id: SurfaceId) => {
      if (id === dir) return;
      setDir(id);
      fire();
    },
    [dir, fire],
  );

  const setRung = useCallback(
    (id: RungId) => {
      if (!hasLadder) return;
      setRungs((prev) => ({ ...prev, [dir as 'heaven' | 'hell']: id }));
    },
    [dir, hasLadder],
  );

  /* arrow keys walk the ladder, as a radio group should */
  const onRungKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (!activeRung) return;
      const i = RUNG_IDS.indexOf(activeRung);
      let next = i;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(RUNG_IDS.length - 1, i + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, i - 1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = RUNG_IDS.length - 1;
      else return;
      e.preventDefault();
      setRung(RUNG_IDS[next]);
    },
    [activeRung, setRung],
  );

  const copy = useCallback((text: string, key: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(key);
        window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400);
      },
      () => undefined,
    );
  }, []);

  /* the command line rewrites live off the instrument */
  const command = hasLadder
    ? `${surface.command} --rung ${activeRung}`
    : dir === 'zero'
      ? `claude-zero  ·  ${MECHANIC.floor} "code review"`
      : surface.command;

  const art = ART[dir];

  return (
    <div className={`hx hx--${dir}${impact ? ' hx--impact' : ''}`}>
      <div className="hx__bg" style={{ backgroundImage: `url(${art.bg})` }} aria-hidden="true" />

      <nav className="hx__nav">
        <div className="hx__brand">
          <span className="hx__logo" role="img" aria-label="Logo slot — mark pending commission" />
          <span className="hx__brandname">{SITE.repoName}</span>
          <span className="sh-chip">{SITE.version}</span>
        </div>
        <div className="hx__navlinks">
          <Link to="/landing">The document</Link>
          <a href={SITE.repoUrl}>GitHub</a>
        </div>
      </nav>

      <div className="hx__body">
        <div className="hx__plate">
          <div className="hx__reg">
            <svg className="hx__reg-cross" viewBox="0 0 13 13" aria-hidden="true">
              <line x1="6.5" y1="0" x2="6.5" y2="13" />
              <line x1="0" y1="6.5" x2="13" y2="6.5" />
            </svg>
            <span className="hx__reg-dot" aria-hidden="true" />
            <span className="hx__reg-dot" aria-hidden="true" />
            <span className="hx__reg-text">One mechanic · four surfaces</span>
          </div>

          <h1 className="hx__wordmark">
            <span className="hx__skill">Skill</span>
            <span className="hx__state">{surface.name.replace('Skill ', '')}</span>
          </h1>

          <p className="hx__role">{surface.command} · {surface.role}</p>
          <p className="hx__blurb">{surface.blurb}</p>

          <div className="hx__cmd">
            <code aria-live="polite">
              <b>$</b> {command}
            </code>
            <button className="hx__copy" type="button" onClick={() => copy(command, 'cmd')}>
              {copied === 'cmd' ? 'copied' : 'copy'}
            </button>
          </div>

          <div className="hx__actions">
            <button className="sh-cta" type="button" onClick={() => copy(INSTALL.sh, 'install')}>
              {copied === 'install' ? 'Copied to clipboard' : 'Copy the install one-liner'}
            </button>
            <Link className="sh-cta sh-cta--ghost" to="/landing">
              Read the document
            </Link>
          </div>
          <p className="hx__install">{INSTALL.sh}</p>
        </div>

        <div className="hx__figure">
          <img src={art.figure} alt={art.alt} />
        </div>
      </div>

      <div className="hx__instrument">
        <p className="hx__thesis">{MECHANIC.line}</p>
        <div className="hx__instrument-inner">
          <div className="hx__dirs" role="tablist" aria-label="Product surface">
            {SURFACES.map((s) => (
              <button
                key={s.id}
                className="hx__dir"
                style={{ ['--dir-hue' as string]: s.hue }}
                role="tab"
                type="button"
                aria-selected={s.id === dir}
                onClick={() => pick(s.id)}
              >
                <span className="hx__dir-mark" aria-hidden="true" />
                <span className="hx__dir-cmd">{s.command}</span>
                <span className="hx__dir-role">{s.role}</span>
              </button>
            ))}
          </div>

          <div className="hx__gauge">
            {hasLadder ? (
              <>
                <div className="hx__gauge-head">
                  <span className="hx__gauge-title">
                    Auto-summons per capability gap
                  </span>
                  <span className="sh-chip sh-chip--wip">WIP</span>
                </div>

                <div
                  className="hx__rungs"
                  role="radiogroup"
                  aria-label={`${surface.name} ladder`}
                  onKeyDown={onRungKey}
                >
                  {RUNGS.map((r) => (
                    <button
                      key={r.id}
                      className="hx__rung"
                      type="button"
                      role="radio"
                      aria-checked={r.id === activeRung}
                      tabIndex={r.id === activeRung ? 0 : -1}
                      onClick={() => setRung(r.id)}
                    >
                      {r.id}
                    </button>
                  ))}
                </div>

                <div className="hx__slots">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span
                      key={i}
                      className={`hx__slot${i < slots ? ' hx__slot--on' : ''}`}
                      aria-hidden="true"
                    />
                  ))}
                  <span className="hx__slot-read" aria-live="polite">
                    {slots === 0
                      ? 'none automatic — /summon still works by hand'
                      : `${slots} skill${slots === 1 ? '' : 's'} per gap`}
                  </span>
                </div>

                <p className="hx__wip">{LADDER_WIP}</p>
              </>
            ) : (
              <div className="hx__noladder">
                {dir === 'zero' ? (
                  <>
                    <b>{MECHANIC.floor}</b> — the floor. {MECHANIC.floorNote}
                  </>
                ) : (
                  <>
                    <b>No ladder.</b> The controller picks the direction and the depth
                    per gap. Nothing to set.
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
