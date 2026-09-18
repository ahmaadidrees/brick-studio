import { useState, type ReactNode } from 'react'
import { ChevronDown, Compass, Download, ExternalLink, Eye, EyeOff, GraduationCap, Heart, Image, KeyRound, Settings, Smile, User, UserRound, Users } from 'lucide-react'
import { BRAND_NAME, BRAND_PALETTE, BRAND_PRIMARY_STRONG, BRAND_TAGLINE, BrandLockup, BrickMark, Wordmark } from '../brand'
import { Button } from './Button'
import { Field, TextField } from './Field'
import { Select } from './Select'
import { SegmentedControl } from './SegmentedControl'
import { SaveStatus, type SaveStatusSource } from './SaveStatus'
import { Dialog, Sheet } from './Sheet'
import { AccountChip, AppHeader, WorldMenu, type ClassroomSessionState } from '../shell'
import './gallery.css'

/**
 * Component review page (dev-only; the lead wires the `/dev/ui` route). Shows
 * every primitive in every state, plus one representative compact header, a
 * sign-in form and a sheet so the lanes can match spacing and hierarchy.
 * Light theme only — the product has no dark theme.
 */
export function Gallery() {
  return (
    <main className="ui-gallery" aria-labelledby="ui-gallery-title">
      <header className="ui-gallery-intro">
        <BrandLockup size={40} />
        <h1 id="ui-gallery-title">Component gallery</h1>
        <p>{BRAND_NAME} direction I — tokens, mark, wordmark and the shared primitives. Every lane builds from these; nothing here is product UI.</p>
      </header>

      <GallerySection id="app-header" title="App header" description="One header for every screen (src/shell/AppHeader). Things about my build sit beside its name; things about me sit in the top-right corner. Landing = lockup + page links + account chip; page = lockup, page title, actions, chip; editor = mark (Home), title + pencil, ⋯ This build menu, save pill, Scene / Character / People, Build | Explore pill, chip. Under 700px the editor keeps mark, title, save pill, mode switch and an icon-only chip on the first row and moves the tools to a second row.">
        <AppHeaderExample />
      </GallerySection>

      <GallerySection id="header" title="Compact header" description="64–72px. Brand/home, world title menu and true save state left; Scene, Character, People, Settings right; one primary Explore action at the far edge. Under 640px the wordmark drops and the actions wrap into a second row.">
        <HeaderExample />
      </GallerySection>

      <GallerySection id="signin" title="Sign-in form" description="Labels always visible, hints kept while an error shows, one primary action, 44px controls.">
        <SignInExample />
      </GallerySection>

      <GallerySection id="sheet" title="Sheet and dialog" description="Right-docked on wide screens, bottom sheet under 900px or on touch. Scrolling body, persistent footer, Escape closes only the topmost dialog, focus returns to the opener.">
        <SheetExample />
      </GallerySection>

      <GallerySection id="mark" title="Mark and wordmark" description="Two equal rounded brick lobes forming a B; blue upper, coral lower; two front studs per lobe. Wordmark is real text in Fredoka.">
        <div className="ui-gallery-row">
          {[16, 24, 32, 48, 96].map((size) => <BrickMark key={size} size={size} />)}
          <BrickMark size={48} variant="mono" />
          <span className="ui-gallery-inverse"><BrickMark size={48} variant="mono" /></span>
          <BrickMark size={48} variant="outline" />
        </div>
        <div className="ui-gallery-row">
          <BrandLockup size={32} />
          <BrandLockup size={24} variant="mono" />
          <Wordmark size={40} />
        </div>
        <p className="ui-gallery-note">Tagline: {BRAND_TAGLINE}</p>
      </GallerySection>

      <GallerySection id="tokens" title="Palette" description="Cornflower, coral and butter are surface and illustration colors; ink carries text; white text sits only on --primary-strong, --danger and --success.">
        <div className="ui-gallery-swatches">
          <Swatch name="--primary" value={BRAND_PALETTE.cornflower} />
          <Swatch name="--primary-strong" value={BRAND_PRIMARY_STRONG} light />
          <Swatch name="--accent" value={BRAND_PALETTE.coral} />
          <Swatch name="--warning" value={BRAND_PALETTE.butter} />
          <Swatch name="--text" value={BRAND_PALETTE.ink} light />
          <Swatch name="--bg" value={BRAND_PALETTE.warmWhite} />
          <Swatch name="--danger" value="#C9463A" light />
          <Swatch name="--success" value="#1F7A46" light />
        </div>
      </GallerySection>

      <GallerySection id="buttons" title="Buttons" description="primary · secondary · quiet · danger, three sizes, icon slot, loading, disabled, pressed toggles, and the same component as a link (href). sm reaches 44px on touch.">
        <ButtonsExample />
      </GallerySection>

      <GallerySection id="fields" title="Fields" description="Label, hint, error, required and disabled states; the required mark sits outside the label so the accessible name stays plain; the password pattern uses Field's render prop; Select is the native picker beyond four options.">
        <FieldsExample />
      </GallerySection>

      <GallerySection id="segmented" title="Segmented control" description="Radiogroup: one tab stop, arrow keys move the selection; aria-describedby ties a hint to the group; options are 44px on touch.">
        <SegmentedExample />
      </GallerySection>

      <GallerySection id="status" title="Save status" description="Keyed to the real enums. Device icon for browser-only drafts; the cloud icon appears only for cloud 'saved'.">
        <SaveStatusExample />
      </GallerySection>
    </main>
  )
}

