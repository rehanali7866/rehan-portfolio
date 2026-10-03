#!/usr/bin/env python3
"""
tools/check.py — static verification for ravolution.agency (Python 3 stdlib only).

Walks every *.html page under the repo (same skip rules as tools/build.py) and checks:
  1. every href / src / action / poster attribute, and the content attribute of a
     <meta property="og:image"> or <meta name="twitter:image"> tag, that starts with
     "/" resolves to a real file in the repo ("/x/" is treated as "/x/index.html";
     "/#...", "mailto:", "tel:" and "/_vercel/..." are ignored)
  2. the @head / @nav / @footer marker pairs are present, in order, exactly once
     each, and expanded (non-empty content between them); <body> carries a
     data-page="..." value from the set build.py accepts
  3. exactly one <h1> on the page
  4. <title>, a non-empty meta description, and a canonical link are present
  5. every <script type="application/ld+json"> block parses as JSON
  6. no reference anywhere to the old, now-removed paths: css/style.css,
     js/main.js, js/roller.js, css/legal.css?v=1, /vaults/assets/
  7. no "lorem" placeholder text (case-insensitive)

It also checks:
  - sitemap.xml lists every indexable page (no noindex, not 404.html) and lists
    no page that should have been excluded
  - robots.txt exists
  - every css/*.html... (css/*.css) file has balanced { }
  - if $HOME/.local/node/bin/node exists, `node --check` is run on every js/*.js

Usage: python3 tools/check.py
Exit status is non-zero (with every problem printed) if anything fails.
"""
from __future__ import annotations

import datetime
import json
import os
import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SITE = "https://ravolution.agency"
SKIP_DIR_NAMES = {"_partials", "tools", "node_modules", "react-bits", "ui-ux-pro-max-skill"}
PAGE_VALUES = {"home", "nevermissed", "vaults", "insights", "contact", "legal", "notfound"}
MARKERS = ("head", "nav", "footer")

OLD_PATHS = ["css/style.css", "js/main.js", "js/roller.js", "css/legal.css?v=1", "/vaults/assets/"]

problems: list[str] = []


def flag(where: str, msg: str) -> None:
    problems.append(f"{where}: {msg}")


def rel(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO).as_posix()
    except ValueError:
        return str(path)


def skip_dir(name: str) -> bool:
    return name in SKIP_DIR_NAMES or name.startswith(".") or name.startswith("_")


def iter_html(root: Path):
    root = root.resolve()
    for p in sorted(root.rglob("*.html")):
        parts = p.relative_to(REPO).parts[:-1]
        if any(skip_dir(part) for part in parts):
            continue
        yield p


# ----------------------------------------------------------------- HTML parsing
LINK_ATTRS = {"href", "src", "action", "poster"}


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links: list[str] = []           # every href/src/action/poster value
        self.h1_count = 0
        self.title = ""
        self._in_title = False
        self.description = None
        self.canonical = None
        self.body_data_page = None
        self.ld_json_blocks: list[str] = []
        self._in_ldjson = False
        self._ldjson_buf = []
        self.og_image_values: list[str] = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        for a in LINK_ATTRS:
            if d.get(a):
                self.links.append(d[a])
        if tag == "meta":
            name = (d.get("name") or "").lower()
            prop = (d.get("property") or "").lower()
            if name == "description" and d.get("content") is not None:
                self.description = d.get("content")
            if prop == "og:image" or name == "twitter:image":
                if d.get("content"):
                    self.og_image_values.append(d["content"])
        if tag == "link" and (d.get("rel") or "").lower() == "canonical":
            self.canonical = d.get("href")
        if tag == "h1":
            self.h1_count += 1
        if tag == "title":
            self._in_title = True
        if tag == "body":
            self.body_data_page = d.get("data-page")
        if tag == "script" and (d.get("type") or "").lower() == "application/ld+json":
            self._in_ldjson = True
            self._ldjson_buf = []

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        if tag == "script" and self._in_ldjson:
            self._in_ldjson = False
            self.ld_json_blocks.append("".join(self._ldjson_buf))

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._in_ldjson:
            self._ldjson_buf.append(data)


# ----------------------------------------------------------------- link resolution
def resolve_target(value: str) -> Path | None:
    """Map a root-absolute URL path to a repo file path (or None if not root-absolute)."""
    if not value.startswith("/"):
        return None
    if value.startswith("/_vercel/"):
        return None
    if value.startswith("/#"):
        return None
    # strip fragment then query
    path = value.split("#", 1)[0].split("?", 1)[0]
    if not path or path == "/":
        path = "/index.html"
    elif path.endswith("/"):
        path = path + "index.html"
    return REPO / path.lstrip("/")


def check_links(where: str, links: list[str]) -> None:
    for value in links:
        if value.startswith(("mailto:", "tel:", "javascript:", "data:", "http://", "https://", "//")):
            continue
        target = resolve_target(value)
        if target is None:
            continue
        if not target.exists():
            flag(where, f'broken link "{value}" -> missing {rel(target)}')


# ----------------------------------------------------------------- marker checks
def check_markers(where: str, html: str) -> None:
    for name in MARKERS:
        open_tag, close_tag = f"<!-- @{name} -->", f"<!-- /@{name} -->"
        n_open, n_close = html.count(open_tag), html.count(close_tag)
        if n_open == 0 and n_close == 0:
            flag(where, f"missing @{name} marker pair")
            continue
        if n_open != 1 or n_close != 1:
            flag(where, f"@{name} marker unbalanced ({n_open} open, {n_close} close)")
            continue
        o = html.index(open_tag) + len(open_tag)
        c = html.index(close_tag)
        if c < o:
            flag(where, f"@{name} marker closes before it opens")
            continue
        if html[o:c].strip() == "":
            flag(where, f"@{name} marker is empty (not expanded)")


