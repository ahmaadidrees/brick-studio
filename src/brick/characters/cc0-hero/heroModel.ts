import { useGLTF } from '@react-three/drei'

/**
 * Vendored CC0 hero model — see ASSET_PROVENANCE.md. Keeping the URL beside the
 * lazy character module lets Vite fingerprint the binary without loading it
 * until the character is selected or explicitly preloaded.
 */
export const HERO_MODEL_URL = new URL('./brick-hero.glb', import.meta.url).href

/** Draco/meshopt are both off: the file is plain glTF and needs no decoder. */
export const HERO_MODEL_LOADER_ARGS = [false, false] as const

/**
 * Optional warmup for a selector hover/focus. Deliberately never called at
 * import time so choosing another character incurs no model request.
 */
export function preloadHeroAvatar() {
  useGLTF.preload(HERO_MODEL_URL, false, false)
}
