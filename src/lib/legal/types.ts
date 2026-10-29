/** Shape of a legal document (terms, privacy policy). The text lives in data files so the page layout stays simple. */

export type LegalTable = {
  head: string[];
  rows: string[][];
};

export type LegalParagraph = {
  text?: string;
  /** Short list under the paragraph (shown as （1）（2）…). */
  items?: string[];
  table?: LegalTable;
  /** A line shown under the table or list, not numbered. */
  note?: string;
};

export type LegalArticle = {
  title: string;
  paragraphs: LegalParagraph[];
  /** Number the paragraphs 1, 2, 3 … (used for articles that cite 「第1項」「前2項」). */
  numbered: boolean;
};

export type LegalChapter = {
  title?: string;
  articles: LegalArticle[];
};

export type LegalDocumentData = {
  title: string;
  enactedOn: string;
  revisedOn: string;
  chapters: LegalChapter[];
  /** Company information table shown after the articles. */
  closing?: { title: string; table: LegalTable };
  supplement: string;
};

/** An article whose paragraphs are numbered when there is more than one. */
export function article(title: string, ...paragraphs: LegalParagraph[]): LegalArticle {
  return { title, paragraphs, numbered: paragraphs.length > 1 };
}
