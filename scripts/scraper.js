import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(__dirname, '../cards.json');

// ─────────────────────────────────────────────────────────────
// BANK DETECTION
// ─────────────────────────────────────────────────────────────
function detectBank(text) {
  const t = text.toLowerCase();
  if (t.includes('chase') || t.includes('sapphire') || t.includes('ink business') || t.includes('freedom') || t.includes('united') || t.includes('southwest') || t.includes('world of hyatt') || (t.includes('marriott') && t.includes('boundless'))) return 'Chase';
  if (t.includes('american express') || t.includes('amex') || t.includes('blue cash') || t.includes('blue business') || (t.includes('delta') && !t.includes('chase')) || (t.includes('hilton') && !t.includes('citi')) || (t.includes('marriott') && t.includes('brilliant'))) return 'Amex';
  if (t.includes('capital one') || t.includes('venture x') || t.includes('savor') || t.includes('spark cash')) return 'Capital One';
  if (t.includes('citi') || t.includes('strata premier') || t.includes('double cash') || t.includes('custom cash') || (t.includes('aadvantage') && !t.includes('aviator'))) return 'Citi';
  if (t.includes('wells fargo') || t.includes('autograph journey') || t.includes('active cash')) return 'Wells Fargo';
  if (t.includes('barclays') || t.includes('aviator') || (t.includes('jetblue') && t.includes('barclays'))) return 'Barclays';
  if (t.includes('bank of america') || t.includes('alaska airlines') || t.includes('premium rewards')) return 'Bank of America';
  if (t.includes('us bank') || t.includes('altitude reserve') || t.includes('altitude connect') || t.includes('altitude go')) return 'US Bank';
  if (t.includes('discover')) return 'Discover';
  if (t.includes('bilt')) return 'Bilt';
  if (t.includes('navy federal')) return 'Navy Federal';
  return null;
}

