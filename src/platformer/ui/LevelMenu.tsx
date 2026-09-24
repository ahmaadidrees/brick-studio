import { FilePlus2, Gamepad2, History, House, Link2, MoreHorizontal, Music, Pencil, RotateCcw, Share2, SlidersHorizontal, Users, Volume2, VolumeX } from 'lucide-react'
import { Button, Menu, MenuItem, MenuSeparator } from '../../ui'
import type { SoundPrefs } from './prefs'

interface Props {
  onRename?: () => void
  /** Solo: copy a link that carries the whole level. */
  onShareLink?: () => void
  /** Rooms: copy the room's link. */
  onInvite?: () => void
  /** A student's own account level: share it with the class. */
  onShareWithClass?: () => void
  /** Solo building: put coins and enemies back. */
  onResetWorld?: () => void
  onNewLevel?: () => void
  /** Signed-in owner or teacher: download earlier 2D room copies. */
  onRecoveryCopies?: () => void
  sound: SoundPrefs
  onSound: (p: SoundPrefs) => void
  onControls: () => void
  onFeel: () => void
  onExit: () => void
  exitLabel: string
}

/** The header's ⋯ menu in the 2D builder: this level, sound, help, and the way back. */
export function LevelMenu(p: Props) {
  return (
    <Menu
      label="This world"
      align="end"
      trigger={({ ref, ...props }) => (
        <Button ref={ref} variant="quiet" iconOnly icon={<MoreHorizontal size={20} />} aria-label="This world" title="This world" className="shell-world-menu-trigger" {...props}>
          This world
        </Button>
      )}
    >
      {p.onRename && <MenuItem icon={<Pencil size={18} />} label="Rename" description="Change this world’s name" onSelect={p.onRename} />}
      {p.onShareWithClass && <MenuItem icon={<Users size={18} />} label="Share with my class" description="Classmates can play it, or build it with you" onSelect={p.onShareWithClass} />}
      {p.onInvite && <MenuItem icon={<Link2 size={18} />} label="Copy invite link" description="Friends who open it join this room" onSelect={p.onInvite} />}
      {p.onShareLink && <MenuItem icon={<Share2 size={18} />} label="Copy a link to this world" description="Anyone who opens it gets their own copy" onSelect={p.onShareLink} />}
      {p.onResetWorld && <MenuItem icon={<RotateCcw size={18} />} label="Bring back coins and enemies" description="Everything you took or stomped comes back" onSelect={p.onResetWorld} />}
      {p.onNewLevel && <MenuItem icon={<FilePlus2 size={18} />} label="New world" description="Start with a floor and a flag" onSelect={p.onNewLevel} />}
      {p.onRecoveryCopies && <MenuItem icon={<History size={18} />} label="Recovery copies" description="Download an earlier copy of this world" onSelect={p.onRecoveryCopies} />}
      <MenuSeparator />
      <MenuItem icon={p.sound.muted ? <VolumeX size={18} /> : <Volume2 size={18} />} label={p.sound.muted ? 'Turn sound on' : 'Turn sound off'} onSelect={() => p.onSound({ ...p.sound, muted: !p.sound.muted })} />
      <MenuItem icon={<Music size={18} />} label={p.sound.music ? 'Turn music off' : 'Turn music on'} onSelect={() => p.onSound({ ...p.sound, music: !p.sound.music })} />
      <MenuItem icon={<Gamepad2 size={18} />} label="Controls" description="Keyboard, controller and touch" onSelect={p.onControls} />
      <MenuItem icon={<SlidersHorizontal size={18} />} label="Tune how the player moves" onSelect={p.onFeel} />
      <MenuSeparator />
      <MenuItem icon={<House size={18} />} label={p.exitLabel} onSelect={p.onExit} />
    </Menu>
  )
}
