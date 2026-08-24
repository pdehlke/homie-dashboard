"""Write a Playwright storage-state file that logs a browser in as a real HA user,
without ever putting the token on a command line or in a heredoc `ps` could see.

Injects the token into localStorage under `hassTokens`, the same key the HA
frontend itself uses, so `state-load` in playwright-cli produces an already
logged-in session for whichever account the token belongs to.

Usage:
    python3 make-auth-state.py <ENV_VAR_NAME> <output-path>

    python3 make-auth-state.py HA_TOKEN ha-auth-state.json      # Pete (admin)
    python3 make-auth-state.py HOMIE_TOKEN homie-auth-state.json # Homie Dashboard (non-admin)

Delete the output file as soon as the browser session that loaded it is closed.
Never echo, log, or commit it; it contains the live token in plain text.
"""

import json
import os
import pathlib
import sys

URL = os.environ.get("HA_URL", "http://hass.ehlke.net")


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2

    env_var, out_path = sys.argv[1], sys.argv[2]
    token = os.environ.get(env_var)
    if not token:
        print(f"{env_var} is not set in this environment", file=sys.stderr)
        return 1

    tokens = {
        "access_token": token,
        "token_type": "Bearer",
        "expires_in": 315360000,
        "hassUrl": URL,
        "clientId": None,
        "expires": 9999999999999,
        "refresh_token": "",
    }
    state = {
        "cookies": [],
        "origins": [
            {"origin": URL, "localStorage": [{"name": "hassTokens", "value": json.dumps(tokens)}]}
        ],
    }
    path = pathlib.Path(out_path)
    path.write_text(json.dumps(state))
    path.chmod(0o600)
    print(f"wrote {out_path} (mode 0600) for origin {URL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
