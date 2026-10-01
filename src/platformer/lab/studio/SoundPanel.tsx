import { useState } from 'react'
import { Play, Plus, Trash2, Volume2, X } from 'lucide-react'
import type { Sound } from '../core/contracts'
import { STAGE_ID, useStudio, type StudioStore } from './store'
import { getSoundLibrary } from './assets/soundLibrary'
import './assets/assets.css'

export function SoundPanel({ store }: { store: StudioStore }) {
  const selectedBrickId = useStudio(store, (s) => s.selectedBrickId)
  const isStage = selectedBrickId === STAGE_ID
  const brick = useStudio(store, (s) =>
    s.selectedBrickId === STAGE_ID
      ? s.project.design.stage
      : s.project.design.bricks.find((b) => b.id === s.selectedBrickId)
  )

  const sounds: Sound[] = brick?.sounds ?? []
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [playingSound, setPlayingSound] = useState<string | null>(null)

  const library = getSoundLibrary()

  function playSound(sound: Sound) {
    if (!sound.asset) return
    try {
      const audio = new Audio(sound.asset)
      setPlayingSound(sound.name)
      audio.onended = () => setPlayingSound(null)
      audio.onerror = () => setPlayingSound(null)
      audio.play().catch(() => setPlayingSound(null))
    } catch {
      setPlayingSound(null)
    }
  }

  function handleAddSound(sound: Sound) {
    // Add sound to the brick or stage
    const nextSounds = [...sounds, sound]
    store.setSounds(selectedBrickId, nextSounds)
    setLibraryOpen(false)
  }

  function handleRemoveSound(index: number) {
    const nextSounds = sounds.filter((_, i) => i !== index)
    store.setSounds(selectedBrickId, nextSounds)
  }

  return (
    <div className="sound-panel-container" aria-label="Sound editor">
      <div className="sound-list-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1.05rem', margin: 0, color: '#e2e5eb' }}>
            {isStage ? 'Stage Sounds' : `Sounds for ${brick?.name ?? 'Brick'}`}
          </h2>
          <button
            type="button"
            className="asset-btn asset-btn-primary"
            onClick={() => setLibraryOpen(true)}
            aria-label="+ Add sound"
          >
            <Plus size={18} aria-hidden="true" />
            <span>+ Add sound</span>
          </button>
        </div>

        {sounds.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              color: '#838b9e',
              background: '#1d212b',
              borderRadius: 10,
              border: '1px dashed #343c4e',
            }}
          >
            <Volume2 size={40} style={{ opacity: 0.5, marginBottom: 8 }} aria-hidden="true" />
            <p style={{ margin: 0, fontSize: '0.95rem' }}>No sounds added yet.</p>
            <p style={{ margin: '4px 0 16px', fontSize: '0.85rem', color: '#687082' }}>
              Add synthesized retro sounds from the library!
            </p>
            <button
              type="button"
              className="asset-btn"
              onClick={() => setLibraryOpen(true)}
              aria-label="Open sound library"
            >
              <Plus size={16} aria-hidden="true" />
              <span>Browse library</span>
            </button>
          </div>
        ) : (
          <div role="list" aria-label="Assigned sounds" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sounds.map((sound, idx) => (
              <div
                key={`${sound.name}-${idx}`}
                role="listitem"
                className="sound-card"
                aria-label={`${sound.name} sound`}
              >
                <div className="sound-card-info">
                  <span className="sound-card-name">{sound.name}</span>
                  <span className="sound-card-duration">{(sound.durationMs / 1000).toFixed(2)}s</span>
                </div>
                <div className="sound-card-actions">
                  <button
                    type="button"
                    className="asset-btn"
                    onClick={() => playSound(sound)}
                    aria-label={`Preview ${sound.name} sound`}
                    title="Preview"
                  >
                    <Play size={16} fill={playingSound === sound.name ? '#4f8cf6' : 'currentColor'} aria-hidden="true" />
                    <span>Play</span>
                  </button>
                  <button
                    type="button"
                    className="brick-icon-btn brick-icon-btn-danger"
                    style={{ width: 40, height: 40 }}
                    onClick={() => handleRemoveSound(idx)}
                    aria-label={`Remove ${sound.name} sound`}
                    title="Remove"
                  >
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sound Library Modal */}
      {libraryOpen && (
        <div
          className="asset-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Sound Library"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLibraryOpen(false)
          }}
        >
          <div className="asset-modal" style={{ maxWidth: 600 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 className="asset-modal-title" style={{ margin: 0 }}>Sound Library</h3>
              <button
                type="button"
                className="brick-icon-btn"
                onClick={() => setLibraryOpen(false)}
                aria-label="Close library"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <p className="asset-modal-body">Click Play to preview, or Add to attach to your brick:</p>

            <div className="sound-library-modal-grid">
              {library.map((item) => (
                <div key={item.name} className="sound-lib-card" aria-label={item.name}>
                  <span style={{ fontWeight: 600, color: '#f0f2f7', fontSize: '0.95rem' }}>
                    {item.name}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#8891a2' }}>
                    {(item.durationMs / 1000).toFixed(2)}s
                  </span>
                  <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                    <button
                      type="button"
                      className="asset-btn"
                      style={{ flex: 1, minHeight: 36, padding: '4px 6px', fontSize: '0.8rem' }}
                      onClick={() => playSound(item)}
                      aria-label={`Play ${item.name}`}
                    >
                      <Play size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="asset-btn asset-btn-primary"
                      style={{ flex: 1, minHeight: 36, padding: '4px 6px', fontSize: '0.8rem' }}
                      onClick={() => handleAddSound(item)}
                      aria-label={`Add ${item.name}`}
                    >
                      <Plus size={14} aria-hidden="true" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="asset-modal-actions">
              <button
                type="button"
                className="asset-btn"
                onClick={() => setLibraryOpen(false)}
                aria-label="Cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
