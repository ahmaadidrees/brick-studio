import { describe, expect, it } from 'vitest'
import { createBrickStudioDocument } from './brickDocument'
import { createPublishedWorldUrl, loadPublishedWorld } from './publishedWorlds'

describe('published world snapshot links', () => {
  it('round trips a validated document and unicode title', () => {
    const document = createBrickStudioDocument([], { environmentId: 'brick-valley' })
    const url = new URL(createPublishedWorldUrl(document, 'Zoë’s world'))

    expect(url.pathname).toBe('/world')
    expect(loadPublishedWorld(url.hash)).toEqual({ title: 'Zoë’s world', document })
  })

  it('rejects missing and damaged snapshots', () => {
    expect(() => loadPublishedWorld('')).toThrow(/missing/)
    expect(() => loadPublishedWorld('#not-a-world')).toThrow(/invalid or damaged/)
  })
})
