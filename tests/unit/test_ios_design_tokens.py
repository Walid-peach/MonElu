"""
The iOS app's color tokens are MonÉlu's web palette, in light and dark (#447,
ADR-027, ADR-041).

Each token is a color set in `MonEluUI`'s asset catalog. This pins three
things a reviewer who does not read Swift cannot check by eye:
- every token has a light and a dark value;
- both match the `--dp-*` variables the website uses in globals.css, so the
  two clients cannot drift apart;
- no Swift file that draws (the UI kit, the screens, the app target) writes a
  literal or system color instead of a token.
"""

import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
UI = ROOT / "ios" / "Packages" / "MonEluUI" / "Sources" / "MonEluUI"
# Everything that draws: the UI kit, the screens, and the app target.
SWIFT_UI_SOURCES = [
    UI,
    ROOT / "ios" / "Packages" / "MonEluFeatures" / "Sources",
    ROOT / "ios" / "MonElu" / "Sources",
]
CATALOG = UI / "Resources" / "Colors.xcassets"
GLOBALS_CSS = ROOT / "frontend" / "src" / "app" / "globals.css"

# token -> (light CSS source, dark CSS source). A source is a `--dp-*` variable
# read from :root / .dark, or a literal where the web has no variable.
WEB_SOURCES = {
    "pageBackground": ("--dp-page-bg", "--dp-page-bg"),
    "cardBackground": ("--dp-card-bg", "--dp-card-bg"),
    "border": ("--dp-border", "--dp-border"),
    "textPrimary": ("#0D1F3C", "--dp-text"),  # :root --dp-text is navy via theme()
    # Darker than the web in light mode (and textMuted in dark too): the web
    # values miss 4.5:1 on the page and track backgrounds (#480). #5F6673 is
    # the design A secondary text; see test_text_tokens_reach_aa_contrast.
    "textSecondary": ("#5F6673", "--dp-text-secondary"),
    "textMuted": ("#656C79", "#8A94A8"),
    "positive": ("--dp-green", "--dp-green"),
    "negative": ("--dp-red", "--dp-red"),
    "positiveBackground": ("--dp-badge-pos-bg", "--dp-badge-pos-bg"),
    "negativeBackground": ("--dp-badge-neg-bg", "--dp-badge-neg-bg"),
    # Badge text: darker than positive in light mode, so the result and
    # position badges reach 4.5:1 on their tint.
    "positiveText": ("--dp-badge-pos-text", "--dp-badge-pos-text"),
    "negativeText": ("--dp-badge-neg-text", "--dp-badge-neg-text"),
    "trackBackground": ("--dp-track-bg", "--dp-track-bg"),
    # The abstention badge: amber, the hue of the abstention seat (#516).
    "abstentionBackground": ("--dp-badge-abst-bg", "--dp-badge-abst-bg"),
    "abstentionText": ("--dp-badge-abst-text", "--dp-badge-abst-text"),
    "accent": ("#C9302C", "--dp-red"),  # red.civic in tailwind.config.ts
    # POSITION_COLORS.abstention in HemicycleChart.tsx, not theme-aware there.
    "seatAbstention": ("#D97706", "#D97706"),
    # A fixed navy surface and the white text on it, the same in both themes
    # (MON-160: --dp-active-bg is deliberately not overridden in .dark).
    "identityBackground": ("--dp-active-bg", "--dp-active-bg"),
    "onIdentity": ("#FFFFFF", "#FFFFFF"),
    # Text on an accent-filled button: white reaches only 2.8:1 on the dark
    # accent (#FF6B60), so dark mode writes it in navy (#491).
    "onAccent": ("#FFFFFF", "#0D1F3C"),
    # POSITION_COLORS.nonVotant in HemicycleChart.tsx, not theme-aware there.
    "seatNonVotant": ("#9CA3AF", "#9CA3AF"),
    # Group chips: partyColor() in lib/utils.ts, Tailwind's 100/900 (950 for
    # RN) shades. The web has no dark variant; the app reverses each pair.
    "partyRNBackground": ("#172554", "#1E3A8A"),
    "partyRNText": ("#DBEAFE", "#DBEAFE"),
    "partyEPRBackground": ("#FEF3C7", "#78350F"),
    "partyEPRText": ("#78350F", "#FEF3C7"),
    "partyLFIBackground": ("#FEE2E2", "#7F1D1D"),
    "partyLFIText": ("#7F1D1D", "#FEE2E2"),
    "partySOCBackground": ("#FFE4E6", "#881337"),
    "partySOCText": ("#881337", "#FFE4E6"),
    "partyDRBackground": ("#E0F2FE", "#0C4A6E"),
    "partyDRText": ("#0C4A6E", "#E0F2FE"),
    "partyECSBackground": ("#DCFCE7", "#14532D"),
    "partyECSText": ("#14532D", "#DCFCE7"),
    "partyDEMBackground": ("#FFEDD5", "#7C2D12"),
    "partyDEMText": ("#7C2D12", "#FFEDD5"),
    "partyHORBackground": ("#CCFBF1", "#134E4A"),
    "partyHORText": ("#134E4A", "#CCFBF1"),
    "partyOtherBackground": ("#F3F4F6", "#374151"),
    "partyOtherText": ("#374151", "#F3F4F6"),
}

