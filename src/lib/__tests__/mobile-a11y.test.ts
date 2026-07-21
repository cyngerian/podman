import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Source-level guardrails for the mobile / accessibility floors:
 *
 *  - form controls render at >=16px on mobile, so iOS Safari doesn't zoom on focus
 *  - placeholder text is never dimmer than /50
 *  - interactive text is never dimmer than /60
 *
 * These are CSS-class invariants with no runtime behavior to assert, so the
 * test reads the source instead. It fails loudly when a new component
 * reintroduces the pattern.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

const FILES = tsxFiles(SRC).map((file) => ({
  file: path.relative(SRC, file),
  source: readFileSync(file, "utf8"),
}));

/**
 * Returns the source of every `<input>` / `<textarea>` / `<select>` opening tag
 * in `source`. Brace- and quote-aware, so a `>` inside an arrow function
 * (`onChange={(e) => ...}`) does not end the tag early.
 */
export function extractControlTags(source: string): { tag: string; line: number }[] {
  const found: { tag: string; line: number }[] = [];
  const tagStart = /<(input|textarea|select)\b/g;
  let match: RegExpExecArray | null;

  while ((match = tagStart.exec(source)) !== null) {
    let depth = 0;
    let quote: string | null = null;
    let i = match.index;

    for (; i < source.length; i++) {
      const ch = source[i];
      if (quote) {
        if (ch === "\\") i++;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
      } else if (ch === ">" && depth === 0) {
        break;
      }
    }

    found.push({
      tag: source.slice(match.index, i + 1),
      line: source.slice(0, match.index).split("\n").length,
    });
    tagStart.lastIndex = i;
  }

  return found;
}

// Controls with no text field to zoom into.
const NON_TEXT_TYPES = ["checkbox", "radio", "file", "hidden", "range"];

function isTextControl(tag: string): boolean {
  const type = tag.match(/type="(\w+)"/)?.[1];
  return !type || !NON_TEXT_TYPES.includes(type);
}

describe("extractControlTags", () => {
  it("stops at the tag's own '>' and not one inside a handler", () => {
    const src = `<input\n  onChange={(e) => setX(e.target.value)}\n  className="text-base"\n/>\n<p>after</p>`;
    const tags = extractControlTags(src);
    expect(tags).toHaveLength(1);
    expect(tags[0].tag).toContain('className="text-base"');
    expect(tags[0].tag).not.toContain("after");
  });

  it("ignores angle brackets inside string literals", () => {
    const tags = extractControlTags(`<input placeholder="a > b" className="text-base" />`);
    expect(tags).toHaveLength(1);
    expect(tags[0].tag.endsWith("/>")).toBe(true);
  });

  it("finds every control and reports its line", () => {
    const src = `<div>\n<textarea className="a" />\n<select className="b">\n<option/>\n</select>\n</div>`;
    const tags = extractControlTags(src);
    expect(tags.map((t) => t.line)).toEqual([2, 3]);
  });
});

describe("form controls are >=16px on mobile", () => {
  it("declares text-base (or larger) on every text-entry control", () => {
    const offenders: string[] = [];

    for (const { file, source } of FILES) {
      for (const { tag, line } of extractControlTags(source)) {
        if (!isTextControl(tag)) continue;
        if (/\btext-(base|lg|xl|2xl)\b/.test(tag)) continue;
        offenders.push(`${file}:${line}`);
      }
    }

    expect(offenders, "text-entry controls must use `text-base sm:text-sm`").toEqual([]);
  });

  it("keeps the global 16px backstop in globals.css", () => {
    const css = readFileSync(path.join(SRC, "app/globals.css"), "utf8");
    expect(css).toMatch(/@media \(max-width: 639px\)/);
    expect(css).toMatch(/font-size: 16px/);
  });
});

describe("contrast floors", () => {
  it("never renders placeholder text below /50", () => {
    const offenders: string[] = [];
    const tooFaint = /placeholder[:-](?:text-)?foreground\/(\d+)/g;

    for (const { file, source } of FILES) {
      for (const match of source.matchAll(tooFaint)) {
        if (Number(match[1]) < 50) {
          offenders.push(`${file}: ${match[0]}`);
        }
      }
    }

    expect(offenders, "placeholders must be at least /50").toEqual([]);
  });

  it("never renders interactive text below /60", () => {
    const offenders: string[] = [];
    // A `hover:text-foreground/*` sibling marks the class list as interactive.
    const interactive = /text-foreground\/(\d+)([^"'`]*?)hover:text-foreground/g;

    for (const { file, source } of FILES) {
      for (const match of source.matchAll(interactive)) {
        if (Number(match[1]) < 60) {
          offenders.push(`${file}: text-foreground/${match[1]}`);
        }
      }
    }

    expect(offenders, "interactive text must be at least /60").toEqual([]);
  });

  it("has no text-foreground/30 left anywhere", () => {
    const offenders = FILES.filter(({ source }) =>
      /text-foreground\/30\b/.test(source)
    ).map(({ file }) => file);

    expect(offenders).toEqual([]);
  });
});
