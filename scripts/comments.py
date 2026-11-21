"""Comment ratchet: the codebase carries no comments, and the count may only go down.

Comments are banned (see ADR-050). What a comment used to explain belongs in a
name, a test, a docstring an API consumer reads, or an ADR in docs/decisions.md.
`comment-baseline.json` records how many comment lines each file still carried
when the ban landed; `check` fails when a file goes above its allowance or
stays below it without the baseline being lowered, so the debt only shrinks.

    python scripts/comments.py check [--only PREFIX]   # CI and pre-commit
    python scripts/comments.py update                  # lower the baseline after deleting
    python scripts/comments.py list [PATH ...]         # every comment, for /delete-comment
    python scripts/comments.py strip PATH ...          # delete every comment under PATH
    python scripts/comments.py stats                   # totals by area and language

Directives that tools read (noqa, type: ignore, eslint-disable, pragma: allowlist
secret, dbt depends_on, shebangs...) are not comments and are never counted.
Python docstrings are string literals, not comments, and are not counted either.
JavaScript and TypeScript are read with the TypeScript compiler through
frontend/scripts/list-comments.mjs, so those files need `npm ci` in frontend/.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import subprocess
import sys
import tokenize
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE = ROOT / "comment-baseline.json"
JS_LISTER = ROOT / "frontend" / "scripts" / "list-comments.mjs"

EXCLUDED_PREFIXES = ("archive/",)

HASH_SUFFIXES = {".yml", ".yaml", ".sh", ".toml"}
HASH_NAMES = {"Makefile"}
JS_SUFFIXES = {".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx"}
C_SUFFIXES = {".swift", ".css"}

DIRECTIVE = re.compile(
    r"^\s*(?:"
    r"noqa\b|type:\s*ignore|pragma\b|fmt:\s*(?:on|off|skip)|ruff:|pylint:|mypy:"
    r"|eslint-|@ts-|prettier-ignore|istanbul ignore|c8 ignore|webpack\w*:"
    r"|swiftlint:|swift-format-ignore|periphery:"
    r"|shellcheck\b|yamllint\b|yaml-language-server:|zizmor:"
    r"|depends_on:|-\*-|<reference\b|@jest-environment|@refresh\b"
    r")",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Comment:
    path: str
    line: int
    text: str
    full_line: bool


def is_directive(body: str) -> bool:
    return bool(DIRECTIVE.match(body))


def strip_marker(text: str) -> str:
    text = text.strip()
    for marker in ("{#", "#}", "/**", "/*", "*/", "///", "//", "--", "#"):
        if text.startswith(marker):
            text = text[len(marker) :]
        if text.endswith(marker):
            text = text[: -len(marker)]
    return text.lstrip("*! ").strip()


def explode(path: str, line: int, block: str, source_lines: list[str]) -> list[Comment]:
    out = []
    first = strip_marker(block.splitlines()[0]) if block.strip() else ""
    if block.startswith("#!") or is_directive(first):
        return out
    for offset, raw in enumerate(block.splitlines()):
        number = line + offset
        full = True
        if offset == 0 and number - 1 < len(source_lines):
            physical = source_lines[number - 1]
            start = physical.find(raw.rstrip())
            full = start >= 0 and physical[:start].strip() in ("", "{")
        out.append(Comment(path, number, raw.rstrip(), full))
    return out


def python_comments(path: str, text: str) -> list[Comment]:
    lines = text.splitlines()
    out = []
    try:
        tokens = list(tokenize.generate_tokens(io.StringIO(text).readline))
    except (tokenize.TokenError, SyntaxError):
        return out
    for tok in tokens:
        if tok.type == tokenize.COMMENT:
            out += explode(path, tok.start[0], tok.string, lines)
    return out


def hash_comments(path: str, text: str) -> list[Comment]:
    lines = text.splitlines()
    out = []
    for number, line in enumerate(lines, start=1):
        position = hash_position(line)
        if position is not None:
            out += explode(path, number, line[position:], lines)
    return out


def hash_position(line: str) -> int | None:
    quote = None
    for index, char in enumerate(line):
        if quote:
            if char == quote:
                quote = None
            continue
        if char in "\"'":
            previous = line[index - 1] if index else " "
            if not previous.isalnum():
                quote = char
            continue
        if char == "#" and (index == 0 or line[index - 1] in " \t"):
            if line[index:].startswith("#!") and index == 0:
                return None
            return index
    return None


def c_like_comments(path: str, text: str, nested: bool, line_comments: bool) -> list[Comment]:
    out: list[Comment] = []
    lines = text.splitlines()
    i, n, line = 0, len(text), 1
    while i < n:
        char = text[i]
        if text.startswith('"""', i):
            end = text.find('"""', i + 3)
            end = n if end < 0 else end + 3
            line += text.count("\n", i, end)
            i = end
            continue
        if char == '"' or (char == "'" and path.endswith(".css")):
            j = i + 1
            while j < n and text[j] != char and text[j] != "\n":
                j += 2 if text[j] == "\\" else 1
            i = j + 1
            continue
        if line_comments and text.startswith("//", i):
            end = text.find("\n", i)
            end = n if end < 0 else end
            out += explode(path, line, text[i:end], lines)
            i = end
            continue
        if text.startswith("/*", i):
            depth, j = 1, i + 2
            while j < n and depth:
                if nested and text.startswith("/*", j):
                    depth, j = depth + 1, j + 2
                elif text.startswith("*/", j):
                    depth, j = depth - 1, j + 2
                else:
                    j += 1
            out += explode(path, line, text[i:j], lines)
            line += text.count("\n", i, j)
            i = j
            continue
        if char == "\n":
            line += 1
        i += 1
    return out


