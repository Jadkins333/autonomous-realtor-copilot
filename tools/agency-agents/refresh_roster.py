#!/usr/bin/env python3
from __future__ import annotations

import io
import json
import subprocess
import shutil
import tarfile
import urllib.request
from pathlib import Path

REPO_TARBALL_URL = "https://codeload.github.com/msitarzewski/agency-agents/tar.gz/refs/heads/main"
ROOT = Path(__file__).resolve().parent
UPSTREAM_DIR = ROOT / "upstream"


def main() -> int:
    print(f"Downloading agency-agents roster from {REPO_TARBALL_URL}")
    archive_bytes: bytes
    try:
        with urllib.request.urlopen(REPO_TARBALL_URL, timeout=30) as response:
            archive_bytes = response.read()
    except Exception:
        # Fallback for local Python trust-store issues on macOS.
        archive_bytes = subprocess.check_output(["curl", "-fsSL", REPO_TARBALL_URL], text=False)

    if UPSTREAM_DIR.exists():
        shutil.rmtree(UPSTREAM_DIR)
    UPSTREAM_DIR.mkdir(parents=True, exist_ok=True)

    copied: list[str] = []
    with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz") as archive:
        for member in archive.getmembers():
            if not member.isfile():
                continue

            path = Path(member.name)
            # path format: agency-agents-main/<file>
            relative = Path(*path.parts[1:]) if len(path.parts) > 1 else Path(path.name)
            if not relative.parts:
                continue

            if relative.name == "README.md" or (
                relative.suffix == ".md" and len(relative.parts) >= 2 and relative.parts[0] != ".github"
            ):
                target = UPSTREAM_DIR / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                extracted = archive.extractfile(member)
                if extracted is None:
                    continue
                target.write_bytes(extracted.read())
                copied.append(str(relative))

    manifest = {
        "source": "https://github.com/msitarzewski/agency-agents",
        "count": len(copied),
        "files": sorted(copied),
    }
    (UPSTREAM_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote {len(copied)} files into {UPSTREAM_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
