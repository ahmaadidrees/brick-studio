import { Check, Link2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button, type ButtonVariant } from '../../ui'

export type CopyInviteButtonProps = {
  shareLink: string
  copyText: (text: string) => Promise<boolean>
  className?: string
  variant?: ButtonVariant
}

/**
 * Copies the guest invite link (never the owner capability). When the
 * clipboard is blocked it falls back to a prompt so the link is still
 * hand-copyable on locked-down classroom devices. The label reports the
 * real outcome ("Copied!" vs "Link ready to share"), never assumes success.
 */
export function CopyInviteButton({ shareLink, copyText, className, variant = 'primary' }: CopyInviteButtonProps) {
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
    <Button
      variant={variant}
      className={['live-copy-button', className].filter(Boolean).join(' ')}
      icon={state === 'idle' ? <Link2 size={16} /> : <Check size={16} />}
      onClick={() => { void copyInvite() }}
    >
      {state === 'copied' ? 'Copied!' : state === 'shown' ? 'Link ready to share' : 'Copy link'}
    </Button>
  )
}
