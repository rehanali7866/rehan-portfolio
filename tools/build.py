#!/usr/bin/env python3
"""
tools/build.py — static build for ravolution.agency (Python 3 stdlib only).

Usage
  python3 tools/build.py                 full build:
                                          1) tools/store_build.py (if present) -> store_build.build(repo_root)
                                          2) inject partials into every *.html in the repo
                                          3) write sitemap.xml
  python3 tools/build.py --only P [P…]   inject partials only into these files/dirs
                                          (no store generation, no sitemap)
  python3 tools/build.py --only P --store   …and run the store generator first

Partial contract (markers stay in the file; the content between them is replaced):
  <head> …page meta…  <!-- @head --><!-- /@head -->  …page CSS / JSON-LD… </head>
  <body data-page="home|nevermissed|web|vaults|insights|contact|legal|notfound">
  <!-- @nav --><!-- /@nav -->
  <main id="main"> … </main>
  <!-- @footer --><!-- /@footer -->

  * A page with NO markers is skipped with a warning (legacy page).
  * A page WITH markers but no body data-page (or an unknown value) fails the build.
  * Unbalanced or out-of-order markers fail the build.
  * The nav partial's links carry data-nav="…"; the link matching data-page gets
    aria-current="page" (any stale aria-current is removed first).
  * Running the build twice yields byte-identical output.

Sitemap: every *.html except 404.html and pages whose <head> has
<meta name="robots" content="noindex">. <loc> drops a trailing index.html.
home 1.0 weekly · section landings 0.9 weekly · products/articles 0.7 monthly ·
legal/contact 0.3 yearly.
"""
import argparse
import datetime
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PARTIALS_DIR = REPO / "_partials"
SITE = "https://ravolution.agency"
SKIP_DIR_NAMES = {"_partials", "tools", "node_modules", "react-bits", "ui-ux-pro-max-skill"}
PAGE_VALUES = {"home", "nevermissed", "web", "vaults", "insights", "contact", "legal", "notfound"}
MARKERS = ("head", "nav", "footer")
LEGAL_DIRS = {"privacy", "terms", "refunds", "contact"}


class BuildError(Exception):
    pass


# ----------------------------------------------------------------- helpers
def rel(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO).as_posix()
    except ValueError:
        return str(path)


def skip_dir(name: str) -> bool:
    return name in SKIP_DIR_NAMES or name.startswith(".") or name.startswith("_")


def iter_html(root: Path):
    """Yield every *.html under root (sorted), honouring the skip rules."""
    root = root.resolve()
    if root.is_file():
        if root.suffix.lower() == ".html":
            yield root
        return
    for p in sorted(root.rglob("*.html")):
        parts = p.relative_to(REPO).parts[:-1]
        if any(skip_dir(part) for part in parts):
            continue
        yield p


def load_partials() -> dict:
    out = {}
    for name in MARKERS:
        f = PARTIALS_DIR / f"{name}.html"
        if not f.exists():
            raise BuildError(f"missing partial: {rel(f)}")
        out[name] = f.read_text(encoding="utf-8").strip("\r\n")
    return out


DATA_PAGE_RE = re.compile(r"<body\b[^>]*?\bdata-page\s*=\s*[\"']([^\"']*)[\"']", re.I | re.S)
NAV_LINK_RE = re.compile(r"<a\b([^>]*?)\bdata-nav=\"([^\"]+)\"([^>]*)>", re.I)
ARIA_CURRENT_RE = re.compile(r"\s+aria-current=\"[^\"]*\"", re.I)
META_RE = re.compile(r"<meta\b[^>]*>", re.I)


def data_page(html: str):
    m = DATA_PAGE_RE.search(html)
    return m.group(1).strip() if m else None


def has_any_marker(html: str) -> bool:
    return any(f"<!-- @{n} -->" in html or f"<!-- /@{n} -->" in html for n in MARKERS)


def nav_for(page: str, nav_html: str) -> str:
    """Return the nav partial with aria-current="page" on the link whose data-nav == page."""
    def repl(m):
        before = ARIA_CURRENT_RE.sub("", m.group(1))
        after = ARIA_CURRENT_RE.sub("", m.group(3))
        key = m.group(2)
        current = ' aria-current="page"' if key == page else ""
        return f'<a{before}data-nav="{key}"{current}{after}>'
    return NAV_LINK_RE.sub(repl, nav_html)


def inject(html: str, name: str, content: str, where: str) -> str:
    open_tag, close_tag = f"<!-- @{name} -->", f"<!-- /@{name} -->"
    n_open, n_close = html.count(open_tag), html.count(close_tag)
    if n_open == 0 and n_close == 0:
        return html  # this marker pair is simply not used on the page
    if n_open != 1 or n_close != 1:
        raise BuildError(f"{where}: marker @{name} unbalanced (found {n_open} open, {n_close} close)")
    o = html.index(open_tag)
    c = html.index(close_tag)
    if c < o:
        raise BuildError(f"{where}: marker @{name} closes before it opens")
    return html[: o + len(open_tag)] + "\n" + content + "\n" + html[c:]


def is_noindex(html: str) -> bool:
    head_end = html.lower().find("</head>")
    head = html if head_end < 0 else html[:head_end]
    for tag in META_RE.findall(head):
        t = tag.lower()
        if 'name="robots"' in t or "name='robots'" in t:
            if "noindex" in t:
                return True
    return False


