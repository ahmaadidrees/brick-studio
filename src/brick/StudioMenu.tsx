import { Download, FilePlus2, HelpCircle, MoreHorizontal, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export type StudioDocumentCommands = {
  onNewBuild?: () => void
  onImportProject?: (file: File) => void | Promise<void>
  onExportProject?: () => void
}

type StudioMenuProps = StudioDocumentCommands & {
  onOpenHelp: () => void
}

export function StudioMenu({
  onNewBuild,
  onImportProject,
  onExportProject,
  onOpenHelp,
}: StudioMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
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
    <div className="studio-menu" ref={containerRef}>
      <button
        className="studio-icon-button"
        type="button"
        aria-label="More studio actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={19} />
      </button>
      {open && (
        <div className="studio-menu-popover" role="menu" aria-label="Studio actions">
          <a role="menuitem" href="/rover" aria-label="Rover Lab"><span className="studio-menu-icon" aria-hidden="true">R</span><span><strong>Rover Lab</strong><small>Open the coding mission</small></span></a>
          <button role="menuitem" type="button" disabled={!onNewBuild} onClick={() => runAndClose(onNewBuild)}>
            <FilePlus2 size={18} /><span><strong>New Build</strong><small>Start with a blank plate</small></span>
          </button>
          <button role="menuitem" type="button" disabled={!onImportProject} onClick={() => importRef.current?.click()}>
            <Upload size={18} /><span><strong>Import</strong><small>Open a .brickstudio.json file</small></span>
          </button>
          <button role="menuitem" type="button" disabled={!onExportProject} onClick={() => runAndClose(onExportProject)}>
            <Download size={18} /><span><strong>Export</strong><small>Download this build</small></span>
          </button>
          <button role="menuitem" type="button" onClick={() => runAndClose(onOpenHelp)}>
            <HelpCircle size={18} /><span><strong>Help</strong><small>Show the quick start guide</small></span>
          </button>
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