// ─────────────────────────────────────────────────────────────
// BONUS PARSING
// ─────────────────────────────────────────────────────────────
function parseBonus(text) {
  const patterns = [
    { re: /(\d{1,3}),(\d{3})\s*(membership rewards?|points?|miles?|pts?)/i, type: 'pts' },
    { re: /(\d{2,3})k\s*(points?|miles?|pts?|rewards?)/i, type: 'k' },
    { re: /\$\s*(\d{3,5})\s*(cash|back|bonus|statement credit)/i, type: 'cash' },
  ];

  for (const { re, type } of patterns) {
    const m = text.match(re);
    if (!m) continue;
    let pts;
    if (type === 'k') pts = parseInt(m[1]) * 1000;
    else if (type === 'cash') return { pts: parseInt(m[1]), isCash: true, display: '$' + m[1] };
    else pts = parseInt(m[1] + m[2]);
    if (pts < 5000 || pts > 1000000) continue;
    const unit = /miles/i.test(m[0]) ? 'miles' : /membership/i.test(m[0]) ? 'MR pts' : 'pts';
    return { pts, isCash: false, display: pts.toLocaleString() + ' ' + unit };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// MIN SPEND PARSING
// ─────────────────────────────────────────────────────────────
function parseMinSpend(text) {
  const patterns = [
    /\$\s*([\d,]+)\s*(?:in\s+)?(?:eligible\s+)?(?:purchases?|spend|spending)/i,
    /spend\s+\$\s*([\d,]+)/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const val = parseInt(m[1].replace(/,/g, ''));
      if (val > 0 && val <= 50000) return val;
    }
  }
  return null;
}

function parseDays(text) {
  const m = text.match(/(\d+)\s*(months?|days?)/i);
  if (!m) return 90;
  const n = parseInt(m[1]);
  return m[2].toLowerCase().startsWith('month') ? n * 30 : n;
}

function parseAnnualFee(text) {
  if (/no annual fee|\$0\s*annual/i.test(text)) return 0;
  const m = text.match(/annual fee[^$\d]*\$\s*(\d{2,4})/i) || text.match(/\$\s*(\d{2,4})\s*annual fee/i);
  return m ? parseInt(m[1]) : null;
}

// ─────────────────────────────────────────────────────────────
// APPLY URL
// ─────────────────────────────────────────────────────────────
function getApplyUrl(name, bank) {
  const n = (name + ' ' + bank).toLowerCase();
  if (n.includes('sapphire preferred'))    return 'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred';
  if (n.includes('sapphire reserve'))      return 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve';
  if (n.includes('ink') && n.includes('preferred')) return 'https://creditcards.chase.com/business-credit-cards/ink/preferred';
  if (n.includes('ink') && n.includes('unlimited')) return 'https://creditcards.chase.com/business-credit-cards/ink/unlimited';
  if (n.includes('ink') && n.includes('cash'))      return 'https://creditcards.chase.com/business-credit-cards/ink/cash';
  if (n.includes('freedom flex'))          return 'https://creditcards.chase.com/cash-back-credit-cards/freedom/flex';
  if (n.includes('freedom unlimited'))     return 'https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited';
  if (n.includes('united') && n.includes('club'))   return 'https://creditcards.chase.com/travel-credit-cards/united/club';
  if (n.includes('united') && n.includes('explorer')) return 'https://creditcards.chase.com/travel-credit-cards/united/explorer';
  if (n.includes('southwest') && n.includes('priority')) return 'https://creditcards.chase.com/travel-credit-cards/southwest/priority';
  if (n.includes('southwest') && n.includes('plus'))    return 'https://creditcards.chase.com/travel-credit-cards/southwest/plus';
  if (n.includes('world of hyatt'))        return 'https://creditcards.chase.com/travel-credit-cards/hyatt';
  if (n.includes('ihg'))                   return 'https://creditcards.chase.com/travel-credit-cards/ihg/premier';
  if (n.includes('marriott') && bank === 'Chase') return 'https://creditcards.chase.com/travel-credit-cards/marriott';
  if (bank === 'Chase')                    return 'https://creditcards.chase.com';
  if (n.includes('platinum') && n.includes('business')) return 'https://www.americanexpress.com/us/credit-cards/card/business-platinum/';
  if (n.includes('gold') && n.includes('business'))     return 'https://www.americanexpress.com/us/credit-cards/card/business-gold/';
  if (n.includes('platinum'))              return 'https://www.americanexpress.com/us/credit-cards/card/platinum/';
  if (n.includes('gold'))                  return 'https://www.americanexpress.com/us/credit-cards/card/gold-card/';
  if (n.includes('green') && bank === 'Amex') return 'https://www.americanexpress.com/us/credit-cards/card/american-express-green-card/';
  if (n.includes('blue cash preferred'))   return 'https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/';
  if (n.includes('blue cash everyday'))    return 'https://www.americanexpress.com/us/credit-cards/card/blue-cash-everyday/';
  if (n.includes('blue business plus'))    return 'https://www.americanexpress.com/us/credit-cards/card/blue-business-plus/';
  if (n.includes('blue business cash'))    return 'https://www.americanexpress.com/us/credit-cards/card/blue-business-cash/';
  if (n.includes('delta') && n.includes('reserve')) return 'https://www.americanexpress.com/us/credit-cards/card/delta-skymiles-reserve/';
  if (n.includes('delta') && n.includes('platinum')) return 'https://www.americanexpress.com/us/credit-cards/card/delta-skymiles-platinum/';
  if (n.includes('delta'))                 return 'https://www.americanexpress.com/us/credit-cards/card/delta-skymiles-gold/';
  if (n.includes('hilton') && n.includes('aspire')) return 'https://www.americanexpress.com/us/credit-cards/card/hilton-honors-aspire/';
  if (n.includes('hilton') && n.includes('surpass')) return 'https://www.americanexpress.com/us/credit-cards/card/hilton-honors-surpass/';
  if (n.includes('hilton'))                return 'https://www.americanexpress.com/us/credit-cards/card/hilton-honors/';
  if (n.includes('marriott') && n.includes('brilliant')) return 'https://www.americanexpress.com/us/credit-cards/card/marriott-bonvoy-brilliant/';
  if (bank === 'Amex')                     return 'https://www.americanexpress.com/us/credit-cards/';
  if (n.includes('venture x'))             return 'https://creditcards.capitalone.com/venture-x-credit-card/';
  if (n.includes('venture'))               return 'https://creditcards.capitalone.com/venture-credit-card/';
  if (n.includes('savor one') || n.includes('savorone')) return 'https://creditcards.capitalone.com/savorone-credit-card/';
  if (n.includes('savor'))                 return 'https://creditcards.capitalone.com/savor-credit-card/';
  if (n.includes('spark'))                 return 'https://creditcards.capitalone.com/spark-cash-plus/';
  if (bank === 'Capital One')              return 'https://creditcards.capitalone.com';
  if (n.includes('strata premier'))        return 'https://www.citi.com/credit-cards/citi-strata-premier-credit-card';
  if (n.includes('double cash'))           return 'https://www.citi.com/credit-cards/citi-double-cash-credit-card';
  if (n.includes('custom cash'))           return 'https://www.citi.com/credit-cards/citi-custom-cash-credit-card';
  if (n.includes('aadvantage') && n.includes('executive')) return 'https://www.citi.com/credit-cards/citi-aadvantage-executive-world-elite-credit-card';
  if (n.includes('aadvantage'))            return 'https://www.citi.com/credit-cards/citi-aadvantage-platinum-select';
  if (bank === 'Citi')                     return 'https://www.citi.com/credit-cards/compare/view-all-credit-cards';
  if (n.includes('autograph journey'))     return 'https://creditcards.wellsfargo.com/autograph-journey-visa-credit-card/';
  if (n.includes('autograph'))             return 'https://creditcards.wellsfargo.com/autograph-visa-credit-card/';
  if (n.includes('active cash'))           return 'https://creditcards.wellsfargo.com/active-cash-credit-card/';
  if (bank === 'Wells Fargo')              return 'https://creditcards.wellsfargo.com';
  if (n.includes('aviator'))               return 'https://cards.barclaycardus.com/banking/cards/aadvantage-aviator-red-world-elite-mastercard/';
  if (n.includes('jetblue') && n.includes('plus')) return 'https://cards.barclaycardus.com/banking/cards/jetblue-plus-card/';
  if (n.includes('jetblue'))               return 'https://cards.barclaycardus.com/banking/cards/jetblue-card/';
  if (bank === 'Barclays')                 return 'https://cards.barclaycardus.com';
  if (n.includes('alaska') && n.includes('business')) return 'https://www.bankofamerica.com/credit-cards/products/alaska-airlines-business-visa-credit-card/';
  if (n.includes('alaska'))                return 'https://www.bankofamerica.com/credit-cards/products/alaska-airlines-visa-signature-credit-card/';
  if (n.includes('premium rewards elite')) return 'https://www.bankofamerica.com/credit-cards/products/premium-rewards-elite-credit-card/';
  if (n.includes('premium rewards'))       return 'https://www.bankofamerica.com/credit-cards/products/premium-rewards-credit-card/';
  if (bank === 'Bank of America')          return 'https://www.bankofamerica.com/credit-cards/';
  if (n.includes('altitude reserve'))      return 'https://www.usbank.com/credit-cards/altitude-reserve-visa-infinite-credit-card.html';
  if (n.includes('altitude connect'))      return 'https://www.usbank.com/credit-cards/altitude-connect-visa-signature-credit-card.html';
  if (bank === 'US Bank')                  return 'https://www.usbank.com/credit-cards/';
  if (n.includes('discover it') && n.includes('miles')) return 'https://www.discover.com/credit-cards/travel/it-miles-card.html';
  if (bank === 'Discover')                 return 'https://www.discover.com/credit-cards/cash-back/it-card.html';
  if (bank === 'Bilt')                     return 'https://www.biltrewards.com/card';
  return `https://www.google.com/search?q=${encodeURIComponent(name + ' credit card apply')}`;
}

// ─────────────────────────────────────────────────────────────
// SCRAPER — Doctor of Credit
// ─────────────────────────────────────────────────────────────
async function scrapeDoctorofCredit() {
  console.log('Fetching Doctor of Credit...');
  const cards = [];

  const res = await fetch('https://www.doctorofcredit.com/best-current-credit-card-sign-bonuses/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
    timeout: 20000,
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  $('h2, h3, h4').each((_, el) => {
    const heading = $(el).text().trim();
    if (!heading || heading.length < 5) return;
    if (/table of contents|updated|editor|summary|overview|what is|how to|why |tip:|note:|quick|bottom line|disclaimer|advertis/i.test(heading)) return;

    const bank = detectBank(heading);
    if (!bank) return;

    // Gather context: heading + next 3 siblings
    let context = heading;
    let sib = $(el).next();
    for (let i = 0; i < 3; i++) {
      context += ' ' + sib.text();
      sib = sib.next();
      if (!sib.length) break;
    }

    const bonus = parseBonus(context);
    if (!bonus) return;

    const minSpend = parseMinSpend(context);
    const days = parseDays(context);
    const fee = parseAnnualFee(context);

    // Clean card name
    let name = heading
      .replace(/\d{1,3},\d{3}.*$/, '').replace(/\$[\d,]+.*$/, '')
      .replace(/american express/gi, '').replace(/\bamex\b/gi, '')
      .replace(/\bchase\b/gi, '').replace(/capital one/gi, '')
      .replace(/\bciti(bank)?\b/gi, '').replace(/wells fargo/gi, '')
      .replace(/\bbarclays\b/gi, '').replace(/bank of america/gi, '')
      .replace(/\bus bank\b/gi, '').replace(/\bdiscover\b/gi, '')
      .replace(/[–—].*$/, '').replace(/\s*[\(\[{].*?[\)\]}]/g, '')
      .replace(/\s+/g, ' ').trim();

    if (!name || name.length < 3) return;

    const id = (bank + '-' + name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (cards.find(c => c.id === id)) return;

    const isBiz = /business|biz/i.test(name);
    cards.push({
      id, bank, name,
      bonus: bonus.isCash ? bonus.pts : Math.round(bonus.pts * 0.01),
      bonusPts: bonus.display,
      minSpend: minSpend || 3000,
      days,
      fee: fee !== null ? fee : 95,
      credits: 0,
      isBiz,
      rule524: bank === 'Chase' && !isBiz,
      hasTransfers: ['Chase', 'Amex', 'Capital One', 'Citi', 'Bilt'].includes(bank),
      applyUrl: getApplyUrl(name, bank),
      dataSource: 'doctorofcredit',
      scrapedAt: new Date().toISOString(),
    });
  });

  console.log(`  DoC: found ${cards.length} cards`);
  return cards;
}

// ─────────────────────────────────────────────────────────────
// SCRAPER — FrequentMiler
// ─────────────────────────────────────────────────────────────
async function scrapeFrequentMiler() {
  console.log('Fetching FrequentMiler...');
  const cards = [];

  const res = await fetch('https://frequentmiler.com/best-credit-card-offers/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    timeout: 20000,
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  $('table tr').each((_, row) => {
    const cells = $(row).find('td, th').map((_, c) => $(c).text().trim()).get();
    if (cells.length < 2) return;
    const rowText = cells.join(' ');
    const bank = detectBank(rowText);
    if (!bank) return;
    const bonus = parseBonus(rowText);
    if (!bonus) return;

    let name = cells[0]
      .replace(/american express/gi, '').replace(/\bamex\b/gi, '')
      .replace(/\bchase\b/gi, '').replace(/capital one/gi, '')
      .replace(/\bciti(bank)?\b/gi, '').trim();

    if (!name || name.length < 3) return;

    const id = (bank + '-' + name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const isBiz = /business|biz/i.test(name);

    cards.push({
      id, bank, name,
      bonus: bonus.isCash ? bonus.pts : Math.round(bonus.pts * 0.01),
      bonusPts: bonus.display,
      minSpend: parseMinSpend(rowText) || 3000,
      days: 90,
      fee: parseAnnualFee(rowText) ?? 95,
      credits: 0,
      isBiz,
      rule524: bank === 'Chase' && !isBiz,
      hasTransfers: ['Chase', 'Amex', 'Capital One', 'Citi', 'Bilt'].includes(bank),
      applyUrl: getApplyUrl(name, bank),
      dataSource: 'frequentmiler',
      scrapedAt: new Date().toISOString(),
    });
  });

  console.log(`  FrequentMiler: found ${cards.length} cards`);
  return cards;
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log('RewardPath scraper starting...');

  const results = await Promise.allSettled([
    scrapeDoctorofCredit(),
    scrapeFrequentMiler(),
  ]);

  const docCards = results[0].status === 'fulfilled' ? results[0].value : [];
  const fmCards  = results[1].status === 'fulfilled' ? results[1].value : [];

  if (results[0].status === 'rejected') console.error('DoC failed:', results[0].reason.message);
  if (results[1].status === 'rejected') console.error('FM failed:', results[1].reason.message);

  // Merge — DoC takes priority, FM fills gaps
  const seen = new Set();
  const cards = [];
  for (const card of [...docCards, ...fmCards]) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    cards.push(card);
  }

  // Sort by bonus descending
  cards.sort((a, b) => b.bonus - a.bonus);

  if (cards.length === 0) {
    console.error('No cards scraped — aborting to preserve existing cards.json');
    process.exit(1);
  }

  const output = {
    updatedAt: new Date().toISOString(),
    cardCount: cards.length,
    sourceBreakdown: {
      doctorofcredit: cards.filter(c => c.dataSource === 'doctorofcredit').length,
      frequentmiler: cards.filter(c => c.dataSource === 'frequentmiler').length,
    },
    cards,
  };

  writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  console.log(`\nDone! ${cards.length} cards scraped.`);
  console.log(`  DoC: ${output.sourceBreakdown.doctorofcredit}, FM: ${output.sourceBreakdown.frequentmiler}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
