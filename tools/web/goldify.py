#!/usr/bin/env python3
"""Black & gold theme for the website: recolour CSS colour values.

The receiver pages are green / red / white. The website uses black and gold, so
every colour in the page styles is mapped by hue:

* greens and teals  -> gold (dark ones -> warm black)
* reds and pinks    -> bronze (dark ones -> warm black)
* neutrals, yellows, blues are kept

Used by build_pages.py on the receiver pages' <style> blocks and style=""
attributes, and once on the website's own CSS files.

    python3 tools/web/goldify.py file.css [...]   # recolour files in place
"""
import colorsys
import re
import sys

HEX = re.compile(r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])")
RGB = re.compile(r"rgba?\(\s*(\d{1,3}(?:\.\d+)?)\s*,\s*(\d{1,3}(?:\.\d+)?)\s*,\s*(\d{1,3}(?:\.\d+)?)\s*(?:,\s*([0-9.]+%?)\s*)?\)")


def remap(r, g, b):
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    deg = h * 360
    if s < 0.12 or l < 0.025 or l > 0.97:
        return r, g, b
    green = 70 <= deg <= 200
    red = deg >= 320 or deg <= 18
    if not (green or red):
        return r, g, b
    if l < 0.2:
        # Dark tinted surfaces become warm black.
        nh, ns, nl = 38 / 360, 0.22, l * 0.92
    elif green:
        nh = 42 / 360
        ns = max(0.48, min(0.82, s * 0.95))
        nl = l if l > 0.8 else min(0.74, l * 1.08)
    else:
        nh = 30 / 360
        ns = max(0.42, min(0.66, s * 0.7))
        nl = l * 0.82
    nr, ng, nb = colorsys.hls_to_rgb(nh, nl, ns)
    return round(nr * 255), round(ng * 255), round(nb * 255)


def _hex(m):
    v = m.group(1)
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    r, g, b = (int(v[i:i + 2], 16) for i in (0, 2, 4))
    nr, ng, nb = remap(r, g, b)
    if (nr, ng, nb) == (r, g, b):
        return m.group(0)
    return "#%02x%02x%02x" % (nr, ng, nb)


def _rgb(m):
    r, g, b = (float(m.group(i)) for i in (1, 2, 3))
    a = m.group(4)
    nr, ng, nb = remap(r, g, b)
    if (nr, ng, nb) == (round(r), round(g), round(b)):
        return m.group(0)
    return "rgba(%d,%d,%d,%s)" % (nr, ng, nb, a) if a is not None else "rgb(%d,%d,%d)" % (nr, ng, nb)


TRIPLE = re.compile(r"(--[\w-]+\s*:\s*)(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?=\s*[;}!])")


def _triple(m):
    # Accent tints kept as "r,g,b" in custom properties: every one becomes a gold tone.
    r, g, b = (int(m.group(i)) for i in (2, 3, 4))
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    if s < 0.12:
        return m.group(0)
    nr, ng, nb = colorsys.hls_to_rgb((36 + (h * 360) % 12) / 360, max(0.42, min(0.66, l)), 0.62)
    return "%s%d,%d,%d" % (m.group(1), round(nr * 255), round(ng * 255), round(nb * 255))


def recolor_css(text):
    return TRIPLE.sub(_triple, RGB.sub(_rgb, HEX.sub(_hex, text)))


def recolor_html(html):
    """Recolour only <style> blocks and style="" attributes (never scripts)."""
    html = re.sub(r"(<style[^>]*>)(.*?)(</style>)", lambda m: m.group(1) + recolor_css(m.group(2)) + m.group(3), html, flags=re.S | re.I)
    html = re.sub(r'(\sstyle=")([^"]*)(")', lambda m: m.group(1) + recolor_css(m.group(2)) + m.group(3), html)
    return html


if __name__ == "__main__":
    for path in sys.argv[1:]:
        with open(path, encoding="utf-8") as f:
            src = f.read()
        out = recolor_css(src)
        with open(path, "w", encoding="utf-8") as f:
            f.write(out)
        print(path, "recoloured")
