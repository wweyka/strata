"""Chapters for a document, and which chapter each passage belongs to.

The file's own structure wins: PDF bookmarks, Word/EPUB/HTML/Markdown headings, or headings read
from scans. Without one, the sections the AI found are used, and failing that the whole material
is one chapter. Passages before the first chapter (covers, contents pages) get a leading chapter
named after the material, so every topic can be traced to a chapter.
"""

from dataclasses import dataclass

from strata_ai.ingest.analysis import Section
from strata_ai.ingest.chunking import Chunk
from strata_ai.ingest.extract import OutlineEntry

MAX_LEVEL = 3
MAX_CHAPTERS = 400


@dataclass
class ChapterPlan:
    title: str
    level: int
    parent: int | None = None  # index in the plan
    page_start: int | None = None
    page_end: int | None = None


@dataclass
class Structure:
    chapters: list[ChapterPlan]
    chunk_chapter: list[int]  # chapter index for each chunk, by ordinal


def plan_chapters(
    title: str, outline: list[OutlineEntry], sections: list[Section], chunks: list[Chunk]
) -> Structure:
    entries = [e for e in outline if e.level <= MAX_LEVEL and e.title.strip()][:MAX_CHAPTERS]
    if entries and any(chunk.heading_path for chunk in chunks):
        chapters, assigned = _by_heading(entries, chunks)
    elif entries and all(e.page is not None for e in entries):
        chapters, assigned = _by_page(entries, chunks)
    elif sections:
        chapters, assigned = _by_section(sections[:MAX_CHAPTERS], chunks)
    else:
        chapters, assigned = [], [None] * len(chunks)

    if not chapters or any(index is None for index in assigned):
        # A leading chapter for front matter (or the whole material when it has no structure).
        chapters.insert(0, ChapterPlan(title=title.strip()[:300] or "Untitled", level=1))
        assigned = [0 if index is None else index + 1 for index in assigned]

    _link_parents(chapters)
    _page_ranges(chapters, assigned, chunks)
    return Structure(chapters=chapters, chunk_chapter=[int(index) for index in assigned])  # type: ignore[arg-type]


def _by_page(entries: list[OutlineEntry], chunks: list[Chunk]) -> tuple[list[ChapterPlan], list[int | None]]:
    ordered = sorted(entries, key=lambda e: e.page or 0)  # stable: bookmark order within a page
    chapters = [ChapterPlan(e.title[:300], e.level, page_start=e.page) for e in ordered]
    assigned: list[int | None] = []
    previous: int | None = None
    for chunk in chunks:
        page = chunk.page_start
        if page is None:
            assigned.append(previous)
            continue
        found = None
        for index, chapter in enumerate(chapters):
            if (chapter.page_start or 0) <= page:
                found = index
            else:
                break
        assigned.append(found)
        previous = found
    return chapters, assigned


def _by_heading(
    entries: list[OutlineEntry], chunks: list[Chunk]
) -> tuple[list[ChapterPlan], list[int | None]]:
    chapters: list[ChapterPlan] = []
    occurrences: dict[tuple[str, ...], list[int]] = {}
    stack: list[tuple[int, str]] = []
    for entry in entries:
        while stack and stack[-1][0] >= entry.level:
            stack.pop()
        stack.append((entry.level, entry.title))
        occurrences.setdefault(tuple(t for _, t in stack), []).append(len(chapters))
        chapters.append(ChapterPlan(entry.title[:300], entry.level, page_start=entry.page))

    entered: dict[tuple[str, ...], int] = {}
    assigned: list[int | None] = []
    current: tuple[str, ...] | None = None
    for chunk in chunks:
        path = next(
            (
                chunk.heading_path[:n]
                for n in range(len(chunk.heading_path), 0, -1)
                if chunk.heading_path[:n] in occurrences
            ),
            None,
        )
        if path is None:
            assigned.append(None)
            current = None
            continue
        if path != current:
            # Entering a section again: take the next chapter with the same path (repeated titles).
            entered[path] = min(entered.get(path, 0) + 1, len(occurrences[path]))
            current = path
        assigned.append(occurrences[path][entered[path] - 1])
    return chapters, assigned


def _by_section(sections: list[Section], chunks: list[Chunk]) -> tuple[list[ChapterPlan], list[int | None]]:
    ordered = sorted(sections, key=lambda s: (s.first_chunk, s.level))
    chapters = [ChapterPlan(s.title[:300], min(s.level, MAX_LEVEL)) for s in ordered]
    assigned: list[int | None] = []
    for chunk in chunks:
        found = None
        for index, section in enumerate(ordered):
            if section.first_chunk <= chunk.ordinal:
                found = index
            else:
                break
        assigned.append(found)
    return chapters, assigned


def _link_parents(chapters: list[ChapterPlan]) -> None:
    stack: list[int] = []
    for index, chapter in enumerate(chapters):
        while stack and chapters[stack[-1]].level >= chapter.level:
            stack.pop()
        chapter.parent = stack[-1] if stack else None
        stack.append(index)


def _page_ranges(chapters: list[ChapterPlan], assigned: list[int | None], chunks: list[Chunk]) -> None:
    for chunk, index in zip(chunks, assigned, strict=True):
        if index is None or chunk.page_start is None:
            continue
        # A chapter spans its own passages and those of its subchapters.
        target: int | None = index
        while target is not None:
            chapter = chapters[target]
            end = chunk.page_end or chunk.page_start
            chapter.page_start = min(chapter.page_start or chunk.page_start, chunk.page_start)
            chapter.page_end = max(chapter.page_end or end, end)
            target = chapter.parent
    for chapter in chapters:
        if chapter.page_start is not None and (
            chapter.page_end is None or chapter.page_end < chapter.page_start
        ):
            chapter.page_end = chapter.page_start
        if chapter.page_start is None:
            chapter.page_end = None
