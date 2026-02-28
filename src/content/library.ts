import poorCharlieMarkdown from './poor_charlie_almanack.md?raw';
import thusSpokeZarathustraMarkdown from './thus_spoke_zarathustra.md?raw';

export type ReaderContentId = 'thus_spoke_zarathustra' | 'poor_charlie_almanack';

export interface ReaderContent {
  id: ReaderContentId;
  label: string;
  markdown: string;
  bookTitle: string;
  author: string;
  chapterTitle: string;
  chapterSummary: string;
}

const CONTENT_LIBRARY: Record<ReaderContentId, ReaderContent> = {
  thus_spoke_zarathustra: {
    id: 'thus_spoke_zarathustra',
    label: 'Thus Spoke Zarathustra',
    markdown: thusSpokeZarathustraMarkdown,
    bookTitle: 'Thus Spoke Zarathustra',
    author: 'Friedrich Nietzsche',
    chapterTitle: "Zarathustra's Prologue",
    chapterSummary:
      'Zarathustra leaves solitude, addresses the crowd, and introduces the challenge of surpassing complacent humanity.'
  },
  poor_charlie_almanack: {
    id: 'poor_charlie_almanack',
    label: "Poor Charlie's Almanack",
    markdown: poorCharlieMarkdown,
    bookTitle: "Poor Charlie's Almanack",
    author: 'Charles T. Munger',
    chapterTitle: 'Praising Old Age',
    chapterSummary:
      "Reflections on Cicero's praise of old age and the enduring influence of ideas across time."
  }
};

export const DEFAULT_READER_CONTENT_ID: ReaderContentId = 'thus_spoke_zarathustra';

export const READER_CONTENTS: ReaderContent[] = Object.values(CONTENT_LIBRARY);

export function isReaderContentId(value: unknown): value is ReaderContentId {
  return typeof value === 'string' && value in CONTENT_LIBRARY;
}

export function getReaderContentById(id: string | ReaderContentId | null | undefined): ReaderContent {
  if (isReaderContentId(id)) {
    return CONTENT_LIBRARY[id];
  }
  return CONTENT_LIBRARY[DEFAULT_READER_CONTENT_ID];
}
