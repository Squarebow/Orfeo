#!/usr/bin/env python3
"""
Orfeo GitHub stats collector.

Runs once a day from .github/workflows/stats.yml and keeps a permanent record
on the `stats` branch, because GitHub itself only keeps:
  - release download counts as running totals (no history), and
  - traffic (views, clones, referring sites, popular pages) for 14 days.

Each run adds today's numbers to the CSV files in data/ (never removes
anything) and rebuilds traffic.md, a shareable summary.

Environment:
  REPO            owner/name, e.g. Squarebow/Orfeo
  GH_TOKEN        token for releases and repo info (the workflow's own token)
  TRAFFIC_TOKEN   fine-grained token with "Administration: Read-only" on the
                  repo; needed for traffic. Optional: without it only
                  downloads are recorded and traffic.md says so.
  OWN_DOWNLOADS   your own downloads, subtracted in the "by others" line (default 0)
Usage:
  python tools/stats/collect.py --out <folder of the stats branch>
Only the Python standard library is used.
"""

import argparse
import csv
import datetime as dt
import json
import os
import re
import sys
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

API = "https://api.github.com"
# Days and the "Last updated" time are Ljubljana time (CET/CEST), the developer's own
LOCAL_TZ = ZoneInfo("Europe/Ljubljana")
NOW = dt.datetime.now(LOCAL_TZ)
TODAY = NOW.date()
PERIOD_DAYS = 14  # GitHub's traffic window


# ---------------------------------------------------------------- GitHub API


def api(path, token, params=""):
    """GET one API path (all pages for lists). Returns parsed JSON."""
    url = f"{API}{path}{params}"
    out = None
    while url:
        req = urllib.request.Request(url)
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("X-GitHub-Api-Version", "2022-11-28")
        req.add_header("User-Agent", "orfeo-stats")
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        with urllib.request.urlopen(req, timeout=30) as res:
            data = json.loads(res.read().decode("utf-8"))
            link = res.headers.get("Link", "")
        if isinstance(data, list):
            out = (out or []) + data
            m = re.search(r'<([^>]+)>;\s*rel="next"', link)
            url = m.group(1) if m else None
        else:
            return data
    return out or []


# ---------------------------------------------------------------- CSV helpers


def read_csv(path):
    if not os.path.exists(path):
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write_csv(path, rows, fields):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fields})


