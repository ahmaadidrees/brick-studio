import { useEffect, useState, type RefObject } from 'react'
import { Check, ChevronUp, Copy, Monitor, Printer, QrCode } from 'lucide-react'
import { Button } from '../../ui'
import { joinHost, joinLink } from './classPageData'

/** Renders the join link as a QR data URL; empty until `qrcode` loads (and on failure). */
export function useJoinQr(code: string, size: number) {
  const [qr, setQr] = useState('')
  useEffect(() => {
    let active = true
    setQr('')
    if (!code) return
    void import('qrcode').then(module => module.toDataURL(joinLink(code), { width: size, margin: 2 })).then(value => { if (active) setQr(value) }).catch(() => {})
    return () => { active = false }
  }, [code, size])
  return qr
}

type Props = {
  className: string
  code: string
  /** Where "Show on projector" goes; omitted on the projector page itself. */
  projectorHref?: string
  /** Once the class has students the card can fold back to its one-line strip. */
  onFold?: () => void
  cardRef?: RefObject<HTMLElement | null>
}

/**
 * The card at the top of Students: scan target, the code in display type, and
 * the three things a teacher does with it at the start of a lesson.
 */
export function ClassCodeCard({ className, code, projectorHref, onFold, cardRef }: Props) {
  const qr = useJoinQr(code, 180)
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')
  const link = code ? joinLink(code) : ''
  useEffect(() => { if (copied !== 'copied') return; const timer = window.setTimeout(() => setCopied('idle'), 2500); return () => window.clearTimeout(timer) }, [copied])
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(link); setCopied('copied')
    } catch { setCopied('failed') }
  }
  return <section ref={cardRef} tabIndex={-1} className="class-code-card" aria-labelledby="class-code-title">
    <div className="class-code-qr">{qr
      ? <img src={qr} width={180} height={180} alt={`Scan to join ${className}`} />
      : <span className="class-code-qr-placeholder" aria-hidden="true" />}</div>
    <div className="class-code-main">
      <small className="class-code-eyebrow" id="class-code-title">Class code</small>
      <strong className="class-code-value">{code || 'Unavailable'}</strong>
      <p className="class-code-steps">Students go to <strong>{joinHost()}</strong>, enter the code, then tap their name. New students tap “I’m new”.</p>
      {copied === 'failed' && <label className="class-code-fallback">Join link<input className="ui-input" readOnly value={link} onFocus={event => event.target.select()} /></label>}
      <div className="class-code-actions">
        {projectorHref && <Button variant="primary" size="sm" icon={<Monitor size={16} />} href={projectorHref}>Show on projector</Button>}
        <Button variant="secondary" size="sm" icon={copied === 'copied' ? <Check size={16} /> : <Copy size={16} />} disabled={!code} onClick={() => void copy()}>{copied === 'copied' ? 'Link copied' : 'Copy join link'}</Button>
        <Button variant="secondary" size="sm" icon={<Printer size={16} />} disabled={!code} onClick={() => window.print()}>Print QR</Button>
        {onFold && <Button variant="quiet" size="sm" icon={<ChevronUp size={16} />} onClick={onFold}>Fold away</Button>}
      </div>
      {copied === 'failed' && <small className="class-help" role="status">Copying is blocked in this browser. Select the link above to copy it by hand.</small>}
    </div>
  </section>
}

type StripProps = { code: string; projectorHref: string; onExpand: () => void }

/**
 * The code card folded to one line, once the class has students: the code is still there to read out, and the
 * roster starts near the top of the page instead of under the QR.
 */
export function ClassCodeStrip({ code, projectorHref, onExpand }: StripProps) {
  return <section className="class-code-strip" aria-labelledby="class-code-strip-title">
    <small className="class-code-eyebrow" id="class-code-strip-title">Class code</small>
    <strong className="class-code-strip-value">{code || 'Unavailable'}</strong>
    <span className="class-code-strip-host">{joinHost()}</span>
    <div className="class-code-actions">
      <Button variant="secondary" size="sm" icon={<Monitor size={16} />} href={projectorHref}>Show on projector</Button>
      <Button variant="quiet" size="sm" icon={<QrCode size={16} />} aria-expanded={false} onClick={onExpand}>QR and join link</Button>
    </div>
  </section>
}

/** Paper version of the code card; only `@media print` reveals it. */
export function PrintableCode({ className, code }: { className: string; code: string }) {
  const qr = useJoinQr(code, 420)
  return <div className="class-print-sheet" aria-hidden="true">
    <h2>{className}</h2>
    <p className="class-print-code">{code}</p>
    {qr && <img src={qr} width={420} height={420} alt="" />}
    <p className="class-print-steps">Go to {joinHost()}, enter the code, then tap your name. New? Tap “I’m new”.</p>
  </div>
}
