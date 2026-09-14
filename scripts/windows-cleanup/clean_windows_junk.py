#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Dọn file rác / tạm / cache trên ổ C: (Windows).

Chỉ xóa bên trong các thư mục được phép (allowlist). Bỏ qua file đang mở,
điểm nối (junction/symlink) và file hệ thống quan trọng. Không đụng tới
System32, WinSxS, Program Files, hay dữ liệu đăng nhập trình duyệt.

Cách chạy (khuyến nghị):
    Chay_Don_Rac.bat
    (chuột phải -> Run as administrator)

Hoặc:
    python clean_windows_junk.py
"""

from __future__ import annotations

import argparse
import ctypes
import os
import stat
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Iterable, Optional, Sequence, Set


SYSTEM_DRIVE = Path(os.environ.get("SystemDrive", "C:") + os.sep)
WINDIR = Path(os.environ.get("WINDIR", str(SYSTEM_DRIVE / "Windows")))

# Không bao giờ xóa, kể cả khi đường dẫn vô tình nằm trong danh sách quét.
PROTECTED_PREFIXES = (
    WINDIR / "System32",
    WINDIR / "SysWOW64",
    WINDIR / "WinSxS",
    WINDIR / "WinSxSTemp",
    WINDIR / "Boot",
    WINDIR / "Fonts",
    WINDIR / "System",
    WINDIR / "assembly",
    WINDIR / "servicing",
    SYSTEM_DRIVE / "Program Files",
    SYSTEM_DRIVE / "Program Files (x86)",
    SYSTEM_DRIVE / "ProgramData" / "Microsoft" / "Windows" / "Start Menu",
)

PROTECTED_FILE_NAMES = {
    "pagefile.sys",
    "hiberfil.sys",
    "swapfile.sys",
    "bootmgr",
    "ntldr",
    "ntdetect.com",
    "bootnxt",
    "boottel.dat",
    "layout.ini",
}

# Không xóa driver / kernel kể cả khi nằm trong thư mục tạm.
NEVER_DELETE_SUFFIXES = {".sys", ".drv", ".efi"}

PROTECTED_NAME_PREFIXES = (
    "ntuser.dat",
    "usrclass.dat",
)

# File ghi trong khoảng này được bỏ qua để tránh xóa file installer/app đang dùng.
MIN_FILE_AGE_SECONDS = 120

# Log cũ: chỉ xóa khi già hơn ngưỡng này.
OLD_LOG_AGE_DAYS = 7

FILE_ATTRIBUTE_REPARSE_POINT = 0x400
FILE_ATTRIBUTE_SYSTEM = 0x4
FILE_ATTRIBUTE_READONLY = 0x1
INVALID_FILE_ATTRIBUTES = 0xFFFFFFFF

ERROR_SHARING_VIOLATION = 32
ERROR_LOCK_VIOLATION = 33
ERROR_ACCESS_DENIED = 5
ERROR_SHARING_BUFFER_EXCEEDED = 36


@dataclass
class ScanRoot:
    category: str
    path: Path
    allowed_suffixes: Optional[Set[str]] = None
    name_prefixes: Optional[tuple[str, ...]] = None
    min_age_days: int = 0
    recursive: bool = True
    skip_system_attr: bool = True


@dataclass
class FileCandidate:
    path: Path
    size: int
    category: str


@dataclass
class CategoryStat:
    files: int = 0
    bytes: int = 0
    skipped_locked: int = 0
    skipped_other: int = 0


@dataclass
class ScanResult:
    candidates: list[FileCandidate] = field(default_factory=list)
    by_category: dict[str, CategoryStat] = field(default_factory=dict)
    skipped_locked: int = 0
    skipped_other: int = 0
    skipped_bytes: int = 0


def is_windows() -> bool:
    return os.name == "nt"


def enable_windows_console_utf8() -> None:
    if not is_windows():
        return
    try:
        ctypes.windll.kernel32.SetConsoleOutputCP(65001)
        ctypes.windll.kernel32.SetConsoleCP(65001)
    except Exception:
        pass
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def is_admin() -> bool:
    if not is_windows():
        return os.geteuid() == 0 if hasattr(os, "geteuid") else False
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def relaunch_as_admin() -> None:
    if not is_windows():
        print("Script này cần quyền Administrator trên Windows.")
        sys.exit(1)
    script = os.path.abspath(sys.argv[0])
    args = " ".join(quote_win(a) for a in sys.argv[1:])
    params = f"{quote_win(script)} {args}".strip()
    rc = ctypes.windll.shell32.ShellExecuteW(
        None, "runas", sys.executable, params, None, 1
    )
    if rc <= 32:
        print("Không thể yêu cầu quyền Administrator (mã {}).".format(rc))
        print("Hãy chuột phải file Chay_Don_Rac.bat -> Run as administrator.")
        sys.exit(1)
    sys.exit(0)


def quote_win(value: str) -> str:
    return '"' + value.replace('"', '\\"') + '"'


def format_size(num_bytes: int) -> str:
    if num_bytes < 0:
        num_bytes = 0
    if num_bytes < 1024:
        return f"{num_bytes} B"
    value = float(num_bytes)
    for unit in ("KB", "MB", "GB", "TB"):
        value /= 1024.0
        if value < 1024 or unit == "TB":
            if unit in ("MB", "GB", "TB"):
                return f"{value:.2f} {unit}"
            return f"{value:.1f} {unit}"
    return f"{value:.2f} TB"


def _is_under(child: Path, parent: Path) -> bool:
    child_s = os.path.normcase(os.path.abspath(str(child)))
    parent_s = os.path.normcase(os.path.abspath(str(parent)))
    if child_s == parent_s:
        return True
    sep = "\\" if "\\" in parent_s else os.sep
    if not parent_s.endswith(("/", "\\")):
        parent_s = parent_s + sep
    return child_s.startswith(parent_s)


def is_protected_path(path: Path) -> bool:
    name = path.name.lower()
    if name in PROTECTED_FILE_NAMES:
        return True
    if path.suffix.lower() in NEVER_DELETE_SUFFIXES:
        return True
    if any(name.startswith(prefix) for prefix in PROTECTED_NAME_PREFIXES):
        return True
    for prefix in PROTECTED_PREFIXES:
        if _is_under(path, prefix):
            return True
    return False


def win_long_path(path: Path) -> str:
    raw = os.path.abspath(str(path))
    if raw.startswith("\\\\?\\"):
        return raw
    if raw.startswith("\\\\"):
        return "\\\\?\\UNC\\" + raw[2:]
    return "\\\\?\\" + raw


def get_file_attributes(path: Path) -> int:
    if not is_windows():
        return 0
    try:
        return ctypes.windll.kernel32.GetFileAttributesW(win_long_path(path))
    except Exception:
        return INVALID_FILE_ATTRIBUTES


def is_reparse_point(path: Path) -> bool:
    if not is_windows():
        try:
            return path.is_symlink()
        except OSError:
            return True
    attrs = get_file_attributes(path)
    if attrs == INVALID_FILE_ATTRIBUTES:
        try:
            return path.is_symlink()
        except OSError:
            return True
    return bool(attrs & FILE_ATTRIBUTE_REPARSE_POINT)


def has_system_attribute(path: Path) -> bool:
    attrs = get_file_attributes(path)
    if attrs == INVALID_FILE_ATTRIBUTES:
        return False
    return bool(attrs & FILE_ATTRIBUTE_SYSTEM)


def clear_readonly(path: Path) -> None:
    try:
        os.chmod(path, stat.S_IWRITE | stat.S_IREAD)
    except OSError:
        pass
    if not is_windows():
        return
    attrs = get_file_attributes(path)
    if attrs == INVALID_FILE_ATTRIBUTES:
        return
    if attrs & FILE_ATTRIBUTE_READONLY:
        try:
            ctypes.windll.kernel32.SetFileAttributesW(
                win_long_path(path), attrs & ~FILE_ATTRIBUTE_READONLY
            )
        except Exception:
            pass


_K32 = None


def _kernel32():
    global _K32
    if _K32 is not None:
        return _K32
    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    wintypes = ctypes.wintypes
    k32.CreateFileW.argtypes = [
        ctypes.c_wchar_p,
        wintypes.DWORD,
        wintypes.DWORD,
        ctypes.c_void_p,
        wintypes.DWORD,
        wintypes.DWORD,
        ctypes.c_void_p,
    ]
    k32.CreateFileW.restype = ctypes.c_void_p
    k32.CloseHandle.argtypes = [ctypes.c_void_p]
    k32.CloseHandle.restype = wintypes.BOOL
    _K32 = k32
    return k32


def file_is_in_use(path: Path) -> bool:
    """True nếu file đang bị tiến trình khác giữ (không xóa được an toàn)."""
    if not is_windows():
        return False
    GENERIC_READ = 0x80000000
    OPEN_EXISTING = 3
    FILE_SHARE_NONE = 0
    INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value
    k32 = _kernel32()
    handle = k32.CreateFileW(
        win_long_path(path),
        GENERIC_READ,
        FILE_SHARE_NONE,
        None,
        OPEN_EXISTING,
        0,
        None,
    )
    if handle == INVALID_HANDLE_VALUE or handle is None:
        err = ctypes.get_last_error()
        return err in (
            ERROR_SHARING_VIOLATION,
            ERROR_LOCK_VIOLATION,
            ERROR_SHARING_BUFFER_EXCEEDED,
        )
    k32.CloseHandle(handle)
    return False


def skip_user_profile(name: str) -> bool:
    lowered = name.lower()
    return lowered in {
        "public",
        "default",
        "default user",
        "all users",
        "wdagutilityaccount",
        "defaultapppool",
    }


def iter_user_profiles() -> Iterable[Path]:
    users_dir = SYSTEM_DRIVE / "Users"
    if not users_dir.is_dir():
        return
    try:
        entries = list(users_dir.iterdir())
    except OSError:
        return
    for entry in entries:
        try:
            if skip_user_profile(entry.name):
                continue
            if is_reparse_point(entry):
                continue
            if entry.is_dir():
                yield entry
        except OSError:
            continue


def browser_cache_dirs(local_appdata: Path) -> Iterable[Path]:
    patterns = (
        local_appdata / "Google" / "Chrome" / "User Data",
        local_appdata / "Microsoft" / "Edge" / "User Data",
        local_appdata / "BraveSoftware" / "Brave-Browser" / "User Data",
        local_appdata / "Microsoft" / "Edge Beta" / "User Data",
        local_appdata / "Chromium" / "User Data",
        local_appdata / "Opera Software" / "Opera Stable",
        local_appdata / "Opera Software" / "Opera GX Stable",
    )
    cache_names = {
        "Cache",
        "Code Cache",
        "GPUCache",
        "ShaderCache",
        "GrShaderCache",
        "DawnCache",
        "DawnWebGPUCache",
        "DawnGraphiteCache",
        "Media Cache",
        "OptimizationHints",
        "JumpListIcons",
        "JumpListIconsMostVisited",
        "JumpListIconsRecentClosed",
    }
    for product_root in patterns:
        if not product_root.exists() or is_reparse_point(product_root):
            continue
        # Opera stores cache directly under the profile folder.
        if product_root.name.startswith("Opera"):
            for name in cache_names:
                yield product_root / name
            yield product_root / "Service Worker" / "CacheStorage"
            continue
        try:
            children = list(product_root.iterdir())
        except OSError:
            continue
        for profile in children:
            if is_reparse_point(profile) or not profile.is_dir():
                continue
            if profile.name in {"System Profile", "Guest Profile", "Crashpad"}:
                continue
            for name in cache_names:
                yield profile / name
            yield profile / "Service Worker" / "CacheStorage"

    firefox_root = local_appdata / "Mozilla" / "Firefox" / "Profiles"
    if firefox_root.is_dir() and not is_reparse_point(firefox_root):
        try:
            profiles = list(firefox_root.iterdir())
        except OSError:
            profiles = []
        for profile in profiles:
            if is_reparse_point(profile) or not profile.is_dir():
                continue
            yield profile / "cache2"
            yield profile / "startupCache"
            yield profile / "OfflineCache"
            yield profile / "shader-cache"


def build_scan_roots() -> list[ScanRoot]:
    roots: list[ScanRoot] = [
        ScanRoot("Windows Temp", WINDIR / "Temp", skip_system_attr=False),
        ScanRoot("Prefetch", WINDIR / "Prefetch", allowed_suffixes={".pf"}),
        ScanRoot(
            "Log Windows cũ",
            WINDIR / "Logs",
            allowed_suffixes={".log", ".etl", ".cab", ".tmp", ".old"},
            min_age_days=OLD_LOG_AGE_DAYS,
        ),
        ScanRoot(
            "Minidump",
            WINDIR / "Minidump",
            allowed_suffixes={".dmp", ".mdmp"},
            min_age_days=1,
        ),
        ScanRoot(
            "WER Temp",
            SYSTEM_DRIVE / "ProgramData" / "Microsoft" / "Windows" / "WER" / "Temp",
            skip_system_attr=False,
        ),
        ScanRoot(
            "WER ReportQueue",
            SYSTEM_DRIVE / "ProgramData" / "Microsoft" / "Windows" / "WER" / "ReportQueue",
            skip_system_attr=False,
        ),
        ScanRoot(
            "Thùng rác",
            SYSTEM_DRIVE / "$Recycle.Bin",
            skip_system_attr=False,
        ),
    ]

    memory_dmp = WINDIR / "MEMORY.DMP"
    if memory_dmp.is_file():
        roots.append(
            ScanRoot(
                "MEMORY.DMP",
                memory_dmp,
                allowed_suffixes={".dmp"},
                recursive=False,
                min_age_days=1,
            )
        )

    for profile in iter_user_profiles():
        local_appdata = profile / "AppData" / "Local"
        roots.append(
            ScanRoot(
                "Temp người dùng",
                local_appdata / "Temp",
                skip_system_attr=False,
            )
        )
        roots.append(
            ScanRoot(
                "INetCache",
                local_appdata / "Microsoft" / "Windows" / "INetCache",
            )
        )
        roots.append(
            ScanRoot(
                "Thumbnail cache",
                local_appdata / "Microsoft" / "Windows" / "Explorer",
                allowed_suffixes={".db"},
                name_prefixes=("thumbcache_", "iconcache_"),
            )
        )
        roots.append(
            ScanRoot(
                "Crash dumps",
                local_appdata / "CrashDumps",
                allowed_suffixes={".dmp", ".mdmp"},
                min_age_days=1,
            )
        )
        for cache_dir in browser_cache_dirs(local_appdata):
            roots.append(ScanRoot("Cache trình duyệt", cache_dir))

    # Gộp trùng đường dẫn, giữ category đầu tiên.
    unique: list[ScanRoot] = []
    seen: Set[str] = set()
    for root in roots:
        key = os.path.normcase(os.path.abspath(str(root.path)))
        suffix_key = ",".join(sorted(root.allowed_suffixes or []))
        name_key = ",".join(root.name_prefixes or ())
        full_key = f"{key}|{suffix_key}|{name_key}|{root.min_age_days}|{root.category}"
        if full_key in seen:
            continue
        seen.add(full_key)
        unique.append(root)
    return unique


def should_skip_dir(path: Path) -> bool:
    name = path.name.lower()
    if name in {"system volume information", "windowsapps", "recovery"}:
        return True
    if is_reparse_point(path):
        return True
    if is_protected_path(path):
        return True
    return False


def matches_suffix(path: Path, allowed: Optional[Set[str]]) -> bool:
    if not allowed:
        return True
    return path.suffix.lower() in allowed


def matches_name(path: Path, prefixes: Optional[tuple[str, ...]]) -> bool:
    if not prefixes:
        return True
    name = path.name.lower()
    return any(name.startswith(prefix) for prefix in prefixes)


def is_candidate_file(root: ScanRoot, file_path: Path, now: float) -> bool:
    try:
        if is_reparse_point(file_path):
            return False
        if not file_path.is_file():
            return False
        if is_protected_path(file_path):
            return False
        if root.skip_system_attr and has_system_attribute(file_path):
            return False
        if not matches_suffix(file_path, root.allowed_suffixes):
            return False
        if not matches_name(file_path, root.name_prefixes):
            return False
        if not is_old_enough(file_path, root.min_age_days, now):
            return False
        return True
    except OSError:
        return False


def is_old_enough(path: Path, min_age_days: int, now: float) -> bool:
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        return False
    min_age = max(MIN_FILE_AGE_SECONDS, min_age_days * 86400)
    return (now - mtime) >= min_age


def iter_files(root: ScanRoot, now: float) -> Iterable[Path]:
    path = root.path
    if is_reparse_point(path):
        return
    if is_protected_path(path):
        return

    if path.is_file():
        if is_candidate_file(root, path, now):
            yield path
        return

    if not path.exists() or not path.is_dir():
        return

    if not root.recursive:
        try:
            entries = list(path.iterdir())
        except OSError:
            return
        for entry in entries:
            if is_candidate_file(root, entry, now):
                yield entry
        return

    for dirpath, dirnames, filenames in os.walk(path, topdown=True, followlinks=False):
        current = Path(dirpath)
        if should_skip_dir(current):
            dirnames[:] = []
            continue
        kept_dirs = []
        for dirname in dirnames:
            child = current / dirname
            if should_skip_dir(child):
                continue
            kept_dirs.append(dirname)
        dirnames[:] = kept_dirs
        for filename in filenames:
            file_path = current / filename
            if is_candidate_file(root, file_path, now):
                yield file_path


def ensure_category(result: ScanResult, category: str) -> CategoryStat:
    stat_obj = result.by_category.get(category)
    if stat_obj is None:
        stat_obj = CategoryStat()
        result.by_category[category] = stat_obj
    return stat_obj


def scan(roots: Sequence[ScanRoot]) -> ScanResult:
    result = ScanResult()
    now = time.time()
    seen: Set[str] = set()
    print("Đang quét các thư mục tạm, log cũ, cache trình duyệt và Prefetch...")
    print()
    last_category = None
    for root in roots:
        if root.category != last_category:
            print(f"  • {root.category}: {root.path}")
            last_category = root.category
        for file_path in iter_files(root, now):
            key = os.path.normcase(os.path.abspath(str(file_path)))
            if key in seen:
                continue
            seen.add(key)
            cat = ensure_category(result, root.category)
            try:
                size = os.path.getsize(file_path)
            except OSError:
                cat.skipped_other += 1
                result.skipped_other += 1
                continue
            if file_is_in_use(file_path):
                cat.skipped_locked += 1
                result.skipped_locked += 1
                result.skipped_bytes += size
                continue
            result.candidates.append(
                FileCandidate(path=file_path, size=size, category=root.category)
            )
            cat.files += 1
            cat.bytes += size
    return result


def print_scan_summary(result: ScanResult) -> None:
    print()
    print("=" * 64)
    print("TỔNG HỢP DUNG LƯỢNG DỰ KIẾN GIẢI PHÓNG")
    print("=" * 64)
    if not result.by_category:
        print("Không tìm thấy file rác nào có thể xóa.")
        return
    width = max(len(name) for name in result.by_category)
    for name, cat in result.by_category.items():
        skip_note = ""
        skipped = cat.skipped_locked + cat.skipped_other
        if skipped:
            skip_note = f"  (bỏ qua {skipped} file đang mở/không xóa được)"
        print(
            f"  {name.ljust(width)}  {format_size(cat.bytes).rjust(12)}   "
            f"{cat.files:>7} file{skip_note}"
        )
    total_bytes = sum(c.size for c in result.candidates)
    print("-" * 64)
    print(f"  Tổng dự kiến xóa được : {format_size(total_bytes)} ({len(result.candidates)} file)")
    if result.skipped_locked or result.skipped_other:
        print(
            f"  Đã bỏ qua (đang mở / hệ thống): {result.skipped_locked + result.skipped_other} file"
            f" (~{format_size(result.skipped_bytes)})"
        )
    print("=" * 64)


def ask_confirm() -> bool:
    print()
    print("Các file đang mở và file hệ thống quan trọng sẽ KHÔNG bị xóa.")
    print("Nên đóng trình duyệt trước để dọn cache được nhiều hơn.")
    while True:
        try:
            raw = input("Bạn có muốn tiếp tục xóa? (Y/N): ")
        except EOFError:
            return False
        answer = (raw or "").strip().lower()
        if answer in {"y", "yes", "c", "co", "có"}:
            return True
        if answer in {"n", "no", "k", "khong", "không"}:
            return False
        print("Vui lòng nhập Y hoặc N.")


def delete_file(path: Path) -> bool:
    clear_readonly(path)
    target = win_long_path(path) if is_windows() else str(path)
    try:
        os.remove(target)
        return True
    except OSError:
        return False


def cleanup_empty_dirs(roots: Sequence[ScanRoot]) -> int:
    removed = 0
    root_keys = {
        os.path.normcase(os.path.abspath(str(r.path)))
        for r in roots
        if r.path.exists() and r.path.is_dir()
    }
    for root in roots:
        if not root.path.is_dir() or is_reparse_point(root.path):
            continue
        if is_protected_path(root.path):
            continue
        for dirpath, dirnames, filenames in os.walk(
            root.path, topdown=False, followlinks=False
        ):
            current = Path(dirpath)
            key = os.path.normcase(os.path.abspath(str(current)))
            if key in root_keys:
                continue
            if should_skip_dir(current):
                continue
            try:
                if not os.listdir(current):
                    os.rmdir(current)
                    removed += 1
            except OSError:
                continue
    return removed


def delete_candidates(
    candidates: Sequence[FileCandidate],
) -> tuple[int, int, int, dict[str, CategoryStat]]:
    deleted_files = 0
    deleted_bytes = 0
    skipped = 0
    by_category: dict[str, CategoryStat] = {}
    total = len(candidates)
    report_every = max(1, total // 20) if total else 1

    for index, item in enumerate(candidates, start=1):
        cat = by_category.get(item.category)
        if cat is None:
            cat = CategoryStat()
            by_category[item.category] = cat
        if is_protected_path(item.path) or file_is_in_use(item.path):
            skipped += 1
            cat.skipped_locked += 1
            continue
        if delete_file(item.path):
            deleted_files += 1
            deleted_bytes += item.size
            cat.files += 1
            cat.bytes += item.size
        else:
            skipped += 1
            cat.skipped_other += 1
        if index % report_every == 0 or index == total:
            pct = (index / total) * 100 if total else 100
            print(f"  Đã xử lý {index}/{total} file ({pct:.0f}%)...", end="\r")
    if total:
        print()
    return deleted_files, deleted_bytes, skipped, by_category


def print_banner() -> None:
    print()
    print("=" * 64)
    print("  DỌN RÁC Ổ C:  —  Temp / Cache / Log cũ / Prefetch")
    print("=" * 64)
    print(f"  Máy: {os.environ.get('COMPUTERNAME', '-')}")
    print(f"  Ổ đĩa: {SYSTEM_DRIVE}")
    print(f"  Thời gian: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 64)
    print()


def require_admin_or_exit(auto_elevate: bool) -> None:
    if is_admin():
        print("Quyền Administrator: CÓ")
        print()
        return
    print("Quyền Administrator: KHÔNG")
    print()
    print("Script cần chạy với quyền Administrator để dọn")
    print("C:\\Windows\\Temp, Prefetch và temp của mọi tài khoản.")
    if auto_elevate and is_windows():
        print("Đang mở hộp thoại UAC để nâng quyền...")
        relaunch_as_admin()
    print("Hãy chuột phải Chay_Don_Rac.bat → Run as administrator.")
    sys.exit(1)


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Dọn file rác, file tạm và cache an toàn trên ổ C: (Windows)."
    )
    parser.add_argument(
        "-y",
        "--yes",
        action="store_true",
        help="Không hỏi lại Y/N (vẫn in dung lượng dự kiến).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Chỉ quét và báo dung lượng, không xóa.",
    )
    parser.add_argument(
        "--no-elevate",
        action="store_true",
        help="Không tự mở UAC; thoát nếu chưa phải admin.",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Chạy kiểm tra nội bộ (không đụng tới ổ C:).",
    )
    return parser.parse_args(argv)


def run_self_test() -> int:
    import shutil
    import tempfile

    assert format_size(0) == "0 B"
    assert format_size(512) == "512 B"
    assert format_size(1024) == "1.0 KB"
    assert format_size(1024 * 1024) == "1.00 MB"
    assert format_size(int(1.5 * 1024 * 1024 * 1024)) == "1.50 GB"
    fake_sys32 = WINDIR / "System32" / "drivers" / "etc" / "hosts"
    assert is_protected_path(fake_sys32)
    assert is_protected_path(Path("C:/pagefile.sys") if is_windows() else WINDIR / "pagefile.sys")
    temp_ok = WINDIR / "Temp" / "abc.tmp"
    assert not is_protected_path(temp_ok)
    assert is_protected_path(WINDIR / "Temp" / "driver.sys")
    assert not is_protected_path(WINDIR / "Temp" / "setup.tmp")
    assert skip_user_profile("Public")
    assert skip_user_profile("Default")
    assert not skip_user_profile("Nguyen")
    assert matches_suffix(Path("a.pf"), {".pf"})
    assert not matches_suffix(Path("a.dll"), {".pf"})
    assert matches_suffix(Path("a.tmp"), None)
    assert matches_name(Path("thumbcache_256.db"), ("thumbcache_", "iconcache_"))
    assert not matches_name(Path("settings.db"), ("thumbcache_", "iconcache_"))

    tmp = Path(tempfile.mkdtemp(prefix="junk-clean-test-"))
    try:
        temp_dir = tmp / "Temp"
        nested = temp_dir / "nested"
        nested.mkdir(parents=True)
        logs_dir = tmp / "Logs"
        logs_dir.mkdir()
        (temp_dir / "a.tmp").write_bytes(b"x" * 1000)
        (nested / "b.tmp").write_bytes(b"y" * 2048)
        (temp_dir / "driver.sys").write_bytes(b"nope")
        (temp_dir / "fresh.tmp").write_bytes(b"fresh")
        old_log = logs_dir / "old.log"
        new_log = logs_dir / "new.log"
        old_log.write_text("old", encoding="utf-8")
        new_log.write_text("new", encoding="utf-8")
        aged = time.time() - 180
        very_old = time.time() - 10 * 86400
        for path in (temp_dir / "a.tmp", nested / "b.tmp", temp_dir / "driver.sys"):
            os.utime(path, (aged, aged))
        os.utime(old_log, (very_old, very_old))

        roots = [
            ScanRoot("Temp", temp_dir, skip_system_attr=False),
            ScanRoot(
                "Log cũ",
                logs_dir,
                allowed_suffixes={".log"},
                min_age_days=OLD_LOG_AGE_DAYS,
            ),
        ]
        result = scan(roots)
        names = {item.path.name for item in result.candidates}
        assert names == {"a.tmp", "b.tmp", "old.log"}
        assert sum(item.size for item in result.candidates) == 1000 + 2048 + len("old")

        deleted_files, deleted_bytes, skipped, _ = delete_candidates(result.candidates)
        assert deleted_files == 3
        assert skipped == 0
        assert deleted_bytes == 1000 + 2048 + len("old")
        assert not (temp_dir / "a.tmp").exists()
        assert not (nested / "b.tmp").exists()
        assert not old_log.exists()
        assert (temp_dir / "driver.sys").exists()
        assert new_log.exists()
        assert (temp_dir / "fresh.tmp").exists()
        removed_dirs = cleanup_empty_dirs(roots)
        assert removed_dirs >= 1
        assert not nested.exists()
        assert temp_dir.is_dir()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print("Self-test: OK")
    return 0


def main(argv: Optional[Sequence[str]] = None) -> int:
    enable_windows_console_utf8()
    args = parse_args(argv)

    if args.self_test:
        return run_self_test()

    if not is_windows():
        print("Script này chỉ chạy trên Windows.")
        print("Dùng --self-test để kiểm tra logic trên máy không phải Windows.")
        return 1

    print_banner()
    require_admin_or_exit(auto_elevate=not args.no_elevate)

    roots = build_scan_roots()
    result = scan(roots)
    print_scan_summary(result)

    if not result.candidates:
        print()
        print("Không có gì để xóa. Kết thúc.")
        return 0

    if args.dry_run:
        print()
        print("Chế độ dry-run: không xóa file nào.")
        return 0

    if not args.yes and not ask_confirm():
        print("Đã hủy. Không file nào bị xóa.")
        return 0

    print()
    print("Đang xóa các file đã quét (bỏ qua file phát sinh khóa)...")
    deleted_files, deleted_bytes, skipped, by_category = delete_candidates(
        result.candidates
    )
    empty_dirs = cleanup_empty_dirs(roots)

    print()
    print("=" * 64)
    print("KẾT QUẢ DỌN DẸP")
    print("=" * 64)
    if by_category:
        width = max(len(name) for name in by_category)
        for name, cat in by_category.items():
            print(
                f"  {name.ljust(width)}  {format_size(cat.bytes).rjust(12)}   "
                f"{cat.files:>7} file"
            )
    print("-" * 64)
    print(f"  Đã xóa thành công     : {deleted_files} file")
    print(f"  Dung lượng giải phóng : {format_size(deleted_bytes)}")
    print(f"  Thư mục rỗng đã gỡ    : {empty_dirs}")
    print(f"  Bỏ qua (đang mở/lỗi)  : {skipped} file")
    print("=" * 64)
    print()
    print("Hoàn tất. Prefetch và cache trình duyệt sẽ được Windows/trình duyệt tạo lại khi cần.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nĐã dừng bởi người dùng.")
        sys.exit(130)
