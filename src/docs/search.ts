/**
 * Natural-language search over the installation documentation.
 *
 * The corpus is small and fixed, so the search is a scored scan rather than an index: every
 * document is split at its headings into sections, and sections are ranked on how many of the
 * query's terms they carry, with a heading match worth more than a body match.
 */
import { loadDocumentation } from "../corpus/index.js";

export interface DocumentationSection {
  readonly document: string;
  /** Heading path, e.g. `In-Site installation > The security hash`. */
  readonly heading: string;
  readonly content: string;
}

export interface SearchHit extends DocumentationSection {
  readonly score: number;
  readonly excerpt: string;
}

let sections: readonly DocumentationSection[] | undefined;

/** Splits every document at its headings, keeping the heading path. */
export function documentationSections(): readonly DocumentationSection[] {
  if (sections !== undefined) return sections;

  const collected: DocumentationSection[] = [];

  for (const file of loadDocumentation()) {
    const path: string[] = [];
    let heading = file.name;
    let buffer: string[] = [];

    const flush = (): void => {
      const content = buffer.join("\n").trim();
      if (content.length > 0) collected.push({ document: file.name, heading, content });
      buffer = [];
    };

    for (const line of file.content.split(/\r?\n/)) {
      const match = /^(#{1,3})\s+(.*)$/.exec(line);
      if (match) {
        flush();
        const level = match[1]!.length;
        path.length = Math.max(0, level - 1);
        path[level - 1] = match[2]!.trim();
        heading = path.filter((part) => part !== undefined).join(" > ");
      } else {
        buffer.push(line);
      }
    }
    flush();
  }

  sections = collected;
  return sections;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "is", "it", "how", "do", "i",
  "my", "with", "what", "when", "where", "which", "that", "this", "can", "be", "from", "at",
]);

function terms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));
}

/** Ranks documentation sections against a natural-language question. */
export function searchDocumentation(question: string, limit = 5): readonly SearchHit[] {
  const queryTerms = terms(question);
  if (queryTerms.length === 0) return [];

  const hits: SearchHit[] = [];

  for (const section of documentationSections()) {
    const heading = section.heading.toLowerCase();
    const body = section.content.toLowerCase();
    let score = 0;

    for (const term of queryTerms) {
      if (heading.includes(term)) score += 5;
      const occurrences = body.split(term).length - 1;
      if (occurrences > 0) score += 1 + Math.min(occurrences, 5) * 0.5;
    }

    if (score > 0) hits.push({ ...section, score, excerpt: excerpt(section.content, queryTerms) });
  }

  return hits.sort((left, right) => right.score - left.score).slice(0, limit);
}

/** The window of the section around its first matching term, enough to judge relevance. */
function excerpt(content: string, queryTerms: readonly string[], size = 700): string {
  if (content.length <= size) return content;

  const lower = content.toLowerCase();
  const positions = queryTerms.map((term) => lower.indexOf(term)).filter((index) => index >= 0);
  const start = positions.length === 0 ? 0 : Math.max(0, Math.min(...positions) - 150);

  return `${start > 0 ? "..." : ""}${content.slice(start, start + size)}...`;
}
