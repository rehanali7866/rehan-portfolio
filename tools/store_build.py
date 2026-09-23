#!/usr/bin/env python3
"""
tools/store_build.py — generates everything under vaults/ from data/products.json
and tools/templates/*.html.

Public entry point:
    build(repo_root: Path) -> None

Called by tools/build.py (`import store_build; store_build.build(repo_root)`) before
the normal partial-injection pass runs over the repo. Can also be run directly for
fast iteration: `python3 tools/store_build.py` builds against the real repo.

Writes:
  vaults/index.html                      the door + catalogue
  vaults/category/<slug>.html            5 category ("shelf") pages
  vaults/product/<slug>.html             15 products + 3 bundles = 18 pages
  vaults/cart.html                       noindex
  vaults/account/index.html              noindex
  vaults/thanks/index.html               noindex

Every generated page keeps the @head / @nav / @footer marker pairs (still empty —
tools/build.py's partial-injection pass fills them in afterwards) and carries
data-page="vaults" so that pass accepts it.
"""
from __future__ import annotations

import json
from html import escape as _esc
from pathlib import Path

SITE = "https://ravolution.agency"
CATEGORY_ORDER = ["fitness", "wealth", "ai", "mindset", "health"]


def esc(value) -> str:
    return _esc(str(value), quote=True)


def money(pence: int) -> str:
    pence = int(pence)
    pounds, rem = divmod(pence, 100)
    if rem == 0:
        return f"£{pounds:,}"
    return f"£{pounds:,}.{rem:02d}"


def jsonld(obj) -> str:
    """A <script type="application/ld+json"> block, safe against premature </script>."""
    body = json.dumps(obj, ensure_ascii=False, indent=2).replace("</", "<\\/")
    return f'  <script type="application/ld+json">\n{body}\n  </script>'


def json_block(obj, el_id: str) -> str:
    if isinstance(obj, dict) and "coupons" in obj:
        obj = {**obj, "coupons": [c for c in obj["coupons"] if c.get("active")]}
    body = json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")
    return f'<script type="application/json" id="{el_id}">{body}</script>'


def make_description(base: str, filler: str, lo: int = 120, hi: int = 160) -> str:
    text = base.strip()
    if len(text) > hi:
        cut = text[: hi - 1].rsplit(" ", 1)[0]
        return cut.rstrip(",.;: ") + "…"
    if len(text) >= lo:
        return text
    candidate = (text + " " + filler).strip()
    if len(candidate) <= hi:
        return candidate
    # trim the filler to fit
    # filler doesn't fit whole: use as many complete sentences as fit, never a cut-off phrase
    out = text
    for sentence in [s.strip() for s in filler.replace(". ", ".|").split("|") if s.strip()]:
        if len(out) + 1 + len(sentence) <= hi:
            out = (out + " " + sentence).strip()
        else:
            break
    return out


# --------------------------------------------------------------------- data


def load_data(repo: Path) -> dict:
    return json.loads((repo / "data" / "products.json").read_text(encoding="utf-8"))


def category_map(data: dict) -> dict:
    return {c["slug"]: c for c in data["categories"]}


def product_map(data: dict) -> dict:
    return {p["slug"]: p for p in data["products"]}


def bundle_category(bundle: dict, products: dict) -> str:
    cats = {products[s]["category"] for s in bundle["includes"]}
    return next(iter(cats)) if len(cats) == 1 else "bundle"


def bundle_status(bundle: dict, products: dict) -> str:
    return "live" if all(products[s]["status"] == "live" for s in bundle["includes"]) else "coming_soon"


def normalize_product(p: dict) -> dict:
    return {
        "kind": "product",
        "slug": p["slug"],
        "title": p["title"],
        "cover_title": p["cover_title"],
        "cover_sub": p["cover_sub"],
        "tagline": p["tagline"],
        "description": p["description"],
        "highlights": p["highlights"],
        "pages": p["pages"],
        "category": p["category"],
        "price_pence": p["price_pence"],
        "compare_at_pence": p.get("compare_at_pence"),
        "status": p["status"],
        "featured": bool(p.get("featured")),
        "checkout": p.get("checkout", {"url": ""}),
        "cover_image": p.get("cover_image"),
        "og_image": p.get("og_image"),
        "includes": None,
        "saving_pence": None,
    }


def normalize_bundle(b: dict, products: dict) -> dict:
    cat = bundle_category(b, products)
    n = len(b["includes"])
    compare_at = sum(products[s]["price_pence"] for s in b["includes"])
    return {
        "kind": "bundle",
        "slug": b["slug"],
        "title": b["title"],
        "cover_title": b["title"],
        "cover_sub": f"{n} guides in one set",
        "tagline": b["blurb"],
        "description": b["blurb"],
        "highlights": None,
        "pages": None,
        "category": cat,
        "price_pence": b["price_pence"],
        "compare_at_pence": compare_at,
        "status": bundle_status(b, products),
        "featured": True,
        "checkout": b.get("checkout", {"url": ""}),
        "includes": b["includes"],
        "saving_pence": b.get("saving_pence", compare_at - b["price_pence"]),
    }


def build_items(data: dict) -> list:
    products = product_map(data)
    items = [normalize_bundle(b, products) for b in data["bundles"]]
    items += [normalize_product(p) for p in data["products"]]
    return items


