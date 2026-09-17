import { useEffect, useState } from 'react'
import { Button } from '../ui'
import type { ClassroomClass } from './contracts'

export function ClassInvite({ classroom }: { classroom: ClassroomClass }) {
  const [open, setOpen] = useState(false)
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const code = classroom.code || classroom.loginCode
  const url = new URL('/build', window.location.origin)
  url.searchParams.set('classroom', 'signin')
  url.searchParams.set('classCode', code)
  const href = url.toString()
  useEffect(() => {
    let active = true
    setQr(''); setCopied(false)
    if (open) void import('qrcode').then(module => module.toDataURL(href, { width: 180, margin: 2 })).then(value => { if (active) setQr(value) }).catch(() => {})
    return () => { active = false }
  }, [open, href])
  return <section className="classroom-invite" aria-label="Invite students">
    <div className="classroom-invite-heading"><div><strong>Class code: <span className="classroom-invite-code">{code}</span></strong><p>One code for new and returning students.</p></div><Button variant="primary" size="sm" onClick={() => setOpen(value => !value)} aria-expanded={open}>Invite students</Button></div>
    {open && <div className="classroom-invite-details">
      {qr && <img src={qr} width={180} height={180} alt="Scan to open this class on another device" />}
      <div><p>{classroom.enrollmentOpen ? 'Students open this link or scan the code, then sign in or create an account.' : 'New accounts are closed. Existing students can still sign in.'}</p><label>Class link<input className="ui-input" readOnly value={href} onFocus={event => event.target.select()} /></label><Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(href).then(() => setCopied(true)).catch(() => setCopied(false)) }}>{copied ? 'Copied' : 'Copy class link'}</Button></div>
    </div>}
  </section>
}
