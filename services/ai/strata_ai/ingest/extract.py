"""Turn an uploaded file into ordered text blocks with page numbers and headings.

Pages without a usable text layer (scans, photos) are returned as images for the OCR step,
so every format ends up as the same list of blocks.
"""

import io
import re
import statistics
import warnings
import zipfile
from collections import Counter
from dataclasses import dataclass, field
from posixpath import dirname, join, normpath
from typing import Literal
from urllib.parse import unquote

BlockKind = Literal["text", "ocr", "figure", "table"]

# A page with fewer characters than this is treated as a scan and sent to OCR.
MIN_TEXT_CHARS = 40
# Long edge of page images sent for OCR: legible for dense print, about 4K input tokens.
OCR_LONG_EDGE = 1800


class UnsupportedFormat(ValueError):
    """The file type can't be read yet."""


class UnreadableFile(ValueError):
    """The file is damaged, encrypted, or not what its type says."""


@dataclass
class Block:
    text: str
    page: int | None = None
    heading_path: tuple[str, ...] = ()
    kind: BlockKind = "text"
    heading_level: int | None = None  # set when the block is itself a heading


@dataclass
class OutlineEntry:
    title: str
    level: int  # 1 = top level
    page: int | None


@dataclass
class PageImage:
    page: int
    data: bytes
    media_type: str


@dataclass
class Extracted:
    parser: str
    parser_version: str
    page_count: int | None
    blocks: list[Block] = field(default_factory=list)
    outline: list[OutlineEntry] = field(default_factory=list)
    ocr_pages: list[PageImage] = field(default_factory=list)
    pages_with_text: set[int] = field(default_factory=set)
    scans_skipped: list[int] = field(default_factory=list)


PDF = "application/pdf"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
EPUB = "application/epub+zip"
IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/heic"}

SUPPORTED_TYPES = {PDF, DOCX, PPTX, EPUB, "text/html", "text/plain", "text/markdown", *IMAGE_TYPES}


def extract(data: bytes, mime_type: str, max_scans: int = 300) -> Extracted:
    """Text blocks and outline of a file. At most `max_scans` scanned pages are rendered for OCR;
    the numbers of the rest are listed in `scans_skipped`."""
    if mime_type == PDF:
        return extract_pdf(data, max_scans)
    if mime_type == DOCX:
        return extract_docx(data)
    if mime_type == PPTX:
        return extract_pptx(data, max_scans)
    if mime_type == EPUB:
        return extract_epub(data)
    if mime_type == "text/html":
        return extract_html(decode_text(data))
    if mime_type == "text/markdown":
        return extract_markdown(decode_text(data))
    if mime_type == "text/plain":
        return extract_plain(decode_text(data))
    if mime_type in IMAGE_TYPES:
        return extract_image(data)
    raise UnsupportedFormat(mime_type)


# ---------------------------------------------------------------- text helpers


def decode_text(data: bytes) -> str:
    from charset_normalizer import from_bytes

    if data.startswith(b"\xef\xbb\xbf"):
        return data[3:].decode("utf-8", errors="replace")
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        best = from_bytes(data).best()
        if best is None:
            raise UnreadableFile("the text encoding could not be detected") from None
        return str(best)


def clean(text: str) -> str:
    text = text.replace("­", "").replace("\x00", "").replace("￾", "")
    return re.sub(r"[ \t ]+", " ", text).strip()


