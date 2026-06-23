const URLS = {
  binanceTicker: 'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT',
  binanceKlines: 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=24',
  binanceFunding: 'https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1',
  okxTicker: 'https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT',
  okxCandles: 'https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1H&limit=24',
  coinbaseTicker: 'https://api.exchange.coinbase.com/products/BTC-USD/ticker',
  coinbaseStats: 'https://api.exchange.coinbase.com/products/BTC-USD/stats',
  coinbaseCandles: 'https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600',
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
      'User-Agent': 'BTC-General-Market-Radar/1.0 (+https://btcgeneral.com)',
      Accept: 'application/json,text/plain,*/*',
    },
    cf: { cacheTtl: 45, cacheEverything: true },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function tryFirst(tasks) {
  const errors = [];
  for (const task of tasks) {
    try {
      return await task();
    } catch (error) {
      errors.push(error.message || String(error));
    }
  }
  throw new Error(errors.join(' | '));
}

function estimateLiquidationDensity({ highPrice, lowPrice, lastPrice, quoteVolume }) {
  const high = Number(highPrice || 0);
  const low = Number(lowPrice || 0);
  const last = Number(lastPrice || 0);
  const volume = Number(quoteVolume || 0);
  const rangePct = last ? ((high - low) / last) * 100 : 0;

  if (rangePct >= 5 || volume >= 8_000_000_000) return ['HIGH', rangePct];
  if (rangePct >= 2.5 || volume >= 3_500_000_000) return ['MID', rangePct];
  return ['LOW', rangePct];
}

function normalizeCloses(values) {
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(-24);
}

async function getBinanceMarket() {
  const [ticker, klines] = await Promise.all([
    fetchJson(URLS.binanceTicker),
    fetchJson(URLS.binanceKlines),
  ]);
  return {
    source: 'binance',
    lastPrice: Number(ticker.lastPrice || 0),
    priceChangePercent: Number(ticker.priceChangePercent || 0),
    highPrice: Number(ticker.highPrice || 0),
    lowPrice: Number(ticker.lowPrice || 0),
    quoteVolume: Number(ticker.quoteVolume || 0),
    closes: Array.isArray(klines) ? normalizeCloses(klines.map((row) => row[4])) : [],
  };
}

async function getOkxMarket() {
  const [tickerBody, candlesBody] = await Promise.all([
    fetchJson(URLS.okxTicker),
    fetchJson(URLS.okxCandles),
  ]);
  const ticker = (tickerBody.data || [])[0] || {};
  const candles = candlesBody.data || [];
  const last = Number(ticker.last || 0);
  const open24h = Number(ticker.open24h || 0);
  const priceChangePercent = open24h ? ((last - open24h) / open24h) * 100 : 0;
  return {
    source: 'okx',
    lastPrice: last,
    priceChangePercent,
    highPrice: Number(ticker.high24h || 0),
    lowPrice: Number(ticker.low24h || 0),
    quoteVolume: Number(ticker.volCcy24h || 0),
    closes: normalizeCloses(candles.slice().reverse().map((row) => row[4])),
  };
}

async function getCoinbaseMarket() {
  const [ticker, stats, candles] = await Promise.all([
    fetchJson(URLS.coinbaseTicker),
    fetchJson(URLS.coinbaseStats),
    fetchJson(URLS.coinbaseCandles),
  ]);
  const last = Number(ticker.price || 0);
  const open = Number(stats.open || 0);
  const priceChangePercent = open ? ((last - open) / open) * 100 : 0;
  return {
    source: 'coinbase',
    lastPrice: last,
    priceChangePercent,
    highPrice: Number(stats.high || 0),
    lowPrice: Number(stats.low || 0),
    quoteVolume: Number(ticker.volume || 0) * last,
    closes: normalizeCloses((Array.isArray(candles) ? candles : []).slice().reverse().map((row) => row[4])),
  };
}

async function getFundingRatePercent() {
  try {
    const funding = await fetchJson(URLS.binanceFunding);
    return Number(((funding || [{}])[0] || {}).fundingRate || 0) * 100;
  } catch (_) {
    return 0;
  }
}

async function getFearGreed() {
  try {
    const fng = await fetchJson(URLS.fng);
    const fearGreed = (fng.data || [{}])[0];
    const label = fearGreed.value_classification || '--';
    return {
      fearGreedValue: String(fearGreed.value || '--'),
      fearGreedLabel: FNG_ZH[label] || label,
    };
  } catch (_) {
    return { fearGreedValue: '--', fearGreedLabel: '同步中' };
  }
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
    const [market, fundingRatePercent, fearGreed] = await Promise.all([
      tryFirst([getBinanceMarket, getOkxMarket, getCoinbaseMarket]),
      getFundingRatePercent(),
      getFearGreed(),
    ]);

    const [densityLabel, densityValue] = estimateLiquidationDensity(market);

    return jsonResponse({
      lastPrice: Math.round(Number(market.lastPrice || 0) * 100) / 100,
      priceChangePercent: Math.round(Number(market.priceChangePercent || 0) * 1000) / 1000,
      closes: market.closes,
      fundingRatePercent: Math.round(Number(fundingRatePercent || 0) * 1_000_000) / 1_000_000,
      fearGreedValue: fearGreed.fearGreedValue,
      fearGreedLabel: fearGreed.fearGreedLabel,
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
