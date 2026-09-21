/**
 * Flows v2: the world menu moved to src/shell/WorldMenu.tsx and the placed-brick navigator to the
 * command strip ("Jump to brick"). Only the document-command contract remains here because
 * useBrickStudioDocuments (lead-owned) imports it from this path.
 */
export type StudioDocumentCommands = {
  onNewBuild?: () => void
  onImportProject?: (file: File) => void | Promise<void>
  onExportProject?: () => void
  onStartLiveWorld?: () => void
  onPublishWorld?: () => void
}
