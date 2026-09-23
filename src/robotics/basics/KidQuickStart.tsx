import { Bot, X } from 'lucide-react'
import './kidQuickStart.css'

/**
 * The first screen of the Robot Workshop prototype (docs/robotics/KID-UX.md: few words, big targets,
 * always show the next step). It replaces the studio's quick start, which testers found wordy (orbit,
 * pan, box-select in small print), with three pictures and a few words each, in the words of the
 * device in hand (mouse or touch, by the same pointer media query the studio uses), one big "Start
 * building" and a clear "Build a robot" that opens the drawer's Robots kits. Nothing is in hand at
 * start: the student picks the first part. The close button and "Start building" keep the studio's
 * accessible names, so every existing script still dismisses it the same way.
 */
export type KidQuickStartProps = {
  onStart: () => void
  onBuildRobot: () => void
}

export default function KidQuickStart({ onStart, onBuildRobot }: KidQuickStartProps) {
  return (
    <section className="onboarding-guide kid-quick-start" role="dialog" aria-modal="false" aria-labelledby="onboarding-title" data-testid="kid-quick-start">
      <button className="onboarding-close studio-icon-button" type="button" aria-label="Dismiss quick start" onClick={onStart}><X size={18} /></button>
      <h2 id="onboarding-title">Let's build!</h2>
      <ol className="kid-quick-start-tips">
        <li>
          <PickPicture />
          <strong>Pick a part</strong>
        </li>
        <li>
          <PlacePicture />
          <strong><span className="fine-pointer-copy">Click to place it</span><span className="coarse-pointer-copy">Tap, then Place</span></strong>
        </li>
        <li>
          <LookPicture />
          <strong><span className="fine-pointer-copy">Right-drag to look around</span><span className="coarse-pointer-copy">Drag to look around</span></strong>
        </li>
      </ol>
      <div className="kid-quick-start-actions">
        <button className="kid-quick-start-robot" type="button" onClick={onBuildRobot} data-testid="kid-quick-start-robot">
          <span className="kid-quick-start-robot-icon" aria-hidden="true"><Bot size={24} /></span>
          <span>Build a robot</span>
        </button>
        <button className="studio-button studio-button-primary onboarding-start kid-quick-start-go" type="button" onClick={onStart}>Start building</button>
      </div>
    </section>
  )
}

const INK = '#263c51'
const BLUE = '#3e83d7'
const PLATE = '#dfe6ea'

/** A drawer of parts, one picked. */
function PickPicture() {
  return (
    <svg className="kid-quick-start-picture" viewBox="0 0 96 72" aria-hidden="true" focusable="false">
      <rect x="6" y="8" width="54" height="58" rx="9" fill="#f3f5f9" stroke="#c9d3dc" strokeWidth="2" />
      {[0, 1].map((row) => [0, 1].map((column) => (
        <rect key={`${row}-${column}`} x={13 + column * 24} y={15 + row * 24} width="18" height="18" rx="4" fill={row === 0 && column === 1 ? '#f4ca3a' : '#c9d3dc'} />
      )))}
      <rect x="35" y="13" width="22" height="22" rx="6" fill="none" stroke={BLUE} strokeWidth="3" />
      <path d="M58 40 L58 64 L64 58 L69 68 L74 66 L69 56 L77 56 Z" fill="#ffffff" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  )
}

/** A brick coming down onto the plate. */
function PlacePicture() {
  return (
    <svg className="kid-quick-start-picture" viewBox="0 0 96 72" aria-hidden="true" focusable="false">
      <path d="M8 56 L48 44 L88 56 L48 68 Z" fill={PLATE} stroke="#b9c4cc" strokeWidth="2" strokeLinejoin="round" />
      <path d="M34 24 L52 19 L66 24 L48 29 Z" fill="#f08a7e" />
      <path d="M34 24 L48 29 L48 41 L34 36 Z" fill="#e7473c" />
      <path d="M48 29 L66 24 L66 36 L48 41 Z" fill="#c53a30" />
      <path d="M48 44 L48 50" stroke={BLUE} strokeWidth="3" strokeLinecap="round" />
      <path d="M43 46 L48 52 L53 46" fill="none" stroke={BLUE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="50" cy="56" rx="14" ry="4" fill="rgba(38, 60, 81, .18)" />
    </svg>
  )
}

/** A build with a turning arrow around it. */
function LookPicture() {
  return (
    <svg className="kid-quick-start-picture" viewBox="0 0 96 72" aria-hidden="true" focusable="false">
      <path d="M30 34 L48 28 L66 34 L48 40 Z" fill="#8fd3c9" />
      <path d="M30 34 L48 40 L48 52 L30 46 Z" fill="#2eaa9d" />
      <path d="M48 40 L66 34 L66 46 L48 52 Z" fill="#23877d" />
      <path d="M18 44 C 14 26, 36 12, 58 14 C 72 16, 82 24, 82 34" fill="none" stroke={BLUE} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M76 30 L82 37 L87 29" fill="none" stroke={BLUE} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M78 52 C 66 64, 36 66, 22 56" fill="none" stroke={BLUE} strokeWidth="3.5" strokeLinecap="round" strokeDasharray="1 7" />
    </svg>
  )
}