# ---------------------------------------------------------------- fragments


TRUST_COPY = [
    ("Instant delivery", "Download it on screen the moment payment clears, with a copy of the link in your inbox. No waiting room, no drip feed, no upsell page."),
    ("30-day money-back", "Not what you expected? Ask within 30 days and you get a full refund, checked personally under our refund policy."),
    ("Written from practice", "Every guide comes from doing the thing, not from summarising other people's books. Where something is uncertain, it says so."),
    ("Yours to keep", "Pay once and it stays yours. No subscription. Keep the email and you can download it again whenever you need it."),
]


def trust_html(compact: bool = False) -> str:
    cls = "trust-strip compact" if compact else "trust-strip"
    items = "".join(
        f'<li class="trust-item"><h3>{esc(h)}</h3><p>{esc(p)}</p></li>' for h, p in TRUST_COPY
    )
    return f'<ul class="{cls}">{items}</ul>'


def faq_html(pairs) -> str:
    out = ['<div class="faq reveal">']
    for q, a in pairs:
        out.append(f'<details><summary>{esc(q)}</summary><div class="faq-a"><p>{a}</p></div></details>')
    out.append("</div>")
    return "\n".join(out)


def crumbs_html(parts) -> str:
    """parts: list of (label, href_or_None) — last one has href=None (current page)."""
    bits = []
    for i, (label, href) in enumerate(parts):
        if i:
            bits.append('<span aria-hidden="true">/</span>')
        if href:
            bits.append(f'<a href="{esc(href)}">{esc(label)}</a>')
        else:
            bits.append(f'<span aria-current="page">{esc(label)}</span>')
    return f'<nav class="crumbs" aria-label="Breadcrumb">{"".join(bits)}</nav>'


def cover_html(item: dict, cats: dict, author: str, big: bool = False) -> str:
    cat = cats.get(item["category"])
    accent = cat["accent"] if cat else "#3a342e"
    cat_label = cat["name"] if cat else "Bundle"
    cls = "cover" + (" cover--big" if big else "")
    if item.get("cover_image"):
        if big:
            return (
                f'<div class="{cls} cover--img" style="--accent:{esc(accent)}">'
                f'<img src="{esc(item["cover_image"])}" alt="{esc(item["title"])} book cover" loading="eager" fetchpriority="high" decoding="async"/>'
                f'<span class="cover__shine"></span></div>'
            )
        return (
            f'<div class="{cls} cover--img" style="--accent:{esc(accent)}" aria-hidden="true">'
            f'<img src="{esc(item["cover_image"])}" alt="" loading="lazy" decoding="async"/>'
            f'<span class="cover__shine"></span></div>'
        )
    if item["kind"] == "bundle" and item["includes"]:
        minis = []
        for slug in item["includes"][:3]:
            minis.append(f'<span class="cover__mini" style="--accent:{esc(accent)}"></span>')
        stack = "".join(minis)
        return (
            f'<div class="{cls} cover--stack" style="--accent:{esc(accent)}" aria-hidden="true">'
            f'<span class="cover__spine"></span>'
            f'<span class="cover__stack-wrap">{stack}</span>'
            f'<span class="cover__inner">'
            f'<span class="cover__brand">RAVOLUTION</span>'
            f'<span class="cover__rule"></span>'
            f'<span class="cover__title">{esc(item["cover_title"])}</span>'
            f'<span class="cover__sub">{esc(item["cover_sub"])}</span>'
            f'<span class="cover__foot"><span class="cover__author">{esc(author)}</span>'
            f'<span class="cover__cat">Bundle</span></span>'
            f'</span><span class="cover__shine"></span></div>'
        )
    return (
        f'<div class="{cls}" style="--accent:{esc(accent)}" aria-hidden="true">'
        f'<span class="cover__spine"></span>'
        f'<span class="cover__inner">'
        f'<span class="cover__brand">RAVOLUTION</span>'
        f'<span class="cover__rule"></span>'
        f'<span class="cover__title">{esc(item["cover_title"])}</span>'
        f'<span class="cover__sub">{esc(item["cover_sub"])}</span>'
        f'<span class="cover__foot"><span class="cover__author">{esc(author)}</span>'
        f'<span class="cover__cat">{esc(cat_label)}</span></span>'
        f'</span><span class="cover__shine"></span></div>'
    )


def price_html(item: dict) -> str:
    price = money(item["price_pence"])
    if item.get("compare_at_pence"):
        return f'<s class="price-was">{money(item["compare_at_pence"])}</s> <span class="price-now">{price}</span>'
    return f'<span class="price-now">{price}</span>'


