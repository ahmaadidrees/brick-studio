import React, { useRef, useState } from 'react'
import { Download, RotateCcw, Upload } from 'lucide-react'
import { setStorageNotice } from './notice'
import { releaseSaveHold } from '../storage'
import { exportProjectFile, importProjectFile } from './projectIo'
import { createStarterProject } from '../starter'
import type { StudioProject, StudioStore } from '../store'
import './projectMenu.css'

export interface ProjectMenuProps {
  store: StudioStore
  className?: string
}

export function ProjectMenu({ store, className = '' }: ProjectMenuProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showConfirmReset, setShowConfirmReset] = useState(false)
  const [pendingOpen, setPendingOpen] = useState<StudioProject | null>(null)

  const handleExport = () => {
    const project = store.getState().project
    exportProjectFile(project)
  }

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const result = await importProjectFile(file)
    if (result.ok) {
      // Opening a file replaces this whole world: ask first (confirmOpen below).
      setPendingOpen(result.project)
    } else {
      setStorageNotice({
        id: 'import-error',
        type: 'error',
        message: result.error,
      })
    }
  }

  const confirmOpen = () => {
    if (!pendingOpen) return
    store.load(pendingOpen)
    releaseSaveHold()
    setStorageNotice({ id: 'import-success', type: 'success', message: `Opened ${pendingOpen.design.name || 'your world'}.` })
    setPendingOpen(null)
  }

  const handleResetToStarter = () => {
    const starter = createStarterProject()
    store.load(starter)
    releaseSaveHold()
    setShowConfirmReset(false)
    setStorageNotice({
      id: 'reset-success',
      type: 'info',
      message: 'Started a new world.',
    })
  }

  return (
    <div className={`project-menu ${className}`} role="region" aria-label="Project storage controls">
      <div className="project-menu-buttons">
        <button
          type="button"
          className="project-menu-btn"
          onClick={handleExport}
          aria-label="Save project to file"
          title="Save project to file (.json)"
        >
          <Download size={16} aria-hidden="true" />
          <span>Save File</span>
        </button>

        <button
          type="button"
          className="project-menu-btn"
          onClick={handleImportClick}
          aria-label="Open project from file"
          title="Open project from file (.json)"
        >
          <Upload size={16} aria-hidden="true" />
          <span>Open File</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="project-menu-hidden-input"
          aria-label="Upload project file"
          onChange={handleFileSelected}
        />

        <button
          type="button"
          className="project-menu-btn project-menu-btn-danger"
          onClick={() => setShowConfirmReset(true)}
          aria-label="Reset project to starter"
          title="Reset project to starter playground"
        >
          <RotateCcw size={16} aria-hidden="true" />
          <span>Reset</span>
        </button>
      </div>

      {pendingOpen && (
        <div className="project-menu-confirm-dialog" role="dialog" aria-label="Confirm open">
          <p className="project-menu-confirm-text">
            Open {pendingOpen.design.name || 'this file'}? The world you are working on will be replaced.
          </p>
          <div className="project-menu-confirm-actions">
            <button type="button" className="project-menu-btn" onClick={() => setPendingOpen(null)}>
              Cancel
            </button>
            <button type="button" className="project-menu-btn project-menu-btn-danger" onClick={confirmOpen}>
              Open it
            </button>
          </div>
        </div>
      )}

      {showConfirmReset && (
        <div className="project-menu-confirm-dialog" role="dialog" aria-label="Confirm reset">
          <p className="project-menu-confirm-text">Start over? Your changes will be lost.</p>
          <div className="project-menu-confirm-actions">
            <button
              type="button"
              className="project-menu-btn"
              onClick={() => setShowConfirmReset(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="project-menu-btn project-menu-btn-danger"
              onClick={handleResetToStarter}
            >
              Reset
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
