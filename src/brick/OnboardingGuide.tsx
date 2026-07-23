import { Check, Gamepad2, MousePointer2, Shapes, X } from 'lucide-react'
import { useState } from 'react'

const ONBOARDING_KEY = 'brick-studio:onboarding:v1'

function onboardingWasDismissed() {
  try {
    return window.localStorage.getItem(ONBOARDING_KEY) === 'dismissed'
  } catch {
    return false
  }
}

function persistOnboardingDismissal() {
  try {
    window.localStorage.setItem(ONBOARDING_KEY, 'dismissed')
  } catch {
    // The guide remains dismissible for this session if storage is unavailable.
  }
}

export function useBuilderOnboarding() {
  const [open, setOpen] = useState(() => !onboardingWasDismissed())
  const [forced, setForced] = useState(false)

  return {
    open,
    forced,
    dismiss: () => {
      persistOnboardingDismissal()
      setOpen(false)
      setForced(false)
    },
    reopen: () => {
      setForced(true)
      setOpen(true)
    },
  }
}

type OnboardingGuideProps = {
  onDismiss: () => void
}

export function OnboardingGuide({ onDismiss }: OnboardingGuideProps) {
  return (
    <section className="onboarding-guide" role="dialog" aria-modal="false" aria-labelledby="onboarding-title">
      <button className="onboarding-close studio-icon-button" type="button" aria-label="Dismiss quick start" onClick={onDismiss}><X size={18} /></button>
      <span className="brick-eyebrow">Quick start</span>
      <h2 id="onboarding-title">Build something you can explore</h2>
      <p className="onboarding-intro">
        <span className="fine-pointer-copy">Click to build quickly. Drag empty space to orbit.</span>
        <span className="coarse-pointer-copy">Tap to position safely. Drag empty space to orbit, then use the large Place button.</span>
      </p>
      <ol>
        <li><span><Shapes size={18} /></span><div><strong>Choose a brick</strong><small>Pick any shape from the drawer.</small></div></li>
        <li><span><MousePointer2 size={18} /></span><div><strong>Position the preview</strong><small>Move it onto the plate or another brick.</small></div></li>
        <li><span><Check size={18} /></span><div><strong>Place it</strong><small><span className="fine-pointer-copy">Click or press Enter.</span><span className="coarse-pointer-copy">Tap the blue Place button.</span></small></div></li>
        <li><span><Gamepad2 size={18} /></span><div><strong>Explore</strong><small>Switch modes when your world is ready.</small></div></li>
      </ol>
      <button className="studio-button studio-button-primary onboarding-start" type="button" onClick={onDismiss}>Start building</button>
    </section>
  )
}
