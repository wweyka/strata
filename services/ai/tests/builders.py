"""Small, real files built in memory for extraction tests (no binary fixtures in the repo)."""

import io
import zipfile

from PIL import Image


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_pdf(pages: list[list[str] | Image.Image], outline: list[tuple[str, int]] = ()) -> bytes:
    """A PDF whose pages hold Helvetica text lines, or a single picture (a "scan").

    `outline` is a flat list of (bookmark title, zero-based page index).
    """
    objects: list[bytes] = []

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects)

    catalog = add(b"")  # filled in at the end
    pages_obj = add(b"")
    font = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    page_ids: list[int] = []
    for page in pages:
        resources = f"/Font << /F1 {font} 0 R >>"
        if isinstance(page, Image.Image):
            buffer = io.BytesIO()
            page.convert("RGB").save(buffer, format="JPEG", quality=80)
            data = buffer.getvalue()
            image = add(
                f"<< /Type /XObject /Subtype /Image /Width {page.width} /Height {page.height} /ColorSpace /DeviceRGB "
                f"/BitsPerComponent 8 /Filter /DCTDecode /Length {len(data)} >>\nstream\n".encode()
                + data
                + b"\nendstream"
            )
            resources += f" /XObject << /Im1 {image} 0 R >>"
            stream = b"q 450 0 0 600 80 100 cm /Im1 Do Q"
        else:
            body = " T* ".join(f"({_escape(line)}) Tj" for line in page)
            stream = f"BT /F1 11 Tf 14 TL 72 740 Td {body} ET".encode("latin-1")
        content = add(f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream")
        page_ids.append(
            add(
                f"<< /Type /Page /Parent {pages_obj} 0 R /MediaBox [0 0 612 792] /Resources << {resources} >> "
                f"/Contents {content} 0 R >>".encode()
            )
        )
    objects[pages_obj - 1] = (
        f"<< /Type /Pages /Kids [{' '.join(f'{p} 0 R' for p in page_ids)}] /Count {len(page_ids)} >>".encode()
    )

    outline_ref = ""
    if outline:
        root = add(b"")
        first = len(objects) + 1
        ids = list(range(first, first + len(outline)))
        for index, (title, page_index) in enumerate(outline):
            links = f"/Parent {root} 0 R"
            if index > 0:
                links += f" /Prev {ids[index - 1]} 0 R"
            if index < len(outline) - 1:
                links += f" /Next {ids[index + 1]} 0 R"
            add(
                f"<< /Title ({_escape(title)}) {links} /Dest [{page_ids[page_index]} 0 R /XYZ 0 792 0] >>".encode()
            )
        objects[root - 1] = (
            f"<< /Type /Outlines /First {ids[0]} 0 R /Last {ids[-1]} 0 R /Count {len(ids)} >>".encode()
        )
        outline_ref = f" /Outlines {root} 0 R"
    objects[catalog - 1] = f"<< /Type /Catalog /Pages {pages_obj} 0 R{outline_ref} >>".encode()

    out = io.BytesIO()
    out.write(b"%PDF-1.7\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(f"{number} 0 obj\n".encode() + body + b"\nendobj\n")
    xref = out.tell()
    out.write(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets:
        out.write(f"{offset:010d} 00000 n \n".encode())
    out.write(
        f"trailer\n<< /Size {len(objects) + 1} /Root {catalog} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    )
    return out.getvalue()


def scan_image(width: int = 300, height: int = 400) -> Image.Image:
    image = Image.new("RGB", (width, height), "white")
    for y in range(40, height - 40, 24):
        for x in range(30, width - 30):
            image.putpixel((x, y), (20, 20, 20))
    return image


def make_epub(chapters: list[tuple[str, str]]) -> bytes:
    """An EPUB with one XHTML file per (title, body html) chapter."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        archive.writestr(
            "META-INF/container.xml",
            '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
            '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>'
            "</rootfiles></container>",
        )
        manifest = "".join(
            f'<item id="c{i}" href="c{i}.xhtml" media-type="application/xhtml+xml"/>'
            for i in range(len(chapters))
        )
        spine = "".join(f'<itemref idref="c{i}"/>' for i in range(len(chapters)))
        archive.writestr(
            "OEBPS/content.opf",
            '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0">'
            f"<manifest>{manifest}</manifest><spine>{spine}</spine></package>",
        )
        for i, (title, body) in enumerate(chapters):
            archive.writestr(
                f"OEBPS/c{i}.xhtml",
                f'<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>{title}</h1>{body}</body></html>',
            )
    return buffer.getvalue()
