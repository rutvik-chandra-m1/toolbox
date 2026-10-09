/**
 * Splits rendered Word pages that are taller than one page.
 *
 * docx-preview starts a new page only at explicit page breaks (and Word's own
 * "last rendered page break" markers). Files from Google Docs, LibreOffice,
 * pandoc and most generators have neither, so a 5-page document arrives as ONE
 * very tall page. This re-flows such a page into several page-sized ones:
 *
 *  - blocks (paragraphs, tables, ...) move to a new page whole, so a line of
 *    text is never cut in half;
 *  - a heading is kept with the block that follows it;
 *  - a table taller than the space left is split between rows;
 *  - header/footer are copied onto every new page, and the page margins come
 *    from the cloned page element, so margins are the same on every page.
 *
 * The one thing it cannot split is a single block taller than a whole page
 * (a giant paragraph or image); those are returned oversized and the caller
 * slices them.
 *
 * Needs a real layout engine (it measures), so it runs in the render frame.
 * Elements live in the frame's document, which is a different realm from the
 * app's, so `instanceof HTMLElement` must not be used here.
 */

export interface Page {
  element: HTMLElement;
  /** Height of one page in CSS pixels (from the document's page size). */
  pageHeight: number;
}

const HEADING = /\bdocx_(heading\d*|title|subtitle)\b/i;
const A4_RATIO = 297 / 210;
/** Layout rounding: ignore overflow smaller than this (px). */
const TOLERANCE = 1;

const px = (value: string): number => Number.parseFloat(value) || 0;

export function paginateSections(doc: Document): Page[] {
  const sections = Array.from(doc.querySelectorAll<HTMLElement>('section.docx'));
  return sections.flatMap(paginateSection);
}

function paginateSection(section: HTMLElement): Page[] {
  const view = section.ownerDocument.defaultView;
  if (!view) return [{ element: section, pageHeight: section.offsetHeight }];

  const style = view.getComputedStyle(section);
  const pageHeight = px(style.minHeight) || px(style.width) * A4_RATIO;
  const single: Page[] = [{ element: section, pageHeight }];

  const article = section.querySelector<HTMLElement>(':scope > article');
  if (!article || section.offsetHeight <= pageHeight + TOLERANCE) return single;

  // Space for body text = page minus margins minus header/footer.
  const parts = Array.from(section.children) as HTMLElement[];
  const furniture = parts.filter((part) => part !== article).reduce((sum, part) => sum + part.offsetHeight, 0);
  const capacity = pageHeight - px(style.paddingTop) - px(style.paddingBottom) - furniture;
  if (capacity < 100) return single; // implausible layout: leave it alone

  const pages: Page[] = [{ element: section, pageHeight }];
  const blocks = Array.from(article.children) as HTMLElement[];
  article.replaceChildren();
  let current = article;

  const used = (target: HTMLElement): number => {
    const last = target.lastElementChild;
    if (!last) return 0;
    const bottom = last.getBoundingClientRect().bottom + px(view.getComputedStyle(last).marginBottom);
    return bottom - target.getBoundingClientRect().top;
  };
  const fits = () => used(current) <= capacity + TOLERANCE;

  /** Adds a new page after the last one and returns its (empty) article. */
  const newPage = (): HTMLElement => {
    const page = section.cloneNode(false) as HTMLElement;
    let newArticle = article;
    for (const part of parts) {
      if (part === article) {
        newArticle = article.cloneNode(false) as HTMLElement;
        page.appendChild(newArticle);
      } else {
        page.appendChild(part.cloneNode(true));
      }
    }
    pages[pages.length - 1]?.element.after(page);
    pages.push({ element: page, pageHeight });
    return newArticle;
  };

  /** Space-before is dropped at the top of a continuation page, as Word does. */
  const startPage = (): HTMLElement => {
    current = newPage();
    return current;
  };
  const trimTop = () => {
    const first = current.firstElementChild as HTMLElement | null;
    if (first) first.style.marginTop = '0';
  };

  const placeBlock = (block: HTMLElement) => {
    current.appendChild(block);
    if (fits() || current.childElementCount <= 1) return;

    // Move it to a fresh page, together with a heading that precedes it.
    const carry = [block];
    let previous = block.previousElementSibling as HTMLElement | null;
    while (previous && HEADING.test(previous.className) && current.childElementCount > carry.length + 1) {
      carry.unshift(previous);
      previous = previous.previousElementSibling as HTMLElement | null;
    }
    startPage();
    for (const item of carry) current.appendChild(item);
    trimTop();
  };

  const placeTable = (table: HTMLElement) => {
    const colgroup = table.querySelector(':scope > colgroup');
    const rows = Array.from(table.children).filter((child) => child.tagName === 'TR') as HTMLElement[];
    const rowsOnly = rows.length + (colgroup ? 1 : 0) === table.childElementCount;

    current.appendChild(table);
    if (fits() || !rowsOnly || rows.length < 2) {
      if (!fits() && current.childElementCount > 1) {
        startPage();
        current.appendChild(table);
        trimTop();
      }
      return;
    }

    // Too tall for the space left: lay the rows out one by one, starting a
    // new copy of the table on the next page whenever a row does not fit.
    for (const row of rows) row.remove();
    let part = table;
    const newPart = (): HTMLElement => {
      const copy = table.cloneNode(false) as HTMLElement;
      if (colgroup) copy.appendChild(colgroup.cloneNode(true));
      return copy;
    };
    const rowCount = (el: HTMLElement) => Array.from(el.children).filter((c) => c.tagName === 'TR').length;

    for (const row of rows) {
      part.appendChild(row);
      if (fits()) continue;
      if (rowCount(part) > 1) {
        part.removeChild(row);
        startPage();
        part = newPart();
        current.appendChild(part);
        part.appendChild(row);
        trimTop();
      } else if (current.childElementCount > 1) {
        startPage();
        current.appendChild(part); // moves the table (and its one row) over
        trimTop();
      }
    }
  };

  for (const block of blocks) {
    if (block.tagName === 'TABLE') placeTable(block);
    else placeBlock(block);
  }
  return pages;
}