def sql_comments(path: str, text: str) -> list[Comment]:
    out: list[Comment] = []
    lines = text.splitlines()
    i, n, line = 0, len(text), 1
    while i < n:
        char = text[i]
        if char == "'":
            j = i + 1
            while j < n:
                if text[j] == "'" and text.startswith("''", j):
                    j += 2
                    continue
                if text[j] == "'":
                    break
                j += 1
            line += text.count("\n", i, j)
            i = j + 1
            continue
        for start, stop in (("--", "\n"), ("/*", "*/"), ("{#", "#}")):
            if text.startswith(start, i):
                end = text.find(stop, i + 2)
                end = n if end < 0 else end + (0 if stop == "\n" else len(stop))
                out += explode(path, line, text[i:end], lines)
                line += text.count("\n", i, end)
                i = end
                break
        else:
            if char == "\n":
                line += 1
            i += 1
    return out


def js_comments(paths: list[str]) -> dict[str, list[Comment]]:
    if not paths:
        return {}
    result: dict[str, list[Comment]] = {}
    for start in range(0, len(paths), 200):
        chunk = paths[start : start + 200]
        try:
            raw = subprocess.run(
                ["node", str(JS_LISTER), *chunk],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            ).stdout
        except (OSError, subprocess.CalledProcessError) as exc:
            detail = getattr(exc, "stderr", "") or exc
            raise SystemExit(
                f"Cannot read JavaScript/TypeScript comments ({detail}).\n"
                "Install Node and run `npm ci` in frontend/, or pass --only for another area."
            ) from None
        for path, blocks in json.loads(raw).items():
            lines = (ROOT / path).read_text(encoding="utf-8").splitlines()
            comments: list[Comment] = []
            for block in blocks:
                comments += explode(path, block["line"], block["text"], lines)
            result[path] = comments
    return result


def tracked_files() -> list[str]:
    listed = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout.split("\0")
    return sorted(
        path
        for path in listed
        if path and not path.startswith(EXCLUDED_PREFIXES) and (ROOT / path).is_file()
    )


def language(path: str) -> str | None:
    suffix = Path(path).suffix
    if suffix == ".py":
        return "python"
    if suffix in JS_SUFFIXES:
        return "js"
    if suffix in C_SUFFIXES:
        return suffix[1:]
    if suffix == ".sql":
        return "sql"
    if suffix in HASH_SUFFIXES or Path(path).name in HASH_NAMES:
        return "hash"
    return None


def scan(paths: list[str]) -> dict[str, list[Comment]]:
    by_language: dict[str, list[str]] = defaultdict(list)
    for path in paths:
        kind = language(path)
        if kind:
            by_language[kind].append(path)
    result: dict[str, list[Comment]] = js_comments(by_language.pop("js", []))
    for kind, files in by_language.items():
        for path in files:
            text = (ROOT / path).read_text(encoding="utf-8")
            if kind == "python":
                result[path] = python_comments(path, text)
            elif kind == "sql":
                result[path] = sql_comments(path, text)
            elif kind == "hash":
                result[path] = hash_comments(path, text)
            else:
                result[path] = c_like_comments(
                    path, text, nested=kind == "swift", line_comments=kind == "swift"
                )
    return {path: comments for path, comments in result.items() if comments}


def load_baseline() -> dict[str, int]:
    if not BASELINE.exists():
        return {}
    return json.loads(BASELINE.read_text(encoding="utf-8"))


