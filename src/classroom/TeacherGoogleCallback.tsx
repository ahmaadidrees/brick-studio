import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Blocks } from 'lucide-react'
import { browserClassroomClient } from './client'
import { PRODUCT_NAME } from './panelShared'
import './classroom.css'

/** Board 04 right: the Google round-trip lands here. Pending and failure states; the exchange itself lives in client.ts. */
export default function TeacherGoogleCallback() {
  const [error, setError] = useState('')
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const callback = window.location.href
    // Remove the short-lived authorization code before rendering links or starting requests.
    window.history.replaceState(null, '', '/auth/teacher-callback')
    void browserClassroomClient.finishGoogleTeacher(callback).then(({ returnTo }) => window.location.replace(returnTo)).catch(reason => setError(reason instanceof Error ? reason.message : 'Could not finish Google sign-in.'))
  }, [])
  return <main className="classroom-backdrop classroom-backdrop-page"><section className={`classroom-panel classroom-callback${error ? ' classroom-callback-failed' : ''}`} aria-live="polite">
    <header className="classroom-header"><div><span className="classroom-eyebrow">{PRODUCT_NAME}</span><h1 className="classroom-callback-title">{error ? 'Sign-in needs another try' : 'Finishing teacher sign-in…'}</h1></div></header>
    <div className="classroom-body classroom-callback-body">
      <span className={`classroom-callback-icon${error ? ' classroom-callback-icon-error' : ''}`} aria-hidden="true">{error ? <AlertTriangle size={30} /> : <Blocks size={30} />}</span>
      {error ? <>
        <p className="classroom-lead">Your build is still here.</p>
        <p className="classroom-error" role="alert">{error}</p>
        <div className="classroom-actions"><a className="classroom-button classroom-primary" href="/build?classroom=teacher">Try again</a><a className="classroom-button" href="/build">Keep building</a></div>
      </> : <>
        <p className="classroom-lead" role="status">Your build is preserved.</p>
        <div className="classroom-progress" aria-hidden="true"><span /></div>
        <p className="classroom-help">Checking your teacher account with Google. This usually takes a moment.</p>
      </>}
    </div>
  </section></main>
}
