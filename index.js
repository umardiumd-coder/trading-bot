const { Telegraf } = require('telegraf');
const https = require('https');
const fs = require('fs');
const express = require('express');

const BOT_TOKEN = '8977837546:AAFS-c6-uzBACeTnPAVeoGNOnXS_7fI8Up0';
const CHAT_ID = '779859640';
const IP = '23.26.4.196';
const PORT = 8443;

const bot = new Telegraf(BOT_TOKEN);
const app = express();
app.use(express.json());

let config = {
  timeframe: '4h',
  watchlist: {
    BTC: { coinId: 'bitcoin', lastSignal: '' },
    ZORA: { coinId: 'zora', lastSignal: '' },
    EQTY: { coinId: 'equilibrium-token', lastSignal: '' }
  }
};

async function getOHLCV(coinId, days) {
  return new Promise((resolve) => {
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

function calcRSI(closes, period) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const rs = (gains / period) / (losses / period || 0.0001);
  return 100 - (100 / (1 + rs));
}

function calcStoch(highs, lows, closes, period) {
  if (closes.length < period) return null;
  const hh = Math.max(...highs.slice(-period));
  const ll = Math.min(...lows.slice(-period));
  if (hh === ll) return 50;
  return ((closes[closes.length - 1] - ll) / (hh - ll)) * 100;
}

function calcMACD(closes) {
  if (closes.length < 26) return null;
  function ema(data, p) {
    const k = 2 / (p + 1);
    let v = data[0];
    for (let i = 1; i < data.length; i++) v = data[i] * k + v * (1 - k);
    return v;
  }
  const macd = ema(closes, 12) - ema(closes, 26);
  const signal = ema(closes.slice(-9), 9);
  return { macd, signal, cross: macd > signal ? 'up' : 'down' };
}

async function analyzeSymbol(symbol, info) {
  const days = config.timeframe === '1h' ? 3 : config.timeframe === '4h' ? 14 : 30;
  const ohlcv = await getOHLCV(info.coinId, days);
  if (!ohlcv || ohlcv.length < 30) return null;
  const closes = ohlcv.map(c => c[4]);
  const highs = ohlcv.map(c => c[2]);
  const lows = ohlcv.map(c => c[3]);
  const price = closes[closes.length - 1];
  const rsi = calcRSI(closes, 7);
  const stoch = calcStoch(highs, lows, closes, 14);
  const macd = calcMACD(closes);
  if (!rsi || !stoch || !macd) return null;
  const buyCount = [rsi > 50, stoch > 50, macd.cross === 'up'].filter(Boolean).length;
  const sellCount = [rsi < 50, stoch < 50, macd.cross === 'down'].filter(Boolean).length;
  let signal = 'HOLD';
  if (buyCount === 3) signal = 'BUY';
  else if (buyCount === 2) signal = 'READY_BUY';
  else if (sellCount >= 2) signal = 'SELL';
  return { symbol, price, rsi, stoch, macd: macd.macd, signal, buyCount, sellCount };
}

async function checkAll() {
  for (const [symbol, info] of Object.entries(config.watchlist)) {
    const r = await analyzeSymbol(symbol, info);
    if (!r) continue;
    console.log(`${symbol}: RSI=${r.rsi.toFixed(1)} Stoch=${r.stoch.toFixed(1)} Signal=${r.signal}`);
    if (r.signal === info.lastSignal) continue;
    info.lastSignal = r.signal;
    let msg = '';
    if (r.signal === 'BUY') {
      msg = `🟢 *SINYAL BELI - ${symbol}*\n\n✅ RSI(7): ${r.rsi.toFixed(1)} > 50\n✅ Stochastic: ${r.stoch.toFixed(1)} > 50\n✅ MACD: Golden Cross\n\n💰 Harga: $${r.price.toLocaleString()}\n⏱ Timeframe: ${config.timeframe}\n\n*3/3 Terpenuhi - BELI!*`;
    } else if (r.signal === 'READY_BUY') {
      msg = `🟡 *SIAP-SIAP BELI - ${symbol}*\n\n${r.buyCount}/3 indikator terpenuhi\nRSI(7): ${r.rsi.toFixed(1)} | Stoch: ${r.stoch.toFixed(1)}\n\n💰 Harga: $${r.price.toLocaleString()}\n⏱ Timeframe: ${config.timeframe}\n\n*Tunggu konfirmasi!*`;
    } else if (r.signal === 'SELL') {
      msg = `🔴 *SINYAL JUAL - ${symbol}*\n\n${r.sellCount}/3 indikator jual terpenuhi\nRSI(7): ${r.rsi.toFixed(1)} | Stoch: ${r.stoch.toFixed(1)}\n\n💰 Harga: $${r.price.toLocaleString()}\n⏱ Timeframe: ${config.timeframe}\n\n*JUAL!*`;
    }
    if (msg) bot.telegram.sendMessage(CHAT_ID, msg, { parse_mode: 'Markdown' });
  }
}

bot.start((ctx) => ctx.reply('🤖 *Bot Trading Aktif!*\n\n/status - Cek sinyal sekarang\n/list - Daftar crypto\n/tf 1h|4h|1d - Ganti timeframe\n/add SYMBOL COINID - Tambah crypto\n/remove SYMBOL - Hapus crypto\n/scan - Scan semua sekarang', { parse_mode: 'Markdown' }));

bot.command('status', async (ctx) => {
  ctx.reply('⏳ Menganalisa...');
  let msg = `📊 *Status Sinyal (${config.timeframe})*\n\n`;
  for (const [symbol, info] of Object.entries(config.watchlist)) {
    const r = await analyzeSymbol(symbol, info);
    if (r) {
      const si = r.signal === 'BUY' ? '🟢 BELI' : r.signal === 'READY_BUY' ? '🟡 SIAP-SIAP' : r.signal === 'SELL' ? '🔴 JUAL' : '⚪ HOLD';
      msg += `*${symbol}* $${r.price.toLocaleString()}\nRSI: ${r.rsi.toFixed(1)} | Stoch: ${r.stoch.toFixed(1)}\nSinyal: ${si}\n\n`;
    } else {
      msg += `*${symbol}*: Data tidak cukup\n\n`;
    }
  }
  ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('scan', async (ctx) => {
  ctx.reply('🔍 Scanning...');
  await checkAll();
  ctx.reply('✅ Scan selesai!');
});

bot.command('tf', (ctx) => {
  const tf = ctx.message.text.split(' ')[1];
  if (!['1h', '4h', '1d'].includes(tf)) return ctx.reply('Format: /tf 1h\nPilihan: 1h, 4h, 1d');
  config.timeframe = tf;
  Object.values(config.watchlist).forEach(i => i.lastSignal = '');
  ctx.reply(`✅ Timeframe diubah ke *${tf}*`, { parse_mode: 'Markdown' });
});

bot.command('list', (ctx) => {
  const items = Object.entries(config.watchlist).map(([s, i]) => `• *${s}* (${i.coinId})`).join('\n');
  ctx.reply(`📋 *Daftar Crypto (${config.timeframe}):*\n\n${items}`, { parse_mode: 'Markdown' });
});

bot.command('add', (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 3) return ctx.reply('Format: /add SYMBOL COINID\nContoh: /add SOL solana\n\nCari coinId di: coingecko.com');
  const symbol = args[1].toUpperCase();
  const coinId = args[2].toLowerCase();
  config.watchlist[symbol] = { coinId, lastSignal: '' };
  ctx.reply(`✅ *${symbol}* ditambahkan!\nCoinId: ${coinId}`, { parse_mode: 'Markdown' });
});

bot.command('remove', (ctx) => {
  const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
  if (!symbol || !config.watchlist[symbol]) return ctx.reply('Crypto tidak ditemukan.');
  delete config.watchlist[symbol];
  ctx.reply(`🗑️ *${symbol}* dihapus.`, { parse_mode: 'Markdown' });
});

setInterval(checkAll, 30 * 60 * 1000);
setTimeout(checkAll, 5000);

app.use(bot.webhookCallback('/webhook'));
https.createServer({
  key: fs.readFileSync('/root/bot/private.key'),
  cert: fs.readFileSync('/root/bot/cert.pem')
}, app).listen(PORT, async () => {
  console.log('Server jalan di port ' + PORT);
  await bot.telegram.setWebhook('https://' + IP + ':' + PORT + '/webhook', { certificate: { source: '/root/bot/cert.pem' } });
  console.log('Webhook berhasil didaftarkan!');
});
