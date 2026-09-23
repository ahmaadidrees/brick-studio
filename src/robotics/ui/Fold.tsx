import { ChevronDown } from 'lucide-react'
import { useId, type ReactNode } from 'react'

/**
 * A folded section (the panel's Parts and More, a part's own More): one big toggle, shut by
 * default. `label` names the toggle for a screen reader when the visible title is not enough
 * ("More about Left motor"); it starts with the title, so what is seen is what is said.
 */
export function Fold({ title, note, label, open, onToggle, testId, children }: { title: string; note?: string; label?: string; open: boolean; onToggle: () => void; testId: string; children: ReactNode }) {
  const bodyId = useId()
  return (
    <section className={`robotics-fold${open ? ' open' : ''}`} data-testid={testId}>
      <button type="button" className="robotics-fold-toggle" aria-expanded={open} aria-controls={bodyId} aria-label={label} onClick={onToggle}>
        <span>{title}</span>
        {note && <small>{note}</small>}
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {open && <div className="robotics-fold-body" id={bodyId}>{children}</div>}
    </section>
  )
}