def n(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def fmt(v):
    return f"{v:,}".replace(",", " ")  # thin space as thousands separator


def d(s):
    return dt.date.fromisoformat(s)


def hi(s):
    """Highlighted cell: the numbers closest to real people (downloads, unique visitors)"""
    return f"<mark>{s}</mark>"


# ---------------------------------------------------------------- Downloads


def asset_kind(name):
    low = name.lower()
    if low.endswith(".blockmap"):
        return "update"  # an installed copy downloading an update
    if low.endswith(".yml") or low.endswith(".yaml"):
        return "launch"  # an installed copy checking for updates at start
    if low.endswith(".exe") and "portable" in low:
        return "portable"
    if low.endswith(".exe") or low.endswith(".msi"):
        return "installer"
    return "other"


def collect_downloads(repo, token, path):
    releases = api(f"/repos/{repo}/releases", token, "?per_page=100")
    rows = [r for r in read_csv(path) if r["date"] != TODAY.isoformat()]
    for rel in releases:
        if rel.get("draft"):
            continue
        for a in rel.get("assets", []):
            rows.append(
                {
                    "date": TODAY.isoformat(),
                    "tag": rel["tag_name"],
                    "published": (rel.get("published_at") or "")[:10],
                    "asset": a["name"],
                    "kind": asset_kind(a["name"]),
                    "downloads": a.get("download_count", 0),
                }
            )
    rows.sort(key=lambda r: (r["date"], r["tag"], r["asset"]))
    write_csv(path, rows, ["date", "tag", "published", "asset", "kind", "downloads"])
    return rows


# ---------------------------------------------------------------- Traffic


def merge_daily(path, items):
    """Daily counts from the API, merged by day. A later run overwrites a day
    (today's numbers grow during the day); days GitHub no longer returns are kept."""
    rows = {r["date"]: r for r in read_csv(path)}
    for it in items:
        day = it["timestamp"][:10]
        rows[day] = {"date": day, "count": it["count"], "uniques": it["uniques"]}
    out = [rows[k] for k in sorted(rows)]
    write_csv(path, out, ["date", "count", "uniques"])
    return out


def collect_traffic(repo, token, data_dir):
    views = api(f"/repos/{repo}/traffic/views", token, "?per=day")
    clones = api(f"/repos/{repo}/traffic/clones", token, "?per=day")
    refs = api(f"/repos/{repo}/traffic/popular/referrers", token)
    paths = api(f"/repos/{repo}/traffic/popular/paths", token)

    views_rows = merge_daily(os.path.join(data_dir, "views.csv"), views.get("views", []))
    clones_rows = merge_daily(os.path.join(data_dir, "clones.csv"), clones.get("clones", []))

    # Referrers: GitHub gives one 14-day total per site. Keep a snapshot per run…
    snap_path = os.path.join(data_dir, "referrers_daily.csv")
    snaps = [r for r in read_csv(snap_path) if r["date"] != TODAY.isoformat()]
    for r in refs:
        snaps.append({"date": TODAY.isoformat(), "referrer": r["referrer"], "count": r["count"], "uniques": r["uniques"]})
    write_csv(snap_path, snaps, ["date", "referrer", "count", "uniques"])

    # …and every 14 days a closed period. Closed periods don't overlap, so
    # adding them up gives the all-time total per site.
    per_path = os.path.join(data_dir, "referrers_periods.csv")
    periods = read_csv(per_path)
    closes = sorted({p["closed"] for p in periods})
    last_close = d(closes[-1]) if closes else None
    if last_close is None or (TODAY - last_close).days >= PERIOD_DAYS:
        for r in refs:
            periods.append({"closed": TODAY.isoformat(), "referrer": r["referrer"], "count": r["count"], "uniques": r["uniques"]})
        if not refs:
            periods.append({"closed": TODAY.isoformat(), "referrer": "", "count": 0, "uniques": 0})
        write_csv(per_path, periods, ["closed", "referrer", "count", "uniques"])

    # Popular pages: the current 14-day list is enough.
    write_csv(
        os.path.join(data_dir, "paths_latest.csv"),
        [{"path": p["path"], "title": p.get("title", ""), "count": p["count"], "uniques": p["uniques"]} for p in paths],
        ["path", "title", "count", "uniques"],
    )
    return {
        "views": views_rows,
        "clones": clones_rows,
        "views_14": (views.get("count", 0), views.get("uniques", 0)),
        "clones_14": (clones.get("count", 0), clones.get("uniques", 0)),
        "refs": refs,
        "periods": periods,
        "paths": paths,
    }


def referrer_totals(periods, refs):
    """All-time per site: closed 14-day periods added up, plus the share of the
    current window that falls after the last closed period (an estimate, ≈)."""
    totals = {}
    closes = sorted({p["closed"] for p in periods})
    for p in periods:
        if p["referrer"]:
            totals[p["referrer"]] = totals.get(p["referrer"], 0) + n(p["count"])
    days_open = (TODAY - d(closes[-1])).days if closes else 0
    estimated = False
    if 0 < days_open < PERIOD_DAYS:
        share = days_open / PERIOD_DAYS
        for r in refs:
            add = round(r["count"] * share)
            if add:
                totals[r["referrer"]] = totals.get(r["referrer"], 0) + add
                estimated = True
    return totals, estimated, (closes[0] if closes else None)


# ---------------------------------------------------------------- Report


def sums_by_date(rows):
    """{date: {kind: total}} from the download snapshots."""
    out = {}
    for r in rows:
        k = out.setdefault(r["date"], {})
        k[r["kind"]] = k.get(r["kind"], 0) + n(r["downloads"])
    return out


def build_report(repo, info, dl_rows, traffic, traffic_error, own):
    by_date = sums_by_date(dl_rows)
    dates = sorted(by_date)
    first_day = dates[0]
    now = by_date[dates[-1]]
    kinds = ("installer", "portable", "launch", "update")
    total = {k: now.get(k, 0) for k in kinds}
    downloads = total["installer"] + total["portable"]

    def at_or_before(day):
        cands = [x for x in dates if d(x) <= day]
        return by_date[cands[-1]] if cands else None

    week_ago = TODAY - dt.timedelta(days=7)
    base = at_or_before(week_ago)
    base_label = "last 7 days"
    if base is None:  # tracking younger than a week: count from the first snapshot
        base = by_date[first_day]
        base_label = f"since {first_day} (tracking started)"
    last7 = {k: total[k] - base.get(k, 0) for k in kinds}

    L = []
    L.append(f"# Orfeo on GitHub: downloads and traffic\n")
    zone = "CEST" if NOW.utcoffset() == dt.timedelta(hours=2) else "CET"
    L.append(f"**Last updated: {NOW.day}. {NOW.month}. {NOW.year} at {NOW:%H:%M}** Ljubljana time ({zone}) · updates daily from 07:00\n")
    L.append(
        f"[{repo}](https://github.com/{repo}) · "
        f"★ {info.get('stargazers_count', 0)} stars · {info.get('forks_count', 0)} forks · "
        f"{info.get('subscribers_count', 0)} watching\n"
    )
    L.append(
        "> Orfeo is a free, open-source (GPL-3.0) Windows app for learning piano with MIDI files. "
        "It is distributed through GitHub Releases, as an installer and a portable version, and through the Microsoft Store "
        "(Store installs aren't counted here). "
        "Download totals come straight from GitHub's release statistics and cover every release since the first one; "
        "traffic is recorded daily from GitHub's traffic API and kept permanently, because GitHub itself keeps only 14 days.\n"
    )

    # Summary
    L.append("## At a glance\n")
    L.append(f"| | All time | {base_label.capitalize()} |")
    L.append("|---|---:|---:|")
    dl7 = last7["installer"] + last7["portable"]
    L.append(f"| **Downloads** (installer + portable) | {hi('**' + fmt(downloads) + '**')} | {hi('**' + fmt(dl7) + '**')} |")
    L.append(f"| — Installer (`Orfeo-Setup-x.y.z.exe`) | {fmt(total['installer'])} | {fmt(last7['installer'])} |")
    L.append(f"| — Portable (`Orfeo-x.y.z-portable.exe`) | {fmt(total['portable'])} | {fmt(last7['portable'])} |")
    L.append(f"| App starts checking for updates (`latest.yml`) | {fmt(total['launch'])} | {fmt(last7['launch'])} |")
    L.append(f"| Updates installed (`.blockmap`) | {fmt(total['update'])} | {fmt(last7['update'])} |")
    if traffic:
        v_all = sum(n(r["count"]) for r in traffic["views"])
        c_all = sum(n(r["count"]) for r in traffic["clones"])
        v7 = sum(n(r["count"]) for r in traffic["views"] if d(r["date"]) > week_ago)
        u7 = sum(n(r["uniques"]) for r in traffic["views"] if d(r["date"]) > week_ago)
        c7 = sum(n(r["count"]) for r in traffic["clones"] if d(r["date"]) > week_ago)
        since = traffic["views"][0]["date"] if traffic["views"] else TODAY.isoformat()
        L.append(f"| Repository page views (since {since}) | {fmt(v_all)} | {fmt(v7)} |")
        u_all = sum(n(r["uniques"]) for r in traffic["views"])
        L.append(f"| Unique visitors (added up per day) | {hi(fmt(u_all))} | {hi(fmt(u7))} |")
        L.append(f"| Repository clones | {fmt(c_all)} | {fmt(c7)} |")
    L.append("")
    if own:
        L.append(f"Downloads by others, excluding the developer's own test downloads (about {own}): {hi(f'**≈ {fmt(max(0, downloads - own))}**')}.\n")
    L.append(
        "*Downloads* count each time a release file was downloaded. *App starts* count installed copies (installer version) "
        "checking GitHub for a newer version when Orfeo starts, so they show the app being used, not just downloaded. "
        "The portable version does not check automatically.\n"
    )
    L.append(
        "Highlighted numbers are the ones closest to real people: downloads of the app and unique visitors. "
        "Page views and clones also count repeat visits, search-engine crawlers and automated tools.\n"
    )

    # Per release
    L.append("## Downloads per release\n")
    L.append("| Release | Published | Installer | Portable | Total downloads | App starts | Updates |")
    L.append("|---|---|---:|---:|---:|---:|---:|")
    latest = [r for r in dl_rows if r["date"] == dates[-1]]
    rels = {}
    for r in latest:
        x = rels.setdefault(r["tag"], {"published": r["published"], "installer": 0, "portable": 0, "launch": 0, "update": 0})
        if r["kind"] in x:
            x[r["kind"]] += n(r["downloads"])
    def ver(tag):
        return [int(x) for x in re.findall(r"\d+", tag)]

    for tag, x in sorted(rels.items(), key=lambda kv: (kv[1]["published"], ver(kv[0])), reverse=True):
        L.append(
            f"| [{tag}](https://github.com/{repo}/releases/tag/{tag}) | {x['published']} | {fmt(x['installer'])} | "
            f"{fmt(x['portable'])} | {hi('**' + fmt(x['installer'] + x['portable']) + '**')} | {fmt(x['launch'])} | {fmt(x['update'])} |"
        )
    L.append(
        f"| **All releases** | | **{fmt(total['installer'])}** | **{fmt(total['portable'])}** | {hi('**' + fmt(downloads) + '**')} | "
        f"**{fmt(total['launch'])}** | **{fmt(total['update'])}** |\n"
    )

    # Last 7 days, day by day
    L.append("## Last 7 days, day by day\n")
    views_by_day = {r["date"]: r for r in (traffic["views"] if traffic else [])}
    clones_by_day = {r["date"]: r for r in (traffic["clones"] if traffic else [])}
    L.append("| Day | Installer | Portable | App starts | Page views | Unique visitors | Clones |")
    L.append("|---|---:|---:|---:|---:|---:|---:|")
    for i in range(6, -1, -1):
        day = TODAY - dt.timedelta(days=i)
        cur = by_date.get(day.isoformat())
        prev = at_or_before(day - dt.timedelta(days=1))
        if cur is not None and prev is not None:
            inst = str(cur.get("installer", 0) - prev.get("installer", 0))
            port = str(cur.get("portable", 0) - prev.get("portable", 0))
            lau = str(cur.get("launch", 0) - prev.get("launch", 0))
        else:
            inst = port = lau = "–"
        v = views_by_day.get(day.isoformat())
        c = clones_by_day.get(day.isoformat())
        L.append(
            f"| {day.strftime('%a %d %b')} | {inst} | {port} | {lau} | "
            f"{v['count'] if v else '–'} | {hi(v['uniques']) if v else '–'} | {c['count'] if c else '–'} |"
        )
    L.append(
        "\nDownloads per day start with the second day of tracking (they are the difference between two daily snapshots); "
        "views and clones go back 14 days before tracking started. Today's row is still growing.\n"
    )

    # Weekly history
    if traffic or len(dates) > 1:
        L.append("## History by week\n")
        L.append("| Week (Mon) | Downloads | — installer | — portable | App starts | Page views |")
        L.append("|---|---:|---:|---:|---:|---:|")
        weeks = {}
        for prev_day, day in zip(dates, dates[1:]):
            wk = (d(day) - dt.timedelta(days=d(day).weekday())).isoformat()
            w = weeks.setdefault(wk, {"installer": 0, "portable": 0, "launch": 0, "views": 0})
            for k in ("installer", "portable", "launch"):
                w[k] += by_date[day].get(k, 0) - by_date[prev_day].get(k, 0)
        for r in traffic["views"] if traffic else []:
            wk = (d(r["date"]) - dt.timedelta(days=d(r["date"]).weekday())).isoformat()
            weeks.setdefault(wk, {"installer": 0, "portable": 0, "launch": 0, "views": 0})["views"] += n(r["count"])
        for wk in sorted(weeks, reverse=True):
            w = weeks[wk]
            dl = w["installer"] + w["portable"]
            L.append(f"| {wk} | {fmt(dl)} | {fmt(w['installer'])} | {fmt(w['portable'])} | {fmt(w['launch'])} | {fmt(w['views'])} |")
        L.append(
            f"\nDownloads before {first_day} (when tracking started) are in the all-time totals above but not in this table.\n"
        )

    # Referrers
    if traffic:
        totals, estimated, first_close = referrer_totals(traffic["periods"], traffic["refs"])
        L.append("## Where visitors come from\n")
        L.append(f"| Site | Views, last 14 days | Unique visitors, last 14 days | Views, all time{' (≈)' if estimated else ''} |")
        L.append("|---|---:|---:|---:|")
        names = sorted(set(totals) | {r["referrer"] for r in traffic["refs"]}, key=lambda s: -totals.get(s, 0))
        cur = {r["referrer"]: r for r in traffic["refs"]}
        for s in names:
            c = cur.get(s)
            L.append(f"| {s} | {fmt(c['count']) if c else '–'} | {hi(fmt(c['uniques'])) if c else '–'} | {fmt(totals.get(s, 0))} |")
        L.append(
            f"\nGitHub only reports referring sites as 14-day totals. All-time adds up non-overlapping 14-day periods "
            f"recorded since {first_close}"
            + (", plus an estimate for the days since the last full period (≈)." if estimated else ".")
            + " Search engines and AI assistants don't pass on what was searched.\n"
        )
        L.append("## Most visited pages, last 14 days\n")
        L.append("| Page | Views | Unique visitors |")
        L.append("|---|---:|---:|")
        for p in traffic["paths"][:10]:
            short = p["path"].replace(f"/{repo}", "", 1) or "/"
            L.append(f"| [{short}](https://github.com{p['path']}) | {fmt(p['count'])} | {hi(fmt(p['uniques']))} |")
        L.append("")
    else:
        L.append("## Traffic\n")
        L.append(f"> Traffic (views, visitors, referring sites) was not collected on this run: {traffic_error}\n")

    L.append("---")
    L.append(
        f"Raw data, one row per day: [data/](https://github.com/{repo}/tree/stats/data) "
        "(downloads.csv, views.csv, clones.csv, referrers_daily.csv, referrers_periods.csv). "
        f"Collected by [tools/stats/collect.py](https://github.com/{repo}/blob/main/tools/stats/collect.py)."
    )
    return "\n".join(L) + "\n"


# ---------------------------------------------------------------- Main


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="checkout of the stats branch")
    args = ap.parse_args()
    repo = os.environ.get("REPO", "Squarebow/Orfeo")
    token = os.environ.get("GH_TOKEN", "")
    traffic_token = os.environ.get("TRAFFIC_TOKEN", "")
    own = n(os.environ.get("OWN_DOWNLOADS", "0"))
    data_dir = os.path.join(args.out, "data")
    os.makedirs(data_dir, exist_ok=True)

    info = api(f"/repos/{repo}", token)
    dl_rows = collect_downloads(repo, token, os.path.join(data_dir, "downloads.csv"))

    traffic, traffic_error = None, ""
    if not traffic_token:
        traffic_error = "the TRAFFIC_TOKEN secret is not set in the repository (Settings → Secrets and variables → Actions)."
    else:
        try:
            traffic = collect_traffic(repo, traffic_token, data_dir)
        except urllib.error.HTTPError as e:
            traffic_error = f"GitHub answered {e.code} ({e.reason}). The TRAFFIC_TOKEN may have expired or lack Administration: Read-only."
            print("Traffic failed:", traffic_error, file=sys.stderr)

    report = build_report(repo, info, dl_rows, traffic, traffic_error, own)
    with open(os.path.join(args.out, "traffic.md"), "w", encoding="utf-8") as f:
        f.write(report)
    print(report)
    # A failed traffic call should show as a failed run (GitHub e-mails you), after saving the downloads.
    if traffic_token and traffic is None:
        sys.exit(1)


if __name__ == "__main__":
    main()