function GallerySection({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return (
    <section className="ui-gallery-section" aria-labelledby={`ui-gallery-${id}`} data-gallery-section={id}>
      <div className="ui-gallery-section-heading">
        <h2 id={`ui-gallery-${id}`}>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="ui-gallery-section-body">{children}</div>
    </section>
  )
}

function Swatch({ name, value, light = false }: { name: string; value: string; light?: boolean }) {
  return (
    <div className="ui-gallery-swatch" style={{ background: value, color: light ? '#fff' : BRAND_PALETTE.ink }}>
      <strong>{name}</strong>
      <span>{value}</span>
    </div>
  )
}

type HeaderState = 'local' | 'saved' | 'saving' | 'error' | 'online' | 'offline'

function headerState(source: SaveStatusSource): HeaderState {
  if (source.kind === 'local') return 'local'
  if (source.kind === 'cloud') return source.status === 'pending' ? 'saving' : source.status
  return source.connection === 'online' ? 'online' : 'offline'
}

/** Representative compact editor header; W4 builds the real one from the same primitives. */
function HeaderExample() {
  const [cloud, setCloud] = useState<SaveStatusSource>({ kind: 'local' })
  return (
    <div className="ui-gallery-header-demo">
      <div className="ui-gallery-header" data-gallery="header">
        <div className="ui-gallery-header-start">
          <BrandLockup size={32} wordmark="wide" href="#header" srSuffix="Home" onClick={(event) => event.preventDefault()} />
          <span className="ui-gallery-header-divider" aria-hidden="true" />
          <Button variant="quiet" trailingIcon={<ChevronDown size={16} />} aria-haspopup="menu" className="ui-gallery-header-title">Desk Castle</Button>
          <SaveStatus source={cloud} autoCompact />
        </div>
        <div className="ui-gallery-header-actions" aria-label="World tools">
          <Button variant="quiet" icon={<Image size={18} />}>Scene</Button>
          <Button variant="quiet" icon={<Smile size={18} />}>Character</Button>
          <Button variant="quiet" icon={<Users size={18} />}>People</Button>
          <Button variant="quiet" iconOnly icon={<Settings size={20} />} aria-label="Settings">Settings</Button>
        </div>
        <div className="ui-gallery-header-end">
          <Button variant="primary" icon={<Compass size={18} />}>Explore</Button>
        </div>
      </div>
      <div className="ui-gallery-row ui-gallery-controls">
        <SegmentedControl<HeaderState>
          label="Header save state"
          showLabel
          size="sm"
          value={headerState(cloud)}
          onChange={(value) => {
            if (value === 'local') setCloud({ kind: 'local' })
            else if (value === 'online' || value === 'offline') setCloud({ kind: 'live', connection: value })
            else setCloud({ kind: 'cloud', status: value })
          }}
          options={[
            { value: 'local', label: 'Local' },
            { value: 'saved', label: 'Saved' },
            { value: 'saving', label: 'Saving' },
            { value: 'error', label: 'Error' },
            { value: 'online', label: 'Live' },
            { value: 'offline', label: 'Offline' },
          ]}
        />
      </div>
    </div>
  )
}

type GalleryRole = 'guest' | 'student' | 'teacher'

const noop = async () => undefined
const GALLERY_SESSIONS: Record<GalleryRole, ClassroomSessionState> = {
  guest: { status: 'guest', signOut: noop, switchAccount: noop },
  student: {
    status: 'student',
    user: { id: 'u1', username: 'ava', rosterName: 'Ava Rodriguez', role: 'student', resetRequired: false },
    classes: [],
    className: 'Period 2 — Builders',
    displayName: 'Ava R.',
    signOut: noop,
    switchAccount: noop,
  },
  teacher: {
    status: 'teacher',
    user: { id: 't1', username: 'Teacher', rosterName: 'Ms. Okafor', role: 'teacher', resetRequired: false },
    classes: [],
    displayName: 'Ms. O.',
    signOut: noop,
    switchAccount: noop,
  },
}

/** The shell header in its three variants, driven by a role switch, plus both menus open for review. */
function AppHeaderExample() {
  const [role, setRole] = useState<GalleryRole>('student')
  const [mode, setMode] = useState<'build' | 'explore'>('build')
  const [live, setLive] = useState(false)
  const session = GALLERY_SESSIONS[role]
  const stop = (event: { preventDefault: () => void }) => event.preventDefault()
  return (
    <div className="ui-gallery-stack" data-gallery="app-header">
      <div className="ui-gallery-row ui-gallery-controls">
        <SegmentedControl<GalleryRole> label="Signed in as" showLabel size="sm" value={role} onChange={setRole} options={[{ value: 'guest', label: 'Guest' }, { value: 'student', label: 'Student' }, { value: 'teacher', label: 'Teacher' }]} />
        <SegmentedControl<'draft' | 'live'> label="Editor session" showLabel size="sm" value={live ? 'live' : 'draft'} onChange={(value) => setLive(value === 'live')} options={[{ value: 'draft', label: 'Own build' }, { value: 'live', label: 'Shared world (guest)' }]} />
      </div>
      <div className="ui-gallery-header-frame" data-variant="landing" onClickCapture={stop}>
        <AppHeader variant="landing" session={session} navigation={<nav aria-label="Gallery landing links" className="ui-gallery-landing-nav"><a href="#app-header">How it works</a><a href="#app-header">For teachers</a><a href="#app-header">Teacher login</a></nav>} />
      </div>
      <div className="ui-gallery-header-frame" data-variant="page" onClickCapture={stop}>
        <AppHeader variant="page" title="My worlds" session={session} actions={<Button variant="primary">Start a shared world</Button>} />
      </div>
      <div className="ui-gallery-header-frame ui-gallery-header-frame-editor" data-variant="editor">
        <AppHeader
          variant="editor"
          session={session}
          worldTitle={role === 'guest' ? undefined : 'Desk Castle'}
          onRenameWorld={role === 'guest' ? undefined : async () => undefined}
          saveStatus={live ? { source: { kind: 'live', connection: 'online' } } : role === 'guest' ? { source: { kind: 'local' } } : { source: { kind: 'cloud', status: 'saved' } }}
          livePolicy={live ? { connection: 'online', isOwner: false, roomTitle: 'Team Red', peopleCount: 4, onOpenPeople: () => undefined } : undefined}
          mode={mode}
          onRequestMode={setMode}
          canExplore
          onOpenWorldSetup={() => undefined}
          onStartLiveWorld={() => undefined}
          onNewBuild={() => undefined}
          onImportProject={() => undefined}
          onExportProject={() => undefined}
          onOpenSettings={() => undefined}
          onOpenHelp={() => undefined}
          onSaveToAccount={role === 'student' ? () => undefined : undefined}
          onGoHome={() => undefined}
        />
      </div>
      <div className="ui-gallery-menus">
        <div className="ui-gallery-menu-slot">
          <span className="ui-gallery-note">This build menu</span>
          <WorldMenu defaultOpen onRename={() => undefined} onExportProject={() => undefined} onImportProject={() => undefined} onNewBuild={() => undefined} onOpenSettings={() => undefined} onOpenHelp={() => undefined} />
        </div>
        <div className="ui-gallery-menu-slot ui-gallery-menu-slot-end" onClickCapture={stop}>
          <span className="ui-gallery-note">Account menu ({role === 'guest' ? 'signed out' : role})</span>
          <AccountChip session={session} context="editor" onSaveToAccount={() => undefined} menuDefaultOpen={role !== 'guest'} />
        </div>
      </div>
    </div>
  )
}

function PasswordExample({ label, hint, error }: { label: string; hint?: string; error?: string }) {
  const [visible, setVisible] = useState(false)
  const [value, setValue] = useState('')
  return (
    <Field label={label} hint={hint} error={error} required>
      {(control) => (
        <span className="ui-input-wrap ui-gallery-password">
          <input {...control} className="ui-input" type={visible ? 'text' : 'password'} autoComplete="current-password" value={value} onChange={(event) => setValue(event.target.value)} />
          <Button
            variant="quiet"
            size="sm"
            iconOnly
            icon={visible ? <EyeOff size={18} /> : <Eye size={18} />}
            aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
            aria-pressed={visible}
            aria-controls={control.id}
            onClick={() => setVisible((current) => !current)}
            className="ui-gallery-password-toggle"
          >
            {visible ? 'Hide' : 'Show'}
          </Button>
        </span>
      )}
    </Field>
  )
}

function SignInExample() {
  const [role, setRole] = useState<'student' | 'teacher'>('student')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>()
  return (
    <form
      className="ui-gallery-card ui-gallery-form"
      data-gallery="signin"
      aria-labelledby="ui-gallery-signin-title"
      onSubmit={(event) => {
        event.preventDefault()
        setSubmitting(true)
        window.setTimeout(() => {
          setSubmitting(false)
          setError('That code and username do not match. Check with your teacher.')
        }, 600)
      }}
    >
      <BrandLockup size={24} />
      <div>
        <h2 id="ui-gallery-signin-title">Welcome back</h2>
        <p className="ui-gallery-form-lede">Sign in to open your saved worlds.</p>
      </div>
      <SegmentedControl
        label="I am a"
        fullWidth
        value={role}
        onChange={setRole}
        options={[
          { value: 'student', label: 'Student', icon: <GraduationCap size={16} /> },
          { value: 'teacher', label: 'Teacher', icon: <UserRound size={16} /> },
        ]}
      />
      <TextField label="Class sign-in code" hint="Your teacher shares this code." icon={<KeyRound size={18} />} autoComplete="off" inputMode="text" autoCapitalize="characters" error={error} />
      <TextField label="Username" icon={<User size={18} />} autoComplete="username" />
      <PasswordExample label="Password" />
      <Button type="submit" variant="primary" fullWidth loading={submitting} loadingLabel="Signing in…">Sign in</Button>
      <p className="ui-gallery-form-help">Forgot your details? Ask your teacher.</p>
      <div className="ui-gallery-form-links">
        <Button variant="quiet" size="sm">New here? Join a class</Button>
        <Button variant="quiet" size="sm">Keep building as a guest</Button>
      </div>
    </form>
  )
}

function SheetExample() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [camera, setCamera] = useState<'follow' | 'free'>('follow')
  const [name, setName] = useState('Desk Castle')
  return (
    <div className="ui-gallery-row">
      <Button variant="secondary" icon={<Settings size={18} />} onClick={() => setSheetOpen(true)}>Open settings sheet</Button>
      <Button variant="secondary" onClick={() => setDialogOpen(true)}>Open confirm dialog</Button>
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Settings"
        description="Make the controls feel right for you."
        footer={
          <>
            <SaveStatus source={{ kind: 'local' }} className="ui-gallery-footer-status" />
            <Button variant="primary" onClick={() => setSheetOpen(false)}>Done</Button>
          </>
        }
      >
        <div className="ui-gallery-stack">
          <SegmentedControl label="Explore camera" showLabel fullWidth value={camera} onChange={setCamera} options={[{ value: 'follow', label: 'Follow' }, { value: 'free', label: 'Free look' }]} />
          <TextField label="World name" value={name} onChange={(event) => setName(event.target.value)} hint="Shown to people you build with." />
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>Open a dialog on top</Button>
          {Array.from({ length: 6 }, (_, index) => (
            <p key={index} className="ui-gallery-filler">Scrollable body paragraph {index + 1}. The footer stays put while this content scrolls, and Tab cycles inside the sheet.</p>
          ))}
        </div>
      </Sheet>
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Open this build?"
        description="Download your current build before replacing it."
        footer={
          <>
            <Button variant="secondary" icon={<Download size={18} />} fullWidth>Download current build</Button>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => setDialogOpen(false)}>Open build</Button>
          </>
        }
      >
        <p className="ui-gallery-filler">Your current browser draft will be replaced. This cannot be undone.</p>
      </Dialog>
    </div>
  )
}

