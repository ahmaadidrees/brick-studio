import React, { useRef, useState } from 'react'
import { Download, RotateCcw, Upload } from 'lucide-react'
import { setStorageNotice } from './notice'
import { releaseSaveHold } from '../storage'
import { exportProjectFile, importProjectFile } from './projectIo'
import { designKit, type KitId } from '../../core/contracts'
import { screensFor } from '../kitScreens'
import type { StudioProject, StudioStore } from '../store'
import './projectMenu.css'

export interface ProjectMenuProps {
  store: StudioStore
  className?: string
}

/** What "Start over" starts from, in each game's words. */
const START_OVER: Record<'platformer' | 'race' | 'blank', { what: string; done: string }> = {
  platformer: { what: 'the starter level', done: 'Started over with the starter level.' },
  race: { what: 'the beginner track', done: 'Started over with the beginner track.' },
  blank: { what: 'an empty stage', done: 'Started over with an empty stage.' },
}
const startOverOf = (kit: KitId) => (kit === 'race' ? START_OVER.race : kit === 'blank' ? START_OVER.blank : START_OVER.platformer)

export function ProjectMenu({ store, className = '' }: ProjectMenuProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showConfirmReset, setShowConfirmReset] = useState(false)
  const [pendingOpen, setPendingOpen] = useState<{ project: StudioProject; notice?: string } | null>(null)
  // A project's game never changes (Open File refuses another game's file), so this is read once per render.
  const startOver = startOverOf(designKit(store.getState().project.design))

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

    // A project keeps its game: a file of another one opens from My projects instead.
    const result = await importProjectFile(file, designKit(store.getState().project.design))
    if (result.ok) {
      // Opening a file replaces this whole world: ask first (confirmOpen below).
      setPendingOpen({ project: result.project, notice: result.notice })
    } else {
      setStorageNotice({
        id: 'import-error',
        type: 'error',
        message: result.error,
      })
    }
  }

  /** Replace the whole project, with Undo on the notice (it puts back what was there, and that is saved again). */
  const replaceProject = (next: StudioProject, id: string, message: string) => {
    const previous = store.getState().project
    store.load(next)
    releaseSaveHold()
    setStorageNotice({
      id,
      type: 'success',
      message,
      actions: [{
        label: 'Undo',
        run: () => {
          store.load(previous)
          setStorageNotice({ id: 'replace-undone', type: 'info', message: 'Put back the project you had before.' })
        },
      }],
    })
  }

  const confirmOpen = () => {
    if (!pendingOpen) return
    const { project, notice } = pendingOpen
    replaceProject(project, 'import-success', `Opened ${project.design.name || 'your project'}.${notice ? ` ${notice}` : ''}`)
    setPendingOpen(null)
  }

  const handleResetToStarter = () => {
    // Starting over keeps the project's name and its game: it is still the same project in My projects.
    const design = store.getState().project.design
    const name = design.name
    const starter = screensFor(design).starter()
    replaceProject({ ...starter, design: { ...starter.design, name: name || starter.design.name } }, 'reset-success', startOverOf(designKit(design)).done)
    setShowConfirmReset(false)
  }

  return (
    <div className={`project-menu ${className}`} role="region" aria-label="Project storage controls">
      <div className="project-menu-buttons">
        <button
          type="button"
          className="project-menu-btn"
          onClick={handleExport}
          aria-label="Save project to file"
          title="Save this project as a file on this computer"
        >
          <Download size={16} aria-hidden="true" />
          <span>Save File</span>
        </button>

        <button
          type="button"
          className="project-menu-btn"
          onClick={handleImportClick}
          aria-label="Open project from file"
          title="Open a project file you saved"
        >
          <Upload size={16} aria-hidden="true" />
          <span>Open File</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".brickgineers,.json,application/json"
          className="project-menu-hidden-input"
          aria-label="Upload project file"
          onChange={handleFileSelected}
        />

        <button
          type="button"
          className="project-menu-btn project-menu-btn-danger"
          onClick={() => setShowConfirmReset(true)}
          aria-label={`Start over with ${startOver.what}`}
          title={`Start over with ${startOver.what}`}
        >
          <RotateCcw size={16} aria-hidden="true" />
          <span>Start over</span>
        </button>
      </div>

      {pendingOpen && (
        <div className="project-menu-confirm-dialog" role="dialog" aria-label="Confirm open">
          <p className="project-menu-confirm-text">
            Open {pendingOpen.project.design.name || 'this file'}? It takes the place of the project you are working on. You can undo it right after.
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
          <p className="project-menu-confirm-text">Start over with {startOver.what}? You can undo it right after.</p>
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
              Start over
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
