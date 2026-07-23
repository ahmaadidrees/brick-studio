import { useCallback, useEffect } from 'react'
import { createBrickStudioDocument } from './brickDocument'
import {
  connectBrickStudioAutosave,
  downloadBrickStudioDocument,
  loadLocalBrickStudioProject,
} from './documentPersistence'
import type { StudioDocumentCommands } from './StudioMenu'
import { useBrickStore } from './store'

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
): Required<StudioDocumentCommands> {
  useEffect(() => {
    const storage = getLocalStorage()
    if (!storage) return

    const loaded = loadLocalBrickStudioProject(storage)
    if (loaded.ok) {
      if (loaded.document) useBrickStore.getState().restoreDocument(loaded.document)
    } else {
      showDocumentMessage(loaded.error.message)
    }

    const autosave = connectBrickStudioAutosave({
      store: useBrickStore,
      storage,
      onError: (error) => showDocumentMessage(error.message),
    })
    return () => autosave.dispose()
  }, [])

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
      useBrickStore.getState().importDocument(await file.text())
    } catch {
      showDocumentMessage('Brick Studio could not read that file. Your current build is unchanged.')
    }
  }, [])

  const exportProject = useCallback(() => {
    const state = useBrickStore.getState()
    const result = downloadBrickStudioDocument(createBrickStudioDocument(state.bricks))
    showDocumentMessage(result.ok ? 'Project exported as .brickstudio.json.' : result.error.message)
  }, [])

  return {
    onNewBuild: overrides.onNewBuild ?? newBuild,
    onImportProject: overrides.onImportProject ?? importProject,
    onExportProject: overrides.onExportProject ?? exportProject,
  }
}