# A translucent fill (the badge backgrounds) can sit on either surface.
SURFACES = ("pageBackground", "cardBackground")

# Text token -> the backgrounds it is drawn on. Every pair must reach WCAG AA
# for body text (4.5:1) in light and in dark, computed from the catalog.
# The badges draw positiveText/negativeText, never positive/negative: those
# fills reached only 3.88:1 as text on positiveBackground in light mode.
TEXT_ON_BACKGROUNDS = {
    "textPrimary": ["pageBackground", "cardBackground", "trackBackground"],
    "textSecondary": ["pageBackground", "cardBackground", "trackBackground"],
    "textMuted": ["pageBackground", "cardBackground", "trackBackground"],
    "accent": ["pageBackground", "cardBackground"],
    "positiveText": ["positiveBackground"],
    "negativeText": ["negativeBackground"],
    # The badge, and an abstention count written as a figure on a card (#519).
    "abstentionText": ["abstentionBackground", "cardBackground"],
    "onIdentity": ["identityBackground"],
    "onAccent": ["accent"],
    "cardBackground": ["textPrimary"],  # a selected FilterChipRow chip
    **{
        f"party{code}Text": [f"party{code}Background"]
        for code in ("RN", "EPR", "LFI", "SOC", "DR", "ECS", "DEM", "HOR", "Other")
    },
}


def _css_block(css: str, selector: str) -> str:
    match = re.search(re.escape(selector) + r"\s*\{(.*?)\n\}", css, re.S)
    assert match, f"{selector} block not found in globals.css"
    return match.group(1)


def _css_vars(block: str) -> dict[str, str]:
    # Comments go first: one that names a variable before a colon would
    # otherwise be read as its declaration.
    block = re.sub(r"/\*.*?\*/", "", block, flags=re.S)
    return dict(re.findall(r"(--[\w-]+):\s*([^;]+);", block))


def test_css_vars_ignore_comments():
    block = "  --dp-red: #C9302A;\n  /* --dp-red: the line above; */"
    assert _css_vars(block) == {"--dp-red": "#C9302A"}


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
    # A UIKit color is only ever a token looked up by name, in Palette.swift.
    r"|UIColor\((?!named: name, in: \.module)"
    r"|(?<![\w.])\.(red|blue|green|black|white|gray|orange|yellow|pink|purple|mint|teal|cyan|indigo|brown"
    r"|primary|secondary|tertiary|quaternary)\b"
    r"|Color\.(red|blue|green|black|white|gray|orange|yellow|pink|purple|primary|secondary)\b"
)


def test_components_use_no_literal_color():
    offenders = [
        f"{path.name}:{number}: {line.strip()}"
        for root in SWIFT_UI_SOURCES
        for path in root.rglob("*.swift")
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
        ".foregroundStyle(.secondary)",
        ".foregroundStyle(.primary)",
    ]:
        assert LITERAL_COLOR.search(line), line
    for line in [
        ".foregroundStyle(Palette.negative)",
        "Color(name, bundle: .module)",
        "UIColor(named: name, in: .module, compatibleWith: nil)",
    ]:
        assert not LITERAL_COLOR.search(line), line


# `positive`/`negative` are fills (bars, hemicycle seats). As text on their
# own tint they miss 4.5:1, so badge text must use positiveText/negativeText.
FILL = re.compile(r"Palette\.(positive|negative)\b(?!Background|Text)")
# Where a fill would be drawn as text. Expressions span lines (a ternary per
# line), so each pattern runs over the whole file:
# - a tuple or call pairing a fill with its own tint on one line;
# - a `foreground:` argument or a `var foreground: Color { … }` property, up
#   to the `background:` that follows it or a line that closes the call;
# - a `.foregroundStyle(...)` argument, one level of parentheses deep.
FILL_AS_TEXT = [
    re.compile(r"Palette\.(positive|negative)\b(?!Background|Text)[^\n]*Palette\.\1Background"),
    re.compile(r"\bforeground:(.*?)(?=\bbackground:|\)\s*$)", re.S | re.M),
    re.compile(r"\.foregroundStyle\(([^()]*(?:\([^()]*\)[^()]*)*)\)"),
]


