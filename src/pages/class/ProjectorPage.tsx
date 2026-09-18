import { useEffect, useState, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../ui'
import { errorMessage } from '../../classroom/panelShared'
import { classCode, defaultClassPageClient, joinHost, loadClasses, type ClassPageClient, type ClassPageClass } from './classPageData'
import { useJoinQr } from './ClassCodeCard'
import { createDemoClassPageClient } from './demoData'
import './class.css'

type Props = {
  client?: ClassPageClient
  navigate?: (href: string) => void
}

function resolveClient(): ClassPageClient {
  if (!import.meta.env.DEV) return defaultClassPageClient
  return new URLSearchParams(window.location.search).has('demo') ? createDemoClassPageClient('everyday') : defaultClassPageClient
}

/**
 * The class code on the board. It loads its own class, so a teacher can open it
 * in a second tab and leave it up while they work in `/class`.
 */
export default function ProjectorPage({ client = resolveClient(), navigate = href => window.location.assign(href) }: Props) {
  const session = useSyncExternalStore(client.subscribe, client.getSession)
  const teacher = session?.user.role === 'teacher'
  const [classes, setClasses] = useState<ClassPageClass[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const requested = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('classId')
  const current = classes.find(item => item.id === requested) || classes[0]
  const code = current ? classCode(current) : ''
  const qr = useJoinQr(code, 320)

  useEffect(() => {
    if (!session) navigate('/join?mode=teacher&next=/class/projector')
    else if (session.user.role !== 'teacher') navigate('/worlds')
  }, [session, navigate])

  useEffect(() => {
    if (!teacher) return
    let cancelled = false
    loadClasses(client)
      .then(result => { if (!cancelled) setClasses(result) })
      .catch(failure => { if (!cancelled) setError(errorMessage(failure)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [client, teacher])

  if (!session || !teacher) return <main className="class-page-redirect" role="status">Taking you to the right page…</main>

  return <main className="class-projector-page" aria-labelledby="class-projector-title">
    <div className="class-projector-close"><Button variant="quiet" icon={<X size={18} />} href="/class">Close</Button></div>
    {loading
      ? <p role="status" className="class-loading">Loading your class…</p>
      : error
        ? <p role="alert" className="class-banner class-banner-error">{error}</p>
        : current
          ? <>
            <h1 id="class-projector-title" className="class-projector-name">{current.name}</h1>
            <p className="class-projector-label">Class code</p>
            <p className="class-projector-code-big">{code}</p>
            {qr && <img className="class-projector-qr" src={qr} width={320} height={320} alt={`Scan to join ${current.name}`} />}
            <p className="class-projector-steps">Go to <strong>{joinHost()}</strong>, enter the code, then tap your name.</p>
          </>
          : <p role="status" className="class-help">Create a class first — its code appears here.</p>}
  </main>
}
