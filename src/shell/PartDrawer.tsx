import { PanelLeftClose, PanelLeftOpen, Plus, Search, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'

/*
 * The builders' part drawer, shared by the 3D studio (bricks) and the 2D builder (blocks) so both look and behave
 * the same: a docked panel on wide screens (collapsible to a toggle), and on compact screens a floating button that
 * opens a bottom sheet. The markup and class names are the 3D studio's own; each builder styles them (the 3D studio
 * in src/brick/*.css, the 2D builder in src/platformer/ui/platformer.css) and supplies its items and wording.
 */

export type DrawerItem = {
  id: string
  name: string
  /** One of the drawer's category ids (never `all`). */
  category: string
  thumbnail: ReactNode
}

export type DrawerCategory = { id: string; label: string }

/** The first category may be `all`, which shows everything. */
export const ALL_CATEGORY = 'all'

export type DrawerLabels = {
  /** Heading, button and sheet title: "Bricks". */
  title: string
  /** Search field's accessible name and placeholder. */
  search: string
  searchPlaceholder: string
  /** The grid of parts. */
  grid: string
  /** The category picker: a select in the docked panel, chips in the sheet. */
  categorySelect: string
  categoryTabs: string
  /** "No bricks match …" / "Show all bricks". */
  plural: string
  /** The docked panel and its open, collapse and sheet controls. */
  panel: string
  open: string
  collapse: string
  close: string
  expand: string
  shrink: string
}

export const BRICK_DRAWER_LABELS: DrawerLabels = {
  title: 'Bricks',
  search: 'Search bricks',
  searchPlaceholder: 'Search bricks…',
  grid: 'Brick shapes',
  categorySelect: 'Brick category',
  categoryTabs: 'Brick categories',
  plural: 'bricks',
  panel: 'Brick drawer',
  open: 'Open brick drawer',
  collapse: 'Collapse brick drawer',
  close: 'Close brick drawer',
  expand: 'Expand brick drawer',
  shrink: 'Make brick drawer smaller',
}

export type PartPickerProps = {
  items: readonly DrawerItem[]
  categories: readonly DrawerCategory[]
  activeId: string | null
  onChoose: (id: string) => void
  labels: DrawerLabels
  /** Docked panel: categories in a select beside the search. The sheet shows them as chips. */
  denseCatalog?: boolean
  /** Rendered between the search row and the categories (the 3D studio's "Create a brick"). */
  beforeCategories?: ReactNode
  /** Extra text each item matches in search (defaults to its id). */
  searchText?: (item: DrawerItem) => string
}

/** Search, categories and the grid of parts. */
export function PartPicker({ items, categories, activeId, onChoose, labels, denseCatalog = false, beforeCategories, searchText = (item) => item.id }: PartPickerProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(categories[0]?.id ?? ALL_CATEGORY)
  const searchId = useId()
  const trimmedQuery = query.trim().toLowerCase()
  const visible = useMemo(() => items.filter((item) => {
    if (category !== ALL_CATEGORY && item.category !== category) return false
    return !trimmedQuery || item.name.toLowerCase().includes(trimmedQuery) || searchText(item).toLowerCase().includes(trimmedQuery)
  }), [items, category, trimmedQuery, searchText])
  return (
    <>
      <div className="part-search-row">
      <div className="part-search">
        <Search size={16} aria-hidden="true" />
        <input
          id={searchId}
          type="search"
          value={query}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.search}
          autoComplete="off"
          enterKeyHint="search"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Escape clears the search first; a second Escape leaves the field so the build shortcut can take it.
            if (event.key !== 'Escape') return
            if (query) { event.preventDefault(); event.stopPropagation(); setQuery('') } else event.currentTarget.blur()
          }}
        />
        {query && <button type="button" className="part-search-clear" aria-label="Clear search" onClick={() => setQuery('')}><X size={14} aria-hidden="true" /></button>}
      </div>
      {denseCatalog && <select className="part-category-select" aria-label={labels.categorySelect} value={category} onChange={event => setCategory(event.target.value)}>{categories.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select>}
      </div>
      {beforeCategories}
      {!denseCatalog && <div className="part-categories" role="tablist" aria-label={labels.categoryTabs}>
        {categories.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={category === entry.id}
            className={`part-category${category === entry.id ? ' active' : ''}`}
            onClick={() => setCategory(entry.id)}
          >{entry.label}</button>
        ))}
      </div>}
      <div className="part-grid" aria-label={labels.grid}>
        {visible.map((item) => (
          <button
            key={item.id}
            className={`library-part ${activeId === item.id ? 'active' : ''}`}
            type="button"
            aria-pressed={activeId === item.id}
            onClick={() => onChoose(item.id)}
            title={item.name}
          >
            {item.thumbnail}
            <span>{item.name}</span>
          </button>
        ))}
        {visible.length === 0 && (
          <p className="part-grid-empty" role="status">No {labels.plural} match {trimmedQuery ? `“${query.trim()}”` : 'this category'}.{trimmedQuery && <> <button type="button" className="part-grid-empty-clear" onClick={() => { setQuery(''); setCategory(ALL_CATEGORY) }}>Show all {labels.plural}</button></>}</p>
        )}
      </div>
    </>
  )
}

