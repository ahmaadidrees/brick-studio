import { useCallback, useEffect, useRef } from 'react'
import {
  createBrickStudioDocument,
  parseBrickStudioDocument,
  type BrickStudioDocument,
  type CreateBrickStudioDocumentOptions,
} from './brickDocument'
import {
  connectBrickStudioAutosave,
  downloadBrickStudioDocument,
  loadLocalBrickStudioProject,
} from './documentPersistence'
import type { StudioDocumentCommands } from './StudioMenu'
import { useBrickStore } from './store'

export type BrickStudioDocumentPersistenceOptions = CreateBrickStudioDocumentOptions & {
  /** Receives normalized local/imported documents so app-owned metadata state can follow them. */
  onDocumentLoaded?: (document: BrickStudioDocument) => void
}

function showDocumentMessage(message: string) {
  useBrickStore.setState({ toast: message })
}

function getLocalStorage() {
  try {
    return window.localStorage
  } catch {
    showDocumentMessage('Brick Studio could not access local storage. Your current build is still open.')
    return null
  }
}

export function useBrickStudioDocuments(
  overrides: StudioDocumentCommands = {},
  enabled = true,
  persistence: BrickStudioDocumentPersistenceOptions = {},
): Required<StudioDocumentCommands> {
  const persistenceRef = useRef(persistence)
  persistenceRef.current = persistence
  const autosaveRef = useRef<ReturnType<typeof connectBrickStudioAutosave> | null>(null)
  const loadedRef = useRef(false)
  const persistedMetadataRef = useRef({
    environmentId: persistence.environmentId,
    customParts: persistence.customParts,
  })

  useEffect(() => {
    useBrickStore.getState().setDocumentMetadata(persistence)
  }, [persistence.environmentId, persistence.customParts])

  useEffect(() => useBrickStore.subscribe((state, previous) => {
    if (state.documentMetadata !== previous.documentMetadata) {
      persistenceRef.current.onDocumentLoaded?.(state.getDocumentSnapshot())
    }
  }), [])

  const currentDocument = useCallback((bricks = useBrickStore.getState().bricks) => (
    createBrickStudioDocument(bricks, {
      ...useBrickStore.getState().documentMetadata,
    })
  ), [])

  useEffect(() => {
    loadedRef.current = false
    if (!enabled) return
    const storage = getLocalStorage()
    if (!storage) return

    const loaded = loadLocalBrickStudioProject(storage)
    if (loaded.ok) {
      if (loaded.document) {
        useBrickStore.getState().restoreDocument(loaded.document)
        persistenceRef.current.onDocumentLoaded?.(loaded.document)
      }
    } else {
      showDocumentMessage(`${loaded.error.message} The unreadable draft will be kept in recovery storage before any new save.`)
    }

    const autosave = connectBrickStudioAutosave({
      store: useBrickStore,
      storage,
      createDocument: currentDocument,
      onError: (error) => showDocumentMessage(error.message),
    })
    autosaveRef.current = autosave
    loadedRef.current = true
    return () => {
      loadedRef.current = false
      autosaveRef.current = null
      autosave.dispose()
    }
  }, [currentDocument, enabled])

  // Environment/custom-part changes are document changes even when the brick
  // array is referentially unchanged, so they must enter the same debounced save.
  useEffect(() => {
    const previous = persistedMetadataRef.current
    const changed = previous.environmentId !== persistence.environmentId
      || previous.customParts !== persistence.customParts
    persistedMetadataRef.current = {
      environmentId: persistence.environmentId,
      customParts: persistence.customParts,
    }
    if (changed && enabled && loadedRef.current) autosaveRef.current?.schedule()
  }, [enabled, persistence.environmentId, persistence.customParts])

  const newBuild = useCallback(() => {
    if (!window.confirm('Start a new blank build? You can Undo during this session to restore the current build.')) {
      showDocumentMessage('New Build canceled. Your current build is unchanged.')
      return
    }
    useBrickStore.getState().newBuild()
  }, [])

  const importProject = useCallback(async (file: File) => {
    if (!window.confirm(`Replace the current build with “${file.name}”? The file will be validated before anything changes.`)) {
      showDocumentMessage('Import canceled. Your current build is unchanged.')
      return
    }
    try {
      const serialized = await file.text()
      const parsed = parseBrickStudioDocument(serialized)
      const result = useBrickStore.getState().importDocument(serialized)
      if (result.ok && parsed.ok) persistenceRef.current.onDocumentLoaded?.(parsed.document)
    } catch {
      showDocumentMessage('Brick Studio could not read that file. Your current build is unchanged.')
    }
  }, [])

  const exportProject = useCallback(() => {
    const result = downloadBrickStudioDocument(currentDocument())
    showDocumentMessage(result.ok ? 'Project exported as .brickstudio.json.' : result.error.message)
  }, [currentDocument])

  return {
    onNewBuild: overrides.onNewBuild ?? newBuild,
    onImportProject: overrides.onImportProject ?? importProject,
    onExportProject: overrides.onExportProject ?? exportProject,
    onStartLiveWorld: overrides.onStartLiveWorld ?? (() => {}),
    onPublishWorld: overrides.onPublishWorld ?? (() => {}),
  }
}
