import { classJoinHref } from './client'
import { useEffect, useState } from 'react'
import { Monitor } from 'lucide-react'
import { Button, Sheet } from '../ui'
import type { ClassroomClass } from './contracts'

type Props = {
  classroom: ClassroomClass
  /** Start with the link and QR visible (teachers landing on My Class before a lesson). */
  defaultOpen?: boolean
}

export function ClassInvite({ classroom, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [projector, setProjector] = useState(false)
  const [qr, setQr] = useState('')
  const [projectorQr, setProjectorQr] = useState('')
  const [copied, setCopied] = useState(false)
  const code = classroom.code || classroom.loginCode
  // Invites land on account creation: /join?classCode=<code> (contract v2).
  const href = classJoinHref(code)
  useEffect(() => {
    let active = true
    setQr(''); setCopied(false)
    if (open) void import('qrcode').then(module => module.toDataURL(href, { width: 180, margin: 2 })).then(value => { if (active) setQr(value) }).catch(() => {})
    return () => { active = false }
  }, [open, href])
  useEffect(() => {
    let active = true
    setProjectorQr('')
    if (projector) void import('qrcode').then(module => module.toDataURL(href, { width: 320, margin: 2 })).then(value => { if (active) setProjectorQr(value) }).catch(() => {})
    return () => { active = false }
  }, [projector, href])
  return <section className="classroom-invite" aria-label="Invite students">
    <div className="classroom-invite-heading">
      <div><strong>Class code: <span className="classroom-invite-code">{code}</span></strong><p>One code for new and returning students.</p></div>
      <div className="classroom-invite-actions">
        <Button variant="secondary" size="sm" icon={<Monitor size={16} />} onClick={() => setProjector(true)}>Show on projector</Button>
        <Button variant="primary" size="sm" onClick={() => setOpen(value => !value)} aria-expanded={open}>Invite students</Button>
      </div>
    </div>
    {open && <div className="classroom-invite-details">
      {qr && <img src={qr} width={180} height={180} alt="Scan to open this class on another device" />}
      <div><p>{classroom.enrollmentOpen ? 'Students open this link or scan the code, then sign in or create an account.' : 'New accounts are closed. Existing students can still sign in.'}</p><label>Class link<input className="ui-input" readOnly value={href} onFocus={event => event.target.select()} /></label><Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(href).then(() => setCopied(true)).catch(() => setCopied(false)) }}>{copied ? 'Copied' : 'Copy class link'}</Button></div>
    </div>}
    <Sheet open={projector} onClose={() => setProjector(false)} variant="dialog" size="lg" title={classroom.name} closeLabel="Close projector view" className="classroom-projector">
      <div className="classroom-projector-body">
        <p className="classroom-projector-label">Class code</p>
        <p className="classroom-projector-code">{code}</p>
        {projectorQr && <img className="classroom-projector-qr" src={projectorQr} width={320} height={320} alt="Scan to open this class" />}
        <p className="classroom-projector-steps">Go to <strong>{window.location.host}/join</strong>, enter the code, then sign in or create your account</p>
      </div>
    </Sheet>
  </section>
}
