import React, { useRef, useState } from 'react'
import { CircleAlert, Download, RotateCcw, Upload } from 'lucide-react'
import { clearStorageNotice, setStorageNotice, useStorageNotice } from './notice'
import { exportProjectFile, importProjectFile } from './projectIo'
import { createStarterProject } from '../starter'
import type { StudioStore } from '../store'
import './projectMenu.css'

export interface ProjectMenuProps {
  store: StudioStore
  className?: string
}

export function ProjectMenu({ store, className = '' }: ProjectMenuProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showConfirmReset, setShowConfirmReset] = useState(false)
  const notice = useStorageNotice()

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
      store.load(result.project)
      setStorageNotice({
        id: 'import-success',
        type: 'success',
        message: `Loaded "${result.project.design.name || 'project'}" successfully!`,
      })
    } else {
      setStorageNotice({
        id: 'import-error',
        type: 'error',
        message: result.error,
      })
    }
  }

  const handleResetToStarter = () => {
    const starter = createStarterProject()
    store.load(starter)
    setShowConfirmReset(false)
    setStorageNotice({
      id: 'reset-success',
      type: 'info',
      message: 'Reset to starter playground.',
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

      {showConfirmReset && (
        <div className="project-menu-confirm-dialog" role="dialog" aria-label="Confirm reset">
          <p className="project-menu-confirm-text">Start over with the fresh starter playground?</p>
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

      {notice && (
        <div
          className={`project-menu-banner banner-${notice.type}`}
          role="status"
          aria-live="polite"
        >
          <div className="project-menu-banner-content">
            <CircleAlert size={16} aria-hidden="true" />
            <span>{notice.message}</span>
          </div>
          <button
            type="button"
            className="project-menu-banner-btn"
            onClick={clearStorageNotice}
            aria-label="Dismiss message"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
