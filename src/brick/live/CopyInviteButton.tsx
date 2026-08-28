import { Check, Link2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export type CopyInviteButtonProps = {
  shareLink: string
  copyText: (text: string) => Promise<boolean>
  className?: string
}

/**
 * Copies the guest invite link (never the owner capability). When the
 * clipboard is blocked it falls back to a prompt so the link is still
 * hand-copyable on locked-down classroom devices.
 */
export function CopyInviteButton({ shareLink, copyText, className }: CopyInviteButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'shown'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const copyInvite = async () => {
    let copied = false
    try {
      copied = await copyText(shareLink)
    } catch {
      copied = false
    }
    if (!copied) window.prompt('Share this invite link:', shareLink)
    setState(copied ? 'copied' : 'shown')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 2000)
  }

  return (
    <button type="button" className={className ?? 'live-copy-button'} onClick={() => { void copyInvite() }}>
      {state === 'idle' ? <Link2 size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
      <span>{state === 'copied' ? 'Copied!' : state === 'shown' ? 'Link ready to share' : 'Copy invite link'}</span>
    </button>
  )
}
