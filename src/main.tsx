import { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { AppErrorBoundary } from './brick/AppErrorBoundary'
import { installBrickStudioErrorListeners } from './brick/errorLog'

// Prefixed console logging plus a small in-memory ring buffer for the recovery screen.
installBrickStudioErrorListeners()

const TeacherGoogleCallback = lazy(() => import('./classroom/TeacherGoogleCallback'))
const BrickStudioApp = lazy(() => import('./brick/BrickStudioApp'))
const PublishedWorldPage = lazy(() => import('./brick/PublishedWorldPage'))
const LiveWorldPage = lazy(() => import('./brick/LiveWorldPage'))
const LandingPage = lazy(() => import('./brick/landing/LandingPage'))
const landingPageMatch = /^\/welcome\/?$/.test(window.location.pathname)
const publishedWorldMatch = /^\/world\/?$/.test(window.location.pathname)
const liveWorldMatch = /^\/live\/[^/]+\/?$/.test(window.location.pathname)
const experience = window.location.pathname === '/auth/teacher-callback'
  ? <TeacherGoogleCallback />
  : landingPageMatch
    ? <LandingPage />
  : liveWorldMatch
    ? <LiveWorldPage />
  : publishedWorldMatch
    ? <PublishedWorldPage />
    : <BrickStudioApp />

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', background: '#f4f2ed', color: '#405761', fontWeight: 800 }}>Opening the studio…</div>}>
      {experience}
    </Suspense>
  </AppErrorBoundary>,
)
