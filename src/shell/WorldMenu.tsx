import { Download, FilePlus2, HelpCircle, MoreHorizontal, Pencil, Settings, Upload } from 'lucide-react'
import { useRef } from 'react'
import { BRAND_NAME } from '../brand'
import { Button, Menu, MenuItem, MenuSeparator } from '../ui'

export type WorldMenuProps = {
  /** Account worlds only: opens the rename dialog (the header owns it). Hidden for guest drafts. */
  onRename?: () => void
  onExportProject?: () => void
  onImportProject?: (file: File) => void | Promise<void>
  onNewBuild?: () => void
  /** Camera, controls and preferences (moved here from the header). */
  onOpenSettings?: () => void
  onOpenHelp?: () => void
  /** Opens on mount (gallery). */
  defaultOpen?: boolean
  /** Which edge of the trigger the menu hangs from; `end` at the far right of the header. */
  align?: 'start' | 'end'
  className?: string
}

/**
 * The ⋯ "This build" menu at the far right of the editor header (after the account chip): Rename, Download build,
 * Import build, New build, then Settings and Help. Entries whose callback is
 * missing are disabled rather than hidden so the menu keeps its shape across
 * guest, account and live sessions (a live room has no Import / New build).
 */
export function WorldMenu({ onRename, onExportProject, onImportProject, onNewBuild, onOpenSettings, onOpenHelp, defaultOpen, align = 'start', className }: WorldMenuProps) {
  const importRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <Menu
        label="This build"
        align={align}
        defaultOpen={defaultOpen}
        className={className}
        trigger={({ ref, ...props }) => (
          <Button ref={ref} variant="quiet" iconOnly icon={<MoreHorizontal size={20} />} aria-label="This build" title="This build" className="shell-world-menu-trigger" {...props}>
            This build
          </Button>
        )}
      >
        {onRename && <MenuItem icon={<Pencil size={18} />} label="Rename" description="Change this world’s name" onSelect={onRename} />}
        <MenuItem icon={<Download size={18} />} label="Download build" description="Save a .brickstudio.json file" disabled={!onExportProject} onSelect={onExportProject} />
        <MenuItem icon={<Upload size={18} />} label="Import build" description="Open a .brickstudio.json file" disabled={!onImportProject} onSelect={() => importRef.current?.click()} />
        <MenuItem icon={<FilePlus2 size={18} />} label="New build" description="Start with a blank plate" disabled={!onNewBuild} onSelect={onNewBuild} />
        <MenuSeparator />
        <MenuItem icon={<Settings size={18} />} label="Settings" description="Camera, controls and preferences" disabled={!onOpenSettings} onSelect={onOpenSettings} />
        <MenuItem icon={<HelpCircle size={18} />} label="Help" description="Show the quick start guide" disabled={!onOpenHelp} onSelect={onOpenHelp} />
      </Menu>
      <input
        ref={importRef}
        className="sr-only"
        type="file"
        accept=".brickstudio.json,application/json"
        aria-label={`Choose ${BRAND_NAME} project file`}
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void onImportProject?.(file)
          event.target.value = ''
        }}
      />
    </>
  )
}
