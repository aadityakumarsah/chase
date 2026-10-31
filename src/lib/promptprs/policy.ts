/** A shared agent may only be rewritten in a demo with one workspace. */
export function canSyncSharedPrompt(
  demoMode: boolean,
  workspaceIds: string[],
  businessId: string,
) {
  return (
    demoMode && workspaceIds.length === 1 && workspaceIds[0] === businessId
  );
}