def render_card(item: dict, cats: dict, author: str, provider: str = "none") -> str:
    cat = cats.get(item["category"])
    cat_name = cat["name"] if cat else "Bundle"
    href = f"/vaults/product/{item['slug']}.html"
    title_attr = item["title"].lower()
    tag_attr = item["tagline"].lower()
    foot_badges = ""
    if item["kind"] == "bundle":
        foot_badges += f'<span class="badge badge-bundle">BUNDLE · SAVE {money(item["saving_pence"])}</span>'
    meta_bits = []
    if item["kind"] == "product" and item["status"] != "live":
        meta_bits.append('In progress')
    elif item["kind"] == "product":
        meta_bits.append(f'{item["pages"]} pages')
    else:
        meta_bits.append(f'{len(item["includes"])} guides')
    meta_bits.append(f'By {author}')
    action = ""
    if item["status"] == "coming_soon":
        action = '<span class="badge badge-soon">Coming soon</span>'
    else:
        url = (item.get("checkout") or {}).get("url") or ""
        if provider == "links" and url:
            buy_now = (f'<a class="btn-primary btn-sm buy-now" href="{esc(url)}" '
                       f'data-store-buy data-id="{esc(item["slug"])}" data-kind="{item["kind"]}">Buy now</a>')
        else:
            buy_now = (f'<button type="button" class="btn-primary btn-sm buy-now" '
                       f'data-store-buy data-id="{esc(item["slug"])}" data-kind="{item["kind"]}">Buy now</button>')
        action = (
            f'<div class="card-actions">{buy_now}'
            f'<button type="button" class="btn-secondary btn-sm buy-add" '
            f'data-store-add data-id="{esc(item["slug"])}" data-kind="{item["kind"]}">+ Add to cart</button></div>'
        )
    return f'''<li class="vault-card" data-cat="{esc(item["category"])}" data-status="{esc(item["status"])}" data-featured="{"true" if item["featured"] else "false"}" data-price="{item["price_pence"]}" data-title="{esc(title_attr)}" data-tagline="{esc(tag_attr)}" data-type="{item["kind"]}">
  <a class="cover-link" href="{esc(href)}" aria-label="{esc(item["title"])}">{cover_html(item, cats, author)}</a>
  <div class="card-body">
    {foot_badges}<span class="card-cat">{esc(cat_name)}</span>
    <h3 class="card-title"><a href="{esc(href)}">{esc(item["title"])}</a></h3>
    <p class="card-tagline">{esc(item["tagline"])}</p>
    <p class="card-meta">{esc(" · ".join(meta_bits))}</p>
    <div class="card-foot">
      <p class="card-price">{price_html(item)}</p>
      {action}
    </div>
  </div>
</li>'''


def render_shelf_card(cat: dict, count: int) -> str:
    return f'''<li class="shelf-card" style="--accent:{esc(cat["accent"])}">
  <a href="/vaults/category/{esc(cat["slug"])}.html">
    <span class="shelf-mark" aria-hidden="true"></span>
    <h3>{esc(cat["name"])}</h3>
    <p>{esc(cat["blurb"])}</p>
    <span class="shelf-count">{count} guide{"s" if count != 1 else ""}</span>
    <span class="shelf-arrow" aria-hidden="true">&rarr;</span>
  </a>
</li>'''


def toolbar_html(mode: str, cats: dict, current_cat: str) -> str:
    chips = [f'<a class="chip{" is-active" if current_cat == "all" else ""}" data-cat="all" href="/vaults/"'
             + (' aria-current="page"' if current_cat == "all" else "") + '>All</a>']
    for slug in CATEGORY_ORDER:
        c = cats[slug]
        active = current_cat == slug
        current_attr = ' aria-current="page"' if active else ""
        chips.append(
            f'<a class="chip{" is-active" if active else ""}" data-cat="{slug}" '
            f'href="/vaults/category/{slug}.html"{current_attr}>{esc(c["short"])}</a>'
        )
    return f'''<div class="store-toolbar" data-store-toolbar data-mode="{mode}" data-cat="{esc(current_cat)}">
  <div class="store-search">
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m20 20-3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <label class="visually-hidden" for="storeSearch">Search the Vaults</label>
    <input class="input" type="search" id="storeSearch" placeholder="Search guides&hellip;" autocomplete="off" data-store-search />
  </div>
  <div class="store-chips" role="group" aria-label="Filter by shelf" data-store-chips>
    {"".join(chips)}
  </div>
  <div class="store-selects">
    <label class="visually-hidden" for="storeSort">Sort by</label>
    <select class="input store-select" id="storeSort" data-store-sort>
      <option value="featured">Featured</option>
      <option value="price-asc">Price: low to high</option>
      <option value="price-desc">Price: high to low</option>
      <option value="title-asc">Title A&ndash;Z</option>
    </select>
    <label class="visually-hidden" for="storeAvail">Availability</label>
    <select class="input store-select" id="storeAvail" data-store-avail>
      <option value="all">All</option>
      <option value="available">Available now</option>
      <option value="soon">Coming soon</option>
    </select>
  </div>
</div>'''


def preview_strip_html(provider: str) -> str:
    if provider != "none":
        return ""
    return '<p class="store-preview-strip" role="note">PREVIEW &middot; The Vaults open soon. Browse now, buy at launch.</p>'


PAY_PILLS = '<ul class="pay-pills" aria-label="Payment methods accepted at checkout"><li>VISA</li><li>MASTERCARD</li><li>AMEX</li><li>APPLE PAY</li><li>GOOGLE PAY</li></ul>'
SECURE_LINE = '<p class="secure-line">Secure checkout &middot; handled by our payment provider &middot; card details never touch our servers</p>'


# ---------------------------------------------------------------- layout


def render_layout(layout: str, **slots) -> str:
    out = layout
    for key, val in slots.items():
        out = out.replace("{{" + key + "}}", val if val is not None else "")
    return out


