#!/usr/bin/env python3
"""Economic Calendar Fetcher
Scrapes ForexFactory calendar for high-impact news events.
Stores results as JSON for the ICM pipeline to consume.

Usage:
  python tools/economic_calendar.py --output shared/economic_calendar.json
  python tools/economic_calendar.py --today-only --output shared/today_events.json
"""

import argparse
import json
import re
import sys
from datetime import datetime, timedelta
from urllib.request import Request, urlopen
from urllib.error import URLError


FOREX_FACTORY_URL = "https://www.forexfactory.com/calendar"
FOREX_FACTORY_XML = "https://cdn-nfs.forexfactory.com/ff_calendar_thisweek.xml"
# Fallback: use nfs-forexfactory CDN
FOREX_FACTORY_XML_ALT = "https://nfs-forexfactory.s3.amazonaws.com/ff_calendar_thisweek.xml"


def fetch_forex_factory_xml():
    """Fetch the ForexFactory XML feed (free, no API key required).
    Returns raw XML string."""
    req = Request(
        FOREX_FACTORY_XML,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/xml,text/xml,*/*",
        },
    )
    try:
        with urlopen(req, timeout=15) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except URLError as e:
        print(f"Error fetching ForexFactory XML: {e}", file=sys.stderr)
        return None


def parse_forex_factory_xml(xml_content):
    """Parse ForexFactory XML into structured event list.
    XML structure: <event><title>, <country>, <date>, <time>, <impact>, <forecast>, <previous></event>
    """
    events = []
    # Simple regex-based XML parsing (no xml.etree dependency needed)
    event_blocks = re.findall(r"<event>(.*?)</event>", xml_content, re.DOTALL)

    for block in event_blocks:
        title = re.search(r"<title>(.*?)</title>", block)
        country = re.search(r"<country>(.*?)</country>", block)
        date_str = re.search(r"<date>(.*?)</date>", block)
        time_str = re.search(r"<time>(.*?)</time>", block)
        impact = re.search(r"<impact>(.*?)</impact>", block)
        forecast = re.search(r"<forecast>(.*?)</forecast>", block)
        previous = re.search(r"<previous>(.*?)</previous>", block)

        if not title or not country or not date_str:
            continue

        title_text = title.group(1).strip()
        country_text = country.group(1).strip()
        impact_text = (impact.group(1).strip() if impact else "Non-Economic").lower()
        forecast_text = forecast.group(1).strip() if forecast else ""
        previous_text = previous.group(1).strip() if previous else ""

        # Parse date/time
        date_val = date_str.group(1).strip()
        time_val = time_str.group(1).strip() if time_str else "00:00"

        # Skip non-economic events and holidays
        if impact_text == "non-economic" or "holiday" in title_text.lower():
            continue
        if impact_text == "" or impact_text == "none":
            continue

        # Determine if this affects USD pairs
        affected_pairs = []
        currency_map = {
            "USD": ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "NZDUSD", "XAUUSD", "NAS100", "DXY"],
            "EUR": ["EURUSD", "EURGBP"],
            "GBP": ["GBPUSD", "EURGBP"],
            "JPY": ["USDJPY", "GBPJPY"],
            "AUD": ["AUDUSD"],
            "CAD": ["USDCAD"],
            "NZD": ["NZDUSD"],
            "CHF": ["USDCHF"],
        }
        affected_pairs = currency_map.get(country_text, [])

        # Determine news window (30 min before/after for high impact)
        is_high = impact_text == "high"

        events.append({
            "title": title_text,
            "currency": country_text,
            "impact": impact_text,
            "is_high_impact": is_high,
            "date": date_val,
            "time": time_val,
            "forecast": forecast_text,
            "previous": previous_text,
            "affected_pairs": affected_pairs,
            "blackout_active": is_high,  # No trading 30min before/after high impact
        })

    # Sort by date/time
    events.sort(key=lambda e: (e["date"], e["time"]))
    return events


def filter_today(events):
    """Filter events to today only."""
    today = datetime.utcnow().strftime("%m-%d-%Y")
    return [e for e in events if e["date"] == today]


def filter_this_week(events):
    """Filter events to this week."""
    now = datetime.utcnow()
    week_start = now - timedelta(days=now.weekday())
    week_end = week_start + timedelta(days=7)

    result = []
    for e in events:
        try:
            event_date = datetime.strptime(e["date"], "%m-%d-%Y")
            if week_start <= event_date <= week_end:
                result.append(e)
        except ValueError:
            continue
    return result


def get_active_blackout_pairs(events):
    """Get pairs currently in news blackout (30min window around high-impact events)."""
    now = datetime.utcnow()
    blackout_pairs = set()

    for e in events:
        if not e["is_high_impact"]:
            continue
        try:
            event_time = datetime.strptime(f"{e['date']} {e['time']}", "%m-%d-%Y %H:%M")
            window_start = event_time - timedelta(minutes=30)
            window_end = event_time + timedelta(minutes=30)
            if window_start <= now <= window_end:
                for pair in e["affected_pairs"]:
                    blackout_pairs.add(pair)
        except ValueError:
            continue

    return list(blackout_pairs)


def main():
    parser = argparse.ArgumentParser(description="Fetch ForexFactory economic calendar")
    parser.add_argument("--output", help="Output JSON file path", default=None)
    parser.add_argument("--today-only", action="store_true", help="Filter to today's events only")
    parser.add_argument("--blackout-check", action="store_true", help="Check which pairs are in news blackout right now")
    args = parser.parse_args()

    xml_content = fetch_forex_factory_xml()
    if not xml_content:
        print("Failed to fetch calendar data", file=sys.stderr)
        sys.exit(1)

    events = parse_forex_factory_xml(xml_content)
    print(f"Parsed {len(events)} economic events", file=sys.stderr)

    if args.today_only:
        events = filter_today(events)
        print(f"Filtered to {len(events)} events today", file=sys.stderr)

    blackout_pairs = get_active_blackout_pairs(events)

    result = {
        "fetched_at": datetime.utcnow().isoformat(),
        "total_events": len(events),
        "high_impact_count": sum(1 for e in events if e["is_high_impact"]),
        "medium_impact_count": sum(1 for e in events if e["impact"] == "medium"),
        "active_blackout_pairs": blackout_pairs,
        "blackout_active": len(blackout_pairs) > 0,
        "events": events,
    }

    output = json.dumps(result, indent=2, default=str)
    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
        print(f"Saved to {args.output}", file=sys.stderr)
    else:
        print(output)

    if args.blackout_check and blackout_pairs:
        print(f"\n⚠️  NEWS BLACKOUT ACTIVE for: {', '.join(blackout_pairs)}", file=sys.stderr)
        print("   No entries 30min before/after high-impact events.", file=sys.stderr)


if __name__ == "__main__":
    main()