def paragraphs(text: str) -> list[str]:
    """Split plain text into paragraphs, re-flowing hard-wrapped lines."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    parts = re.split(r"\n\s*\n", text)
    if len(parts) == 1:
        parts = _reflow(text.split("\n"))
    out = []
    for part in parts:
        joined = re.sub(r"(\w)-\n(\w)", r"\1\2", part)  # de-hyphenate line breaks
        joined = clean(joined.replace("\n", " "))
        if joined:
            out.append(joined)
    return out


def _reflow(lines: list[str]) -> list[str]:
    """Group lines into paragraphs when the text has no blank lines (typical of PDFs)."""
    lengths = [len(line.strip()) for line in lines if line.strip()]
    if not lengths:
        return []
    typical = statistics.median(lengths)
    groups: list[list[str]] = [[]]
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        groups[-1].append(stripped)
        short = len(stripped) < 0.7 * typical
        if short and stripped[-1:] in ".!?:;)»\"'":
            groups.append([])
    return ["\n".join(group) for group in groups if group]


# ---------------------------------------------------------------- PDF


def extract_pdf(data: bytes, max_scans: int = 300) -> Extracted:
    import pypdfium2 as pdfium
    import pypdfium2.raw as pdfium_c

    try:
        pdf = pdfium.PdfDocument(data)
    except pdfium.PdfiumError as exc:
        raise UnreadableFile("the PDF could not be opened (damaged or password-protected)") from exc

    result = Extracted(parser="pdfium", parser_version=str(pdfium.PYPDFIUM_INFO), page_count=len(pdf))
    try:
        for bookmark in pdf.get_toc(max_depth=4):
            title = clean(bookmark.get_title())
            dest = bookmark.get_dest()
            index = dest.get_index() if dest is not None else None
            if title:
                result.outline.append(
                    OutlineEntry(
                        title=title[:300],
                        level=bookmark.level + 1,
                        page=index + 1 if index is not None else None,
                    )
                )

        page_texts: list[list[str]] = []
        for index in range(len(pdf)):
            page = pdf[index]
            textpage = page.get_textpage()
            text = textpage.get_text_bounded() or ""
            textpage.close()
            lines = [line.strip() for line in text.replace("\r\n", "\n").split("\n")]
            chars = sum(len(line) for line in lines)
            if chars < MIN_TEXT_CHARS:
                # A scan: the page is an image with no text layer. Blank pages are skipped.
                if any(True for _ in page.get_objects(filter=[pdfium_c.FPDF_PAGEOBJ_IMAGE], max_depth=2)):
                    if len(result.ocr_pages) < max_scans:
                        result.ocr_pages.append(_render(page, index + 1))
                    else:
                        result.scans_skipped.append(index + 1)
                page_texts.append([])
            else:
                result.pages_with_text.add(index + 1)
                page_texts.append(lines)
            page.close()
    finally:
        pdf.close()

    entries = sorted(
        (e for e in result.outline if e.page is not None and e.level <= 3), key=lambda e: e.page or 0
    )
    titles = {_title_key(e.title) for e in entries}
    repeated = _running_heads(page_texts, protected=titles)
    stack: list[tuple[int, str]] = []

    def enter(entry: OutlineEntry) -> None:
        while stack and stack[-1][0] >= entry.level:
            stack.pop()
        stack.append((entry.level, entry.title))

    def flush(buffer: list[str], number: int) -> None:
        for paragraph in paragraphs("\n".join(buffer)):
            result.blocks.append(Block(text=paragraph, page=number, heading_path=_titles(stack)))
        buffer.clear()

    position = 0
    for number, lines in enumerate(page_texts, start=1):
        kept = [
            line
            for line in lines
            if line and not _is_running_head(line, repeated) and not _is_page_number(line)
        ]
        here: list[OutlineEntry] = []
        while position < len(entries) and (entries[position].page or 0) <= number:
            here.append(entries[position])
            position += 1
        # Bookmarks whose heading is printed on the page start where it appears; the rest at the top.
        printed = {_title_key(line) for line in kept}
        for entry in [e for e in here if _title_key(e.title) not in printed]:
            enter(entry)
        waiting = [e for e in here if _title_key(e.title) in printed]
        buffer: list[str] = []
        for line in kept:
            if waiting and _title_key(line) == _title_key(waiting[0].title):
                flush(buffer, number)
                entry = waiting.pop(0)
                enter(entry)
                result.blocks.append(
                    Block(text=line, page=number, heading_path=_titles(stack), heading_level=entry.level)
                )
            else:
                buffer.append(line)
        flush(buffer, number)
    return result


def _title_key(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip(" .:").lower()


def outline_paths(
    outline: list[OutlineEntry], page_count: int, max_level: int = 3
) -> dict[int, tuple[str, ...]]:
    """The chapter path each page falls under, from a PDF's bookmarks (page granularity)."""
    entries = sorted(
        (e for e in outline if e.page is not None and e.level <= max_level),
        key=lambda e: e.page or 0,
    )
    paths: dict[int, tuple[str, ...]] = {}
    stack: list[tuple[int, str]] = []
    position = 0
    for number in range(1, page_count + 1):
        while position < len(entries) and (entries[position].page or 0) <= number:
            entry = entries[position]
            while stack and stack[-1][0] >= entry.level:
                stack.pop()
            stack.append((entry.level, entry.title))
            position += 1
        paths[number] = _titles(stack)
    return paths


