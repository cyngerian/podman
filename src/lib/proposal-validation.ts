/**
 * Validation for draft proposal inputs.
 *
 * Kept in a plain module (not the `"use server"` actions file, which may only
 * export async server actions) so it can be unit-tested and reused. The server
 * action bounds these inputs itself rather than relying on the DB CHECK
 * constraints failing with a generic error.
 */

export const PROPOSAL_TITLE_MAX_LENGTH = 200;
export const MIN_PLAYER_COUNT = 2;
export const MAX_PLAYER_COUNT = 8;

/**
 * Validate a proposal's title and player count.
 *
 * @returns a user-friendly error message, or `null` when the input is valid.
 */
export function validateProposalInput(input: {
  title: string;
  playerCount: number;
}): string | null {
  const title = input.title?.trim() ?? "";

  if (title.length < 1) {
    return "Title is required.";
  }
  if (title.length > PROPOSAL_TITLE_MAX_LENGTH) {
    return `Title must be ${PROPOSAL_TITLE_MAX_LENGTH} characters or fewer.`;
  }

  if (!Number.isInteger(input.playerCount)) {
    return "Player count must be a whole number.";
  }
  if (
    input.playerCount < MIN_PLAYER_COUNT ||
    input.playerCount > MAX_PLAYER_COUNT
  ) {
    return `Player count must be between ${MIN_PLAYER_COUNT} and ${MAX_PLAYER_COUNT}.`;
  }

  return null;
}
