import { useGLTF } from '@react-three/drei'

/**
 * Vendored CC0 hero model — see ASSETS.md. Served from our own origin so Explore
 * keeps working offline and behind a base path.
 */
export const HERO_MODEL_URL = `${import.meta.env.BASE_URL}models/brick-hero.glb`

/** Draco/meshopt are both off: the file is plain glTF and needs no decoder. */
export const HERO_MODEL_LOADER_ARGS = [false, false] as const

/**
 * Warms the model cache from an idle callback so entering Explore is instant.
 * Deliberately not called at import time — Build mode should never race first
 * paint for bandwidth.
 */
export function preloadHeroAvatar() {
  useGLTF.preload(HERO_MODEL_URL, false, false)
}