def _render(page, number: int) -> PageImage:
    width, height = page.get_size()
    scale = OCR_LONG_EDGE / max(width, height, 1)
    image = page.render(scale=scale).to_pil().convert("RGB")
    return PageImage(page=number, data=_jpeg(image), media_type="image/jpeg")


def _normal(line: str) -> str:
    return re.sub(r"\d+", "#", line.strip().lower())


def _is_page_number(line: str) -> bool:
    return bool(re.fullmatch(r"[-–—\s]*(\d{1,4}|[ivxlcdm]{1,6})[-–—\s]*", line.strip().lower()))


def _running_heads(pages: list[list[str]], protected: set[str] = frozenset()) -> set[str]:
    """Header and footer lines repeated on many pages (book titles, chapter names, page numbers).

    Short lines are compared with their numbers masked ("Chapter 3 · 41"), longer ones exactly.
    Lines that are a bookmarked heading are never treated as running heads.
    """
    with_text = [lines for lines in pages if lines]
    if len(with_text) < 6:
        return set()
    counts: Counter[str] = Counter()
    for lines in with_text:
        present = [line for line in lines if line]
        edges = present[:2] + present[-2:]
        counts.update({_head_key(line) for line in edges if _title_key(line) not in protected})
    threshold = max(3, int(len(with_text) * 0.4))
    return {line for line, count in counts.items() if count >= threshold and len(line) < 120}


def _head_key(line: str) -> str:
    return _normal(line) if len(line.strip()) <= 60 else line.strip().lower()


def _is_running_head(line: str, repeated: set[str]) -> bool:
    return bool(repeated) and _head_key(line) in repeated


# ---------------------------------------------------------------- images


def _jpeg(image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85, optimize=True)
    return buffer.getvalue()


def extract_image(data: bytes) -> Extracted:
    from PIL import Image, ImageOps, UnidentifiedImageError
    from pillow_heif import register_heif_opener

    register_heif_opener()
    try:
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image).convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise UnreadableFile("the image could not be opened") from exc
    image.thumbnail((OCR_LONG_EDGE, OCR_LONG_EDGE))
    result = Extracted(parser="image", parser_version="1", page_count=1)
    result.ocr_pages.append(PageImage(page=1, data=_jpeg(image), media_type="image/jpeg"))
    return result


# ---------------------------------------------------------------- Word


HEADING_STYLE = re.compile(r"^(?:heading|заголовок|título|titulo)\s*(\d)$", re.IGNORECASE)


def extract_docx(data: bytes) -> Extracted:
    import docx
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    try:
        document = docx.Document(io.BytesIO(data))
    except (zipfile.BadZipFile, KeyError, ValueError) as exc:
        raise UnreadableFile("the Word file could not be opened") from exc

    result = Extracted(parser="python-docx", parser_version=_version("python-docx"), page_count=None)
    path: list[tuple[int, str]] = []
    for item in document.iter_inner_content():
        if isinstance(item, Paragraph):
            text = clean(item.text)
            if not text:
                continue
            level = _docx_heading_level(item)
            if level is not None:
                path = [entry for entry in path if entry[0] < level] + [(level, text[:300])]
                result.outline.append(OutlineEntry(title=text[:300], level=level, page=None))
                result.blocks.append(Block(text=text, heading_path=_titles(path), heading_level=level))
            else:
                result.blocks.append(Block(text=text, heading_path=_titles(path)))
        elif isinstance(item, Table):
            rows = []
            for row in item.rows:
                cells = [clean(cell.text) for cell in row.cells]
                if any(cells):
                    rows.append(" | ".join(cells))
            if rows:
                result.blocks.append(Block(text="\n".join(rows), heading_path=_titles(path), kind="table"))
    return result


