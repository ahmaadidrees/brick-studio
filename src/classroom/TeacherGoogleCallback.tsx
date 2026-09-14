import { useEffect, useRef, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { BrandLockup, BrickMark } from '../brand'
import { browserClassroomClient } from './client'
import './classroom.css'

/** Board 04 right: the Google round-trip lands here. Pending and failure states; the exchange itself lives in client.ts. */
export default function TeacherGoogleCallback() {
  const [error, setError] = useState('')
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const callback = window.location.href
    window.history.replaceState(null, '', '/auth/teacher-callback')
    void browserClassroomClient.finishGoogleTeacher(callback).then(({ returnTo }) => window.location.replace(returnTo)).catch(reason => setError(reason instanceof Error ? reason.message : 'Could not finish Google sign-in.'))
  }, [])
  return <main className="classroom-page">
    <section className={`classroom-page-card${error ? ' classroom-page-card-failed' : ''}`} aria-live="polite">
      <BrandLockup size={28} className="classroom-page-brand" />
      <div className="classroom-page-body">
        <span className={`classroom-page-icon${error ? ' classroom-page-icon-error' : ''}`} aria-hidden="true">{error ? <TriangleAlert size={30} /> : <BrickMark size={36} title={null} />}</span>
        <div className="classroom-page-text">
          <h1 className="classroom-page-title">{error ? 'Sign-in needs another try' : 'Finishing teacher sign-in…'}</h1>
          {error ? <>
            <p className="classroom-lead">Your build is still here.</p>
            <p className="classroom-error" role="alert">{error}</p>
            <div className="classroom-actions classroom-actions-stack">
              <a className="ui-button ui-button-primary ui-button-md" href="/build?classroom=teacher"><span className="ui-button-label">Try again</span></a>
              <a className="ui-button ui-button-secondary ui-button-md" href="/build"><span className="ui-button-label">Keep building</span></a>
            </div>
          </> : <>
            <p className="classroom-lead" role="status">Your build is preserved.</p>
            <div className="classroom-progress" aria-hidden="true"><span /></div>
            <p className="classroom-help">Checking your teacher account with Google. This usually takes a moment.</p>
          </>}
        </div>
      </div>
    </section>
  </main>
}
