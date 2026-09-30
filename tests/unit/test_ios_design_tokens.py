"""
The iOS app's color tokens are MonÉlu's web palette, in light and dark (#447,
ADR-027, ADR-041).

Each token is a color set in `MonEluUI`'s asset catalog. This pins three
things a reviewer who does not read Swift cannot check by eye:
- every token has a light and a dark value;
- both match the `--dp-*` variables the website uses in globals.css, so the
  two clients cannot drift apart;
- no Swift file in MonEluUI writes a literal or system color instead of a
  token.
"""

import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
UI = ROOT / "ios" / "Packages" / "MonEluUI" / "Sources" / "MonEluUI"
CATALOG = UI / "Resources" / "Colors.xcassets"
GLOBALS_CSS = ROOT / "frontend" / "src" / "app" / "globals.css"

# token -> (light CSS source, dark CSS source). A source is a `--dp-*` variable
# read from :root / .dark, or a literal where the web has no variable.
WEB_SOURCES = {
    "pageBackground": ("--dp-page-bg", "--dp-page-bg"),
    "cardBackground": ("--dp-card-bg", "--dp-card-bg"),
    "border": ("--dp-border", "--dp-border"),
    "textPrimary": ("#0D1F3C", "--dp-text"),  # :root --dp-text is navy via theme()
    "textSecondary": ("--dp-text-secondary", "--dp-text-secondary"),
    "textMuted": ("--dp-text-muted", "--dp-text-muted"),
    "positive": ("--dp-green", "--dp-green"),
    "negative": ("--dp-red", "--dp-red"),
    "positiveBackground": ("--dp-badge-pos-bg", "--dp-badge-pos-bg"),
    "negativeBackground": ("--dp-badge-neg-bg", "--dp-badge-neg-bg"),
    "trackBackground": ("--dp-track-bg", "--dp-track-bg"),
    "accent": ("#C9302C", "--dp-red"),  # red.civic in tailwind.config.ts
}


def _css_block(css: str, selector: str) -> str:
    match = re.search(re.escape(selector) + r"\s*\{(.*?)\n\}", css, re.S)
    assert match, f"{selector} block not found in globals.css"
    return match.group(1)


def _css_vars(block: str) -> dict[str, str]:
    return dict(re.findall(r"(--[\w-]+):\s*([^;]+);", block))


def _normalise(value: str) -> tuple[str, float]:
    """(RRGGBB, alpha) from `#RRGGBB` or `rgba(r,g,b,a)`."""
    value = value.strip()
    if value.startswith("#"):
        return value[1:].upper(), 1.0
    r, g, b, a = (part.strip() for part in re.fullmatch(r"rgba\((.*)\)", value).group(1).split(","))
    return f"{int(r):02X}{int(g):02X}{int(b):02X}", float(a)


def _catalog_value(entry: dict) -> tuple[str, float]:
    parts = entry["color"]["components"]
    rgb = "".join(parts[c].removeprefix("0x").upper() for c in ("red", "green", "blue"))
    return rgb, float(parts["alpha"])


def _colorsets() -> dict[str, dict]:
    return {
        path.parent.name.removesuffix(".colorset"): json.loads(path.read_text(encoding="utf-8"))
        for path in CATALOG.glob("*.colorset/Contents.json")
    }


def test_every_token_has_a_light_and_a_dark_value():
    colorsets = _colorsets()
    assert set(colorsets) == set(WEB_SOURCES)
    for name, contents in colorsets.items():
        appearances = [entry.get("appearances") for entry in contents["colors"]]
        assert None in appearances, f"{name} has no light (any-appearance) value"
        assert [{"appearance": "luminosity", "value": "dark"}] in appearances, (
            f"{name} has no dark value"
        )


def test_tokens_match_the_website_palette():
    css = GLOBALS_CSS.read_text(encoding="utf-8")
    light_vars = _css_vars(_css_block(css, ":root"))
    dark_vars = light_vars | _css_vars(_css_block(css, ".dark"))

    for name, contents in _colorsets().items():
        light_source, dark_source = WEB_SOURCES[name]
        light = next(e for e in contents["colors"] if "appearances" not in e)
        dark = next(e for e in contents["colors"] if "appearances" in e)
        expected_light = light_vars.get(light_source, light_source)
        expected_dark = dark_vars.get(dark_source, dark_source)
        assert _catalog_value(light) == _normalise(expected_light), f"{name} light"
        assert _catalog_value(dark) == _normalise(expected_dark), f"{name} dark"


# A literal or system color in a component bypasses the tokens (and dark mode).
LITERAL_COLOR = re.compile(
    r"Color\((red|white|hue|\.sRGB|\.displayP3|uiColor)"
    r"|UIColor\("
    r"|(?<![\w.])\.(red|blue|green|black|white|gray|orange|yellow|pink|purple|mint|teal|cyan|indigo|brown)\b"
    r"|Color\.(red|blue|green|black|white|gray|orange|yellow|pink|purple|primary|secondary)\b"
)


def test_components_use_no_literal_color():
    offenders = [
        f"{path.name}:{number}: {line.strip()}"
        for path in UI.rglob("*.swift")
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1)
        if LITERAL_COLOR.search(line)
    ]
    assert offenders == []


def test_literal_color_pattern_catches_the_usual_forms():
    for line in [
        ".foregroundStyle(.red)",
        "Color(red: 0.1, green: 0.2, blue: 0.3)",
        'UIColor(named: "x")',
        "background(Color.secondary)",
    ]:
        assert LITERAL_COLOR.search(line), line
    for line in [".foregroundStyle(Palette.negative)", "Color(name, bundle: .module)"]:
        assert not LITERAL_COLOR.search(line), line