def base_meta(title: str, description: str, canonical: str, robots: bool, og_title: str = None) -> dict:
    return {
        "TITLE": esc(title),
        "DESCRIPTION": esc(description),
        "ROBOTS": '\n  <meta name="robots" content="noindex" />' if robots else "",
        "CANONICAL": esc(canonical),
        "OG_TITLE": esc(og_title or title),
        "OG_TYPE": "website",
        "OG_EXTRA": "",
        "HEAD_EXTRA": "",
        "THEME_EXTRA": "",
        "OG_IMAGE": f"{SITE}/assets/og-vaults.jpg",
        "OG_IMAGE_ALT": "The Vaults — digital products by Ravolution",
    }


# ---------------------------------------------------------------- pages


def build_catalogue(data: dict, cats: dict, items: list, layout: str, product_html: str) -> str:
    author = data["config"].get("author", "Raki")
    provider = data["config"]["checkout"]["provider"]
    status = data["config"]["status"]
    live_products = [i for i in items if i["kind"] == "product" and i["status"] == "live"]
    cards = "\n".join(render_card(i, cats, author, provider) for i in items)
    shelves = "\n".join(
        render_shelf_card(cats[slug], sum(1 for i in items if i["kind"] == "product" and i["category"] == slug))
        for slug in CATEGORY_ORDER
    )
    scroll_cue = "SCROLL TO PREVIEW &darr;" if status == "preview" else "SCROLL TO ENTER &darr;"
    door_sub = "opening soon." if status == "preview" else "the archive."

    door_subject = "Vaults waitlist" if status == "preview" else "Vaults new drops"
    door_lead = "Get the key. One email when the doors open." if status == "preview" else "Get the key. One email each time a new guide lands."
    door_cta = f'''<form class="waitlist-form" data-form data-subject="{door_subject}" data-event="waitlist_join" data-success="YOU'RE ON THE LIST" novalidate>
      <p class="form-label">{door_lead}</p>
      <label class="visually-hidden" for="doorEmail">Your email</label>
      <div class="form-row">
        <input class="input" id="doorEmail" name="email" type="email" placeholder="you@example.com" autocomplete="email" required data-msg-required="ENTER YOUR EMAIL FIRST" />
        <button class="btn-form" type="submit" data-track="cta_click">Get the key</button>
      </div>
      <input type="text" name="_honey" class="honey" tabindex="-1" autocomplete="off" aria-hidden="true" />
      <p class="form-note" role="status" aria-live="polite">ONE EMAIL. NO SPAM. UNSUBSCRIBE ANY TIME.</p>
    </form>'''

    main = render_layout(
        product_html,
        PREVIEW_STRIP=preview_strip_html(provider),
        DOOR_SUB=door_sub,
        DOOR_CTA=door_cta,
        SCROLL_CUE=scroll_cue,
        TOOLBAR=toolbar_html("catalogue", cats, "all"),
        COUNT=str(len(items)),
        CARDS=cards,
        SHELVES=shelves,
        TRUST=trust_html(False),
        FAQ=faq_html([
            ("How do I get a guide after I buy it?", "As soon as payment clears you get an email with a permanent PDF download link. Lost it? Head to <a href=\"/vaults/account/\">Your Library</a> and it will be resent within one working day."),
            ("What format are the guides in?", "Every guide is a PDF, so it opens on any phone, tablet or laptop. Kindle readers can send it to their Kindle too."),
            ("What is the refund policy?", "Every guide carries a 30-day money-back guarantee. Request it on the <a href=\"/refunds/#refund-request\">Refunds page</a> or by email. Every request is checked personally, and once it is approved the money goes back to your original payment method, normally within 5 to 10 working days."),
            ("Can I buy more than one at a time?", "Yes, one after the other. Each guide checks out on its own through Stripe, so buy one, then come back for the next. Every guide lands in your inbox separately."),
            (("When does checkout open?", "The catalogue is open to browse now. Checkout switches on at launch &mdash; join the waitlist above or <a href=\"/insights/#dispatch\">the Dispatch list</a> and you will get one email when it goes live.") if status == "preview" else ("Can I buy today?", "Yes. Any guide with a price and a Buy now button is available right now. Payment goes through Stripe and the download lands in your inbox straight after. Guides marked Coming soon have a Notify me button &mdash; one email the day each one lands.")),
        ]),
    )

    slots = base_meta(
        "RAVOLUTION VAULTS — Opening Soon" if status == "preview" else "The Vaults — Ravolution",
        make_description(
            "Practical guides on training, money, health, attention and automation, written by " + author + ".",
            "Sculpted, the 12-week aesthetic programme, is on sale now. More guides on the way.",
        ),
        f"{SITE}/vaults/",
        robots=False,
    )
    # The door section (#vault-intro) is dark and sits directly under the nav on
    # first load, so this page overrides the partial's #d1c7bd theme-color. Must
    # be declared before the @head markers (browsers use the first theme-color
    # meta tag) so it wins over the one the head partial injects.
    # (theme-color comes from the shared head partial)
    breadcrumb_ld = {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{SITE}/"},
            {"@type": "ListItem", "position": 2, "name": "The Vaults", "item": f"{SITE}/vaults/"},
        ],
    }
    faq_ld = {
        "@context": "https://schema.org", "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": "How do I get a guide after I buy it?", "acceptedAnswer": {"@type": "Answer", "text": "As soon as payment clears you get an email with a permanent PDF download link. If you lose it, Your Library can have it resent within one working day."}},
            {"@type": "Question", "name": "What is the refund policy?", "acceptedAnswer": {"@type": "Answer", "text": "Every guide carries a 30-day money-back guarantee. Request it on the Refunds page or by email. Every request is checked personally, and approved refunds go back to your original payment method within 5 to 10 working days."}},
            ({"@type": "Question", "name": "When does checkout open?", "acceptedAnswer": {"@type": "Answer", "text": "The catalogue is open to browse now. Checkout switches on at launch; join the waitlist for one email when it goes live."}} if status == "preview" else {"@type": "Question", "name": "Can I buy today?", "acceptedAnswer": {"@type": "Answer", "text": "Yes. Any guide with a price and a Buy now button is available right now. Payment goes through Stripe and the download lands in your inbox straight after. Guides marked Coming soon have a Notify me button, one email the day each one lands."}}),
        ],
    }
    json_ld = jsonld(breadcrumb_ld) + "\n" + jsonld(faq_ld)
    scripts = json_block(data, "rvCatalogue")

    return render_layout(
        layout,
        **slots,
        JSON_LD=json_ld,
        KIND="catalogue",
        MAIN=main,
        AFTER_MAIN='<a class="sticky-cta" href="/vaults/cart.html" data-hide-when="#start" data-track="cta_click" data-cart-sticky>View basket (<span data-cart-count>0</span>)</a>',
        SCRIPTS=scripts,
    )


