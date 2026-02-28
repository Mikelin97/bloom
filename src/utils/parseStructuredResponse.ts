/**
 * Parses a structured AI response into labeled sections.
 *
 * Expected format from the model:
 *   **Label:** text content
 *   **Label:** text content
 *   ...
 *
 * Falls back to returning the raw content as a single section if
 * no structured markers are detected.
 */

export interface ResponseSection {
  label: string;
  text: string;
}

export interface ParsedResponse {
  sections: ResponseSection[];
  /** true when the parser found valid structured sections */
  structured: boolean;
  /** original unmodified content */
  raw: string;
}

const SECTION_RE = /\*\*([^*]+?):\*\*\s*/g;

export function parseStructuredResponse(content: string): ParsedResponse {
  if (!content || !content.trim()) {
    return { sections: [], structured: false, raw: content };
  }

  const markers: { label: string; start: number; end: number }[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex to ensure fresh search
  SECTION_RE.lastIndex = 0;
  while ((match = SECTION_RE.exec(content)) !== null) {
    markers.push({
      label: match[1].trim(),
      start: match.index,
      end: match.index + match[0].length
    });
  }

  // Need at least 2 sections to count as structured (e.g., Insight + Reflect)
  if (markers.length < 2) {
    return { sections: [], structured: false, raw: content };
  }

  const sections: ResponseSection[] = markers.map((marker, i) => {
    const textStart = marker.end;
    const textEnd = i < markers.length - 1 ? markers[i + 1].start : content.length;
    return {
      label: marker.label,
      text: content.slice(textStart, textEnd).trim()
    };
  });

  return { sections, structured: true, raw: content };
}

/**
 * Strips **Label:** markers from text so TTS reads naturally.
 */
export function stripSectionMarkers(text: string): string {
  return text.replace(/\*\*[^*]+?:\*\*\s*/g, '').trim();
}
