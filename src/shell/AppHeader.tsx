import { Mountain, Pencil, UserRound, Users } from 'lucide-react'
import { useState, type HTMLAttributes, type ReactNode } from 'react'
import { BrandLockup } from '../brand'
import { Button, SaveStatus, type SaveStatusSource } from '../ui'
import { AccountChip } from './AccountChip'
import { DimensionSwitch, type BuildDimension } from './DimensionSwitch'
import { ModeSwitch, type StudioMode } from './ModeSwitch'
import { RenameWorldDialog } from './RenameWorldDialog'
import type { ClassroomSessionState } from './useClassroomSession'
import { WorldMenu } from './WorldMenu'
import { describeLivePresence, type LivePresence } from './livePresence'
import './shell.css'

/*
 * The one header. Rule for every screen: things about my build sit beside my
 * build's name; things about me sit in the top-right corner. Props are plain
 * callbacks; the header never imports the store or the classroom client
 * except through `useClassroomSession` (inside AccountChip).
 */

export type AppHeaderVariant = 'landing' | 'page' | 'editor'

type CommonProps = {
  /** Override the live classroom session (gallery, tests). */
  session?: ClassroomSessionState
  className?: string
  /** Opens the account menu on mount (gallery). */
  accountMenuDefaultOpen?: boolean
} & Pick<HTMLAttributes<HTMLElement>, 'onKeyDown' | 'id'>

export type AppHeaderLandingProps = CommonProps & {
  variant: 'landing'
  /** The landing's `<nav>` and its Menu toggle; rendered between the lockup and the chip. */
  navigation?: ReactNode
}

export type AppHeaderPageProps = CommonProps & {
  variant: 'page'
  /** Page name shown beside the lockup (e.g. "My worlds"). */
  title?: string
  /** Page-level actions rendered before the account chip. */
  actions?: ReactNode
}

/** Live-room facts the header needs; `BrickStudioLivePolicy` satisfies it structurally. */
export type HeaderLivePolicy = {
  connection: 'connecting' | 'online' | 'reconnecting' | 'offline'
  isOwner: boolean
  /** Room title shown in place of the guest draft's neutral title. */
  roomTitle?: string
  /** Headcount for the People entry; omitted while unknown. */
  peopleCount?: number
  /** Opens the live People/room panel. */
  onOpenPeople?: () => void
  /** Classroom rooms: who from the invited roster is here and who is still expected. */
  presence?: LivePresence
  /** Edits the room has not confirmed yet (surfaces through `saveStatus.detail`). */
  pendingOperations?: number
  /** Another tab or device took over this participant's connection. */
  sessionReplaced?: boolean
}

export type HeaderSaveStatus = {
  source: SaveStatusSource
  detail?: string
}

export type AppHeaderEditorProps = CommonProps & {
  variant: 'editor'
  /* This build (⋯ menu) */
  onNewBuild?: () => void
  onImportProject?: (file: File) => void | Promise<void>
  onExportProject?: () => void
  /** Accepted for parity with the current header; not rendered (the People entry starts a shared world). */
  onPublishWorld?: () => void
  onOpenSettings?: () => void
  onOpenHelp: () => void
  /* Title */
  /** Cloud world title; guest drafts have no title field, so a neutral name shows instead. */
  worldTitle?: string
  /** Account worlds only: shows the pencil and the Rename entry. */
  onRenameWorld?: (title: string) => Promise<void>
  saveStatus: HeaderSaveStatus
  /** Optional task-specific save controls. */
  editorActions?: ReactNode
  /* Tools */
  onOpenWorldSetup: (tab?: 'environment' | 'character') => void
  /** People outside a room = "Build together" (starts a shared world). */
  onStartLiveWorld?: () => void
  livePolicy?: HeaderLivePolicy
  /* Mode */
  mode: StudioMode
  onRequestMode: (mode: StudioMode) => void
  canExplore: boolean
  /** Why Explore is unavailable (default: "Place a brick first, then explore."). */
  exploreReason?: string
  /* Me */
  /** Guest draft in the editor: "Save this build to my account" in the account menu. */
  onSaveToAccount?: () => void
  /** Kept for parity with the current header; the account menu links to the pages instead. */
  onOpenMyWorlds?: () => void
  onOpenMyClass?: () => void
  /* Home */
  onGoHome: () => void
  /** 3D ⇄ 2D: shown beside the mark when given (the studio saves first, then leaves for the 2D builder). */
  onSwitchDimension?: (target: BuildDimension) => void
  /* The 2D builder uses this header too; everything below defaults to the 3D studio. */
  /** Which builder this is (the current side of the 3D ⇄ 2D switch). */
  dimension?: BuildDimension
  /** The second mode's name and the modes' icons ("Play" in 2D). */
  modeLabels?: { explore?: string; exploreIcon?: ReactNode; buildIcon?: ReactNode }
  /** Overrides the live-room lock (in 2D rooms everyone switches their own mode). */
  modeLock?: { locked: boolean; reason?: string }
  /** Hide the Character tool (2D has no characters yet). */
  hideCharacter?: boolean
  /** The People tool's tooltip outside a room (what "Build together" starts). */
  startLiveTitle?: string
  /** The longest name rename allows (2D worlds keep shorter names). */
  renameMaxLength?: number
  /** Replaces the ⋯ "This build" menu; gets the header's rename opener. */
  worldMenu?: (controls: { openRename?: () => void }) => ReactNode
}