def build_category(slug: str, data: dict, cats: dict, items: list, layout: str, category_html: str, cat_number: int) -> str:
    author = data["config"].get("author", "Raki")
    provider = data["config"]["checkout"]["provider"]
    cat = cats[slug]
    own_items = [i for i in items if i["category"] == slug]
    cards = "\n".join(render_card(i, cats, author, provider) for i in own_items)
    other = [s for s in CATEGORY_ORDER if s != slug]
    shelves = "\n".join(
        render_shelf_card(cats[s], sum(1 for i in items if i["kind"] == "product" and i["category"] == s))
        for s in other
    )
    n_live = sum(1 for i in own_items if i["kind"] == "product" and i["status"] == "live")
    n_total = sum(1 for i in own_items if i["kind"] == "product")
    cat_meta = f"{n_total} guide{'s' if n_total != 1 else ''} on this shelf" + (f" · {n_live} available now" if n_live != n_total else "")

    main = render_layout(
        category_html,
        PREVIEW_STRIP=preview_strip_html(provider),
        CRUMBS=crumbs_html([("Vaults", "/vaults/"), (cat["name"], None)]),
        CAT_NUM=f"{cat_number:02d}",
        ACCENT=cat["accent"],
        CAT_NAME=esc(cat["name"]),
        CAT_BLURB=esc(cat["blurb"]),
        CAT_META=cat_meta,
        TOOLBAR=toolbar_html("category", cats, slug),
        COUNT=str(len(own_items)),
        CARDS=cards,
        SHELVES=shelves,
        TRUST=trust_html(False) if n_live else "",
        FINAL_TEXT=("Pick the one thing you want to be better at by next month. Instant access, 30-day money-back guarantee." if n_live
                    else "Nothing on this shelf is on sale yet. Browse the rest of the Vaults, or use Notify me on any guide above."),
    )

    title = f'{cat["name"]} · Ravolution Vaults'
    slots = base_meta(
        title,
        make_description(
            cat["blurb"],
            (f'{n_total} guides by {author}, {n_live} on sale now with instant PDF download and a 30-day money-back guarantee.' if n_live
             else f'{n_total} guides by {author}, being written now. Get one email the day each one lands.'),
        ),
        f"{SITE}/vaults/category/{slug}.html",
        robots=False,
    )
    breadcrumb_ld = {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{SITE}/"},
            {"@type": "ListItem", "position": 2, "name": "The Vaults", "item": f"{SITE}/vaults/"},
            {"@type": "ListItem", "position": 3, "name": cat["name"], "item": f"{SITE}/vaults/category/{slug}.html"},
        ],
    }
    scripts = json_block(data, "rvCatalogue")
    return render_layout(
        layout,
        **slots,
        JSON_LD=jsonld(breadcrumb_ld),
        KIND="category",
        MAIN=main,
        AFTER_MAIN='<a class="sticky-cta" href="/vaults/cart.html" data-hide-when="#start" data-track="cta_click" data-cart-sticky>View basket (<span data-cart-count>0</span>)</a>',
        SCRIPTS=scripts,
    )


def pick_related(item: dict, items: list, max_n: int = 2) -> list:
    if item["kind"] != "product":
        return []
    same_cat = [i for i in items if i["kind"] == "product" and i["slug"] != item["slug"]
                and i["category"] == item["category"] and i["status"] == "live"]
    chosen = same_cat[:max_n]
    if len(chosen) < max_n and item["status"] == "live":
        pool = [i for i in items if i["kind"] == "product" and i["slug"] != item["slug"]
                and i["status"] == "live" and i not in chosen]
        pool.sort(key=lambda i: (not i["featured"],))
        for cand in pool:
            if len(chosen) >= max_n:
                break
            chosen.append(cand)
    return chosen


def find_bundles_containing(slug: str, items: list) -> list:
    return [i for i in items if i["kind"] == "bundle" and i["includes"] and slug in i["includes"]]


