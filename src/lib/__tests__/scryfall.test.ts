import { describe, it, expect } from "vitest";
import { normalizeForScryfall } from "../scryfall";

describe("normalizeForScryfall", () => {
  describe("plain collector numbers (no normalization needed)", () => {
    it("passes through a simple numeric collector number unchanged", () => {
      expect(normalizeForScryfall({ set: "isd", collector_number: "130" }))
        .toEqual({ set: "isd", collector_number: "130" });
    });

    it("passes through a collector number with leading zeros", () => {
      expect(normalizeForScryfall({ set: "m21", collector_number: "001" }))
        .toEqual({ set: "m21", collector_number: "001" });
    });

    it("preserves the original set code", () => {
      expect(normalizeForScryfall({ set: "ISD", collector_number: "51" }))
        .toEqual({ set: "ISD", collector_number: "51" });
    });
  });

  describe("DFC a/b suffix stripping", () => {
    it("strips trailing 'a' suffix from collector number", () => {
      expect(normalizeForScryfall({ set: "isd", collector_number: "51a" }))
        .toEqual({ set: "isd", collector_number: "51" });
    });

    it("strips trailing 'b' suffix from collector number", () => {
      expect(normalizeForScryfall({ set: "isd", collector_number: "51b" }))
        .toEqual({ set: "isd", collector_number: "51" });
    });

    it("strips suffix from multi-digit collector numbers", () => {
      expect(normalizeForScryfall({ set: "isd", collector_number: "176a" }))
        .toEqual({ set: "isd", collector_number: "176" });
    });
  });

  describe("star ★ suffix stripping", () => {
    it("strips trailing ★ from collector number", () => {
      expect(normalizeForScryfall({ set: "m20", collector_number: "254★" }))
        .toEqual({ set: "m20", collector_number: "254" });
    });
  });

  describe("The List SET-NUM format", () => {
    it("extracts set code and collector number from LIST format", () => {
      expect(normalizeForScryfall({ set: "plst", collector_number: "DOM-130" }))
        .toEqual({ set: "dom", collector_number: "130" });
    });

    it("lowercases the extracted set code", () => {
      expect(normalizeForScryfall({ set: "plst", collector_number: "WAR-1" }))
        .toEqual({ set: "war", collector_number: "1" });
    });

    it("strips DFC suffix from LIST format number part", () => {
      expect(normalizeForScryfall({ set: "plst", collector_number: "HOU-149a" }))
        .toEqual({ set: "hou", collector_number: "149" });
    });

    it("strips star suffix from LIST format number part", () => {
      expect(normalizeForScryfall({ set: "plst", collector_number: "WAR-1★" }))
        .toEqual({ set: "war", collector_number: "1" });
    });

    it("handles The List with multi-letter set codes", () => {
      expect(normalizeForScryfall({ set: "plst", collector_number: "MH2-42" }))
        .toEqual({ set: "mh2", collector_number: "42" });
    });
  });
});
