# Adding a book to Daily Read

Follow these steps when the user says **"add this book: `<pdf>`"**. The app has no upload button: books are added here, at build time.

> **Copyright:** book text must never be committed. `content/daily-read/books/`, every `*.pdf` and extracted text files are git-ignored. Never `git add -f` them, and never paste book text into a commit message, README or test.

## 0. The format

One file per book: `content/daily-read/books/<book-slug>.json` (`slug` is lowercase letters, digits and dashes).

```json
{
  "book": "Book title",
  "slug": "book-slug",
  "lessons": [
    {
      "id": "book-slug-001",
      "title": "Lesson heading (shown in the notification)",
      "hook": "One curiosity line for the notification body",
      "quick": "The 30-second version: 3-5 short lines, separated by \n",
      "original": "The EXACT original text from the PDF for this topic, word for word",
      "explanation": "Thorough explanation of what the text means, step by step",
      "realWorld": "Real-world examples and implications (work, college, friendships, everyday social life)",
      "extraThoughts": "Extra thoughts, counterpoints, when NOT to apply this",
      "tryToday": "One small, specific action to try today",
      "recall": [ { "q": "Short recall question", "a": "Short answer" } ]
    }
  ]
}
```

Use `\n\n` between paragraphs inside a field. `content/daily-read/sample/sample.json` is a complete working example.

## 1. Extract the text

Use PyMuPDF (`pip install pymupdf`), page by page, and keep the output in a git-ignored place (for example `content/daily-read/extracted/<slug>.txt`).

Remove **only**:

- page numbers,
- running headers and footers,
- hyphenation at line breaks (`informa-` / `tion` becomes `information`).

**Never change the wording**: no fixing typos, no modernising spelling, no shortening, no re-ordering, no smoothing of quotes or dashes beyond what the extractor outputs.

## 2. Split into lessons

One clear topic per lesson, about **5-8 minutes of reading** (roughly 1,200-2,000 words in total across all fields, with `original` usually 250-600 words). Follow the book's own structure: chapters, laws, sections. Split a long chapter into parts ("Title, part 1"); never merge unrelated topics. Number the ids in book order: `<slug>-001`, `<slug>-002`, ...

## 3. Write the fields

- `original` = the exact text from the PDF for that topic, **copied, never paraphrased or edited**. It is the only field taken from the book.
- Write **all other fields fresh**, in depth and in simple language:
  - `title`: the lesson heading; `hook`: one curiosity line (it is the notification body).
  - `quick`: 3-5 short lines, the 30-second version.
  - `explanation`: what the text means, step by step.
  - `realWorld`: real **Indian** everyday, college and work examples (exams and hostel life, first job, family, friends, local situations).
  - `extraThoughts`: counterpoints and when **not** to apply the idea.
  - `tryToday`: one small, specific action that can be done today.
  - `recall`: 2-3 short question/answer pairs that test the lesson.

## 4. Save

Write `content/daily-read/books/<slug>.json` (UTF-8). If the folder does not exist, create it.

## 5. Validate, then rebuild

```bash
python content/daily-read/validate.py content/daily-read/books/<slug>.json --pdf <the-source>.pdf
```

It checks that every lesson has every field, that ids are unique, and that **every `original` appears word for word in the PDF text** (whitespace is normalised; page numbers, running headers/footers and line-break hyphenation are ignored on the PDF side). Fix every listed lesson (almost always by re-copying `original` from the extracted text) and run it again until it prints `OK`.

Then rebuild:

```bash
npm test
npm run build            # the PWA / laptop version
npm run android:build    # release/toolbox-debug.apk
```

The app loads every file in `content/daily-read/books/` at build time. While that folder has no books it uses `content/daily-read/sample/`; as soon as one real book exists the sample lessons are no longer loaded.

## Reminders

- Lesson ids are the keys for saved progress: **do not rename or renumber the ids of a book that is already in use**, or the phone forgets what was read. Append new lessons with new ids instead.
- The books are bundled into the app, so the APK and the built `dist/` folder contain the book text. Do not publish or share them.
