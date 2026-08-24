"""Read-only check: is the live Homie Dashboard worth driving right now?

Compares the deployed assets against this checkout's dist/, without ever
printing a token. Stdlib only, no extra dependencies.

Checks:
  1. HA_TOKEN is set and authenticates (GET /api/, expect 200).
  2. Live homie-dashboard.html and homie-custom.js are byte-identical to
     dist/, by SHA-256, and report their shared HOMIE_ASSET_VERSION.
  3. Live config.js is not still the repo's placeholder token (does not
     reveal or compare the real value, only whether it's the placeholder).

Usage:
    python3 doctor.py

Exit code 0 means safe to drive. Non-zero explains what to fix first, e.g. a
stale deploy (dist/ has local changes not yet pushed to the live host) or an
unauthenticated HA_TOKEN.
"""

import hashlib
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request

BASE_URL = os.environ.get("HA_URL", "http://hass.ehlke.net")
LIVE_ROOT = f"{BASE_URL}/local/community/homie-dashboard"
DIST = pathlib.Path(__file__).resolve().parent.parent.parent.parent.parent / "dist"
TIMEOUT = 8

VERSION_RE = re.compile(r'HOMIE_ASSET_VERSION\s*=\s*"([^"]+)"')
PLACEHOLDER = "YOUR_LONG_LIVED_ACCESS_TOKEN"


def fetch(path: str) -> bytes:
    with urllib.request.urlopen(f"{LIVE_ROOT}/{path}", timeout=TIMEOUT) as r:
        return r.read()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def check_auth() -> bool:
    token = os.environ.get("HA_TOKEN")
    if not token:
        print("FAIL  HA_TOKEN is not set")
        return False
    req = urllib.request.Request(f"{BASE_URL}/api/", headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            ok = r.status == 200
    except urllib.error.HTTPError as e:
        print(f"FAIL  HA_TOKEN auth check: HTTP {e.code}")
        return False
    print(f"{'OK   ' if ok else 'FAIL '} HA_TOKEN authenticates against {BASE_URL}")
    return ok


def check_asset(name: str) -> bool:
    local_path = DIST / name
    if not local_path.exists():
        print(f"FAIL  {name}: no local dist/{name} to compare against")
        return False
    local_bytes = local_path.read_bytes()
    try:
        live_bytes = fetch(name)
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"FAIL  {name}: could not fetch live copy ({e})")
        return False
    local_hash, live_hash = sha256(local_bytes), sha256(live_bytes)
    ok = local_hash == live_hash
    print(f"{'OK   ' if ok else 'FAIL '} {name}: live sha256 {live_hash[:12]}.. "
          f"{'==' if ok else '!='} local {local_hash[:12]}..")
    return ok


def check_version() -> bool:
    try:
        live_html = fetch("homie-dashboard.html").decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"FAIL  version: could not fetch live homie-dashboard.html ({e})")
        return False
    local_html = (DIST / "homie-dashboard.html").read_text()
    live_m, local_m = VERSION_RE.search(live_html), VERSION_RE.search(local_html)
    live_v = live_m.group(1) if live_m else None
    local_v = local_m.group(1) if local_m else None
    ok = bool(live_v) and live_v == local_v
    print(f"{'OK   ' if ok else 'FAIL '} HOMIE_ASSET_VERSION: live={live_v!r} dist={local_v!r}")
    return ok


def check_config_not_placeholder() -> bool:
    try:
        live_config = fetch("config.js").decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"FAIL  config.js: could not fetch ({e})")
        return False
    has_placeholder = PLACEHOLDER in live_config
    ok = not has_placeholder
    print(f"{'OK   ' if ok else 'FAIL '} live config.js has a real token spliced in "
          f"(placeholder {'found' if has_placeholder else 'absent'})")
    return ok


def main() -> int:
    print(f"Doctor: {LIVE_ROOT}\n")
    results = [
        check_auth(),
        check_asset("homie-dashboard.html"),
        check_asset("homie-custom.js"),
        check_version(),
        check_config_not_placeholder(),
    ]
    print()
    if all(results):
        print("All checks passed. Safe to drive.")
        return 0
    print("One or more checks failed. Fix before driving -- see SKILL.md's Doctor section.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
