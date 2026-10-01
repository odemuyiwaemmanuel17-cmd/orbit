"""Generate the frontend's bundled offline snapshot from the fallback catalog.

Run from the repo root:
    python backend/tools/gen_snapshot.py
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve()
BACKEND = HERE.parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

from catalog import TleCatalog  # noqa: E402
from propagation import propagate_state, tle_to_satrec  # noqa: E402


def main():
    cat = TleCatalog()
    data = cat.get()
    now = datetime.now(timezone.utc)
    positions = {}
    for s in data["satellites"]:
        sat = tle_to_satrec(s["line1"], s["line2"])
        state = propagate_state(sat, now)
        state["id"] = s["id"]
        state["name"] = s["name"]
        positions[s["id"]] = state
    out = {
        "generated_at": now.isoformat(),
        "note": "Bundled fallback so OrbitalPulse renders with no backend; "
                "regenerate with python backend/tools/gen_snapshot.py",
        "catalog": {
            "source": "offline",
            "updated_at": data["updated_at"],
            "groups": [{"key": k, "label": v[2]} for k, v in cat_groups().items()],
            "satellites": data["satellites"],
        },
        "positions": positions,
    }
    dest = HERE.parents[2] / "frontend" / "src" / "lib" / "offline-snapshot.json"
    dest.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"wrote {dest} ({len(positions)} positions)")


def cat_groups():
    from catalog import GROUPS
    return GROUPS


if __name__ == "__main__":
    main()