function ButtonsExample() {
  const [pressed, setPressed] = useState<Record<string, boolean>>({ primary: true, secondary: true, quiet: true, danger: true })
  return (
    <div className="ui-gallery-stack">
      {(['primary', 'secondary', 'quiet', 'danger'] as const).map((variant) => (
        <div key={variant} className="ui-gallery-row" data-variant={variant}>
          <Button variant={variant} size="sm">{variant} sm</Button>
          <Button variant={variant}>{variant}</Button>
          <Button variant={variant} size="lg">{variant} lg</Button>
          <Button variant={variant} icon={<Compass size={18} />}>With icon</Button>
          <Button variant={variant} trailingIcon={<ChevronDown size={16} />}>Menu</Button>
          <Button variant={variant} iconOnly icon={<Settings size={20} />} aria-label={`${variant} settings`}>Settings</Button>
          <Button variant={variant} loading loadingLabel="Saving…">Save</Button>
          <Button variant={variant} disabled>Disabled</Button>
          <Button variant={variant} pressed={pressed[variant]} icon={<Heart size={18} />} onClick={() => setPressed((current) => ({ ...current, [variant]: !current[variant] }))}>Favorite</Button>
          <Button variant={variant} href="#buttons" trailingIcon={<ExternalLink size={16} />} onClick={(event) => event.preventDefault()}>Link</Button>
        </div>
      ))}
      <div className="ui-gallery-row" data-variant="links">
        <Button href="#buttons" variant="primary" size="lg" icon={<Compass size={18} />} onClick={(event) => event.preventDefault()}>Start building</Button>
        <Button href="#buttons" variant="secondary" onClick={(event) => event.preventDefault()}>Open the classroom</Button>
        <Button href="#buttons" variant="quiet" size="sm" onClick={(event) => event.preventDefault()}>Read the help</Button>
        <Button href="#buttons" variant="secondary" disabled>Disabled link</Button>
      </div>
    </div>
  )
}

