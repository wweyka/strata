import io

import pytest
from PIL import Image

from strata_ai.ingest.extract import (
    DOCX,
    EPUB,
    PDF,
    PPTX,
    UnreadableFile,
    UnsupportedFormat,
    decode_text,
    extract,
    paragraphs,
)
from tests.builders import make_epub, make_pdf, scan_image

BODY = [
    "Routers forward packets between networks using the destination",
    "address in each packet header. They keep a routing table that maps",
    "network prefixes to next hops.",
]


def test_pdf_text_bookmarks_and_scans():
    pdf = make_pdf(
        [
            ["Networks Handbook", *BODY],
            ["Chapter 2 Addressing", "An IPv4 address has 32 bits and is written as four decimal numbers."],
            scan_image(),
            [
                "Chapter 3 Switching",
                "A switch forwards frames inside one local network segment by MAC address.",
            ],
        ],
        outline=[("Chapter 1 Routing", 0), ("Chapter 2 Addressing", 1), ("Chapter 3 Switching", 3)],
    )
    result = extract(pdf, PDF)
    assert result.page_count == 4
    assert [(e.title, e.page) for e in result.outline] == [
        ("Chapter 1 Routing", 1),
        ("Chapter 2 Addressing", 2),
        ("Chapter 3 Switching", 4),
    ]
    assert [page.page for page in result.ocr_pages] == [3]
    assert result.ocr_pages[0].media_type == "image/jpeg"
    assert result.pages_with_text == {1, 2, 4}
    # Lines of one paragraph are joined; each block knows its page and chapter.
    first = result.blocks[0]
    assert "destination address in each packet header" in first.text
    assert first.page == 1 and first.heading_path == ("Chapter 1 Routing",)
    assert result.blocks[-1].heading_path == ("Chapter 3 Switching",)
    # A bookmarked heading printed on the page becomes a heading block where it appears.
    heading = next(b for b in result.blocks if b.text == "Chapter 2 Addressing")
    assert heading.heading_level == 1 and heading.page == 2


def test_pdf_chapter_titles_are_not_mistaken_for_running_heads():
    pages = []
    outline = []
    for n in range(1, 4):
        outline.append((f"Chapter {n}", len(pages)))
        pages.append([f"Chapter {n}", f"Opening text of part {n} with enough words to count as a paragraph."])
        pages.append([f"More text for part {n}, explaining the subject at length and in detail."])
    result = extract(make_pdf(pages, outline), PDF)
    assert [b.text for b in result.blocks if b.heading_level] == ["Chapter 1", "Chapter 2", "Chapter 3"]


def test_pdf_scan_cap_lists_skipped_pages():
    pdf = make_pdf([scan_image(), scan_image(), scan_image()])
    result = extract(pdf, PDF, max_scans=2)
    assert [page.page for page in result.ocr_pages] == [1, 2]
    assert result.scans_skipped == [3]


def test_pdf_running_heads_and_page_numbers_are_removed():
    ideas = [
        "routing tables",
        "subnet masks",
        "switch fabrics",
        "address resolution",
        "port numbers",
        "checksums",
    ]
    pages = [
        ["Networks Handbook", f"This page explains {idea} in detail for beginners.", str(n)]
        for n, idea in enumerate(ideas)
    ]
    result = extract(make_pdf(pages), PDF)
    text = " ".join(block.text for block in result.blocks)
    assert "Networks Handbook" not in text
    assert "This page explains address resolution in detail" in text
    assert not any(block.text.strip().isdigit() for block in result.blocks)


def test_damaged_pdf_is_unreadable():
    with pytest.raises(UnreadableFile):
        extract(b"%PDF-1.7 this is not really a pdf", PDF)


def test_docx_headings_paragraphs_and_tables():
    import docx

    document = docx.Document()
    document.add_heading("Photosynthesis", level=1)
    document.add_paragraph("Plants convert light energy into chemical energy.")
    document.add_heading("Light reactions", level=2)
    document.add_paragraph("They happen in the thylakoid membranes.")
    table = document.add_table(rows=2, cols=2)
    table.cell(0, 0).text, table.cell(0, 1).text = "Stage", "Place"
    table.cell(1, 0).text, table.cell(1, 1).text = "Calvin cycle", "Stroma"
    buffer = io.BytesIO()
    document.save(buffer)

    result = extract(buffer.getvalue(), DOCX)
    assert [(e.title, e.level) for e in result.outline] == [("Photosynthesis", 1), ("Light reactions", 2)]
    body = [b for b in result.blocks if b.heading_level is None]
    assert body[0].text == "Plants convert light energy into chemical energy."
    assert body[1].heading_path == ("Photosynthesis", "Light reactions")
    assert body[2].kind == "table" and "Calvin cycle | Stroma" in body[2].text


