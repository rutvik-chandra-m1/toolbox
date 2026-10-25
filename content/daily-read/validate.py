#!/usr/bin/env python3
"""Validate Daily Read book files.

    python content/daily-read/validate.py                       # every file in books/ (or sample/ if books/ is empty)
    python content/daily-read/validate.py books/my-book.json    # specific files
    python content/daily-read/validate.py books/my-book.json --pdf my-book.pdf

Checks (exit code 1 if any fails):
  1. every lesson has every field, with the right type and non-empty text;
     lesson ids are unique across all the files checked;
  2. with --pdf: every lesson's `original` appears word for word in the text
     extracted from the PDF (whitespace is normalised on both sides; line-break
     hyphenation, page numbers and running headers/footers are removed from the
     PDF text, because those are the only things allowed to be missing from `original`).
     Lessons that do not match are listed with the point where they stop matching.

--pdf needs PyMuPDF:  pip install pymupdf
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT_FIELDS = ["id", "title", "hook", "quick", "original", "explanation", "realWorld", "extraThoughts", "tryToday"]
ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def default_files() -> list[Path]:
    books = sorted((HERE / "books").glob("*.json"))
    return books or sorted((HERE / "sample").glob("*.json"))


def check_structure(path: Path, seen_ids: dict[str, Path]) -> tuple[list[str], list[dict]]:
    problems: list[str] = []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return [f"{path.name}: cannot read as JSON ({error})"], []
    if not isinstance(data, dict):
        return [f"{path.name}: top level must be an object"], []
    for field in ("book", "slug"):
        if not isinstance(data.get(field), str) or not data[field].strip():
            problems.append(f"{path.name}: missing or empty '{field}'")
    slug = data.get("slug")
    if isinstance(slug, str) and not ID_RE.match(slug):
        problems.append(f"{path.name}: slug '{slug}' must be lowercase letters, digits and dashes")
    lessons = data.get("lessons")
    if not isinstance(lessons, list) or not lessons:
        return problems + [f"{path.name}: 'lessons' must be a non-empty list"], []

    for index, lesson in enumerate(lessons, start=1):
        label = f"{path.name} lesson #{index}"
        if not isinstance(lesson, dict):
            problems.append(f"{label}: must be an object")
            continue
        for field in TEXT_FIELDS:
            value = lesson.get(field)
            if not isinstance(value, str) or not value.strip():
                problems.append(f"{label}: missing or empty '{field}'")
        lesson_id = lesson.get("id")
        if isinstance(lesson_id, str) and lesson_id.strip():
            label = f"{path.name} lesson '{lesson_id}'"
            if not ID_RE.match(lesson_id):
                problems.append(f"{label}: id must be lowercase letters, digits and dashes")
            if lesson_id in seen_ids:
                problems.append(f"{label}: duplicate id (also in {seen_ids[lesson_id].name})")
            seen_ids.setdefault(lesson_id, path)
        recall = lesson.get("recall")
        if not isinstance(recall, list) or not recall:
            problems.append(f"{label}: 'recall' must be a non-empty list of {{q, a}}")
        else:
            for n, item in enumerate(recall, start=1):
                ok = isinstance(item, dict) and all(isinstance(item.get(k), str) and item[k].strip() for k in ("q", "a"))
                if not ok:
                    problems.append(f"{label}: recall #{n} needs non-empty 'q' and 'a'")
    return problems, [l for l in lessons if isinstance(l, dict)]


def normalise(text: str) -> str:
    """For comparison only: ligatures/quotes-style compatibility forms, soft hyphens, and whitespace."""
    text = unicodedata.normalize("NFKC", text).replace("­", "")
    return re.sub(r"\s+", " ", text).strip()


def extract_pdf_text(pdf_path: Path) -> str:
    try:
        import pymupdf  # type: ignore
    except ImportError:
        try:
            import fitz as pymupdf  # type: ignore
        except ImportError:
            sys.exit("PyMuPDF is needed for --pdf:  pip install pymupdf")

    pages = [[line.strip() for line in page.get_text().splitlines()] for page in pymupdf.open(pdf_path)]
    # Running headers/footers: the same first/last line on at least 3 pages (and 20% of them).
    edges = Counter()
    for lines in pages:
        non_empty = [l for l in lines if l]
        edges.update({non_empty[0], non_empty[-1]} if non_empty else set())
    repeated = {line for line, n in edges.items() if n >= max(3, len(pages) // 5) and not line.isdigit()}
    kept: list[str] = []
    for lines in pages:
        for line in lines:
            if line in repeated or re.fullmatch(r"(page\s*)?\d{1,4}", line, re.IGNORECASE):
                continue  # page number or running header/footer
            kept.append(line)
    text = "\n".join(kept)
    return normalise(re.sub(r"(\w)-\n(\w)", r"\1\2", text))  # line-break hyphenation


def divergence(needle: str, haystack: str) -> str:
    """Describe where `needle` stops matching somewhere in `haystack`."""
    lo, hi = 0, len(needle)
    while lo < hi:  # longest prefix that occurs in the PDF text
        mid = (lo + hi + 1) // 2
        lo, hi = (mid, hi) if needle[:mid] in haystack else (lo, mid - 1)
    if lo == 0:
        return f"does not even start in the PDF text: \"{needle[:60]}...\""
    return f"matches {lo} of {len(needle)} characters, then differs at: \"...{needle[max(0, lo - 30):lo + 30]}...\""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("files", nargs="*", type=Path, help="book JSON files (default: everything in books/)")
    parser.add_argument("--pdf", type=Path, help="source PDF: check every `original` against its text")
    args = parser.parse_args()

    files = args.files or default_files()
    if not files:
        print("No book files found.")
        return 1

    seen: dict[str, Path] = {}
    problems: list[str] = []
    lessons_by_file: list[tuple[Path, list[dict]]] = []
    for path in files:
        found, lessons = check_structure(path, seen)
        problems += found
        lessons_by_file.append((path, lessons))

    if args.pdf:
        pdf_text = extract_pdf_text(args.pdf)
        for path, lessons in lessons_by_file:
            for lesson in lessons:
                original = lesson.get("original")
                if isinstance(original, str) and original.strip() and normalise(original) not in pdf_text:
                    problems.append(f"{path.name} lesson '{lesson.get('id')}': `original` is not word for word in the PDF - "
                                    + divergence(normalise(original), pdf_text))

    total = sum(len(lessons) for _, lessons in lessons_by_file)
    if problems:
        print(f"{len(problems)} problem(s):")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    suffix = f", and every `original` is word for word in {args.pdf.name}" if args.pdf else ""
    print(f"OK: {total} lessons in {len(files)} file(s), all fields present, ids unique{suffix}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
