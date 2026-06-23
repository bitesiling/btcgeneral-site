from __future__ import annotations

import json
import time
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

HOST = "127.0.0.1"
PORT = 8788
CACHE_TTL = 45
_cache: dict[str, Any] = {"ts": 0.0, "data": None}

URLS = {
    "ticker": "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT",
    "klines": "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=24",
    "funding": "https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1",
    "fng": "https://api.alternative.me/fng/?limit=1",
}

FNG_ZH = {
    "Extreme Fear": "极度恐惧",
    "Fear": "恐惧",
    "Neutral": "中性",
    "Greed": "贪婪",
    "Extreme Greed": "极度贪婪",
}


def fetch_json(url: str, timeout: int = 10) -> Any:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 BTC-General-Market-Radar/1.0",
            "Accept": "application/json,text/plain,*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def estimate_liquidation_density(ticker: dict[str, Any]) -> tuple[str, float]:
    high = float(ticker.get("highPrice") or 0)
    low = float(ticker.get("lowPrice") or 0)
    last = float(ticker.get("lastPrice") or 0)
    quote_volume = float(ticker.get("quoteVolume") or 0)
    range_pct = ((high - low) / last) * 100 if last else 0
    if range_pct >= 5 or quote_volume >= 8_000_000_000:
        return "HIGH", range_pct
    if range_pct >= 2.5 or quote_volume >= 3_500_000_000:
        return "MID", range_pct
    return "LOW", range_pct


def market_payload() -> dict[str, Any]:
    now = time.time()
    if _cache["data"] is not None and now - _cache["ts"] < CACHE_TTL:
        return _cache["data"]

    ticker = fetch_json(URLS["ticker"])
    klines = fetch_json(URLS["klines"])
    funding = fetch_json(URLS["funding"])
    fng = fetch_json(URLS["fng"])

    fear_greed = (fng.get("data") or [{}])[0]
    fng_label = fear_greed.get("value_classification") or "--"
    closes = [float(row[4]) for row in klines if len(row) > 4]

    density_label, density_value = estimate_liquidation_density(ticker)

    data = {
        "lastPrice": float(ticker.get("lastPrice") or 0),
        "priceChangePercent": float(ticker.get("priceChangePercent") or 0),
        "closes": closes,
        "fundingRatePercent": float((funding or [{}])[0].get("fundingRate") or 0) * 100,
        "fearGreedValue": str(fear_greed.get("value") or "--"),
        "fearGreedLabel": FNG_ZH.get(fng_label, fng_label),
        "liquidationDensity": density_label,
        "liquidationDensityValue": round(density_value, 2),
        "updatedAt": int(now * 1000),
    }
    _cache.update(ts=now, data=data)
    return data


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".png": "image/png",
    }

    def do_GET(self) -> None:
        if self.path.startswith("/api/market"):
            self.serve_market()
            return
        super().do_GET()

    def end_headers(self) -> None:
        # This preview site changes frequently during review. Disable browser and
        # Telegram in-app cache so users do not keep seeing stale JS/HTML.
        if not self.path.startswith("/api/market"):
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def serve_market(self) -> None:
        try:
            body = json.dumps(market_payload(), ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            body = json.dumps({"error": "market_unavailable"}).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            print(f"market api error: {exc!r}", flush=True)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Serving BTC GENERAL site with market API on http://{HOST}:{PORT}/", flush=True)
    server.serve_forever()