def build_product(item: dict, data: dict, cats: dict, items: list, layout: str, product_html: str) -> str:
    author = data["config"].get("author", "Raki")
    provider = data["config"]["checkout"]["provider"]
    cat = cats.get(item["category"])
    cat_name = cat["name"] if cat else "Bundle"
    slug = item["slug"]

    is_live = item["status"] == "live"
    meta_chips = []
    if not is_live:
        meta_chips.append('<li>Coming soon</li>')
    elif item["kind"] == "product":
        meta_chips.append(f'<li>{item["pages"]} pages</li>')
    else:
        meta_chips.append(f'<li>{len(item["includes"])} guides</li>')
    meta_chips.append(f'<li>{" + ".join(data["config"]["formats"])}</li>')
    if is_live:
        meta_chips.append('<li>Instant download</li>')

    # buy box
    if item["status"] == "coming_soon":
        subject = f'Vaults waitlist — {item["title"]}'
        buy_box = f'''<form class="waitlist-form" data-form data-subject="{esc(subject)}" data-event="waitlist_join" data-success="YOU'RE ON THE LIST" novalidate>
      <p class="form-label">Notify me when it opens</p>
      <label class="visually-hidden" for="notify-{esc(slug)}">Your email</label>
      <div class="form-row">
        <input class="input" id="notify-{esc(slug)}" name="email" type="email" placeholder="you@example.com" autocomplete="email" required data-msg-required="ENTER YOUR EMAIL FIRST" />
        <button class="btn-form" type="submit" data-track="cta_click">Notify me</button>
      </div>
      <input type="text" name="_honey" class="honey" tabindex="-1" autocomplete="off" aria-hidden="true" />
      <p class="form-note" role="status" aria-live="polite">WE&rsquo;LL EMAIL YOU THE MOMENT THIS OPENS.</p>
    </form>'''
    else:
        add_btn = f'<button type="button" class="btn-secondary buy-add" data-store-add data-id="{esc(slug)}" data-kind="{item["kind"]}">+ Add to cart</button>'
        url = (item.get("checkout") or {}).get("url") or ""
        if provider == "links" and url:
            buy_btn = f'<a class="btn-primary buy-now" href="{esc(url)}" data-store-buy data-id="{esc(slug)}" data-kind="{item["kind"]}">Buy now &mdash; instant delivery</a>'
        else:
            buy_btn = f'<button type="button" class="btn-primary buy-now" data-store-buy data-id="{esc(slug)}" data-kind="{item["kind"]}">Buy now &mdash; instant delivery</button>'
        buy_box = f'<div class="buy-actions">{buy_btn}{add_btn}</div>'

    if item["kind"] == "bundle":
        get_heading = "What&rsquo;s included"
        rows = []
        for inc_slug in item["includes"]:
            p = next(i for i in items if i["kind"] == "product" and i["slug"] == inc_slug)
            rows.append(
                f'<li><a href="/vaults/product/{esc(inc_slug)}.html">{esc(p["title"])}</a>'
                f'<span>{money(p["price_pence"])}</span></li>'
            )
        get_list = f'<ul class="get-list bundle-includes">{"".join(rows)}</ul>'
        about_heading = "About this bundle"
        about = (
            f'<p>{esc(item["tagline"])}</p>'
            f'<p>Bought separately these {len(item["includes"])} guides cost {money(item["compare_at_pence"])}. '
            f'As a bundle it is {money(item["price_pence"])} &mdash; a saving of {money(item["saving_pence"])}.</p>'
        )
    else:
        get_heading = "What you&rsquo;ll get"
        get_list = '<ul class="get-list">' + "".join(f'<li>{esc(h)}</li>' for h in item["highlights"]) + '</ul>'
        about_heading = "About this guide"
        about = f'<p>{esc(item["description"])}</p>'

    related_items = pick_related(item, items)
    bundles_with = find_bundles_containing(slug, items) if item["kind"] == "product" else []
    related_pool = related_items + [b for b in bundles_with if b not in related_items]
    if related_pool:
        related_cards = "\n".join(render_card(r, cats, author, provider) for r in related_pool[:3])
        related_html = f'''<section class="pdp-related" id="related">
  <div class="container">
    <div class="section-head reveal">
      <span class="eyebrow"><b>&middot;</b> Pairs well with</span>
      <h2>Keep <em>going.</em></h2>
    </div>
    <ul class="store-grid related-grid reveal">
{related_cards}
    </ul>
  </div>
</section>'''
    else:
        related_html = ""

    faq_pairs = [
        ("What format is this in?", "A PDF, so it opens on any phone, tablet or laptop. Kindle readers can send it to their Kindle too."),
        ("How do I get it after I buy?", 'Straight away. After payment you download it on the order page, and the link is emailed to you as well. Lost the email? <a href="/vaults/account/">Request a resend</a> and it is sent again within one working day.'),
        ("What if it is not for me?", 'It carries a 30-day money-back guarantee. Request it on the <a href="/refunds/#refund-request">Refunds page</a> or by email. Every request is checked personally, then the money goes back to your original payment method.'),
    ]

    if not is_live:
        faq_pairs = [
            ("When will it be ready?", "It is being written now. Guides go on sale one at a time, and only once they are finished and checked. Use Notify me above and you get one email the day it lands."),
            ("What format will it be?", "A PDF, so it opens on any phone, tablet or laptop. Kindle readers can send it to their Kindle too."),
            ("Can I buy something today?", '<a href="/vaults/product/sculpted-12-week-aesthetic-blueprint.html">Sculpted: The 12-Week Aesthetic Blueprint</a> is on sale now, with a 30-day money-back guarantee.'),
        ]
    pay_info = ('<p class="secure-line">Secure checkout · handled by Stripe · card details never touch our servers</p>\n'
                '        <ul class="pay-pills" aria-label="Payment methods accepted at checkout"><li>VISA</li><li>MASTERCARD</li><li>AMEX</li><li>APPLE PAY</li><li>GOOGLE PAY</li></ul>') if is_live else ""

    crumbs = crumbs_html([("Vaults", "/vaults/")]
                          + ([(cat_name, f"/vaults/category/{item['category']}.html")] if cat else [])
                          + [(item["title"], None)])

    main = render_layout(
        product_html,
        PREVIEW_STRIP=preview_strip_html(provider),
        CRUMBS=crumbs,
        COVER=cover_html(item, cats, author, big=True),
        CAT_LINE=esc(cat_name),
        TITLE_H1=esc(item["title"]),
        TAGLINE=esc(item["tagline"]),
        META_CHIPS="\n".join(meta_chips),
        PRICE_HTML=price_html(item),
        BUY_BOX=buy_box,
        TRUST=trust_html(True) if is_live else "",
        PAY_INFO=pay_info,
        FAQ_HEAD=("Format, delivery, <em>refunds.</em>" if is_live else "Timing, format, <em>what&rsquo;s next.</em>"),
        FAQ_EYEBROW=("Before you buy" if is_live else "Coming soon"),
        GET_HEADING=get_heading,
        GET_LIST=get_list,
        ABOUT_HEADING=about_heading,
        ABOUT=about,
        RELATED=related_html,
        FAQ=faq_html(faq_pairs),
    )

    short = item.get("cover_title") or item["title"]
    title = f'{item["title"]} · Ravolution' if is_live and len(item["title"]) <= 50 else f'{short} · Ravolution Vaults'
    if is_live:
        desc_fill = f'By {author}. {item["pages"]} pages, PDF, {money(item["price_pence"])}. Instant download and a 30-day money-back guarantee.'
    else:
        desc_fill = f'A guide by {author}, coming soon to Ravolution Vaults. Get one email the day it lands.'
    slots = base_meta(
        title,
        make_description(item["tagline"], desc_fill),
        f"{SITE}/vaults/product/{slug}.html",
        robots=False,
    )
    og_img = item.get("og_image")
    if og_img:
        slots["OG_IMAGE"] = f"{SITE}{og_img}"
        slots["OG_IMAGE_ALT"] = esc(f'{item["title"]} cover')
    breadcrumb_items = [{"@type": "ListItem", "position": 1, "name": "Home", "item": f"{SITE}/"},
                         {"@type": "ListItem", "position": 2, "name": "The Vaults", "item": f"{SITE}/vaults/"}]
    pos = 3
    if cat:
        breadcrumb_items.append({"@type": "ListItem", "position": pos, "name": cat_name, "item": f"{SITE}/vaults/category/{item['category']}.html"})
        pos += 1
    breadcrumb_items.append({"@type": "ListItem", "position": pos, "name": item["title"], "item": f"{SITE}/vaults/product/{slug}.html"})
    breadcrumb_ld = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": breadcrumb_items}
    product_ld = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": item["title"],
        "description": item["tagline"],
        "brand": {"@type": "Brand", "name": "Ravolution"},
        "url": f"{SITE}/vaults/product/{slug}.html",
        "offers": {
            "@type": "Offer",
            "price": f'{item["price_pence"] / 100:.2f}',
            "priceCurrency": data["config"]["currency"],
            "availability": "https://schema.org/InStock" if is_live else "https://schema.org/OutOfStock",
            "url": f"{SITE}/vaults/product/{slug}.html",
            "hasMerchantReturnPolicy": {"@id": f"{SITE}/refunds/#policy"},
        },
    }
    if item.get("cover_image"):
        product_ld["image"] = f'{SITE}{item["cover_image"]}'
    json_ld = jsonld(product_ld) + "\n" + jsonld(breadcrumb_ld)
    scripts = json_block(data, "rvCatalogue") + "\n" + json_block({
        "kind": item["kind"], "slug": slug, "title": item["title"],
        "price_pence": item["price_pence"], "category": item["category"], "status": item["status"],
    }, "rvProduct")

    return render_layout(
        layout,
        **slots,
        JSON_LD=json_ld,
        KIND="product",
        MAIN=main,
        AFTER_MAIN="",
        SCRIPTS=scripts,
    )


