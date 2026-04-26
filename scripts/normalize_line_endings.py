#!/usr/bin/env python3
"""Normalize tracked text files to Linux-native LF line endings.

By default this script only scans files tracked by git, skips binary files, and
rewrites text files containing CRLF or old-Mac CR line endings to LF.

Usage:
  python3 scripts/normalize_line_endings.py          # rewrite non-compliant files
  python3 scripts/normalize_line_endings.py --check  # report and exit non-zero
  python3 scripts/normalize_line_endings.py --dry-run
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


BINARY_EXTENSIONS = {
    ".db",
    ".gif",
    ".ico",
    ".jpg",
    ".jpeg",
    ".nbc",
    ".nbi",
    ".pdf",
    ".png",
    ".pyc",
    ".webp",
    ".zip",
}


def repo_root() -> Path:
    output = subprocess.check_output(["git", "rev-parse", "--show-toplevel"])
    return Path(output.decode().strip())


def tracked_files(root: Path) -> list[Path]:
    output = subprocess.check_output(["git", "ls-files", "-z"], cwd=root)
    names = [name for name in output.decode("utf-8", errors="surrogateescape").split("\0") if name]
    return [root / name for name in names]


def is_probably_binary(path: Path, data: bytes) -> bool:
    if path.suffix.lower() in BINARY_EXTENSIONS:
        return True
    if b"\0" in data[:8192]:
        return True
    return False


def normalize_bytes(data: bytes) -> bytes:
    # Convert CRLF first, then any remaining bare CR.
    return data.replace(b"\r\n", b"\n").replace(b"\r", b"\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="only check; exit 1 if any tracked text file is non-compliant")
    parser.add_argument("--dry-run", action="store_true", help="list files that would be rewritten without modifying them")
    args = parser.parse_args()

    root = repo_root()
    changed: list[Path] = []

    for path in tracked_files(root):
        if not path.is_file():
            continue
        data = path.read_bytes()
        if b"\r" not in data:
            continue
        if is_probably_binary(path, data):
            continue
        normalized = normalize_bytes(data)
        if normalized == data:
            continue
        changed.append(path.relative_to(root))
        if not args.check and not args.dry_run:
            path.write_bytes(normalized)

    if changed:
        action = "Non-compliant" if args.check else "Would normalize" if args.dry_run else "Normalized"
        print(f"{action} {len(changed)} tracked text file(s):")
        for rel in changed:
            print(f"  {rel}")
        return 1 if args.check else 0

    print("All tracked text files already use LF line endings.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
