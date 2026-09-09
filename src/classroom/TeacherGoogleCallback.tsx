import { useEffect, useRef, useState } from 'react'
import { browserClassroomClient } from './client'
import './classroom.css'

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
  return <main className="classroom-backdrop"><section className="classroom-panel"><span className="classroom-eyebrow">BRICK STUDIO</span><h1>{error ? 'Sign-in needs another try' : 'Finishing Google sign-in…'}</h1>{error ? <><p role="alert">{error}</p><a href="/?classroom=class">Return to Brick Studio</a></> : <p role="status">Checking your teacher account. Your build is preserved.</p>}</section></main>
}