def test_pptx_slides_titles_notes_and_picture_slides():
    from pptx import Presentation
    from pptx.util import Inches

    deck = Presentation()
    slide = deck.slides.add_slide(deck.slide_layouts[1])
    slide.shapes.title.text = "The OSI model"
    slide.placeholders[1].text = "Seven layers from physical to application."
    slide.notes_slide.notes_text_frame.text = "Mention that TCP/IP has four layers."
    picture_slide = deck.slides.add_slide(deck.slide_layouts[6])
    image = io.BytesIO()
    scan_image().save(image, format="PNG")
    image.seek(0)
    picture_slide.shapes.add_picture(image, Inches(1), Inches(1))
    buffer = io.BytesIO()
    deck.save(buffer)

    result = extract(buffer.getvalue(), PPTX)
    assert result.page_count == 2
    texts = [b.text for b in result.blocks]
    assert texts[0] == "The OSI model" and result.blocks[0].heading_level == 2
    assert "Seven layers from physical to application." in texts
    assert "Mention that TCP/IP has four layers." in texts
    assert [p.page for p in result.ocr_pages] == [2]


def test_epub_follows_the_spine():
    epub = make_epub(
        [
            ("Cells", "<p>The cell is the basic unit of life.</p>"),
            (
                "Tissues",
                "<h2>Epithelium</h2><p>Epithelial tissue covers surfaces.</p><ul><li>Simple</li></ul>",
            ),
        ]
    )
    result = extract(epub, EPUB)
    texts = [b.text for b in result.blocks]
    assert texts == ["Cells", "The cell is the basic unit of life.", "Tissues", "Epithelium",
                     "Epithelial tissue covers surfaces.", "Simple"]  # fmt: skip
    assert result.blocks[4].heading_path == ("Tissues", "Epithelium")


def test_epub_without_text_is_unreadable():
    with pytest.raises(UnreadableFile):
        extract(make_epub([("", "")]), EPUB)


def test_markdown_headings_and_code():
    text = "# Sorting\n\nQuicksort picks a pivot.\n\n## Complexity\n\n```\nO(n log n)\n\nworst O(n^2)\n```\n"
    result = extract(text.encode(), "text/markdown")
    assert [(e.title, e.level) for e in result.outline] == [("Sorting", 1), ("Complexity", 2)]
    # Code keeps its line breaks and is not split into paragraphs.
    assert result.blocks[-1].text == "O(n log n)\n\nworst O(n^2)"
    assert result.blocks[-1].heading_path == ("Sorting", "Complexity")


def test_html_skips_scripts_and_nested_duplicates():
    html = (
        "<html><head><script>steal()</script></head><body><h1>Ohm's law</h1>"
        "<p>V equals I times R.</p><ul><li><p>Nested</p></li></ul></body></html>"
    )
    result = extract(html.encode(), "text/html")
    texts = [b.text for b in result.blocks]
    assert "steal()" not in " ".join(texts)
    assert texts.count("Nested") == 1


def test_plain_text_in_other_encodings():
    russian = "Закон Ома: сила тока прямо пропорциональна напряжению.\n\nВторой абзац."
    assert decode_text(russian.encode("cp1251")) == russian
    result = extract(russian.encode("utf-8-sig"), "text/plain")
    assert [b.text for b in result.blocks] == russian.split("\n\n")


def test_hard_wrapped_text_is_reflowed():
    wrapped = "\n".join(BODY + ["", "Second paragraph."])
    assert paragraphs(wrapped)[0].startswith(
        "Routers forward packets between networks using the destination address"
    )


def test_photo_becomes_a_page_to_read():
    buffer = io.BytesIO()
    Image.new("RGB", (4000, 3000), "white").save(buffer, format="PNG")
    result = extract(buffer.getvalue(), "image/png")
    assert result.page_count == 1 and len(result.ocr_pages) == 1
    image = Image.open(io.BytesIO(result.ocr_pages[0].data))
    assert max(image.size) <= 1800


def test_unsupported_format():
    with pytest.raises(UnsupportedFormat):
        extract(b"{\\rtf1}", "application/rtf")


def test_app_and_pipeline_agree_on_file_types():
    """The app's upload allowlist must list exactly what the pipeline can read."""
    from pathlib import Path

    from strata_ai.ingest.extract import SUPPORTED_TYPES

    shared = Path(__file__).resolve().parents[3] / "packages/shared/src/materials.ts"
    source = shared.read_text()
    block = source.split("ACCEPTED_MATERIAL_TYPES", 1)[1].split("};", 1)[0]
    import re

    assert set(re.findall(r"'([a-z]+/[a-z0-9.+-]+)':", block)) == SUPPORTED_TYPES
