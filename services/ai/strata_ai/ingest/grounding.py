"""Check that a quote the model attributes to a passage really is in that passage.

Only citations that pass are stored, so every source reference a learner sees points at text
that exists in their own material.
"""

import re
import unicodedata
from difflib import SequenceMatcher

# Share of the quote that must appear verbatim (after normalisation) in the passage.
MIN_MATCH = 0.85
MIN_QUOTE_CHARS = 15

_TRANSLATE = str.maketrans(
    {
        "‘": "'",
        "’": "'",
        "‚": "'",
        "“": '"',
        "”": '"',
        "„": '"',
        "«": '"',
        "»": '"',
        "‐": "-",
        "‑": "-",
        "–": "-",
        "—": "-",
        "−": "-",
        " ": " ",
        "­": "",
        "…": "...",
    }
)


def normalise(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).translate(_TRANSLATE).lower()
    text = re.sub(r"(\w)-\s+(\w)", r"\1\2", text)
    return re.sub(r"\s+", " ", text).strip()


def locate(quote: str, passage: str) -> int | None:
    """Character offset of `quote` in `passage`, or None if it isn't really there.

    Exact matches are found directly; otherwise the longest common run must cover most of
    the quote (models sometimes drop a word or change punctuation at the edges).
    """
    q = normalise(quote).strip(" .,;:\"'")
    if len(q) < MIN_QUOTE_CHARS:
        return None
    p = normalise(passage)
    position = p.find(q)
    if position < 0:
        match = SequenceMatcher(None, p, q, autojunk=False).find_longest_match(0, len(p), 0, len(q))
        if match.size < MIN_MATCH * len(q):
            return None
        position = max(0, match.a - match.b)
    # Map the offset in the normalised passage back to the original text, approximately.
    ratio = len(passage) / max(len(p), 1)
    return min(len(passage) - 1, int(position * ratio))
