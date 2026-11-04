/**
 * The pages people join a Hackable room from (docs/qa/hackable-rooms M1). Kept apart from endpoints.ts so pages that
 * only link to a room (My projects, the class page, invites) don't load the room's connection code.
 */
export const roomHref = {
  /** A room joined by link (a project kept in a browser). */
  guest: (roomId: string) => `/2d/hackable/r/${roomId}`,
  /** An account project's room, for classmates it is shared with (and its owner and the teacher, who host it). */
  classroom: (worldId: string) => `/2d/hackable/w/${worldId}`,
}
