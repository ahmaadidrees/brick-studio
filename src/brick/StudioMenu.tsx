import { Download, FilePlus2, HelpCircle, MoreHorizontal, Palette, Radio, Save, FolderOpen, Users, Upload, ChevronDown, Home } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { BRICK_PART_MAP } from './parts'
import { useBrickStore } from './store'

export type StudioDocumentCommands = {
  onNewBuild?: () => void
  onImportProject?: (file: File) => void | Promise<void>
  onExportProject?: () => void
  onStartLiveWorld?: () => void
  onPublishWorld?: () => void
}

type StudioMenuProps = StudioDocumentCommands & {
  worldTitle?: string
  onGoHome?: () => void
  onSaveToAccount?: () => void
  onOpenMyWorlds?: () => void
  onOpenMyClass?: () => void
  onOpenHelp: () => void
  onOpenWorldSetup: () => void
}

function PlacedBrickNavigator() {
  const bricks = useBrickStore((state) => state.bricks)
  const selectedId = useBrickStore((state) => state.selectedId)
  const selectBrick = useBrickStore((state) => state.selectBrick)
  return (
    <div className="studio-menu-section" role="group" aria-label="Placed brick navigator">
      <label htmlFor="placed-brick-select">Placed bricks</label>
      <select
        id="placed-brick-select"
        value={selectedId ?? ''}
        onChange={(event) => selectBrick(event.target.value || null)}
        disabled={bricks.length === 0}
        aria-describedby="placed-brick-help"
        aria-keyshortcuts="BracketLeft BracketRight"
      >
        <option value="">{bricks.length ? `Choose 1 of ${bricks.length}` : 'No placed bricks'}</option>
        {bricks.map((brick, index) => (
          <option key={brick.id} value={brick.id}>
            {index + 1}. {BRICK_PART_MAP[brick.partId].name} — X {brick.x}, Y {brick.y}, Z {brick.z}
          </option>
        ))}
      </select>
      <span id="placed-brick-help">Use this list or [ and ] to select each placed brick.</span>
    </div>
  )
}

export function StudioMenu({
  worldTitle,
  onGoHome,
  onNewBuild,
  onImportProject,
  onExportProject,
  onStartLiveWorld,
  onSaveToAccount,
  onOpenMyWorlds,
  onOpenMyClass,
  onOpenHelp,
  onOpenWorldSetup,
}: StudioMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const buildMode = useBrickStore((state) => state.mode === 'build')

  useEffect(() => {
    if (!open) return
    containerRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener('pointerdown', closeOnOutsidePointer)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const runAndClose = (command?: () => void) => {
    command?.()
    setOpen(false)
  }

  return (
    <div className={`studio-menu ${worldTitle ? 'studio-world-menu' : ''}`} ref={containerRef}>
      <button
        ref={triggerRef}
        className={worldTitle ? 'studio-world-title' : 'studio-icon-button'}
        type="button"
        aria-label={worldTitle ? 'World menu' : 'More studio actions'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {worldTitle ? <><strong title={worldTitle}>{worldTitle}</strong><ChevronDown size={16} /></> : <MoreHorizontal size={19} />}
      </button>
      {open && (
        <div className="studio-menu-popover" role="menu" aria-label="Studio actions" onKeyDown={event => {
          if ((event.target as HTMLElement).matches('input, select, textarea')) return
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
          const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')]
          if (!items.length) return
          event.preventDefault()
          const current = items.indexOf(document.activeElement as HTMLButtonElement)
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
          items[next].focus()
        }}>
          {onGoHome && <button role="menuitem" type="button" onClick={() => runAndClose(onGoHome)}><Home size={18} /><span><strong>Home</strong><small>Return to the Brick Studio landing page</small></span></button>}
          {onOpenMyWorlds && <button role="menuitem" type="button" onClick={() => runAndClose(onOpenMyWorlds)}><FolderOpen size={18} /><span><strong>My Worlds</strong><small>Open your saved builds</small></span></button>}
          {onOpenMyClass && <button role="menuitem" type="button" onClick={() => runAndClose(onOpenMyClass)}><Users size={18} /><span><strong>My Class</strong><small>Find your group and build together</small></span></button>}
          {onSaveToAccount && <button role="menuitem" type="button" onClick={() => runAndClose(onSaveToAccount)}><Save size={18} /><span><strong>Save to my account</strong><small>Keep this build across devices</small></span></button>}
          <button role="menuitem" type="button" onClick={() => runAndClose(onOpenWorldSetup)}>
            <Palette size={18} /><span><strong>Scene &amp; character</strong><small>Choose a scene and customize your explorer</small></span>
          </button>
          <button role="menuitem" type="button" disabled={!onNewBuild} onClick={() => runAndClose(onNewBuild)}>
            <FilePlus2 size={18} /><span><strong>New Build</strong><small>Start with a blank plate</small></span>
          </button>
          <button role="menuitem" type="button" disabled={!onImportProject} onClick={() => importRef.current?.click()}>
            <Upload size={18} /><span><strong>Import</strong><small>Open a .brickstudio.json file</small></span>
          </button>
          <button role="menuitem" type="button" disabled={!onExportProject} onClick={() => runAndClose(onExportProject)}>
            <Download size={18} /><span><strong>Export</strong><small>Download this build</small></span>
          </button>
          <button role="menuitem" type="button" disabled={!onStartLiveWorld} onClick={() => runAndClose(onStartLiveWorld)}>
            <Radio size={18} /><span><strong>Build together</strong><small>Start a live multiplayer world</small></span>
          </button>
          <button role="menuitem" type="button" onClick={() => runAndClose(onOpenHelp)}>
            <HelpCircle size={18} /><span><strong>Help</strong><small>Show the quick start guide</small></span>
          </button>
          {buildMode && <PlacedBrickNavigator />}
        </div>
      )}
      <input
        ref={importRef}
        className="visually-hidden"
        type="file"
        accept=".brickstudio.json,application/json"
        aria-label="Choose Brick Studio project file"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void onImportProject?.(file)
          event.target.value = ''
          setOpen(false)
        }}
      />
    </div>
  )
}