def is_noindex(html: str) -> bool:
    head_end = html.lower().find("</head>")
    head = html if head_end < 0 else html[:head_end]
    for m in re.finditer(r"<meta\b[^>]*>", head, re.I):
        tag = m.group(0).lower()
        if ('name="robots"' in tag or "name='robots'" in tag) and "noindex" in tag:
            return True
    return False


def classify(relpath: str, page):
    parts = relpath.split("/")
    if relpath == "index.html":
        return "weekly", "1.0"
    if page in ("legal", "contact"):
        return "yearly", "0.3"
    if len(parts) == 2 and parts[1] == "index.html":
        return "weekly", "0.9"
    return "monthly", "0.7"


# ----------------------------------------------------------------- main checks
def check_page(path: Path) -> None:
    where = rel(path)
    html = path.read_text(encoding="utf-8")

    if "lorem" in html.lower():
        flag(where, 'contains "lorem" placeholder text')

    for old in OLD_PATHS:
        if old in html:
            flag(where, f'references removed/old path "{old}"')

    check_markers(where, html)

    p = PageParser()
    try:
        p.feed(html)
    except Exception as exc:  # pragma: no cover - defensive
        flag(where, f"HTML could not be parsed: {exc}")
        return

    if p.body_data_page is None:
        flag(where, "no data-page on <body>")
    elif p.body_data_page not in PAGE_VALUES:
        flag(where, f'unknown data-page="{p.body_data_page}"')

    if p.h1_count != 1:
        flag(where, f"expected exactly one <h1>, found {p.h1_count}")

    if not p.title.strip():
        flag(where, "missing or empty <title>")

    if not p.description or not p.description.strip():
        flag(where, "missing or empty meta description")

    if not p.canonical:
        flag(where, "missing <link rel=\"canonical\">")

    for block in p.ld_json_blocks:
        text = block.strip()
        if not text:
            flag(where, "empty <script type=\"application/ld+json\"> block")
            continue
        try:
            json.loads(text)
        except json.JSONDecodeError as exc:
            flag(where, f"invalid JSON-LD ({exc})")

    check_links(where, p.links)
    check_links(where, p.og_image_values)


def check_sitemap(pages: list[Path]) -> None:
    sitemap_path = REPO / "sitemap.xml"
    if not sitemap_path.exists():
        flag("sitemap.xml", "file does not exist")
        return
    sitemap_text = sitemap_path.read_text(encoding="utf-8")
    locs_in_sitemap = set(re.findall(r"<loc>([^<]+)</loc>", sitemap_text))

    expected = set()
    for p in pages:
        r = rel(p)
        if r == "404.html":
            continue
        html = p.read_text(encoding="utf-8")
        if is_noindex(html):
            continue
        loc = SITE + "/" + r
        if loc.endswith("/index.html"):
            loc = loc[: -len("index.html")]
        expected.add(loc)

    missing = expected - locs_in_sitemap
    for loc in sorted(missing):
        flag("sitemap.xml", f"missing indexable page {loc}")

    extra = locs_in_sitemap - expected
    for loc in sorted(extra):
        flag("sitemap.xml", f"lists a page that should not be indexed: {loc}")


def check_robots() -> None:
    if not (REPO / "robots.txt").exists():
        flag("robots.txt", "file does not exist")


CSS_COMMENT_RE = re.compile(r"/\*.*?\*/", re.S)


def check_css() -> None:
    for css_path in sorted((REPO / "css").glob("*.css")):
        text = css_path.read_text(encoding="utf-8")
        stripped = CSS_COMMENT_RE.sub("", text)
        opens, closes = stripped.count("{"), stripped.count("}")
        if opens != closes:
            flag(rel(css_path), f"unbalanced braces ({opens} open, {closes} close)")


def check_js() -> None:
    node = Path(os.path.expanduser("~/.local/node/bin/node"))
    if not node.exists():
        return
    js_dir = REPO / "js"
    if not js_dir.exists():
        return
    for js_path in sorted(js_dir.glob("*.js")):
        src = js_path.read_text(encoding="utf-8", errors="replace")
        is_module = re.search(r"^\s*(import|export)\s", src, re.M) is not None
        try:
            if is_module:  # ES modules (e.g. hero-3d.js) need module-mode parsing
                result = subprocess.run(
                    [str(node), "--input-type=module", "--check"],
                    input=src, capture_output=True, text=True, timeout=30,
                )
            else:
                result = subprocess.run(
                    [str(node), "--check", str(js_path)],
                    capture_output=True, text=True, timeout=30,
                )
        except Exception as exc:  # pragma: no cover - defensive
            flag(rel(js_path), f"could not run node --check: {exc}")
            continue
        if result.returncode != 0:
            flag(rel(js_path), f"node --check failed: {result.stderr.strip()}")


def main() -> int:
    pages = list(iter_html(REPO))
    if not pages:
        flag("(repo)", "no HTML pages found")

    for path in pages:
        check_page(path)

    check_sitemap(pages)
    check_robots()
    check_css()
    check_js()

    if problems:
        print(f"tools/check.py: {len(problems)} problem(s) found\n")
        for p in problems:
            print(f"  - {p}")
        return 1

    print(f"tools/check.py: OK — {len(pages)} pages checked, 0 problems")
    return 0


if __name__ == "__main__":
    sys.exit(main())
