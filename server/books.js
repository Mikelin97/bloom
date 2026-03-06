import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOOK_SOURCES = {
  thus_spoke_zarathustra: {
    id: 'thus_spoke_zarathustra',
    title: 'Thus Spoke Zarathustra',
    author: 'Friedrich Nietzsche',
    chapterTitle: "Zarathustra's Prologue",
    chapterSummary:
      'Zarathustra leaves solitude, addresses the crowd, and introduces the challenge of surpassing complacent humanity.',
    filePath: path.resolve(__dirname, '../src/content/thus_spoke_zarathustra.md')
  },
  poor_charlie_almanack: {
    id: 'poor_charlie_almanack',
    title: "Poor Charlie's Almanack",
    author: 'Charles T. Munger',
    chapterTitle: 'Praising Old Age',
    chapterSummary:
      "Reflections on Cicero's praise of old age and the enduring influence of ideas across time.",
    filePath: path.resolve(__dirname, '../src/content/poor_charlie_almanack.md')
  }
};

function cleanParagraph(text) {
  return text
    .replace(/[#>*_`\-]/g, ' ')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseParagraphs(markdown) {
  return markdown
    .split(/\n\s*\n/g)
    .map((block) => cleanParagraph(block))
    .filter((block) => block.length > 40)
    .map((block, index) => ({
      id: `p-${index + 1}`,
      text: block
    }));
}

export function listBooks() {
  return Object.values(BOOK_SOURCES).map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    chapterTitle: book.chapterTitle,
    chapterSummary: book.chapterSummary
  }));
}

export function getBookById(bookId) {
  const book = BOOK_SOURCES[bookId];
  if (!book) return null;
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    chapterTitle: book.chapterTitle,
    chapterSummary: book.chapterSummary
  };
}

export function getBookParagraphs(bookId) {
  const book = BOOK_SOURCES[bookId];
  if (!book) return [];
  const markdown = fs.readFileSync(book.filePath, 'utf-8');
  return parseParagraphs(markdown);
}
