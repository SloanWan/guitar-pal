"""
PP-OCR with something in front or behind it (#375): a layout model that finds
the notation so its digits stay out of the prose, a vision model that reads
again the lines PP-OCR is unsure of, and a text model that corrects the page
from context. Each variant is one engine in `engines.py`, scored like the rest.

The mask itself (`looks_like_prose`, `keep_lines`, the notation classes per
layout model) is what the scan ships, in `app/ingest/ocr.py` (#417); variant A
with CDLA is exactly the scan's reading.
"""

import base64
import os
import re
from collections.abc import Callable
from dataclasses import dataclass, field

import cv2
import pymupdf
from rapidfuzz.distance import Levenshtein

from app.ingest.model import CallUsage, usage_of
from app.ingest.ocr import (
    OCR_DPI,
    Line,
    build_ocr,
    keep_lines,
    notation_regions,
    ocr_lines,
    page_bgr,
)


@dataclass
class Read:
    """One page's reading, with what it cost and what the variant did."""

    text: str
    cost_usd: float = 0.0
    detail: dict = field(default_factory=dict)


# ─── B. read again the lines PP-OCR is unsure of ──────────────────────────────

REREAD_SYSTEM = """You read single lines cut from a scanned page of a guitar method book \
(Chinese or English). Each image is one printed line; the OCR's guess is given beside it and \
may be wrong. Transcribe exactly what is printed — same characters, same script (simplified \
stays simplified), same punctuation. Do not translate or complete anything. Answer with one \
line per image, numbered as the images are: `1: …`."""

# A line's crop is read sharper than the OCR saw it.
REREAD_DPI = 300


def reread(
    client,
    model: str,
    page: pymupdf.Page,
    lines: list[Line],
    threshold: float,
) -> tuple[list[Line], CallUsage | None, dict]:
    """
    The lines with those under `threshold` read again from their crops, in one
    call; with how many were sent, how many came back different, and whether
    the model refused (Claude has, on a page of upside-down prose — the OCR's
    reading then stands).
    """
    unsure = [i for i, line in enumerate(lines) if line.score < threshold]
    if not unsure:
        return lines, None, {"lines_reread": 0, "lines_changed": 0}
    scale = REREAD_DPI / OCR_DPI
    sharp = page_bgr(page, REREAD_DPI)
    content: list[dict] = []
    for n, i in enumerate(unsure, start=1):
        x0, y0, x1, y1 = (round(v * scale) for v in lines[i].box)
        pad = 6
        crop = sharp[max(0, y0 - pad) : y1 + pad, max(0, x0 - pad) : x1 + pad]
        ok, png = cv2.imencode(".png", crop)
        if not ok:
            continue
        content.append({"type": "text", "text": f"{n}. OCR read: {lines[i].text}"})
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": base64.b64encode(png.tobytes()).decode(),
                },
            }
        )
    response = client.messages.create(
        model=model,
        max_tokens=4096,
        system=REREAD_SYSTEM,
        messages=[{"role": "user", "content": content}],
    )
    usage = usage_of(response, model)
    if response.stop_reason == "refusal":
        return lines, usage, {"lines_reread": len(unsure), "lines_changed": 0, "refused": True}
    text = "".join(b.text for b in response.content if b.type == "text")
    answers = {}
    for row in text.splitlines():
        m = re.match(r"\s*(\d+)\s*[:.：]\s?(.*)$", row)
        if m:
            answers[int(m.group(1))] = m.group(2).strip()
    out = list(lines)
    changed = 0
    for n, i in enumerate(unsure, start=1):
        new = answers.get(n)
        if new is not None and new != lines[i].text:
            out[i] = Line(new, 1.0, lines[i].box)
            changed += 1
    return out, usage, {"lines_reread": len(unsure), "lines_changed": changed}


# ─── C. correct the page's text from context ──────────────────────────────────

CORRECT_SYSTEM = """You get the OCR text of one scanned page of a guitar method book \
(Chinese or English). Fix only obvious OCR errors: a character swapped for a look-alike \
(弦 read as 玫), broken punctuation, a word split by a stray space. Do not rewrite, reorder, \
translate, summarise, add or remove anything else; keep the script (simplified stays \
simplified) and the line breaks. If a line is not prose (numbers, chord names), leave it as \
it is. Output only the corrected text."""


# DeepSeek spends its reasoning inside max_tokens (calibration §10): without
# room on top it can end at the cap with nothing written.
THINKING_ROOM = {"deepseek-flash": 24_576}


def correct(client, model: str, text: str) -> tuple[str, CallUsage, bool]:
    """The corrected text, its usage, and whether the model finished; else `text` back."""
    with client.messages.stream(
        model=model,
        max_tokens=8192 + THINKING_ROOM.get(model, 0),
        system=CORRECT_SYSTEM,
        messages=[{"role": "user", "content": text}],
    ) as stream:
        response = stream.get_final_message()
    out = "".join(b.text for b in response.content if b.type == "text").strip()
    usage = usage_of(response, model)
    if response.stop_reason != "end_turn" or not out:
        return text, usage, False
    return out, usage, True


def _client(provider: str):
    from anthropic import Anthropic

    if provider == "deepseek":
        return Anthropic(
            api_key=os.environ["DEEPSEEK_API_KEY"], base_url="https://api.deepseek.com/anthropic"
        )
    return Anthropic()


def pipeline(
    *,
    layout: str | None,
    mask: str = "notation_lines",
    reread_with: tuple[str, str] | None = None,
    reread_below: float = 0.85,
    correct_with: tuple[str, str] | None = None,
) -> Callable[[], Callable[[pymupdf.Page], Read]]:
    """
    A PP-OCRv6 tiny engine with the given layers. `reread_with` and
    `correct_with` are (provider, model): ("anthropic", "claude-sonnet-5"),
    ("deepseek", "deepseek-flash").
    """

    def build() -> Callable[[pymupdf.Page], Read]:
        ocr = build_ocr("PP-OCRv6", "tiny")
        layout_engine = None
        if layout:
            from rapid_layout import ModelType, RapidLayout

            layout_engine = RapidLayout(model_type=ModelType(layout))
        reread_client = _client(reread_with[0]) if reread_with else None
        correct_client = _client(correct_with[0]) if correct_with else None

        def read(page: pymupdf.Page) -> Read:
            image = page_bgr(page)
            lines = ocr_lines(ocr, image)
            detail: dict = {"lines": len(lines)}
            cost = 0.0
            if layout_engine is not None:
                regions = notation_regions(layout_engine, image, layout)
                kept = keep_lines(lines, regions, mask)
                detail.update(notation_regions=len(regions), lines_dropped=len(lines) - len(kept))
                lines = kept
            if reread_client is not None and reread_with is not None:
                lines, usage, outcome = reread(
                    reread_client, reread_with[1], page, lines, reread_below
                )
                detail.update(outcome)
                if usage:
                    cost += usage.cost_usd
            text = "\n".join(line.text for line in lines)
            if correct_client is not None and correct_with is not None:
                before = text
                text, usage, finished = correct(correct_client, correct_with[1], text)
                cost += usage.cost_usd
                if not finished:
                    detail["correction_failed"] = True
                detail["chars_changed_by_correction"] = Levenshtein.distance(before, text)
            return Read(text=text, cost_usd=cost, detail=detail)

        return read

    return build