def build_cart(data: dict, layout: str, cart_html: str) -> str:
    provider = data["config"]["checkout"]["provider"]
    status = data["config"]["status"]
    main = render_layout(
        cart_html,
        PREVIEW_STRIP=preview_strip_html(provider),
        PROVIDER=esc(provider),
        STATUS=esc(status),
        TRUST=trust_html(True),
    )
    slots = base_meta(
        "Your Basket · Ravolution Vaults",
        "Your basket at Ravolution Vaults. Review the guide you picked and check out securely through Stripe, with instant PDF delivery.",
        f"{SITE}/vaults/cart.html",
        robots=True,
    )
    scripts = json_block(data, "rvCatalogue")
    return render_layout(layout, **slots, JSON_LD="", KIND="cart", MAIN=main, AFTER_MAIN="", SCRIPTS=scripts)


def build_account(data: dict, layout: str, account_html: str) -> str:
    provider = data["config"]["checkout"]["provider"]
    portal = data["config"]["checkout"].get("customer_portal_url") or ""
    if portal:
        action = f'''<div class="form-card account-portal">
  <p class="form-label">Open your library</p>
  <p>Manage your orders and re-download every guide from your payment provider&rsquo;s customer portal.</p>
  <a class="btn-primary" href="{esc(portal)}" data-track="cta_click">Open your library</a>
</div>'''
    else:
        action = '''<form class="form-card resend-form" id="resendForm" data-form data-subject="Resend downloads" data-event="account_resend_request" data-success="REQUEST RECEIVED — DOWNLOADS RESENT WITHIN ONE WORKING DAY" novalidate>
  <p class="form-label">Resend my downloads</p>
  <label class="visually-hidden" for="resendEmail">Your email</label>
  <input class="input" id="resendEmail" name="email" type="email" placeholder="you@example.com" autocomplete="email" required data-msg-required="ENTER YOUR EMAIL FIRST" />
  <label class="visually-hidden" for="resendRef">Order reference (optional)</label>
  <input class="input" id="resendRef" name="order_reference" type="text" placeholder="Order reference (optional)" autocomplete="off" />
  <button class="btn-form" type="submit" data-track="cta_click">Resend downloads</button>
  <input type="text" name="_honey" class="honey" tabindex="-1" autocomplete="off" aria-hidden="true" />
  <p class="form-note" role="status" aria-live="polite">WE&rsquo;LL RESEND YOUR LINKS WITHIN ONE WORKING DAY.</p>
</form>'''
    main = render_layout(
        account_html,
        PREVIEW_STRIP=preview_strip_html(provider),
        ACCOUNT_ACTION=action,
        TRUST=trust_html(False),
    )
    slots = base_meta(
        "Your Library · Ravolution Vaults",
        "Lost your Ravolution Vaults download email? Request a resend and your download link is emailed again within one working day.",
        f"{SITE}/vaults/account/",
        robots=True,
    )
    scripts = json_block(data, "rvCatalogue")
    return render_layout(layout, **slots, JSON_LD="", KIND="account", MAIN=main, AFTER_MAIN="", SCRIPTS=scripts)


