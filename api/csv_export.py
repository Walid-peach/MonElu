"""
api/csv_export.py
Shared CSV response builder for the export endpoints (MON-97).

Conventions (chosen for Excel/LibreOffice compatibility):
- UTF-8 with BOM (U+FEFF) so Excel detects the encoding (accents in names/titles).
- RFC 4180: comma delimiter, CRLF line endings, minimal quoting.
"""

import csv
import io
from collections.abc import Iterable, Iterator

from fastapi.responses import StreamingResponse

UTF8_BOM = chr(0xFEFF)


def _iter_csv(fieldnames: list[str], rows: Iterable[dict]) -> Iterator[str]:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames, extrasaction="ignore")

    writer.writeheader()
    yield UTF8_BOM + buffer.getvalue()
    for row in rows:
        buffer.seek(0)
        buffer.truncate()
        writer.writerow(row)
        yield buffer.getvalue()


def csv_response(fieldnames: list[str], rows: Iterable[dict], filename: str) -> StreamingResponse:
    """Build a text/csv attachment response from already-fetched rows."""
    return StreamingResponse(
        _iter_csv(fieldnames, rows),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
