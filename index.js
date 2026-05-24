cat > ~/bot_v2.js << 'ENDOFFILE'
const{Telegraf}=require('telegraf');const https=require('https');const fs=require('fs');const express=require('express');const BOT_TOKEN='8977837546:AAFS-c6-uzBACeTnPAVeoGNOnXS_7fI8Up0';const CHAT_ID='779859640';const IP='23.26.4.196';const PORT=8443;const bot=new Telegraf(BOT_TOKEN);const app=express();app.use(express.json());

let config={timeframe:'4h',watchlist:{BTC:{coinId:'bitcoin',prices:[],lastSignal:''},ZORA:{coinId:'zora',prices:[],lastSignal:''},EQTY:{coinId:'equilibrium-token',prices:[],lastSignal:''}}};

const TF_MINUTES={'1h':60,'4h':240,'1d':1440};
const TF_CANDLES={'1h':14,'4h':14,'1d':14};

async function getOHLCV(coinId,days){return new Promise((resolve)=>{const url=`https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;https.get(url,{headers:{'User-Agent':'Mozilla/5.0'}},(res)=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{try{resolve(JSON.parse(d))}catch{resolve([])}});}).on('error',()=>resolve([]))});}

function calcRSI(closes,period=7){if(closes.length<period+1)return null;let gains=0,losses=0;for(let i=closes.length-period;i<closes.length;i++){const diff=closes[i]-closes[i-1];if(diff>0)gains+=diff;else losses+=Math.abs(diff);}const avgGain=gains/period;const avgLoss=losses/period;if(avgLoss===0)return 100;const rs=avgGain/avgLoss;return 100-(100/(1+rs));}

function calcStoch(highs,lows,closes,period=14){if(closes.length<period)return null;const recentHighs=highs.slice(-period);const recentLows=lows.slice(-period);const hh=Math.max(...recentHighs);const ll=Math.min(...recentLows);const close=closes[closes.length-1];if(hh===ll)return 50;return((close-ll)/(hh-ll))*100;}

function calcMACD(closes){if(closes.length<26)return null;function ema(data,period){let k=2/(period+1);let emaVal=data[0];for(let i=1;i<data.length;i++)emaVal=data[i]*k+emaVal*(1-k);return emaVal;}const ema12=ema(closes,12);const ema26=ema(closes,26);const macdLine=ema12-ema26;const signal=ema(closes.slice(-9),9);return{macd:macdLine,signal,cross:macdLine>signal?'up':'down'};}

async function analyzeSymbol(symbol,info){const days=config.timeframe==='1h'?3:config.timeframe==='4h'?14:30;const ohlcv=await getOHLCV(info.coinId,days);if(!ohlcv||ohlcv.length<30)return null;const closes=ohlcv.map(c=>c[4]);const highs=ohlcv.map(c=>c[2]);const lows=ohlcv.map(c=>c[3]);const price=closes[closes.length-1];const rsi=calcRSI(closes,7);const stoch=calcStoch(highs,lows,closes,14);const macd=calcMACD(closes);if(!rsi||!stoch||!macd)return null;const rsiBuy=rsi>50;const stochBuy=stoch>50;const macdBuy=macd.cross==='up';const rsiSell=rsi<50;const stochSell=stoch<50;const macdSell=macd.cross==='down';const buyCount=[rsiBuy,stochBuy,macdBuy].filter(Boolean).length;const sellCount=[rsiSell,stochSell,macdSell].filter(Boolean).length;let signal='HOLD';if(buyCount===3)signal='BUY';else if(buyCount===2)signal='READY_BUY';else if(sellCount>=2)signal='SELL';return{symbol,price,rsi,stoch,macd:macd.macd,signal,macdCross:macd.cross,buyCount,sellCount};}

async function checkAll(){for(const[symbol,info]of Object.entries(config.watchlist)){const result=await analyzeSymbol(symbol,info);if(!result)continue;const{price,rsi,stoch,signal,buyCount,sellCount}=result;if(signal===info.lastSignal)continue;info.lastSignal=signal;let msg='';if(signal==='BUY'){msg=`🟢 *SINYAL BELI - ${symbol}*\n\n✅ RSI(7): ${rsi.toFixed(1)} > 50\n✅ Stochastic: ${stoch.toFixed(1)} > 50\n✅ MACD: Golden Cross\n\n💰 Harga: $${price.toLocaleString()}\n⏱ Timeframe: ${config.timeframe}\n\n*3/3 Indikator terpenuhi - BELI!*`;}else if(signal==='READY_BUY'){msg=`🟡 *SIAP-SIAP BELI - ${symbol}*\n\nTerpenuhi ${buyCount}/3 indikator\nRSI(7): ${rsi.toFixed(1)}\nStochastic: ${stoch.toFixed(1)}\n\n💰 Harga: $${price.toLocaleString()}\n⏱ Timeframe: ${config.timeframe}\n\n*Tunggu konfirmasi indikator ke-3!*`;}else if(signal==='SELL'){msg=`🔴 *SINYAL JUAL - ${symbol}*\n\nTerpenuhi ${sellCount}/3 indikator jual\nRSI(7): ${rsi.toFixed(1)}\nStochastic: ${stoch.toFixed(1)}\n\n💰 Harga: $${price.toLocaleString()}\n⏱ Timeframe: ${config.timeframe}\n\n*2/3 Indikator jual terpenuhi - JUAL!*`;}if(msg)bot.telegram.sendMessage(CHAT_ID,msg,{parse_mode:'Markdown'});console.log(`${symbol}: RSI=${rsi.toFixed(1)} Stoch=${stoch.toFixed(1)} Signal=${signal}`);}}

bot.start((ctx)=>ctx.reply('🤖 *Bot Trading Aktif!*\n\nPerintah:\n/status - Cek sinyal sekarang\n/list - Daftar crypto\n/tf 1h|4h|1d - Ganti timeframe\n/add SYMBOL COINID - Tambah crypto\n/remove SYMBOL - Hapus crypto\n/scan - Scan semua sekarang',{parse_mode:'Markdown'}));

bot.command('status',async(ctx)=>{ctx.reply('⏳ Menganalisa...');let msg=`📊 *Status Sinyal (${config.timeframe})*\n\n`;for(const[symbol,info]of Object.entries(config.watchlist)){const r=await analyzeSymbol(symbol,info);if(r){const si=r.signal==='BUY'?'🟢 BELI':r.signal==='READY_BUY'?'🟡 SIAP-SIAP':r.signal==='SELL'?'🔴 JUAL':'⚪ HOLD';msg+=`*${symbol}* $${r.price.toLocaleString()}\nRSI: ${r.rsi.toFixed(1)} | Stoch: ${r.stoch.toFixed(1)}\nSinyal: ${si}\n\n`;}else{msg+=`*${symbol}*: Data tidak cukup\n\n`;}}ctx.reply(msg,{parse_mode:'Markdown'});});

bot.command('scan',async(ctx)=>{ctx.reply('🔍 Scanning semua crypto...');await checkAll();ctx.reply('✅ Scan selesai!');});

bot.command('tf',(ctx)=>{const tf=ctx.message.text.split(' ')[1];if(!['1h','4h','1d'].includes(tf))return ctx.reply('Format: /tf 1h\nPilihan: 1h, 4h, 1d');config.timeframe=tf;Object.values(config.watchlist).forEach(i=>i.lastSignal='');ctx.reply(`✅ Timeframe diubah ke *${tf}*\nSemua sinyal direset.`,{parse_mode:'Markdown'});});

bot.command('list',(ctx)=>{const items=Object.entries(config.watchlist).map(([s,i])=>`• *${s}* (${i.coinId})`).join('\n');ctx.reply(`📋 *Daftar Crypto (${config.timeframe}):*\n\n${items}`,{parse_mode:'Markdown'});});

bot.command('add',(ctx)=>{const args=ctx.message.text.split(' ');if(args.length<3)return ctx.reply('Format: /add SYMBOL COINID\nContoh: /add SOL solana\n\nCari coinId di: coingecko.com');const symbol=args[1].toUpperCase();const coinId=args[2].toLowerCase();config.watchlist[symbol]={coinId,prices:[],lastSignal:''};ctx.reply(`✅ *${symbol}* ditambahkan!\nCoinId: ${coinId}`,{parse_mode:'Markdown'});});

bot.command('remove',(ctx)=>{const symbol=ctx.message.text.split(' ')[1]?.toUpperCase();if(!symbol||!config.watchlist[symbol])return ctx.reply('Crypto tidak ditemukan.');delete config.watchlist[symbol];ctx.reply(`🗑️ *${symbol}* dihapus.`,{parse_mode:'Markdown'});});

const intervalMs=()=>TF_MINUTES[config.timeframe]*60*1000/2;
setInterval(checkAll,30*60*1000);
setTimeout(checkAll,5000);

app.use(bot.webhookCallback('/webhook'));
https.createServer({key:fs.readFileSync('/root/bot/private.key'),cert:fs.readFileSync('/root/bot/cert.pem')},app).listen(PORT,async()=>{console.log('Server jalan di port '+PORT);await bot.telegram.setWebhook('https://'+IP+':'+PORT+'/webhook',{certificate:{source:'/root/bot/cert.pem'}});console.log('Webhook berhasil didaftarkan!');});
ENDOFFILE
