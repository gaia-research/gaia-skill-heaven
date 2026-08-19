import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './hero.css';

import {
  DIRECTION_WORD,
  DOORS,
  INSTALL,
  LADDER_MEASURE,
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



/**
 * Approved character art, per state. The Hell master is already a full
 * RGB inversion of Heaven — the page inverts around it, the art never does.
 * Zero carries no wings, by canon.
 */
const ART: Record<SurfaceId, { figure: string; alt: string }> = {
  zero: {
    figure: zeroMaster,
    alt: 'The line’s figure in its Zero state — seated, eyes closed, no wings, one katana at rest.',
  },
  heaven: {
    figure: heavenMaster,
    alt: 'The line’s figure in its Heaven state — falling with gravity inverted, both diamond eyes open, ordered glass shards.',
  },
  hell: {
    figure: hellMaster,
    alt: 'The line’s figure in its Hell state — the Heaven render fully inverted, eyes closed, a single red tear.',
  },
  ultra: {
    figure: ultraMaster,
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
  const rung = activeRung ? RUNGS.find((r) => r.id === activeRung)! : null;

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

  const onDirKey = useCallback(
    (e: React.KeyboardEvent) => {
      const ids = SURFACES.map((s) => s.id);
      const i = ids.indexOf(dir);
      let next = i;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % ids.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + ids.length) % ids.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = ids.length - 1;
      else return;
      e.preventDefault();
      pick(ids[next]);
      (e.currentTarget.children[next] as HTMLElement | undefined)?.focus();
    },
    [dir, pick],
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

  /* The command line rewrites live off the instrument. These are the plugin's
     real in-session commands — a bare rung is the argument, never a flag, and
     the sigil is the session prompt, never a shell `$`. */
  const command = hasLadder
    ? `${surface.command} ${activeRung}`
    : dir === 'zero'
      ? `${surface.command}  ·  ${MECHANIC.floor} "code review"`
      : surface.command;

  const art = ART[dir];

  return (
    <div className={`hx hx--${dir}${impact ? ' hx--impact' : ''}`}>
      <nav className="hx__nav">
        <div className="hx__brand">
          <span className="hx__logo" role="img" aria-label="Logo slot — mark pending commission" />
          <span className="hx__brandname">{SITE.repoName}</span>
          <span className="sh-chip">{SITE.version}</span>
        </div>
        <div className="hx__navlinks">
          <Link to="/landing">The document</Link>
          <a href={SITE.repoUrl}>GitHub</a>
          <button
            className="hx__navcta"
            type="button"
            onClick={() => copy(DOORS[0].launch, 'nav')}
            title="Copy the launch command for the flagship door"
          >
            {copied === 'nav' ? 'copied ⏎' : `${DOORS[0].launch} ⏎`}
          </button>
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
            <span className="hx__reg-text" aria-hidden="true">
              {SURFACES.map((s, i) => (
                <span key={s.id} className={s.id === dir ? 'is-here' : undefined}>
                  {i > 0 && <i> · </i>}
                  {s.name.replace('Skill ', '')}
                </span>
              ))}
            </span>
            <span className="hx__reg-bridge" aria-hidden="true" />
            <span className="hx__reg-plate" aria-hidden="true">Plate no. 001</span>
          </div>

          <h1 className="hx__wordmark">
            <span className="hx__skill">Skill</span>
            <span className="hx__state">{surface.name.replace('Skill ', '')}</span>
          </h1>

          <p className="hx__role">{surface.command} · {surface.role}</p>
          <p className="hx__blurb">{surface.blurb}</p>

          <div className="hx__cmd">
            <code aria-live="polite">
              <b>›</b> {command}
            </code>
            <button className="hx__copy" type="button" onClick={() => copy(command, 'cmd')}>
              {copied === 'cmd' ? 'copied' : 'copy'}
            </button>
          </div>

          <div className="hx__actions">
            <button
              className="sh-cta"
              type="button"
              onClick={() => copy(INSTALL.plugin.join('\n'), 'install')}
            >
              {copied === 'install' ? 'Copied to clipboard' : 'Copy the install'}
            </button>
            <Link className="sh-cta sh-cta--ghost" to="/landing">
              Read the document
            </Link>
          </div>
          <p className="hx__install">
            {INSTALL.plugin.map((line) => (
              <span key={line}>{line}</span>
            ))}
            <em>Two lines inside Claude Code.</em>
          </p>
        </div>

        <div className="hx__figure">
          <img src={art.figure} alt={art.alt} />
        </div>
      </div>

      <div className="hx__instrument">
        <p className="hx__thesis">{MECHANIC.line}</p>
        <div className="hx__instrument-inner">
          <div
            className="hx__dirs"
            role="radiogroup"
            aria-label="Product surface"
            onKeyDown={onDirKey}
          >
            {SURFACES.map((s) => (
              <button
                key={s.id}
                className="hx__dir"
                style={{ ['--dir-hue' as string]: s.hue }}
                role="radio"
                type="button"
                aria-checked={s.id === dir}
                tabIndex={s.id === dir ? 0 : -1}
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
                  <span className="hx__gauge-title">Skill entropy</span>
                  <span className="sh-chip sh-chip--wip">WIP</span>
                </div>
                <p className="hx__measure">{LADDER_MEASURE}</p>

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

                <div className="hx__read" aria-live="polite">
                  <span className="hx__read-dir">
                    {rung ? DIRECTION_WORD[rung.direction] : ''}
                  </span>
                  <span className="hx__read-pos">{rung?.position}</span>
                </div>
                <p className="hx__read-note">{rung?.note}</p>

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
                    <b>No ladder.</b> The crown rung picks the direction and the
                    position for you, gap by gap. Nothing to set.
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
