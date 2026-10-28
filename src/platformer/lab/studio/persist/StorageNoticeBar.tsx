import { useEffect } from 'react'
import { CircleAlert } from 'lucide-react'
import { clearStorageNotice, useStorageNotice } from './notice'
import './projectMenu.css'

/**
 * Where a kid sees save and open messages: a banner under the header, on the builder and in the workshop. It used to
 * live only inside the closed "This world" menu, so a full disk or an unreadable save went unnoticed.
 */
export function StorageNoticeBar() {
  const notice = useStorageNotice()
  const quiet = notice !== null && !notice.sticky && (notice.type === 'success' || notice.type === 'info')

  // Good news fades on its own; problems stay until a kid dismisses them.
  useEffect(() => {
    if (!quiet || !notice) return
    const t = setTimeout(clearStorageNotice, 6000)
    return () => clearTimeout(t)
  }, [quiet, notice])

  if (!notice) return null
  const problem = !quiet
  return (
    <div className={`storage-notice-bar banner-${notice.type}`} role={problem ? 'alert' : 'status'} aria-live={problem ? 'assertive' : 'polite'}>
      <div className="storage-notice-text">
        <CircleAlert size={20} aria-hidden="true" />
        <span>{notice.message}</span>
      </div>
      <div className="storage-notice-actions">
        {notice.actions?.map((a) => (
          <button key={a.label} type="button" className="storage-notice-btn storage-notice-btn-primary" onClick={a.run}>
            {a.label}
          </button>
        ))}
        {!notice.sticky && (
          <button type="button" className="storage-notice-btn" onClick={clearStorageNotice} aria-label="Dismiss message">
            Dismiss
          </button>
        )}
      </div>
    </div>
  )
}