export type AppHeaderProps = AppHeaderLandingProps | AppHeaderPageProps | AppHeaderEditorProps

/** Guest drafts have no title field in the schema, so the header shows a neutral name, never the brand. */
export const NEUTRAL_WORLD_TITLE = 'My build'

export function AppHeader(props: AppHeaderProps) {
  if (props.variant === 'editor') return <EditorHeader {...props} />
  if (props.variant === 'page') return <PageHeader {...props} />
  return <LandingHeader {...props} />
}

function headerClass(variant: AppHeaderVariant, className?: string) {
  return ['app-header', `app-header-${variant}`, className].filter(Boolean).join(' ')
}

function LandingHeader({ navigation, session, className, accountMenuDefaultOpen, onKeyDown, id }: AppHeaderLandingProps) {
  return (
    <header id={id} className={headerClass('landing', className)} onKeyDown={onKeyDown}>
      <BrandLockup href="/" size={44} srSuffix="Home" className="app-header-brand" />
      {navigation && <div className="app-header-center">{navigation}</div>}
      <div className="app-header-end">
        <AccountChip session={session} context="landing" menuDefaultOpen={accountMenuDefaultOpen} />
      </div>
    </header>
  )
}

function PageHeader({ title, actions, session, className, accountMenuDefaultOpen, onKeyDown, id }: AppHeaderPageProps) {
  return (
    <header id={id} className={headerClass('page', className)} onKeyDown={onKeyDown}>
      <div className="app-header-start">
        <BrandLockup href="/" size={32} wordmark="wide" srSuffix="Home" className="app-header-brand" />
        {title && (
          <>
            <span className="app-header-divider" aria-hidden="true" />
            <span className="app-header-page-title">{title}</span>
          </>
        )}
      </div>
      <div className="app-header-end">
        {actions && <div className="app-header-actions">{actions}</div>}
        <AccountChip session={session} context="page" menuDefaultOpen={accountMenuDefaultOpen} />
      </div>
    </header>
  )
}

type PeopleEntryProps = { livePolicy?: HeaderLivePolicy; onStartLiveWorld?: () => void; startTitle?: string }

/** People = "Build together" outside a room; inside a room it opens the live People panel. */
function PeopleEntry({ livePolicy, onStartLiveWorld, startTitle = 'Start a shared world from this build' }: PeopleEntryProps) {
  if (livePolicy) {
    const count = livePolicy.peopleCount
    const label = count === undefined ? 'People' : `People, ${count} ${livePolicy.connection === 'online' ? 'here' : 'last seen'}`
    const summary = describeLivePresence(livePolicy.presence)
    const title = summary ? `${label}. ${summary}` : label
    return (
      <Button variant="quiet" className="app-header-tool app-header-people" icon={<Users size={17} />} aria-label={title} title={title} onClick={livePolicy.onOpenPeople} disabled={!livePolicy.onOpenPeople}>
        People{count !== undefined && <strong className="app-header-people-count" aria-hidden="true">{count}</strong>}
      </Button>
    )
  }
  if (!onStartLiveWorld) return null
  return (
    <Button variant="quiet" className="app-header-tool app-header-people" icon={<Users size={17} />} onClick={onStartLiveWorld} aria-label="Build together" title={startTitle}>
      People
    </Button>
  )
}