def _docx_heading_level(paragraph) -> int | None:
    name = (paragraph.style.name if paragraph.style is not None else "") or ""
    if name.lower() == "title":
        return 1
    match = HEADING_STYLE.match(name.strip())
    if match:
        return min(int(match.group(1)), 6)
    return None


def _titles(path: list[tuple[int, str]]) -> tuple[str, ...]:
    return tuple(title for _, title in path)


# ---------------------------------------------------------------- PowerPoint


def extract_pptx(data: bytes, max_scans: int = 300) -> Extracted:
    from pptx import Presentation
    from pptx.enum.shapes import MSO_SHAPE_TYPE, PP_PLACEHOLDER

    try:
        deck = Presentation(io.BytesIO(data))
    except (zipfile.BadZipFile, KeyError, ValueError) as exc:
        raise UnreadableFile("the presentation could not be opened") from exc

    slides = list(deck.slides)
    result = Extracted(parser="python-pptx", parser_version=_version("python-pptx"), page_count=len(slides))
    for number, slide in enumerate(slides, start=1):
        title = ""
        texts: list[str] = []
        pictures: list[bytes] = []
        for shape in slide.shapes:
            if shape.is_placeholder and shape.placeholder_format.type in (
                PP_PLACEHOLDER.TITLE,
                PP_PLACEHOLDER.CENTER_TITLE,
            ):
                title = clean(shape.text_frame.text) if shape.has_text_frame else ""
                continue
            if shape.has_text_frame:
                for paragraph in shape.text_frame.paragraphs:
                    text = clean("".join(run.text for run in paragraph.runs))
                    if text:
                        texts.append(text)
            elif getattr(shape, "has_table", False) and shape.has_table:
                rows = [" | ".join(clean(cell.text) for cell in row.cells) for row in shape.table.rows]
                texts.append("\n".join(row for row in rows if row.strip(" |")))
            elif shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                pictures.append(shape.image.blob)
        heading = (title,) if title else ()
        if title:
            result.blocks.append(Block(text=title, page=number, heading_path=heading, heading_level=2))
        for text in texts:
            result.blocks.append(Block(text=text, page=number, heading_path=heading))
        if slide.has_notes_slide:
            notes = clean(slide.notes_slide.notes_text_frame.text)
            if notes:
                result.blocks.append(Block(text=notes, page=number, heading_path=heading))
        if title or texts:
            result.pages_with_text.add(number)
        body_chars = sum(len(text) for text in texts)
        if body_chars < MIN_TEXT_CHARS and pictures and len(result.ocr_pages) >= max_scans:
            result.scans_skipped.append(number)
        elif body_chars < MIN_TEXT_CHARS and pictures:
            largest = max(pictures, key=len)
            try:
                image_page = extract_image(largest).ocr_pages[0]
                result.ocr_pages.append(
                    PageImage(page=number, data=image_page.data, media_type=image_page.media_type)
                )
            except UnreadableFile:
                pass
    return result


# ---------------------------------------------------------------- HTML, EPUB, Markdown, plain text


CONTAINERS = ["p", "li", "pre", "blockquote", "table"]


def _html_blocks(
    markup: str, page: int | None, path: list[tuple[int, str]]
) -> tuple[list[Block], list[OutlineEntry]]:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(markup, "html.parser")
    for tag in soup(["script", "style", "nav", "header", "footer", "noscript", "svg"]):
        tag.decompose()
    blocks: list[Block] = []
    outline: list[OutlineEntry] = []
    root = soup.body or soup
    for element in root.find_all(["h1", "h2", "h3", "h4", "h5", "h6", *CONTAINERS]):
        # Text inside a list item, quote or table is taken once, with its container.
        if element.find_parent(CONTAINERS) is not None:
            continue
        if element.name == "table":
            rows = [
                " | ".join(clean(cell.get_text(" ")) for cell in row.find_all(["td", "th"]))
                for row in element.find_all("tr")
            ]
            text = "\n".join(row for row in rows if row.strip(" |"))
            if text:
                blocks.append(Block(text=text, page=page, heading_path=_titles(path), kind="table"))
            continue
        text = clean(element.get_text(" "))
        if not text:
            continue
        if element.name[0] == "h":
            level = int(element.name[1])
            path[:] = [entry for entry in path if entry[0] < level] + [(level, text[:300])]
            outline.append(OutlineEntry(title=text[:300], level=level, page=page))
            blocks.append(Block(text=text, page=page, heading_path=_titles(path), heading_level=level))
        else:
            blocks.append(Block(text=text, page=page, heading_path=_titles(path)))
    return blocks, outline