def _fill_as_text(source: str) -> list[int]:
    """Line numbers where a fill is drawn as text."""
    lines = set()
    for pattern in FILL_AS_TEXT:
        for match in pattern.finditer(source):
            text = match.group(0) if pattern is FILL_AS_TEXT[0] else match.group(1)
            offset = match.start(0) if pattern is FILL_AS_TEXT[0] else match.start(1)
            for fill in FILL.finditer(text):
                lines.add(source.count("\n", 0, offset + fill.start()) + 1)
    return sorted(lines)


def test_badge_text_does_not_use_the_fill_colors():
    offenders = []
    for root in SWIFT_UI_SOURCES:
        for path in root.rglob("*.swift"):
            source = path.read_text(encoding="utf-8")
            lines = source.splitlines()
            offenders += [f"{path.name}:{n}: {lines[n - 1].strip()}" for n in _fill_as_text(source)]
    assert offenders == []


def test_fill_as_text_catches_the_usual_forms():
    offending = [
        'case "pour": (Palette.positive, Palette.positiveBackground)',
        ".foregroundStyle(Palette.negative)",
        ".foregroundStyle(isOn ? Palette.positive : Palette.textPrimary)",
        'Badge(text: "Adopté", foreground: Palette.positive, background: x)',
        # The confidence pill's shape before this check existed.
        "Pill(\n"
        "    text: confidence,\n"
        '    foreground: answer.confidence == "low" ? Palette.negative\n'
        '        : answer.confidence == "high" ? Palette.positive : Palette.textSecondary,\n'
        "    background: Palette.trackBackground\n"
        ")",
    ]
    for source in offending:
        assert _fill_as_text(source), source
    assert _fill_as_text(offending[-1]) == [3, 4]
    fine = [
        'case "pour": (Palette.positiveText, Palette.positiveBackground)',
        "case .pour: Palette.positive",
        'Segment(position: "pour", count: pour, color: Palette.positive),',
        ".foregroundStyle(Palette.positiveText)",
        "Badge(text: x, foreground: Palette.textSecondary, background: Palette.positive)",
        ".fill(Palette.positive)\n.foregroundStyle(Palette.textPrimary)",
    ]
    for source in fine:
        assert not _fill_as_text(source), source


def _luminance(rgb: str) -> float:
    def channel(hex_pair: str) -> float:
        c = int(hex_pair, 16) / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (channel(rgb[i : i + 2]) for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _contrast(a: str, b: str) -> float:
    high, low = sorted((_luminance(a), _luminance(b)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def test_contrast_helper_matches_known_ratios():
    assert round(_contrast("000000", "FFFFFF"), 1) == 21.0
    assert round(_contrast("767676", "FFFFFF"), 2) == 4.54


def _over(rgb: str, alpha: float, surface: str) -> str:
    """`rgb` at `alpha` composited over the opaque `surface`."""
    return "".join(
        f"{round(int(rgb[i : i + 2], 16) * alpha + int(surface[i : i + 2], 16) * (1 - alpha)):02X}"
        for i in (0, 2, 4)
    )


def test_text_tokens_reach_aa_contrast():
    colorsets = _colorsets()
    failures = []
    for appearance in ("light", "dark"):
        values = {
            name: _catalog_value(
                next(e for e in c["colors"] if ("appearances" in e) == (appearance == "dark"))
            )
            for name, c in colorsets.items()
        }
        for text, backgrounds in TEXT_ON_BACKGROUNDS.items():
            text_rgb, text_alpha = values[text]
            assert text_alpha == 1.0, f"{text} is translucent text"
            for background in backgrounds:
                rgb, alpha = values[background]
                # A translucent fill (the badge backgrounds) is checked over
                # both surfaces it can sit on.
                surfaces = (
                    [rgb]
                    if alpha == 1.0
                    else [
                        _over(rgb, alpha, values[s][0])
                        for s in ("pageBackground", "cardBackground")
                    ]
                )
                for surface in surfaces:
                    ratio = _contrast(text_rgb, surface)
                    if ratio < 4.5:
                        failures.append(f"{appearance}: {text} on {background} is {ratio:.2f}:1")
    assert failures == []
