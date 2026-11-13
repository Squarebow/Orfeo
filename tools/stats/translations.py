#!/usr/bin/env python3
"""
Daily record of which Orfeo translations have ever been ready.

Runs from .github/workflows/stats.yml after the stats collector and writes
translations.json into the stats branch folder. The release script
(scripts/i18n-ready.mjs) copies that file into the app. Per language:
  percent      whole percent, rounded down, of translated + fuzzy over total
               (what users see in 1.8; mirrors COUNT_MACHINE_DRAFTS in
               src/i18n/readiness.ts)
  total, translated, fuzzy
  readySince   first day (Ljubljana date) checked texts alone reached 80 %.
               Machine drafts never count here, and it is never cleared.
  lastChange   Weblate's last_change as given
A language missing from a fetch keeps its previous entry.

Usage:
  python tools/stats/translations.py --out <folder of the stats branch>
  python tools/stats/translations.py --self-test
  (--today YYYY-MM-DD overrides the date, for testing)
If Weblate cannot be read completely, nothing is written and the exit code is 0
(the stats run must never fail because of Weblate). Standard library only.
"""

import datetime as dt
import json
import os
import sys
import urllib.request
from zoneinfo import ZoneInfo

LIST_URL = "https://hosted.weblate.org/api/components/orfeo/app/translations/"
READY_SHARE = 0.8
# Keep equal to COUNT_MACHINE_DRAFTS in src/i18n/readiness.ts: 1.8 shows machine
# drafts ("needs editing") as part of the percentage. readySince ignores this on purpose.
COUNT_MACHINE_DRAFTS = True


def merge(previous, stats, today):
    out = {code: dict(entry) for code, entry in previous.items()}
    for code, s in stats.items():
        total = int(s.get("total") or 0)
        translated = int(s.get("translated") or 0)
        fuzzy = int(s.get("fuzzy") or 0)
        counted = translated + (fuzzy if COUNT_MACHINE_DRAFTS else 0)
        old = previous.get(code) or {}
        ready_since = old.get("readySince")
        if ready_since is None and total > 0 and translated / total >= READY_SHARE:
            ready_since = today
        out[code] = {
            "percent": counted * 100 // total if total > 0 else 0,
            "total": total,
            "translated": translated,
            "fuzzy": fuzzy,
            "readySince": ready_since,
            "lastChange": s.get("last_change"),
        }
    return dict(sorted(out.items()))


def fetch_stats():
    stats = {}
    url = LIST_URL
    for _ in range(20):
        if not url:
            break
        req = urllib.request.Request(url, headers={"User-Agent": "Orfeo"})
        with urllib.request.urlopen(req, timeout=30) as res:
            body = json.load(res)
        for r in body.get("results", []):
            code = str(r["language_code"])
            if code == "en":
                continue
            stats[code] = r
        url = body.get("next")
    else:
        raise RuntimeError("too many pages")
    if not stats:
        raise RuntimeError("no languages returned")
    return stats


def main(argv):
    out_dir = argv[argv.index("--out") + 1] if "--out" in argv else "."
    path = os.path.join(out_dir, "translations.json")
    try:
        stats = fetch_stats()
        previous = {}
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                previous = json.load(f)
        if "--today" in argv:
            today = argv[argv.index("--today") + 1]
        else:
            today = dt.datetime.now(ZoneInfo("Europe/Ljubljana")).date().isoformat()
        result = merge(previous, stats, today)
    except Exception as e:  # never fail the stats run because of Weblate
        print("translations: not updated (%s)" % e)
        return 0
    os.makedirs(out_dir, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
        f.write(chr(10))
    print("translations: %d languages written to %s" % (len(result), path))
    return 0


def self_test():
    def row(total, translated, fuzzy=0, last="2026-11-01T10:00:00Z"):
        return {"code": "xx", "total": total, "translated": translated, "fuzzy": fuzzy, "last_change": last}

    prev = {}
    r = merge(prev, {"de": row(100, 79)}, "2026-11-01")
    assert r["de"]["readySince"] is None, "79% checked must not be ready"
    r = merge(r, {"de": row(100, 80)}, "2026-11-02")
    assert r["de"]["readySince"] == "2026-11-02", "set on first reaching 80%"
    r = merge(r, {"de": row(100, 90)}, "2026-11-03")
    assert r["de"]["readySince"] == "2026-11-02", "kept"
    r = merge(r, {"de": row(100, 10)}, "2026-11-04")
    assert r["de"]["readySince"] == "2026-11-02", "never cleared when it drops"
    r = merge(r, {}, "2026-11-05")
    assert r["de"]["readySince"] == "2026-11-02", "kept when language missing from fetch"
    r = merge(r, {"fr": row(100, 0, 85)}, "2026-11-05")
    assert r["fr"]["readySince"] is None, "fuzzy-only 85% gets no readySince"
    assert r["fr"]["percent"] == 85, "percent counts fuzzy"
    assert "de" in r and "fr" in r, "new languages added"
    r = merge(r, {"es": row(0, 0)}, "2026-11-06")
    assert r["es"]["percent"] == 0 and r["es"]["readySince"] is None, "empty component"
    assert r["fr"]["lastChange"] == "2026-11-01T10:00:00Z" and r["fr"]["total"] == 100 and r["fr"]["translated"] == 0 and r["fr"]["fuzzy"] == 85
    print("self-test ok")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        try:
            self_test()
        except Exception as e:
            print("self-test FAILED:", repr(e))
            sys.exit(1)
    else:
        sys.exit(main(sys.argv))
