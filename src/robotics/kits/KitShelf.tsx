import { Bot } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { scheduleThumbnailWork } from '../../brick/thumbnailWorkQueue'
import { armKit, useKitStore } from './kitPlacement'
import { cachedKitPicture, renderKitPictures } from './kitPictures'
import { KITS, type Kit, type KitId } from './kits'
import './kits.css'

/**
 * The drawer's way to robots (docs/robotics/KID-UX.md §K): a "Robots" choice that stays in view
 * beside the category list, and, at the top of the Robots category, "Start with a kit": four kit
 * cards, each a picture, a name and three words. Choosing a card arms the kit's ghost exactly as
 * choosing a part arms a brick. Mounted by the drawer only while the robotics prototype is on.
 */
export function RobotsChoice({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`kit-robots-choice${active ? ' active' : ''}`} aria-pressed={active} onClick={onToggle} data-testid="robots-choice">
      <span className="kit-robots-choice-icon" aria-hidden="true"><Bot size={24} /></span>
      <span className="kit-robots-choice-text"><strong>Robots</strong><small>Kits and robot parts</small></span>
    </button>
  )
}

export function KitShelf({ onChoose }: { onChoose?: () => void }) {
  const armedKit = useKitStore((state) => state.armed?.kitId ?? null)
  const headingId = useId()
  return (
    <section className="kit-shelf" aria-labelledby={headingId} data-testid="kit-shelf">
      <h3 className="kit-shelf-heading" id={headingId}>Start with a kit</h3>
      <div className="kit-cards">
        {KITS.map((kit) => <KitCard key={kit.id} kit={kit} armed={armedKit === kit.id} onChoose={onChoose} />)}
      </div>
      <h3 className="kit-shelf-heading kit-shelf-parts">Robot parts</h3>
    </section>
  )
}

function KitCard({ kit, armed, onChoose }: { kit: Kit; armed: boolean; onChoose?: () => void }) {
  const picture = useKitPicture(kit.id)
  return (
    <button
      type="button"
      className={`kit-card${armed ? ' active' : ''}`}
      aria-pressed={armed}
      data-kit={kit.id}
      title={`Place a ${kit.name}`}
      onClick={() => { if (armKit(kit.id)) onChoose?.() }}
    >
      <span className="kit-card-picture" aria-hidden="true">
        {picture ? <img src={picture} alt="" draggable={false} /> : <KitIllustration kitId={kit.id} />}
      </span>
      <strong className="kit-card-name">{kit.name}</strong>
      <span className="kit-card-words">{kit.words}</span>
    </button>
  )
}

/** The kit's rendered picture once it is drawn (spread over frames like the part thumbnails); null until then or without WebGL. */
function useKitPicture(kitId: KitId): string | null {
  const [picture, setPicture] = useState<string | null>(() => cachedKitPicture(kitId) ?? null)
  useEffect(() => {
    const cached = cachedKitPicture(kitId)
    if (cached !== undefined) {
      setPicture(cached)
      return
    }
    return scheduleThumbnailWork(() => {
      renderKitPictures()
      setPicture(cachedKitPicture(kitId) ?? null)
    })
  }, [kitId])
  return picture
}

const INK = '#263c51'

/** A flat drawing of each kit, for a browser that cannot draw the real bricks. */
function KitIllustration({ kitId }: { kitId: KitId }) {
  return (
    <svg className="kit-card-illustration" viewBox="0 0 132 88" focusable="false" data-kit-illustration={kitId}>
      <ellipse cx="66" cy="80" rx="52" ry="5" fill="rgba(38, 60, 81, .12)" />
      {kitId === 'buggy' && (
        <>
          <rect x="30" y="50" width="72" height="9" rx="2" fill="#3e83d7" />
          <rect x="42" y="26" width="34" height="24" rx="3" fill="#f5eee0" stroke="#c9c1b2" />
          <rect x="56" y="38" width="20" height="12" rx="2" fill="#f4ca3a" />
          <circle cx="62" cy="44" r="2.5" fill={INK} />
          <circle cx="70" cy="44" r="2.5" fill={INK} />
          <circle cx="32" cy="62" r="15" fill="#1f2a33" />
          <circle cx="32" cy="62" r="6" fill="#a9b7bd" />
          <circle cx="100" cy="62" r="15" fill="#1f2a33" />
          <circle cx="100" cy="62" r="6" fill="#a9b7bd" />
        </>
      )}
      {kitId === 'gate' && (
        <>
          <rect x="22" y="72" width="88" height="6" rx="2" fill="#3e83d7" />
          <rect x="28" y="14" width="8" height="58" fill="#e7473c" />
          <rect x="96" y="14" width="8" height="58" fill="#e7473c" />
          <rect x="24" y="8" width="84" height="8" rx="2" fill="#e7473c" />
          <polygon points="38,44 72,30 72,40 38,54" fill="#f4ca3a" />
          <rect x="36" y="52" width="10" height="20" fill="#2eaa9d" />
          <path d="M78 52 A 30 30 0 0 0 74 26" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M70 29 L74 25 L78 30" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {kitId === 'signal-light' && (
        <>
          <rect x="40" y="68" width="52" height="8" rx="2" fill="#3e83d7" />
          <rect x="44" y="38" width="44" height="30" rx="3" fill="#f5eee0" stroke="#c9c1b2" />
          <rect x="48" y="28" width="20" height="10" rx="2" fill="#f4ca3a" />
          <circle cx="54" cy="33" r="2" fill={INK} />
          <circle cx="62" cy="33" r="2" fill={INK} />
          <circle cx="78" cy="26" r="9" fill="#e7473c" />
          <g stroke="#e7473c" strokeWidth="3" strokeLinecap="round">
            <path d="M78 8v5" /><path d="M93 14l-4 4" /><path d="M99 27h-5" /><path d="M63 14l4 4" />
          </g>
        </>
      )}
      {kitId === 'robot-base' && (
        <>
          <rect x="22" y="60" width="88" height="12" rx="3" fill="#3e83d7" />
          <rect x="44" y="34" width="36" height="26" rx="3" fill="#f5eee0" stroke="#c9c1b2" />
          <rect x="52" y="40" width="20" height="8" rx="2" fill="#dfe7ee" />
          <g stroke="#2eaa9d" strokeWidth="3" strokeLinecap="round">
            <path d="M98 30v12" /><path d="M92 36h12" />
          </g>
        </>
      )}
    </svg>
  )
}

// Dev-only hook for the QA harness (scripts/qa/robotics-kid-kits.mjs), beside the panel's stores.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const host = window as unknown as { __robotics?: Record<string, unknown> }
  host.__robotics = Object.assign(host.__robotics ?? {}, { kitStore: useKitStore, armKit })
}
