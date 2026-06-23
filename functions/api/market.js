const URLS = {
  ticker: 'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT',
  klines: 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=24',
  funding: 'https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1',
  fng: 'https://api.alternative.me/fng/?limit=1',
};

const FNG_ZH = {
  'Extreme Fear': '极度恐惧',
  Fear: '恐惧',
  Neutral: '中性',
  Greed: '贪婪',
  'Extreme Greed': '极度贪婪',
};

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'BTC-General-Market-Radar/1.0',
      Accept: 'application/json,text/plain,*/*',
    },
    cf: { cacheTtl: 45, cacheEverything: true },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

function estimateLiquidationDensity(ticker) {
  const high = Number(ticker.highPrice || 0);
  const low = Number(ticker.lowPrice || 0);
  const last = Number(ticker.lastPrice || 0);
  const quoteVolume = Number(ticker.quoteVolume || 0);
  const rangePct = last ? ((high - low) / last) * 100 : 0;

  if (rangePct >= 5 || quoteVolume >= 8_000_000_000) {
    return ['HIGH', rangePct];
  }
  if (rangePct >= 2.5 || quoteVolume >= 3_500_000_000) {
    return ['MID', rangePct];
  }
  return ['LOW', rangePct];
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      ...init.headers,
    },
  });
}

export async function onRequestGet() {
  try {
    const [ticker, klines, funding, fng] = await Promise.all([
      fetchJson(URLS.ticker),
      fetchJson(URLS.klines),
      fetchJson(URLS.funding),
      fetchJson(URLS.fng),
    ]);

    const fearGreed = (fng.data || [{}])[0];
    const fngLabel = fearGreed.value_classification || '--';
    const closes = Array.isArray(klines)
      ? klines.filter((row) => row.length > 4).map((row) => Number(row[4]))
      : [];
    const [densityLabel, densityValue] = estimateLiquidationDensity(ticker);

    return jsonResponse({
      lastPrice: Number(ticker.lastPrice || 0),
      priceChangePercent: Number(ticker.priceChangePercent || 0),
      closes,
      fundingRatePercent: Number(((funding || [{}])[0] || {}).fundingRate || 0) * 100,
      fearGreedValue: String(fearGreed.value || '--'),
      fearGreedLabel: FNG_ZH[fngLabel] || fngLabel,
      liquidationDensity: densityLabel,
      liquidationDensityValue: Math.round(densityValue * 100) / 100,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error('market api error:', error);
    return jsonResponse({ error: 'market_unavailable' }, { status: 502 });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    },
  });
}