# ----------------------------------------------------------------- build steps
def process_page(path: Path, partials: dict, warnings: list) -> str:
    """Inject partials into one page. Returns 'updated' | 'unchanged' | 'skipped'."""
    where = rel(path)
    original = path.read_text(encoding="utf-8")
    if not has_any_marker(original):
        warnings.append(f"skip (no partial markers): {where}")
        return "skipped"

    page = data_page(original)
    if page is None:
        raise BuildError(f'{where}: has partial markers but <body> lacks data-page="…" '
                         f"(allowed: {', '.join(sorted(PAGE_VALUES))})")
    if page not in PAGE_VALUES:
        raise BuildError(f'{where}: unknown data-page="{page}" (allowed: {", ".join(sorted(PAGE_VALUES))})')

    html = original
    html = inject(html, "head", partials["head"], where)
    html = inject(html, "nav", nav_for(page, partials["nav"]), where)
    html = inject(html, "footer", partials["footer"], where)

    if 'id="main"' not in html and "id='main'" not in html:
        warnings.append(f'{where}: no element with id="main" — the skip link has no target')

    if html != original:
        path.write_text(html, encoding="utf-8")
        return "updated"
    return "unchanged"


def classify(relpath: str, page):
    """(changefreq, priority) for the sitemap."""
    parts = relpath.split("/")
    if relpath == "index.html":
        return "weekly", "1.0"
    if page in ("legal", "contact") or parts[0] in LEGAL_DIRS:
        return "yearly", "0.3"
    if len(parts) == 2 and parts[1] == "index.html":
        return "weekly", "0.9"  # section landing: /vaults/, /nevermissed/, /insights/
    return "monthly", "0.7"


def build_sitemap(warnings: list) -> str:
    today = datetime.date.today().isoformat()
    entries = []
    for p in iter_html(REPO):
        r = rel(p)
        if r == "404.html":
            continue
        html = p.read_text(encoding="utf-8")
        if is_noindex(html):
            continue
        loc = SITE + "/" + r
        if loc.endswith("/index.html"):
            loc = loc[: -len("index.html")]
        freq, prio = classify(r, data_page(html))
        entries.append((-float(prio), loc, freq, prio))
    entries.sort()
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for _, loc, freq, prio in entries:
        lines.append(f"  <url><loc>{loc}</loc><lastmod>{today}</lastmod>"
                     f"<changefreq>{freq}</changefreq><priority>{prio}</priority></url>")
    lines.append("</urlset>")
    xml = "\n".join(lines) + "\n"
    out = REPO / "sitemap.xml"
    status = "unchanged"
    if not out.exists() or out.read_text(encoding="utf-8") != xml:
        out.write_text(xml, encoding="utf-8")
        status = "updated"
    print(f"sitemap.xml: {len(entries)} urls ({status})")
    return status


def run_store_build():
    sb = REPO / "tools" / "store_build.py"
    if not sb.exists():
        print("store: tools/store_build.py not present — skipping store generation")
        return
    sys.path.insert(0, str(REPO / "tools"))
    try:
        import store_build  # noqa: WPS433 (runtime import by design)
        store_build.build(REPO)
        print("store: generated from data/products.json")
    except Exception as exc:  # surface clearly, then fail the build
        raise BuildError(f"store_build.build(repo_root) failed: {exc.__class__.__name__}: {exc}") from exc


def resolve_targets(only: list) -> list:
    targets = []
    for raw in only:
        p = Path(raw)
        cand = (Path.cwd() / p) if not p.is_absolute() else p
        if not cand.exists():
            cand = REPO / p
        if not cand.exists():
            raise BuildError(f"--only path not found: {raw}")
        cand = cand.resolve()
        try:
            cand.relative_to(REPO)
        except ValueError:
            raise BuildError(f"--only path is outside the repo: {raw}")
        targets.append(cand)
    return targets


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="ravolution.agency static build")
    ap.add_argument("--only", nargs="+", metavar="PATH", help="inject partials only into these files/dirs")
    ap.add_argument("--store", action="store_true", help="run tools/store_build.py first (implied by a full build)")
    args = ap.parse_args(argv)

    warnings, errors = [], []
    counts = {"updated": 0, "unchanged": 0, "skipped": 0}
    try:
        if args.only is None or args.store:
            run_store_build()
        partials = load_partials()
        roots = resolve_targets(args.only) if args.only else [REPO]
        seen = set()
        for root in roots:
            for page in iter_html(root):
                if page in seen:
                    continue
                seen.add(page)
                try:
                    status = process_page(page, partials, warnings)
                    counts[status] += 1
                    if status != "skipped":
                        print(f"{status:9s} {rel(page)}")
                except BuildError as exc:
                    errors.append(str(exc))
        if not errors and args.only is None:
            build_sitemap(warnings)
    except BuildError as exc:
        errors.append(str(exc))

    for w in warnings:
        print(f"warning: {w}", file=sys.stderr)
    for e in errors:
        print(f"ERROR: {e}", file=sys.stderr)
    print(f"done: {counts['updated']} updated, {counts['unchanged']} unchanged, "
          f"{counts['skipped']} skipped, {len(warnings)} warnings, {len(errors)} errors")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
