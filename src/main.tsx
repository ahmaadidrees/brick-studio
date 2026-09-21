import { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { AppErrorBoundary } from './brick/AppErrorBoundary'
import { installBrickStudioErrorListeners } from './brick/errorLog'
import { resolveAppRoute } from './routes'
import { BRAND_NAME } from './brand'

// Prefixed console logging plus a small in-memory ring buffer for the recovery screen.
installBrickStudioErrorListeners()

const TeacherGoogleCallback = lazy(() => import('./classroom/TeacherGoogleCallback'))
const BrickStudioApp = lazy(() => import('./brick/BrickStudioApp'))
const PublishedWorldPage = lazy(() => import('./brick/PublishedWorldPage'))
const LiveWorldPage = lazy(() => import('./brick/LiveWorldPage'))
const LandingPage = lazy(() => import('./brick/landing/LandingPage'))
// Dev-only component gallery; the production bundle drops the chunk along with this branch.
const UiGallery = import.meta.env.DEV ? lazy(() => import('./ui/Gallery')) : null
const JoinPage = lazy(() => import('./pages/join/JoinPage'))
const WorldsPage = lazy(() => import('./pages/worlds/WorldsPage'))
const ClassPage = lazy(() => import('./pages/class/ClassPage'))
const ProjectorPage = lazy(() => import('./pages/class/ProjectorPage'))
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
    : route === 'join'
      ? <JoinPage />
    : route === 'worlds'
      ? <WorldsPage />
    : route === 'class'
      ? <ClassPage />
    : route === 'class-projector'
      ? <ProjectorPage />
    : route === 'dev-ui' && UiGallery
      ? <UiGallery />
      : <main style={{ padding: '3rem', maxWidth: 640, margin: 'auto' }}><h1>We couldn't find that page</h1><p>Your saved builds are still available.</p><p><a href="/">Home</a> · <a href="/build">Open the studio</a></p></main>

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', background: '#f4f2ed', color: '#405761', fontWeight: 800 }}>{route === 'landing' ? `Welcome to ${BRAND_NAME}…` : 'Opening the studio…'}</div>}>
      {experience}
    </Suspense>
  </AppErrorBoundary>,
)