def extract_html(markup: str) -> Extracted:
    result = Extracted(parser="html", parser_version="1", page_count=None)
    result.blocks, result.outline = _html_blocks(markup, None, [])
    return result


def extract_epub(data: bytes) -> Extracted:
    from bs4 import XMLParsedAsHTMLWarning

    # EPUB metadata and XHTML are XML; the forgiving HTML parser reads them fine.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", XMLParsedAsHTMLWarning)
        return _extract_epub(data)


def _extract_epub(data: bytes) -> Extracted:
    from bs4 import BeautifulSoup

    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
        container = BeautifulSoup(archive.read("META-INF/container.xml"), "html.parser")
        opf_path = container.find("rootfile")["full-path"]
        opf = BeautifulSoup(archive.read(opf_path), "html.parser")
    except (zipfile.BadZipFile, KeyError, TypeError) as exc:
        raise UnreadableFile("the EPUB could not be opened") from exc

    base = dirname(opf_path)
    manifest = {item.get("id"): item.get("href") for item in opf.find_all("item")}
    spine = [manifest.get(ref.get("idref")) for ref in opf.find_all("itemref")]
    result = Extracted(parser="epub", parser_version="1", page_count=None)
    path: list[tuple[int, str]] = []
    for href in spine:
        if not href:
            continue
        href = unquote(href.split("#", 1)[0])
        name = normpath(join(base, href)) if base else href
        try:
            markup = archive.read(name).decode("utf-8", errors="replace")
        except KeyError:
            continue
        blocks, outline = _html_blocks(markup, None, path)
        result.blocks.extend(blocks)
        result.outline.extend(entry for entry in outline if entry.level <= 2)
    if not result.blocks:
        raise UnreadableFile("the EPUB has no readable text (it may be protected by DRM)")
    return result


def extract_markdown(text: str) -> Extracted:
    result = Extracted(parser="markdown", parser_version="1", page_count=None)
    path: list[tuple[int, str]] = []
    buffer: list[str] = []
    code: list[str] | None = None  # lines of an open ``` block, kept verbatim

    def flush() -> None:
        if buffer:
            for paragraph in paragraphs("\n".join(buffer)):
                result.blocks.append(Block(text=paragraph, heading_path=_titles(path)))
            buffer.clear()

    for line in text.replace("\r\n", "\n").split("\n"):
        if line.strip().startswith("```"):
            if code is None:
                flush()
                code = []
            else:
                if "\n".join(code).strip():
                    result.blocks.append(Block(text="\n".join(code).strip("\n"), heading_path=_titles(path)))
                code = None
            continue
        if code is not None:
            code.append(line.rstrip())
            continue
        match = re.match(r"^(#{1,6})\s+(.+?)\s*#*\s*$", line)
        if match:
            flush()
            level = len(match.group(1))
            title = clean(match.group(2))[:300]
            path = [entry for entry in path if entry[0] < level] + [(level, title)]
            result.outline.append(OutlineEntry(title=title, level=level, page=None))
            result.blocks.append(Block(text=title, heading_path=_titles(path), heading_level=level))
        elif not line.strip():
            buffer.append("")
            flush()
        else:
            buffer.append(line)
    flush()
    if code:
        result.blocks.append(Block(text="\n".join(code).strip("\n"), heading_path=_titles(path)))
    return result


def extract_plain(text: str) -> Extracted:
    result = Extracted(parser="text", parser_version="1", page_count=None)
    result.blocks = [Block(text=paragraph) for paragraph in paragraphs(text)]
    return result


def _version(package: str) -> str:
    from importlib.metadata import PackageNotFoundError, version

    try:
        return version(package)
    except PackageNotFoundError:
        return "unknown"