function FieldsExample() {
  return (
    <div className="ui-gallery-grid">
      <TextField label="Enrollment code" hint="Letters and numbers, from your teacher." placeholder="AB7X" />
      <TextField label="Choose a username" hint="Letters, numbers, _ or -" defaultValue="river builds" error="Usernames cannot contain spaces." />
      <TextField label="Name your teacher knows" labelAside="Shown to your teacher" required />
      <TextField label="Email" disabled value="teacher@school.example" readOnly />
      <Select label="Class" hint="Students see this name on their worlds." defaultValue="p2" required>
        <option value="p1">Period 1 — Makers</option>
        <option value="p2">Period 2 — Builders</option>
        <option value="p3">Period 3 — Engineers</option>
        <option value="p4">After-school club</option>
      </Select>
      <Select label="Group" error="Pick a group first." defaultValue="">
        <option value="">Choose a group…</option>
        <option value="a">Red team</option>
        <option value="b">Blue team</option>
      </Select>
      <PasswordExample label="Choose a password" hint="At least 8 characters." />
      <PasswordExample label="Current password" error="That password is not right." />
    </div>
  )
}

function SegmentedExample() {
  const [a, setA] = useState<'follow' | 'free'>('follow')
  const [b, setB] = useState<'idle' | 'walk' | 'run'>('idle')
  const [plate, setPlate] = useState<'64' | '96' | '128'>('96')
  return (
    <div className="ui-gallery-stack">
      <SegmentedControl label="Explore camera" showLabel value={a} onChange={setA} options={[{ value: 'follow', label: 'Follow' }, { value: 'free', label: 'Free look' }]} />
      <SegmentedControl label="Preview motion" size="sm" value={b} onChange={setB} options={[{ value: 'idle', label: 'Idle' }, { value: 'walk', label: 'Walk' }, { value: 'run', label: 'Run', disabled: true }]} />
      <div className="ui-field">
        <SegmentedControl label="Plate size" showLabel aria-describedby="ui-gallery-plate-hint" value={plate} onChange={setPlate} options={[{ value: '64', label: '64 × 64' }, { value: '96', label: '96 × 96' }, { value: '128', label: '128 × 128' }]} />
        <p id="ui-gallery-plate-hint" className="ui-field-hint">Your creation stays centered.</p>
      </div>
    </div>
  )
}

