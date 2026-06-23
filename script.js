const root = document.documentElement;
const TG_JOIN_URL = 'https://t.me/btcsiling';

window.addEventListener('pointermove', (event) => {
  const x = (event.clientX / window.innerWidth - 0.5).toFixed(3);
  const y = (event.clientY / window.innerHeight - 0.5).toFixed(3);
  root.style.setProperty('--cursor-x', x);
  root.style.setProperty('--cursor-y', y);
});

const cards = document.querySelectorAll('.signal-cards article, .news-grid article, .process-row article');
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.animate([
        { opacity: 0, transform: 'translateY(18px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.18 });

cards.forEach((card) => observer.observe(card));

const marketEls = {
  price: document.querySelector('#btc-price'),
  change: document.querySelector('#btc-change'),
  line: document.querySelector('#btc-line'),
  area: document.querySelector('#btc-area'),
  liquidation: document.querySelector('#liquidation-density'),
  funding: document.querySelector('#funding-rate'),
  greed: document.querySelector('#greed-index'),
  source: document.querySelector('#market-source')
};

const formatUsd = (value) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format(value);

const formatPercent = (value, digits = 2) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

function buildLinePath(closes) {
  const width = 520;
  const height = 220;
  const padX = 8;
  const padY = 24;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const points = closes.map((close, index) => {
    const x = padX + (index / Math.max(closes.length - 1, 1)) * (width - padX * 2);
    const y = padY + (1 - (close - min) / range) * (height - padY * 2);
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  });

  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
  const area = `${line} L${width - padX} ${height} L${padX} ${height} Z`;
  return { line, area };
}

function estimateLiquidationDensity(ticker) {
  const high = Number(ticker.highPrice);
  const low = Number(ticker.lowPrice);
  const last = Number(ticker.lastPrice);
  const quoteVolume = Number(ticker.quoteVolume || 0);
  const rangePct = last ? ((high - low) / last) * 100 : 0;

  if (rangePct >= 5 || quoteVolume >= 8_000_000_000) return 'HIGH';
  if (rangePct >= 2.5 || quoteVolume >= 3_500_000_000) return 'MID';
  return 'LOW';
}

function translateFearGreed(label) {
  const map = {
    'Extreme Fear': '极度恐惧',
    Fear: '恐惧',
    Neutral: '中性',
    Greed: '贪婪',
    'Extreme Greed': '极度贪婪'
  };
  return map[label] || label || '--';
}

async function updateMarketRadar() {
  if (!marketEls.price) return;

  try {
    const market = await fetchJson(`/api/market?t=${Date.now()}`);

    const lastPrice = Number(market.lastPrice);
    const changePercent = Number(market.priceChangePercent);
    const closes = (market.closes || []).map(Number).filter(Number.isFinite);
    const latestFunding = Number(market.fundingRatePercent ?? 0);
    const fngValue = market.fearGreedValue || '--';
    const fngLabel = market.fearGreedLabel || '--';
    const paths = buildLinePath(closes.length ? closes : [lastPrice]);
    const now = new Date();

    marketEls.price.textContent = formatUsd(lastPrice);
    marketEls.change.textContent = `24H ${formatPercent(changePercent)}`;
    marketEls.change.classList.toggle('positive', changePercent >= 0);
    marketEls.change.classList.toggle('negative', changePercent < 0);
    marketEls.line?.setAttribute('d', paths.line);
    marketEls.area?.setAttribute('d', paths.area);
    marketEls.liquidation.textContent = formatPercent(changePercent, 2);
    marketEls.funding.textContent = formatPercent(latestFunding, 4);
    marketEls.greed.textContent = `${fngValue}·${fngLabel}`;
    marketEls.source.textContent = `行情已更新 · ${now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (error) {
    console.warn('Market radar update failed:', error);
    marketEls.price.textContent = ['加载中', '同步中'].includes(marketEls.price.textContent) ? '$--' : marketEls.price.textContent;
    marketEls.source.textContent = '行情暂未同步，稍后自动重试';
  }
}

updateMarketRadar();
setInterval(updateMarketRadar, 60_000);
