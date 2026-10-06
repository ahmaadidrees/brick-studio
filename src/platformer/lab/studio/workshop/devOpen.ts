/**
 * Dev only, imported nowhere in production. In the browser console on any dev page:
 *   (await import('/src/platformer/lab/studio/workshop/devOpen.ts')).openDevWorkshop('brick_hero')
 * mounts a full-screen Workshop over the page on its own store (the saved project, or the starter).
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { loadProject } from '../storage'
import { StudioStore } from '../store'
import { Workshop } from './Workshop'
import '../studio.css'

export function openDevWorkshop(brickId?: string): StudioStore {
  const store = new StudioStore(loadProject())
  store.openWorkshop(brickId ?? store.getState().project.design.bricks[0]?.id ?? 'stage')
  const host = document.createElement('div')
  host.className = 'studio-screen'
  host.style.cssText = 'position:fixed;inset:0;z-index:99999'
  document.body.appendChild(host)
  createRoot(host).render(createElement(Workshop, { store }))
  ;(window as unknown as { __wsStore?: StudioStore }).__wsStore = store
  return store
}