const SAVE_SOURCES: Array<{ name: string; source: SaveStatusSource; detail?: string }> = [
  { name: 'guest local', source: { kind: 'local' } },
  { name: 'guest local, storage blocked', source: { kind: 'local', error: 'This browser is blocking storage.' } },
  { name: "cloud 'saved'", source: { kind: 'cloud', status: 'saved' } },
  { name: "cloud 'pending'", source: { kind: 'cloud', status: 'pending' } },
  { name: "cloud 'saving'", source: { kind: 'cloud', status: 'saving' } },
  { name: "cloud 'error'", source: { kind: 'cloud', status: 'error' }, detail: 'Check your connection.' },
  { name: "live 'connecting'", source: { kind: 'live', connection: 'connecting' } },
  { name: "live 'online'", source: { kind: 'live', connection: 'online' } },
  { name: "live 'reconnecting'", source: { kind: 'live', connection: 'reconnecting' } },
  { name: "live 'offline'", source: { kind: 'live', connection: 'offline' } },
]

function SaveStatusExample() {
  return (
    <div className="ui-gallery-table-wrap">
    <table className="ui-gallery-table">
      <thead><tr><th scope="col">Input</th><th scope="col">Full</th><th scope="col">Compact</th></tr></thead>
      <tbody>
        {SAVE_SOURCES.map(({ name, source, detail }) => (
          <tr key={name}>
            <th scope="row"><code>{name}</code></th>
            <td><SaveStatus source={source} detail={detail} action={<Button size="sm" variant="quiet">Try again</Button>} /></td>
            <td><SaveStatus source={source} detail={detail} compact /></td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  )
}

export default Gallery
