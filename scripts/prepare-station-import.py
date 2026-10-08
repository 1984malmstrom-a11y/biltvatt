#!/usr/bin/env python3
"""Validate the private 2025 store-net CSV and prepare idempotent D1 SQL.

No database connection is made. The input and generated SQL must stay outside Git.
"""

import argparse
import csv
import hashlib
import io
import os
import re
import sys
from datetime import date, timedelta
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
STATION = "tingsryd"
LIMIT_ORE = 10_000_000_000
ALL_DAYS = {date(2025, 1, 1) + timedelta(days=n) for n in range(365)}

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("csv_file", type=Path, help="Private UTF-8 CSV export, outside Git")
parser.add_argument("--expected-sha256", required=True)
parser.add_argument("--expected-total-ore", required=True, type=int)
parser.add_argument("--expected-sample-date", required=True)
parser.add_argument("--expected-sample-ore", required=True, type=int)
parser.add_argument("--write-sql", type=Path, help="Private import SQL path; must not exist")
parser.add_argument("--write-preflight-sql", type=Path, help="Private read-only preflight SQL path; must not exist")
parser.add_argument("--confirm-preview", action="store_true", help="Acknowledge review of a prior preview run")
args = parser.parse_args()

if (args.write_sql or args.write_preflight_sql) and not args.confirm_preview:
    parser.error("Run the preview first, then pass --confirm-preview to create SQL")
if args.csv_file.resolve().is_relative_to(REPO):
    parser.error("Private CSV source must be kept outside the Git repository")
if args.write_sql and args.write_preflight_sql and args.write_sql.resolve() == args.write_preflight_sql.resolve():
    parser.error("Import and preflight paths must differ")
if not re.fullmatch(r"[a-fA-F0-9]{64}", args.expected_sha256):
    parser.error("Expected SHA-256 must be 64 hex characters")
if args.expected_total_ore < 0 or args.expected_sample_ore < 0:
    parser.error("Expected amounts must be nonnegative")
try:
    sample_date = date.fromisoformat(args.expected_sample_date)
    if sample_date.isoformat() != args.expected_sample_date or sample_date not in ALL_DAYS:
        raise ValueError
except ValueError:
    parser.error("Expected sample date must be a valid date in 2025")

raw = args.csv_file.read_bytes()
if len(raw) > 2_000_000:
    parser.error("CSV exceeds the 2 MB limit")
digest = hashlib.sha256(raw).hexdigest()
if digest != args.expected_sha256.lower():
    sys.exit("SHA-256 mismatch: no SQL generated")
try:
    content = raw.decode("utf-8-sig")
except UnicodeDecodeError:
    sys.exit("Export a UTF-8 CSV: no SQL generated")
if "\x00" in content:
    sys.exit("NUL byte in CSV: no SQL generated")

try:
    reader = csv.DictReader(io.StringIO(content, newline=""), delimiter=",", strict=True)
    if reader.fieldnames != ["business_date", "net_sales_ore"]:
        sys.exit("Expected exactly business_date,net_sales_ore in that order")
    rows = list(reader)
except csv.Error as error:
    sys.exit(f"Invalid CSV: {error}")

values = {}
errors = []
for line, row in enumerate(rows, start=2):
    if set(row) != {"business_date", "net_sales_ore"} or any(v is None for v in row.values()):
        errors.append(f"line {line}: wrong number of columns")
        continue
    raw_day, raw_ore = row["business_date"], row["net_sales_ore"]
    try:
        day = date.fromisoformat(raw_day)
        if day.isoformat() != raw_day or day not in ALL_DAYS:
            raise ValueError
    except ValueError:
        errors.append(f"line {line}: invalid 2025 date")
        continue
    if day in values:
        errors.append(f"line {line}: duplicate date")
        continue
    if not re.fullmatch(r"(?:0|[1-9][0-9]*)", raw_ore):
        errors.append(f"line {line}: amount must be whole nonnegative öre")
        continue
    ore = int(raw_ore)
    if ore > LIMIT_ORE:
        errors.append(f"line {line}: amount exceeds D1 limit")
        continue
    values[day] = ore

missing = sorted(ALL_DAYS - values.keys())
total = sum(values.values())
whole, decimals = divmod(total, 100)
print(f"Source SHA-256: {digest}")
print(f"Rows: {len(rows)} | Valid unique days: {len(values)} | Missing days: {len(missing)}")
print(f"Period: {min(values) if values else '-'} to {max(values) if values else '-'}")
print(f"Store net: {format(whole, ',').replace(',', ' ')},{decimals:02d} kr ({total} öre)")
print(f"Sample {sample_date}: {values.get(sample_date, 'missing')} öre")
for error in errors:
    print(error, file=sys.stderr)
if errors or len(rows) != 365 or missing or total != args.expected_total_ore or values.get(sample_date) != args.expected_sample_ore:
    sys.exit("Control checks failed: no SQL generated")
print("All file and control checks passed. No database was changed.")

source_values = ",\n".join(f"('{day}',{values[day]})" for day in sorted(values))
preflight = (
    "-- Read-only: run after migration 0004 and before an approved import.\n"
    "WITH expected(business_date,net_sales_ore) AS (VALUES\n" + source_values + "\n)\n"
    "SELECT COUNT(s.business_date) AS existing_rows,\n"
    "  SUM(CASE WHEN s.business_date IS NOT NULL AND s.net_sales_ore=e.net_sales_ore THEN 1 ELSE 0 END) AS matching_rows,\n"
    "  SUM(CASE WHEN s.business_date IS NOT NULL AND s.net_sales_ore<>e.net_sales_ore THEN 1 ELSE 0 END) AS differing_rows\n"
    "FROM expected e LEFT JOIN station_store_daily_sales s\n"
    "ON s.station_id='tingsryd' AND s.business_date=e.business_date;\n"
)
insert_values = ",\n".join(
    f"('{STATION}','{day}',{values[day]},'import',0,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'IMPORT')"
    for day in sorted(values)
)
import_sql = (
    f"-- Private source SHA-256: {digest}. One atomic, repeatable INSERT.\n"
    "-- Existing days, including corrected values, remain unchanged.\n"
    "INSERT INTO station_store_daily_sales(station_id,business_date,net_sales_ore,source,revision,created_at,updated_at,actor) VALUES\n"
    + insert_values + "\nON CONFLICT(station_id,business_date) DO NOTHING;\n"
)


def write_private(path: Path, data: str):
    target = path.resolve()
    if target.is_relative_to(REPO):
        parser.error("Private SQL must be written outside the Git repository")
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        stream.write(data)
    print(f"Created private SQL: {target}")


if args.write_preflight_sql:
    write_private(args.write_preflight_sql, preflight)
if args.write_sql:
    write_private(args.write_sql, import_sql)
