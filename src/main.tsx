import { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const RoverLabApp = lazy(() => import('./App'))
const BrickStudioApp = lazy(() => import('./brick/BrickStudioApp'))
const experience = window.location.pathname.startsWith('/rover') ? <RoverLabApp /> : <BrickStudioApp />

createRoot(document.getElementById('root')!).render(
  <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', background: '#f4f2ed', color: '#405761', fontWeight: 800 }}>Opening the studio…</div>}>
    {experience}
  </Suspense>,
)