def build_thanks(data: dict, layout: str, thanks_html: str) -> str:
    main = render_layout(thanks_html, TRUST=trust_html(False))
    slots = base_meta(
        "Order Received · Ravolution Vaults",
        "Thank you for your order from Ravolution Vaults. Download your guide on this page, and a copy of the link is on its way by email.",
        f"{SITE}/vaults/thanks/",
        robots=True,
    )
    scripts = json_block(data, "rvCatalogue")
    return render_layout(layout, **slots, JSON_LD="", KIND="thanks", MAIN=main, AFTER_MAIN="", SCRIPTS=scripts)


# --------------------------------------------------------------------- main


def build(repo_root) -> None:
    repo = Path(repo_root)
    data = load_data(repo)
    cats = category_map(data)
    items = build_items(data)

    templates = repo / "tools" / "templates"
    layout = (templates / "_layout.html").read_text(encoding="utf-8")
    catalogue_tpl = (templates / "catalogue.html").read_text(encoding="utf-8")
    category_tpl = (templates / "category.html").read_text(encoding="utf-8")
    product_tpl = (templates / "product.html").read_text(encoding="utf-8")
    cart_tpl = (templates / "cart.html").read_text(encoding="utf-8")
    account_tpl = (templates / "account.html").read_text(encoding="utf-8")
    thanks_tpl = (templates / "thanks.html").read_text(encoding="utf-8")

    vaults = repo / "vaults"
    vaults.mkdir(exist_ok=True)
    (vaults / "category").mkdir(exist_ok=True)
    (vaults / "product").mkdir(exist_ok=True)
    (vaults / "cart.html").parent.mkdir(exist_ok=True)
    (vaults / "account").mkdir(exist_ok=True)
    (vaults / "thanks").mkdir(exist_ok=True)

    written = []

    def write(path: Path, content: str):
        path.write_text(content, encoding="utf-8")
        written.append(path)

    write(vaults / "index.html", build_catalogue(data, cats, items, layout, catalogue_tpl))

    for i, slug in enumerate(CATEGORY_ORDER, start=1):
        write(vaults / "category" / f"{slug}.html", build_category(slug, data, cats, items, layout, category_tpl, i))

    for item in items:
        write(vaults / "product" / f"{item['slug']}.html", build_product(item, data, cats, items, layout, product_tpl))

    write(vaults / "cart.html", build_cart(data, layout, cart_tpl))
    write(vaults / "account" / "index.html", build_account(data, layout, account_tpl))
    write(vaults / "thanks" / "index.html", build_thanks(data, layout, thanks_tpl))

    print(f"store: wrote {len(written)} pages under vaults/")


if __name__ == "__main__":
    import sys
    root = Path(__file__).resolve().parent.parent
    build(root)
