import { describe, it, expect } from "vitest";
import {
  validateProposalInput,
  PROPOSAL_TITLE_MAX_LENGTH,
  MIN_PLAYER_COUNT,
  MAX_PLAYER_COUNT,
} from "../proposal-validation";

describe("validateProposalInput", () => {
  describe("happy path", () => {
    it("accepts a normal title and player count", () => {
      expect(
        validateProposalInput({ title: "Friday Night Draft", playerCount: 8 })
      ).toBeNull();
    });

    it("accepts the minimum player count", () => {
      expect(
        validateProposalInput({ title: "Winston", playerCount: MIN_PLAYER_COUNT })
      ).toBeNull();
    });

    it("accepts the maximum player count", () => {
      expect(
        validateProposalInput({ title: "Big Pod", playerCount: MAX_PLAYER_COUNT })
      ).toBeNull();
    });

    it("accepts a single-character title", () => {
      expect(validateProposalInput({ title: "A", playerCount: 4 })).toBeNull();
    });

    it("accepts a title exactly at the max length", () => {
      const title = "x".repeat(PROPOSAL_TITLE_MAX_LENGTH);
      expect(validateProposalInput({ title, playerCount: 4 })).toBeNull();
    });
  });

  describe("title validation", () => {
    it("rejects an empty title", () => {
      const error = validateProposalInput({ title: "", playerCount: 4 });
      expect(error).toBe("Title is required.");
    });

    it("rejects a whitespace-only title", () => {
      const error = validateProposalInput({ title: "   ", playerCount: 4 });
      expect(error).toBe("Title is required.");
    });

    it("rejects a title one character over the max (201 chars)", () => {
      const title = "x".repeat(PROPOSAL_TITLE_MAX_LENGTH + 1);
      const error = validateProposalInput({ title, playerCount: 4 });
      expect(error).toBe(
        `Title must be ${PROPOSAL_TITLE_MAX_LENGTH} characters or fewer.`
      );
    });

    it("counts the trimmed length when enforcing the max", () => {
      // 200 real chars surrounded by whitespace should be valid after trim.
      const title = `  ${"x".repeat(PROPOSAL_TITLE_MAX_LENGTH)}  `;
      expect(validateProposalInput({ title, playerCount: 4 })).toBeNull();
    });
  });

  describe("player count validation", () => {
    it("rejects a player count of 0", () => {
      const error = validateProposalInput({ title: "Draft", playerCount: 0 });
      expect(error).toBe(
        `Player count must be between ${MIN_PLAYER_COUNT} and ${MAX_PLAYER_COUNT}.`
      );
    });

    it("rejects a player count of 1 (below minimum)", () => {
      const error = validateProposalInput({ title: "Draft", playerCount: 1 });
      expect(error).toBe(
        `Player count must be between ${MIN_PLAYER_COUNT} and ${MAX_PLAYER_COUNT}.`
      );
    });

    it("rejects a player count of 9 (above maximum)", () => {
      const error = validateProposalInput({ title: "Draft", playerCount: 9 });
      expect(error).toBe(
        `Player count must be between ${MIN_PLAYER_COUNT} and ${MAX_PLAYER_COUNT}.`
      );
    });

    it("rejects a NaN player count (e.g. unparseable form input)", () => {
      const error = validateProposalInput({ title: "Draft", playerCount: NaN });
      expect(error).toBe("Player count must be a whole number.");
    });

    it("rejects a fractional player count", () => {
      const error = validateProposalInput({ title: "Draft", playerCount: 4.5 });
      expect(error).toBe("Player count must be a whole number.");
    });
  });
});
