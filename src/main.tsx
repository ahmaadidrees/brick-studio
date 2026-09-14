import { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { AppErrorBoundary } from './brick/AppErrorBoundary'
import { installBrickStudioErrorListeners } from './brick/errorLog'
import { resolveAppRoute } from './routes'

// Prefixed console logging plus a small in-memory ring buffer for the recovery screen.
installBrickStudioErrorListeners()

const TeacherGoogleCallback = lazy(() => import('./classroom/TeacherGoogleCallback'))
const BrickStudioApp = lazy(() => import('./brick/BrickStudioApp'))
const PublishedWorldPage = lazy(() => import('./brick/PublishedWorldPage'))
const LiveWorldPage = lazy(() => import('./brick/LiveWorldPage'))
const LandingPage = lazy(() => import('./brick/landing/LandingPage'))
const { route, canonicalPath } = resolveAppRoute(window.location)
if (canonicalPath) window.history.replaceState(null, '', canonicalPath)
const experience = route === 'teacher-callback'
  ? <TeacherGoogleCallback />
  : route === 'landing'
    ? <LandingPage />
  : route === 'live'
    ? <LiveWorldPage />
  : route === 'published'
    ? <PublishedWorldPage />
    : route === 'build'
      ? <BrickStudioApp />
      : <main style={{ padding: '3rem', maxWidth: 640, margin: 'auto' }}><h1>We couldn't find that page</h1><p>Your saved builds are still available.</p><p><a href="/">Home</a> · <a href="/build">Open the studio</a></p></main>

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', background: '#f4f2ed', color: '#405761', fontWeight: 800 }}>{route === 'landing' ? 'Welcome to Brick Studio…' : 'Opening the studio…'}</div>}>
      {experience}
    </Suspense>
  </AppErrorBoundary>,
)