function EditorHeader({
  onNewBuild, onImportProject, onExportProject, onOpenSettings, onOpenHelp,
  worldTitle, onRenameWorld, saveStatus,
  onOpenWorldSetup, onStartLiveWorld, livePolicy,
  mode, onRequestMode, canExplore, exploreReason,
  onSaveToAccount, onGoHome, onSwitchDimension, editorActions,
  dimension = '3d', modeLabels, modeLock, hideCharacter = false, startLiveTitle, renameMaxLength, worldMenu,
  session, className, accountMenuDefaultOpen, onKeyDown, id,
}: AppHeaderEditorProps) {
  const [renaming, setRenaming] = useState(false)
  const title = worldTitle || livePolicy?.roomTitle || NEUTRAL_WORLD_TITLE
  const locked = modeLock ? modeLock.locked : Boolean(livePolicy && (!livePolicy.isOwner || livePolicy.connection !== 'online'))
  const lockedReason = modeLock?.reason ?? (livePolicy && !livePolicy.isOwner
    ? 'The room owner switches between Build and Explore for everyone.'
    : 'Modes switch once the shared world is back online.')
  const openRename = onRenameWorld ? () => setRenaming(true) : undefined
  const inRoom = Boolean(livePolicy)

  return (
    <header id={id} className={headerClass('editor', className)} aria-label="Studio toolbar" onKeyDown={onKeyDown} data-mode={mode}>
      <div className="app-header-start">
        <BrandLockup
          href="/"
          size={28}
          wordmark="never"
          srSuffix="Home"
          title="Home"
          className="app-header-brand app-header-mark"
          onClick={(event) => { event.preventDefault(); onGoHome() }}
        />
        {onSwitchDimension && <DimensionSwitch current={dimension} onSwitch={onSwitchDimension} className="app-header-dimension" />}
        <div className="app-header-world">
          <span className="app-header-title" title={title}>{title}</span>
          {onRenameWorld && (
            <Button variant="quiet" size="sm" iconOnly icon={<Pencil size={16} />} aria-label="Rename world" title="Rename world" className="app-header-rename" onClick={() => setRenaming(true)}>
              Rename world
            </Button>
          )}
        </div>
        <SaveStatus autoCompact source={saveStatus.source} detail={saveStatus.detail} className="app-header-save" />
      </div>
      <div className="app-header-tools" role="group" aria-label="World tools">
        {editorActions}
        <Button variant="quiet" className="app-header-tool" icon={<Mountain size={17} />} title="Scene" onClick={() => onOpenWorldSetup('environment')}>Scene</Button>
        {!hideCharacter && <Button variant="quiet" className="app-header-tool" icon={<UserRound size={17} />} title="Character" onClick={() => onOpenWorldSetup('character')}>Character</Button>}
        <PeopleEntry livePolicy={livePolicy} onStartLiveWorld={onStartLiveWorld} startTitle={startLiveTitle} />
      </div>
      <div className="app-header-mode">
        <ModeSwitch mode={mode} onRequestMode={onRequestMode} canExplore={canExplore} exploreReason={exploreReason} locked={locked} lockedReason={lockedReason} exploreLabel={modeLabels?.explore} exploreIcon={modeLabels?.exploreIcon} buildIcon={modeLabels?.buildIcon} />
      </div>
      <div className="app-header-end">
        <AccountChip session={session} context="editor" onSaveToAccount={onSaveToAccount} menuDefaultOpen={accountMenuDefaultOpen} />
        {worldMenu ? worldMenu({ openRename }) : <WorldMenu
          align="end"
          onRename={openRename}
          onExportProject={onExportProject}
          onImportProject={inRoom ? undefined : onImportProject}
          onNewBuild={inRoom ? undefined : onNewBuild}
          onOpenSettings={onOpenSettings}
          onOpenHelp={onOpenHelp}
        />}
      </div>
      {renaming && onRenameWorld && (
        <RenameWorldDialog currentTitle={title} onRename={onRenameWorld} onClose={() => setRenaming(false)} maxLength={renameMaxLength} />
      )}
    </header>
  )
}