def write_baseline(counts: dict[str, int]) -> None:
    BASELINE.write_text(json.dumps(dict(sorted(counts.items())), indent=2) + "\n")


def selected(prefix: str | None) -> list[str]:
    files = tracked_files()
    return [path for path in files if not prefix or path.startswith(prefix)]


def check(prefix: str | None) -> int:
    baseline = load_baseline()
    counts = {path: len(comments) for path, comments in scan(selected(prefix)).items()}
    paths = set(counts) | {p for p in baseline if not prefix or p.startswith(prefix)}
    grew, shrank = [], []
    for path in sorted(paths):
        allowed, actual = baseline.get(path, 0), counts.get(path, 0)
        if actual > allowed:
            grew.append(f"  {path}: {actual} comment lines, {allowed} allowed")
        elif actual < allowed:
            shrank.append(f"  {path}: {actual} comment lines, baseline still says {allowed}")
    if grew:
        print("Comments are banned (ADR-050). These files gained comment lines:")
        print("\n".join(grew))
        print(
            "Delete them: rename, extract, test, or record the decision in docs/decisions.md."
            " `python scripts/comments.py list <path>` shows each one."
        )
    if shrank:
        print("Comments were deleted, so the ratchet must tighten. Run:")
        print("  python scripts/comments.py update")
        print("\n".join(shrank))
    return 1 if grew or shrank else 0


def update() -> int:
    baseline = load_baseline()
    counts = {path: len(comments) for path, comments in scan(tracked_files()).items()}
    raised = [p for p, c in counts.items() if c > baseline.get(p, 0)]
    if baseline and raised:
        print("The ratchet only goes down; these files carry more comments than allowed:")
        for path in sorted(raised):
            print(f"  {path}: {counts[path]} > {baseline.get(path, 0)}")
        return 1
    write_baseline(counts)
    print(f"comment-baseline.json: {sum(counts.values())} comment lines in {len(counts)} files")
    return 0


def list_comments(paths: list[str]) -> int:
    files = tracked_files()
    chosen = [p for p in files if not paths or any(p.startswith(q) for q in paths)]
    for path, comments in sorted(scan(chosen).items()):
        for comment in comments:
            print(f"{path}:{comment.line}: {comment.text.strip()}")
    return 0


def strip(paths: list[str]) -> int:
    files = tracked_files()
    chosen = [p for p in files if any(p == q or p.startswith(q.rstrip("/") + "/") for q in paths)]
    removed = 0
    for path, comments in sorted(scan(chosen).items()):
        target = ROOT / path
        text = target.read_text(encoding="utf-8")
        lines = text.split("\n")
        drop: set[int] = set()
        for comment in comments:
            index = comment.line - 1
            if comment.full_line:
                drop.add(index)
                continue
            start = lines[index].rfind(comment.text.strip())
            if start > 0:
                lines[index] = lines[index][:start].rstrip()
        kept = [line for index, line in enumerate(lines) if index not in drop]
        target.write_text("\n".join(kept), encoding="utf-8")
        removed += len(comments)
        print(f"{path}: {len(comments)} comment lines removed")
    print(f"{removed} comment lines removed")
    return 0


def stats() -> int:
    found = scan(tracked_files())
    areas: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0])
    for path, comments in found.items():
        area = "/".join(path.split("/")[:2]) if path.startswith("ios/") else path.split("/")[0]
        if "/" not in path:
            area = "(root)"
        full = sum(c.full_line for c in comments)
        areas[area][0] += 1
        areas[area][1] += full
        areas[area][2] += len(comments) - full
    print(f"{'area':32} {'files':>6} {'own-line':>9} {'trailing':>9}")
    for area, (files, full, trailing) in sorted(areas.items(), key=lambda kv: -kv[1][1]):
        print(f"{area:32} {files:6} {full:9} {trailing:9}")
    full = sum(v[1] for v in areas.values())
    trailing = sum(v[2] for v in areas.values())
    print(f"{'total':32} {len(found):6} {full:9} {trailing:9}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    check_parser = sub.add_parser("check")
    check_parser.add_argument("--only", help="limit the check to paths under this prefix")
    sub.add_parser("update")
    list_parser = sub.add_parser("list")
    list_parser.add_argument("paths", nargs="*")
    strip_parser = sub.add_parser("strip")
    strip_parser.add_argument("paths", nargs="+")
    sub.add_parser("stats")
    args = parser.parse_args()
    if args.command == "check":
        return check(args.only)
    if args.command == "update":
        return update()
    if args.command == "list":
        return list_comments(args.paths)
    if args.command == "strip":
        return strip(args.paths)
    return stats()


if __name__ == "__main__":
    sys.exit(main())
