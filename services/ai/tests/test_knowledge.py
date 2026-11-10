"""Passages, quote checking, analysis assembly, chapters and scan merging (no network, no database)."""

from strata_ai.ingest.analysis import (
    CitationOut,
    ConsolidationAnswer,
    ItemOut,
    MergedTopicOut,
    RelationOut,
    SectionOut,
    TopicOut,
    WindowAnswer,
    build,
    render_window,
    slugify,
    windows,
)
from strata_ai.ingest.chunking import (
    MAX_TOKENS,
    TARGET_TOKENS,
    Chunk,
    estimate_tokens,
    make_chunks,
    split_long,
)
from strata_ai.ingest.extract import Block, Extracted, OutlineEntry, PageImage
from strata_ai.ingest.grounding import locate, normalise
from strata_ai.ingest.ocr import PageBlockOut, PageReading, merge_readings
from strata_ai.ingest.structure import plan_chapters

SENTENCE = "Subnetting divides one network into several smaller networks. "

# ---------------------------------------------------------------- chunking


def test_chunks_respect_headings_kinds_and_size():
    blocks = [
        Block("Chapter 1", page=1, heading_path=("Chapter 1",), heading_level=1),
        *[Block(SENTENCE * 20, page=1 + i // 2, heading_path=("Chapter 1",)) for i in range(6)],
        Block("A table | row", page=4, heading_path=("Chapter 1",), kind="table"),
        Block("Chapter 2", page=5, heading_path=("Chapter 2",), heading_level=1),
        Block("Short body.", page=5, heading_path=("Chapter 2",)),
    ]
    chunks = make_chunks(blocks)
    assert chunks[0].text.startswith("Chapter 1\n\n")  # the heading stays with its body
    assert all(c.token_count <= TARGET_TOKENS + estimate_tokens(SENTENCE * 20) for c in chunks)
    assert {c.source_kind for c in chunks if "A table" in c.text} == {"table"}
    last = chunks[-1]
    assert last.heading_path == ("Chapter 2",) and last.text == "Chapter 2\n\nShort body."
    assert [c.ordinal for c in chunks] == list(range(len(chunks)))


def test_chunk_page_marks_trace_offsets_to_pages():
    chunks = make_chunks([Block("Page one text.", page=1), Block("Page two text.", page=2)])
    assert len(chunks) == 1
    chunk = chunks[0]
    assert (chunk.page_start, chunk.page_end) == (1, 2)
    assert chunk.page_at(chunk.text.index("Page one")) == 1
    assert chunk.page_at(chunk.text.index("Page two")) == 2


def test_split_long_without_sentence_breaks():
    parts = split_long("x" * 10000)
    assert all(estimate_tokens(p) <= MAX_TOKENS for p in parts)
    assert "".join(parts) == "x" * 10000


# ---------------------------------------------------------------- grounding

PASSAGE = (
    "The OSI model has seven layers. The network layer is responsible for logical addressing and "
    "rout-\ning packets between networks, while the “transport layer” provides end‑to‑end delivery."
)


def test_exact_and_normalised_quotes_are_found():
    assert locate("The OSI model has seven layers", PASSAGE) == 0
    # Typographic quotes, a hyphenated line break and case differences still match.
    assert locate('the "transport layer" provides end-to-end delivery', PASSAGE) is not None
    assert locate("responsible for logical addressing and routing packets", PASSAGE) is not None


def test_near_quotes_pass_but_invented_ones_fail():
    assert locate("The network layer is responsible for logical addressing and routing packets.", PASSAGE)
    assert locate("The data link layer handles MAC addresses and frames", PASSAGE) is None
    assert locate("has seven layers", PASSAGE) == 14
    assert locate("seven layers", PASSAGE) is None  # too short to prove anything


def test_normalise():
    assert normalise("  FIrst “Quote” — long-\n term ") == 'first "quote" - longterm'


# ---------------------------------------------------------------- analysis assembly


def _chunks(texts: list[str], kinds: list[str] | None = None) -> list[Chunk]:
    kinds = kinds or ["text"] * len(texts)
    return [Chunk(i, t, ("Ch",), kinds[i], i + 1, i + 1) for i, t in enumerate(texts)]


def _item(
    content: str, quote: str | None, passage: int = 1, basis: str = "source", kind: str = "fact"
) -> ItemOut:
    citations = [CitationOut(passage=passage, quote=quote)] if quote else []
    return ItemOut(kind=kind, term=None, content=content, basis=basis, citations=citations)


def _topic(key: str, title: str, items: list[ItemOut], parent: str | None = None, passages=(1,)) -> TopicOut:
    return TopicOut(
        key=key,
        title=title,
        parent=parent,
        summary=f"About {title}.",
        difficulty=2,
        importance=4,
        passages=list(passages),
        items=items,
    )


def test_build_verifies_citations_and_relabels_unsupported_items():
    chunks = _chunks(
        [
            "A subnet mask separates the network part of an address from the host part.",
            "Figure: a diagram of three subnets connected by one router.",
        ],
        kinds=["text", "figure"],
    )
    window = WindowAnswer(
        sections=[SectionOut(title="Addressing", level=1, first_passage=1)],
        topics=[
            _topic(
                "masks",
                "Subnet masks",
                [
                    _item("Masks split network and host parts.", "separates the network part of an address"),
                    _item(
                        "Masks were invented in 1985.", "Subnet masks were invented in 1985"
                    ),  # not in text
                    _item("Three subnets share a router.", "a diagram of three subnets connected", passage=2),
                    _item("Masks are often written as /24.", None, basis="ai_supplement"),
                    _item("Masks split network and host parts.", "separates the network part"),  # duplicate
                ],
            )
        ],
        relations=[],
    )
    merged = ConsolidationAnswer(
        language="en",
        subject="Computer Networks",
        subject_description="How computers talk.",
        topics=[MergedTopicOut(key="subnet-masks", title="Subnet masks", parent=None, members=["1:masks"])],
        relations=[],
    )
    result = build(chunks, [window], merged)
    (topic,) = result.topics
    assert topic.key == "subnet-masks"
    by_content = {item.content: item for item in topic.items}
    assert len(topic.items) == 2
    source = by_content["Masks split network and host parts."]
    assert source.basis == "source" and source.citations[0].offset == len("A subnet mask ")
    # A claim whose quote is invented, or quotes an AI figure description, is left out entirely.
    assert "Masks were invented in 1985." not in by_content
    assert "Three subnets share a router." not in by_content
    # What the model declared as its own addition stays, labelled as such.
    assert by_content["Masks are often written as /24."].basis == "ai_supplement"
    assert result.verified_citations == 1 and result.unverified_citations == 2
    assert result.dropped_items == 2
    assert result.sections[0].title == "Addressing" and result.sections[0].first_chunk == 0


def test_build_merges_windows_maps_parents_and_relations():
    chunks = _chunks(
        ["Routing moves packets.", "Static routes are set by hand.", "OSPF is a dynamic protocol."]
    )
    first = WindowAnswer(
        sections=[],
        topics=[_topic("routing", "Routing", []), _topic("static", "Static routes", [], parent="routing")],
        relations=[
            RelationOut(source="routing", target="static", kind="prerequisite", basis="ai_supplement")
        ],
    )
    second = WindowAnswer(
        sections=[],
        topics=[
            _topic("routing", "Routing basics", [], passages=(3,)),
            _topic("ospf", "OSPF", [], passages=(3,)),
        ],
        relations=[RelationOut(source="ospf", target="ospf", kind="related", basis="source")],
    )
    merged = ConsolidationAnswer(
        language="en",
        subject="Networks",
        subject_description="",
        topics=[
            MergedTopicOut(key="routing", title="Routing", parent=None, members=["1:routing", "2:routing"]),
            MergedTopicOut(key="ospf", title="OSPF", parent="routing", members=["2:ospf"]),
            MergedTopicOut(key="ghost", title="Ghost", parent=None, members=["9:nothing"]),
        ],
        relations=[RelationOut(source="routing", target="ospf", kind="prerequisite", basis="source")],
    )
    result = build(chunks, [first, second], merged)
    topics = {t.key: t for t in result.topics}
    assert set(topics) == {"routing", "ospf", "static-routes"}  # "static" was not claimed: kept as-is
    assert topics["routing"].chunks == {0, 2}
    assert topics["ospf"].parent == "routing"
    assert topics["static-routes"].parent == "routing"
    kinds = {(r.source, r.target, r.kind, r.basis) for r in result.relations}
    assert kinds == {
        ("routing", "static-routes", "prerequisite", "ai_supplement"),
        ("routing", "ospf", "prerequisite", "source"),
    }


def test_parent_cycles_are_broken():
    chunks = _chunks(["text"])
    window = WindowAnswer(sections=[], topics=[_topic("a", "A", []), _topic("b", "B", [])], relations=[])
    merged = ConsolidationAnswer(
        language="en",
        subject="S",
        subject_description="",
        topics=[
            MergedTopicOut(key="a", title="A", parent="b", members=["1:a"]),
            MergedTopicOut(key="b", title="B", parent="a", members=["1:b"]),
        ],
        relations=[],
    )
    result = build(chunks, [window], merged)
    assert sum(1 for t in result.topics if t.parent is None) >= 1


def test_slugs_are_ascii():
    assert slugify("Модель OSI") == "model-osi"
    assert slugify("Ley de Ohm: V = I·R") == "ley-de-ohm-v-i-r"
    assert slugify("光合作用") == "topic"


def test_windows_and_rendering():
    chunks = [
        Chunk(i, "word " * 1000, ("Part", 'A "quoted" <title>'), "text", i + 1, i + 2) for i in range(10)
    ]
    groups = windows(chunks, budget=3000)
    assert [len(g) for g in groups] == [2, 2, 2, 2, 2]
    rendered = render_window("Book", groups[0])
    assert '<passage n="1" pages="1-2" section="Part > A \'quoted\' (title)">' in rendered


# ---------------------------------------------------------------- chapters


def _chunk(ordinal: int, page: int | None, path: tuple[str, ...] = ()) -> Chunk:
    return Chunk(ordinal, f"text {ordinal}", path, "text", page, page)


def test_chapters_from_pdf_bookmarks_with_front_matter():
    outline = [
        OutlineEntry("Part I", 1, 3),
        OutlineEntry("Chapter 1", 2, 3),
        OutlineEntry("Chapter 2", 2, 6),
    ]
    chunks = [_chunk(0, 1), _chunk(1, 3), _chunk(2, 4), _chunk(3, 6), _chunk(4, 8)]
    structure = plan_chapters("My Book", outline, [], chunks)
    titles = [c.title for c in structure.chapters]
    assert titles == ["My Book", "Part I", "Chapter 1", "Chapter 2"]
    assert structure.chunk_chapter == [0, 2, 2, 3, 3]
    part, ch1, ch2 = structure.chapters[1:]
    assert ch1.parent == 1 and ch2.parent == 1 and part.parent is None
    assert (part.page_start, part.page_end) == (3, 8)
    assert (ch1.page_start, ch1.page_end) == (3, 4)


def test_chapters_from_headings_with_repeated_titles():
    outline = [
        OutlineEntry("Cells", 1, None),
        OutlineEntry("Summary", 2, None),
        OutlineEntry("Tissues", 1, None),
        OutlineEntry("Summary", 2, None),
    ]
    chunks = [
        _chunk(0, None, ("Cells",)),
        _chunk(1, None, ("Cells", "Summary")),
        _chunk(2, None, ("Tissues",)),
        _chunk(3, None, ("Tissues", "Summary", "Deeper heading")),
    ]
    structure = plan_chapters("Biology", outline, [], chunks)
    assert [c.title for c in structure.chapters] == ["Cells", "Summary", "Tissues", "Summary"]
    assert structure.chunk_chapter == [0, 1, 2, 3]


def test_chapters_from_ai_sections_or_single_chapter():
    from strata_ai.ingest.analysis import Section

    chunks = [_chunk(i, None) for i in range(4)]
    structure = plan_chapters("Notes", [], [Section("Intro", 1, 0), Section("Details", 1, 2)], chunks)
    assert [c.title for c in structure.chapters] == ["Intro", "Details"]
    assert structure.chunk_chapter == [0, 0, 1, 1]

    single = plan_chapters("Notes", [], [], chunks)
    assert [c.title for c in single.chapters] == ["Notes"] and single.chunk_chapter == [0, 0, 0, 0]


# ---------------------------------------------------------------- scans


def test_scans_are_merged_in_page_order_with_their_headings():
    extracted = Extracted(parser="pdfium", parser_version="x", page_count=3)
    extracted.blocks = [Block("Typed page one.", page=1), Block("Typed page three.", page=3)]
    extracted.ocr_pages = [PageImage(2, b"", "image/jpeg")]
    readings = {
        2: PageReading(
            legible=True,
            blocks=[
                PageBlockOut(kind="heading", level=1, text="Handwritten notes"),
                PageBlockOut(kind="text", level=None, text="Ohm's law: V = IR."),
                PageBlockOut(kind="figure", level=None, text="A circuit with one resistor."),
            ],
        )
    }
    blocks = merge_readings(extracted, readings)
    assert [(b.page, b.kind, b.text) for b in blocks] == [
        (1, "text", "Typed page one."),
        (2, "ocr", "Handwritten notes"),
        (2, "ocr", "Ohm's law: V = IR."),
        (2, "figure", "A circuit with one resistor."),
        (3, "text", "Typed page three."),
    ]
    assert blocks[1].heading_level == 1 and blocks[2].heading_path == ("Handwritten notes",)
    assert extracted.outline == [OutlineEntry("Handwritten notes", 1, 2)]


def test_illegible_scans_add_nothing():
    extracted = Extracted(parser="image", parser_version="x", page_count=1)
    assert merge_readings(extracted, {1: PageReading(legible=False, blocks=[])}) == []