export type DrawerPanelProps = {
  id: string
  labels: DrawerLabels
  icon: ReactNode
  onCollapse: () => void
  inert?: boolean
  children: ReactNode
  /** Below the grid (the 3D studio's brush colors). */
  footer?: ReactNode
}

/** The docked drawer on wide screens. */
export function DrawerPanel({ id, labels, icon, onCollapse, inert, children, footer }: DrawerPanelProps) {
  return (
    <aside inert={inert} className="part-library" id={id} aria-label={labels.panel}>
      <div className="library-title">
        <h2 className="library-heading">{icon}{labels.title}</h2>
        <button
          className="studio-icon-button library-collapse-button"
          type="button"
          aria-label={labels.collapse}
          aria-controls={id}
          aria-expanded="true"
          onClick={onCollapse}
        ><PanelLeftClose size={18} /></button>
      </div>
      {children}
      {footer}
    </aside>
  )
}

/** What stands in for the docked drawer while it is collapsed. */
export function DrawerToggle({ id, labels, onOpen }: { id: string; labels: DrawerLabels; onOpen: () => void }) {
  return (
    <button
      className="brick-drawer-toggle"
      type="button"
      aria-label={labels.open}
      aria-controls={id}
      aria-expanded="false"
      onClick={onOpen}
    ><PanelLeftOpen size={18} /><span>{labels.title}</span></button>
  )
}

/** Compact screens: the round button that opens the drawer sheet. */
export function DrawerFab({ labels, open, onOpen, children }: { labels: DrawerLabels; open: boolean; onOpen: () => void; children?: ReactNode }) {
  return (
    <nav className="brick-creative-dock" aria-label="Creative tools">
      <button
        className="brick-drawer-fab"
        type="button"
        aria-label={labels.open}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={onOpen}
      >
        <Plus size={22} />
        <span>{labels.title}</span>
      </button>
      {children}
    </nav>
  )
}

export type DrawerSheetProps = {
  labels: DrawerLabels
  icon: ReactNode
  onClose: () => void
  children: ReactNode
  /** Stays in view while the grid scrolls (the 3D studio's brush colors). */
  footer?: ReactNode
  titleId?: string
}

/** Compact screens: the drawer as a modal bottom sheet that can be made taller. */
export function DrawerSheet({ labels, icon, onClose, children, footer, titleId = 'brick-sheet-title' }: DrawerSheetProps) {
  const [expanded, setExpanded] = useState(false)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus({ preventScroll: true })
    // Capture phase: Escape must close the sheet without also reaching the global builder
    // shortcut that cancels the armed brush.
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
      if (dialogs[dialogs.length - 1] !== panel.current) return
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', closeOnEscape, true)
    return () => {
      window.removeEventListener('keydown', closeOnEscape, true)
      restoreTo?.focus({ preventScroll: true })
    }
  }, [onClose])

  return (
    <>
      <div className="brick-sheet-backdrop" data-testid="brick-sheet-backdrop" onPointerDown={onClose} aria-hidden="true" />
      <div ref={panel} className={`brick-sheet${expanded ? ' brick-sheet-expanded' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <button type="button" className="brick-sheet-size" aria-label={expanded ? labels.shrink : labels.expand} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><span className="brick-sheet-grip" aria-hidden="true" /></button>
        <div className="library-title">
          <h2 className="library-heading" id={titleId}>{icon}{labels.title}</h2>
          <button className="studio-icon-button" type="button" aria-label={labels.close} onClick={onClose}><X size={18} /></button>
        </div>
        {children}
        {footer}
      </div>
    </>
  )
}
