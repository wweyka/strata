"""Group text blocks into passages of a few hundred tokens for search, citations and analysis.

A passage never crosses a heading or mixes OCR, figure and table text with ordinary text, and
it remembers where each page starts inside it, so a quote can be traced to its page.
"""

import re
from dataclasses import dataclass, field

from strata_ai.ingest.extract import Block

TARGET_TOKENS = 450
MAX_TOKENS = 800


def estimate_tokens(text: str) -> int:
    return max(1, round(len(text) / 3.6))


@dataclass
class Chunk:
    ordinal: int
    text: str
    heading_path: tuple[str, ...]
    source_kind: str
    page_start: int | None
    page_end: int | None
    # (character offset where a page begins inside `text`, page number)
    page_marks: list[tuple[int, int]] = field(default_factory=list)

    @property
    def token_count(self) -> int:
        return estimate_tokens(self.text)

    def page_at(self, offset: int) -> int | None:
        page = self.page_start
        for start, number in self.page_marks:
            if start <= offset:
                page = number
        return page


def split_long(text: str, limit_tokens: int = MAX_TOKENS) -> list[str]:
    """Split an oversized paragraph at sentence boundaries."""
    if estimate_tokens(text) <= limit_tokens:
        return [text]
    sentences = re.split(r"(?<=[.!?。！？])\s+", text)
    parts: list[str] = []
    current = ""
    for sentence in sentences:
        while estimate_tokens(sentence) > limit_tokens:  # no sentence breaks at all
            cut = int(limit_tokens * 3.6)
            if current:
                parts.append(current)
                current = ""
            parts.append(sentence[:cut])
            sentence = sentence[cut:]
        candidate = f"{current} {sentence}".strip()
        if current and estimate_tokens(candidate) > limit_tokens:
            parts.append(current)
            current = sentence
        else:
            current = candidate
    if current:
        parts.append(current)
    return parts


def make_chunks(blocks: list[Block]) -> list[Chunk]:
    chunks: list[Chunk] = []
    pieces: list[tuple[str, int | None]] = []
    # heading_only: the open passage holds just a heading, which should stay with what follows.
    state: dict = {"path": (), "kind": "text", "heading_only": False}

    def flush() -> None:
        if not pieces:
            return
        text = ""
        marks: list[tuple[int, int]] = []
        last_page: int | None = None
        for piece, page in pieces:
            if text:
                text += "\n\n"
            if page is not None and page != last_page:
                marks.append((len(text), page))
                last_page = page
            text += piece
        pages = [page for _, page in pieces if page is not None]
        chunks.append(
            Chunk(
                ordinal=len(chunks),
                text=text[:20000],
                heading_path=state["path"],
                source_kind=state["kind"],
                page_start=min(pages) if pages else None,
                page_end=max(pages) if pages else None,
                page_marks=marks,
            )
        )
        pieces.clear()

    for block in blocks:
        if block.heading_level is not None:
            # Consecutive headings ("Chapter 3", then "3.1 Overview") share the passage that follows.
            if not state["heading_only"]:
                flush()
            state.update(path=block.heading_path, kind="text", heading_only=True)
            # The heading opens the next passage so its words are searchable with the body.
            pieces.append((block.text, block.page))
            continue
        changed = block.heading_path != state["path"] or block.kind != state["kind"]
        if changed and not state["heading_only"]:
            flush()
        state.update(path=block.heading_path, kind=block.kind)
        for part in split_long(block.text):
            current = sum(estimate_tokens(text) for text, _ in pieces)
            if pieces and not state["heading_only"] and current + estimate_tokens(part) > TARGET_TOKENS:
                flush()
            pieces.append((part, block.page))
            state["heading_only"] = False
    flush()
    return chunks
