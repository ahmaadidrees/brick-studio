import { useState } from 'react'
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import { blankImage, costumeFromImage } from './pixels'
import { STAGE_ID, useStudio, type StudioStore } from './store'
import { BRICK_WORDS, chooseUniqueName } from './assets/words'
import { WordPickerModal } from './assets/WordPickerModal'
import { ConfirmModal } from './assets/ConfirmModal'
import './assets/assets.css'

export function BrickList({ store }: { store: StudioStore }) {
  const bricks = useStudio(store, (s) => s.project.design.bricks)
  const stage = useStudio(store, (s) => s.project.design.stage)
  const selectedBrickId = useStudio(store, (s) => s.selectedBrickId)

  const [addingBrick, setAddingBrick] = useState(false)
  const [renamingBrickId, setRenamingBrickId] = useState<string | null>(null)
  const [deletingBrickId, setDeletingBrickId] = useState<string | null>(null)

  function handleSelectBrick(brickId: string) {
    store.selectBrick(brickId)
    store.setBrush(brickId)
  }

  function handleSelectStage() {
    store.selectBrick(STAGE_ID)
    store.setBrush(null)
  }

  function handleCreateBrick(pickedWord: string) {
    const existingNames = bricks.map((b) => b.name)
    const name = chooseUniqueName(pickedWord, existingNames)
    const costume = costumeFromImage(name, blankImage(32, 32))
    store.addBrick(name, costume)
    store.setEditorTab('costumes')
    setAddingBrick(false)
  }

  function handleRenameBrick(pickedWord: string) {
    if (!renamingBrickId) return
    const otherNames = bricks.filter((b) => b.id !== renamingBrickId).map((b) => b.name)
    const name = chooseUniqueName(pickedWord, otherNames)
    store.renameBrick(renamingBrickId, name)
    setRenamingBrickId(null)
  }

  function handleDeleteBrick() {
    if (!deletingBrickId) return
    store.deleteBrick(deletingBrickId)
    setDeletingBrickId(null)
  }

  const brickToRename = renamingBrickId ? bricks.find((b) => b.id === renamingBrickId) : null
  const brickToDelete = deletingBrickId ? bricks.find((b) => b.id === deletingBrickId) : null

  return (
    <div className="brick-list-container" aria-label="Bricks and Stage">
      <div className="brick-list-header">
        <span className="brick-list-title">Bricks &amp; Stage</span>
        <button
          type="button"
          className="asset-btn asset-btn-primary"
          onClick={() => setAddingBrick(true)}
          aria-label="+ New brick"
        >
          <Plus size={18} aria-hidden="true" />
          <span>+ New brick</span>
        </button>
      </div>

      <div className="brick-grid" role="list" aria-label="Brick tiles">
        {/* Stage tile */}
        <div
          role="listitem"
          className={`brick-card brick-card-stage ${selectedBrickId === STAGE_ID ? 'selected' : ''}`}
          onClick={handleSelectStage}
          aria-label="Stage"
          aria-selected={selectedBrickId === STAGE_ID}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleSelectStage()
            }
          }}
        >
          <div className="brick-thumbnail-container">
            {stage?.costumes?.[0]?.asset ? (
              <img
                src={stage.costumes[0].asset}
                alt="Stage backdrop preview"
                className="brick-thumbnail"
              />
            ) : (
              <Layers size={28} color="#7d8494" aria-hidden="true" />
            )}
          </div>
          <span className="brick-name">Stage</span>
        </div>

        {/* Brick tiles */}
        {bricks.map((brick) => {
          const isSelected = selectedBrickId === brick.id
          const thumb = brick.costumes[0]?.asset

          return (
            <div
              key={brick.id}
              role="listitem"
              className={`brick-card ${isSelected ? 'selected' : ''}`}
              onClick={() => handleSelectBrick(brick.id)}
              aria-label={brick.name}
              aria-selected={isSelected}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSelectBrick(brick.id)
                }
              }}
            >
              <div className="brick-card-actions">
                <button
                  type="button"
                  className="brick-icon-btn"
                  title={`Rename ${brick.name}`}
                  aria-label={`Rename ${brick.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setRenamingBrickId(brick.id)
                  }}
                >
                  <Pencil size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="brick-icon-btn brick-icon-btn-danger"
                  title={`Delete ${brick.name}`}
                  aria-label={`Delete ${brick.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeletingBrickId(brick.id)
                  }}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>

              <div className="brick-thumbnail-container">
                {thumb ? (
                  <img src={thumb} alt={`${brick.name} costume thumbnail`} className="brick-thumbnail" />
                ) : (
                  <div style={{ width: 24, height: 24, background: '#383e4d', borderRadius: 4 }} />
                )}
              </div>
              <span className="brick-name">{brick.name}</span>
            </div>
          )
        })}

        {/* Big + New brick card in grid */}
        <button
          type="button"
          className="brick-add-btn"
          onClick={() => setAddingBrick(true)}
          aria-label="+ Add brick"
        >
          <Plus size={28} aria-hidden="true" />
          <span>New brick</span>
        </button>
      </div>

      {/* New Brick Modal */}
      {addingBrick && (
        <WordPickerModal
          title="Pick a name for your brick"
          words={BRICK_WORDS}
          onSelect={handleCreateBrick}
          onClose={() => setAddingBrick(false)}
        />
      )}

      {/* Rename Brick Modal */}
      {renamingBrickId && brickToRename && (
        <WordPickerModal
          title={`Rename "${brickToRename.name}"`}
          words={BRICK_WORDS}
          onSelect={handleRenameBrick}
          onClose={() => setRenamingBrickId(null)}
        />
      )}

      {/* Delete Brick Confirmation Modal */}
      {deletingBrickId && brickToDelete && (
        <ConfirmModal
          title="Delete brick?"
          message={`Are you sure you want to delete "${brickToDelete.name}"? This will delete the brick and all of its copies from the level.`}
          confirmText="Delete"
          cancelText="Cancel"
          danger
          onConfirm={handleDeleteBrick}
          onCancel={() => setDeletingBrickId(null)}
        />
      )}
    </div>
  )
}
