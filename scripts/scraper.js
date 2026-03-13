import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(__dirname, '../cards.json');

// ─────────────────────────────────────────────
// CARD METADATA — things that don't change often
// (rules, categories, ROI logic, descriptions)
// Only bonus amounts + min spend get overwritten by scraper
// ─────────────────────────────────────────────
const CARD_META = {
  'chase-sapphire-preferred': {
    id: 'csp', bank: 'Chase', name: 'Sapphire Preferred', type: 'travel',
    fee: 95, credits: 50, cats: ['travel', 'dining'], hasTransfers: true,
    rule524: true, minScore: 700, roi: 7.4, isBiz: false, easyMin: false,
    why: 'Best starter travel card. $50 hotel credit offsets fee. Points transfer to 14 airlines/hotels. Gateway to the Chase ecosystem.',
    keeper: true,
  },
  'chase-sapphire-reserve': {
    id: 'csr', bank: 'Chase', name: 'Sapphire Reserve', type: 'travel',
    fee: 550, credits: 300, cats: ['travel', 'dining'], hasTransfers: true,
    rule524: true, minScore: 720, roi: 6.8, isBiz: false, easyMin: false,
    why: '$300 travel credit makes effective fee $250. Priority Pass lounge access. 3x on travel+dining.',
    keeper: true,
  },
  'chase-ink-business-preferred': {
    id: 'ibp', bank: 'Chase', name: 'Ink Business Preferred', type: 'business',
    fee: 95, credits: 0, cats: ['travel', 'online', 'office'], hasTransfers: true,
    rule524: false, minScore: 700, roi: 10.1, isBiz: true, easyMin: false,
    why: "DOES NOT count toward 5/24. Best bonus-to-fee ratio available. Points combine with personal Chase cards.",
    keeper: true,
  },
  'chase-ink-business-unlimited': {
    id: 'ibu', bank: 'Chase', name: 'Ink Business Unlimited', type: 'business',
    fee: 0, credits: 0, cats: ['online', 'office'], hasTransfers: false,
    rule524: false, minScore: 680, roi: 9.2, isBiz: true, easyMin: false,
    why: 'No fee ever. 1.5% on everything. Does NOT count toward 5/24.',
    keeper: true,
  },
  'chase-ink-business-cash': {
    id: 'ibc', bank: 'Chase', name: 'Ink Business Cash', type: 'business',
    fee: 0, credits: 0, cats: ['office', 'online'], hasTransfers: false,
    rule524: false, minScore: 680, roi: 9.0, isBiz: true, easyMin: false,
    why: '5% on office supplies, internet, cable, phone. No fee. Does NOT count toward 5/24.',
    keeper: true,
  },
  'chase-freedom-flex': {
    id: 'ff', bank: 'Chase', name: 'Freedom Flex', type: 'cashback',
    fee: 0, credits: 0, cats: ['grocery', 'dining', 'online'], hasTransfers: false,
    rule524: true, minScore: 670, roi: 8.5, isBiz: false, easyMin: true,
    why: 'Easiest bonus to hit. No annual fee. 5% on rotating categories. Stack with Sapphire to convert cash to travel points.',
    keeper: true,
  },
  'amex-platinum': {
    id: 'amexplat', bank: 'Amex', name: 'Platinum Card', type: 'travel',
    fee: 695, credits: 600, cats: ['travel'], hasTransfers: true,
    rule524: false, minScore: 720, roi: 8.6, isBiz: false, easyMin: false,
    why: 'Highest absolute welcome offer. 180 days to meet spend. Centurion Lounge access. Multiple annual credits offset most of fee.',
    keeper: false,
  },
  'amex-gold': {
    id: 'amexgold', bank: 'Amex', name: 'Gold Card', type: 'travel',
    fee: 250, credits: 240, cats: ['dining', 'grocery'], hasTransfers: true,
    rule524: false, minScore: 700, roi: 7.2, isBiz: false, easyMin: false,
    why: '4x on dining and US groceries. $120 dining credit. Best everyday earner if food is your biggest spend.',
    keeper: true,
  },
  'amex-business-platinum': {
    id: 'amexbizplat', bank: 'Amex', name: 'Business Platinum', type: 'business',
    fee: 695, credits: 600, cats: ['travel', 'office'], hasTransfers: true,
    rule524: false, minScore: 720, roi: 7.8, isBiz: true, easyMin: false,
    why: 'Massive bonus but requires serious spend. Best for high-spend businesses.',
    keeper: false,
  },
  'amex-blue-business-plus': {
    id: 'bbp', bank: 'Amex', name: 'Blue Business Plus', type: 'business',
    fee: 0, credits: 0, cats: ['office'], hasTransfers: true,
    rule524: false, minScore: 670, roi: 5.8, isBiz: true, easyMin: true,
    why: 'No fee ever. 2x Membership Rewards on all purchases up to $50k/yr. Perfect permanent keeper card.',
    keeper: true,
  },
  'capital-one-venture-x': {
    id: 'venturex', bank: 'Capital One', name: 'Venture X', type: 'travel',
    fee: 395, credits: 300, cats: ['travel'], hasTransfers: true,
    rule524: false, minScore: 720, roi: 8.1, isBiz: false, easyMin: false,
    why: '$300 travel credit + 10,000 anniversary miles effectively eliminate the fee. Not restricted by 5/24.',
    keeper: true,
  },
  'capital-one-venture': {
    id: 'venture', bank: 'Capital One', name: 'Venture Rewards', type: 'travel',
    fee: 95, credits: 0, cats: ['travel'], hasTransfers: true,
    rule524: false, minScore: 700, roi: 7.6, isBiz: false, easyMin: false,
    why: 'Simple 2x on everything. No 5/24 restrictions. Warning: Capital One pulls all 3 bureaus.',
    keeper: true,
  },
  'citi-strata-premier': {
    id: 'strata', bank: 'Citi', name: 'Strata Premier', type: 'travel',
    fee: 95, credits: 100, cats: ['travel', 'dining', 'grocery', 'gas'], hasTransfers: true,
    rule524: false, minScore: 700, roi: 7.9, isBiz: false, easyMin: false,
    why: "Citi uses 48-month rule. Points transfer to Turkish Airlines (business class sweet spot). Good when over 5/24.",
    keeper: true,
  },
  'citi-double-cash': {
    id: 'doubecash', bank: 'Citi', name: 'Double Cash', type: 'cashback',
    fee: 0, credits: 0, cats: ['everything'], hasTransfers: false,
    rule524: false, minScore: 670, roi: 7.2, isBiz: false, easyMin: true,
    why: '2% on everything, no fee. Can be product-changed to Strata Premier later to unlock transfer partners.',
    keeper: true,
  },
  'wells-fargo-autograph-journey': {
    id: 'wfaj', bank: 'Wells Fargo', name: 'Autograph Journey', type: 'travel',
    fee: 95, credits: 50, cats: ['hotels', 'dining', 'travel'], hasTransfers: true,
    rule524: false, minScore: 690, roi: 6.5, isBiz: false, easyMin: false,
    why: 'Wells Fargo has NO velocity rules. Best hotel category multiplier on any personal card. Underrated.',
    keeper: true,
  },
  'barclays-aadvantage-aviator-red': {
    id: 'barcavoy', bank: 'Barclays', name: 'AAdvantage Aviator Red', type: 'travel',
    fee: 99, credits: 0, cats: ['travel'], hasTransfers: false,
    rule524: false, minScore: 680, roi: 7.8, isBiz: false, easyMin: true,
    why: 'Unique: bonus triggers after FIRST purchase only — no minimum spend. Barclays is independent of all major bank rules.',
    keeper: false,
  },
};

// ─────────────────────────────────────────────
// SCRAPER — Doctor of Credit
// Parses their best bonuses table
// ─────────────────────────────────────────────
async function scrapeDoctorofCredit() {
  console.log('Fetching Doctor of Credit...');
  const scraped = {};

  try {
    const res = await fetch('https://www.doctorofcredit.com/best-current-credit-card-sign-bonuses/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ChurnCoachBot/1.0)',
        'Accept': 'text/html',
      },
      timeout: 15000,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    // DoC uses a structured list — each card entry has bonus + spend info
    $('h3, h4').each((_, el) => {
      const heading = $(el).text().trim();
      const nextP = $(el).next('p, ul').text();

      // Try to extract bonus amount and min spend
      const bonusMatch = heading.match(/(\d{2,3},\d{3}|\$[\d,]+)/);
      const spendMatch = (heading + nextP).match(/\$?([\d,]+)\s*(?:spend|in\s*(?:purchases|spend))/i);
      const daysMatch = (heading + nextP).match(/(\d+)\s*(?:days|months)/i);

      if (bonusMatch) {
        // Match to our card database by name keywords
        const headingLower = heading.toLowerCase();
        let cardKey = null;

        if (headingLower.includes('sapphire preferred') && !headingLower.includes('reserve')) cardKey = 'chase-sapphire-preferred';
        else if (headingLower.includes('sapphire reserve')) cardKey = 'chase-sapphire-reserve';
        else if (headingLower.includes('ink') && headingLower.includes('preferred')) cardKey = 'chase-ink-business-preferred';
        else if (headingLower.includes('ink') && headingLower.includes('unlimited')) cardKey = 'chase-ink-business-unlimited';
        else if (headingLower.includes('ink') && headingLower.includes('cash')) cardKey = 'chase-ink-business-cash';
        else if (headingLower.includes('freedom flex')) cardKey = 'chase-freedom-flex';
        else if ((headingLower.includes('amex') || headingLower.includes('american express')) && headingLower.includes('platinum') && headingLower.includes('business')) cardKey = 'amex-business-platinum';
        else if ((headingLower.includes('amex') || headingLower.includes('american express')) && headingLower.includes('platinum')) cardKey = 'amex-platinum';
        else if ((headingLower.includes('amex') || headingLower.includes('american express')) && headingLower.includes('gold')) cardKey = 'amex-gold';
        else if (headingLower.includes('blue business plus')) cardKey = 'amex-blue-business-plus';
        else if (headingLower.includes('venture x')) cardKey = 'capital-one-venture-x';
        else if (headingLower.includes('venture') && !headingLower.includes('venture x')) cardKey = 'capital-one-venture';
        else if (headingLower.includes('strata premier')) cardKey = 'citi-strata-premier';
        else if (headingLower.includes('double cash')) cardKey = 'citi-double-cash';
        else if (headingLower.includes('autograph journey')) cardKey = 'wells-fargo-autograph-journey';
        else if (headingLower.includes('aviator')) cardKey = 'barclays-aadvantage-aviator-red';

        if (cardKey) {
          const rawBonus = bonusMatch[1].replace(/[$,]/g, '');
          const bonusNum = parseInt(rawBonus);
          const minSpend = spendMatch ? parseInt(spendMatch[1].replace(/,/g, '')) : null;
          const days = daysMatch ? parseInt(daysMatch[1]) * (daysMatch[2]?.includes('month') ? 30 : 1) : 90;

          scraped[cardKey] = {
            bonusRaw: bonusMatch[1],
            bonus: bonusNum > 10000 ? Math.round(bonusNum * 0.01) : bonusNum, // convert pts to $ if needed
            bonusPts: bonusMatch[1].startsWith('$') ? bonusMatch[1] : bonusMatch[1] + ' pts',
            minSpend: minSpend,
            days: days,
            source: 'doctorofcredit',
            scrapedAt: new Date().toISOString(),
          };
        }
      }
    });

    console.log(`  DoC: matched ${Object.keys(scraped).length} cards`);
  } catch (err) {
    console.error('  DoC scrape failed:', err.message);
  }

  return scraped;
}

// ─────────────────────────────────────────────
// SCRAPER — FrequentMiler (backup/validation)
// ─────────────────────────────────────────────
async function scrapeFrequentMiler() {
  console.log('Fetching FrequentMiler...');
  const scraped = {};

  try {
    const res = await fetch('https://frequentmiler.com/best-credit-card-offers/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChurnCoachBot/1.0)' },
      timeout: 15000,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    // FrequentMiler uses a table format
    $('table tr').each((_, row) => {
      const cells = $(row).find('td, th').map((_, c) => $(c).text().trim()).get();
      if (cells.length < 2) return;

      const rowText = cells.join(' ').toLowerCase();
      const bonusMatch = cells.join(' ').match(/(\d{2,3},\d{3}|\$[\d,]+)/);
      const spendMatch = cells.join(' ').match(/\$?([\d,]+)(?:k)?\s*(?:spend|in\s*purchases)/i);

      if (!bonusMatch) return;

      let cardKey = null;
      if (rowText.includes('sapphire preferred') && !rowText.includes('reserve')) cardKey = 'chase-sapphire-preferred';
      else if (rowText.includes('sapphire reserve')) cardKey = 'chase-sapphire-reserve';
      else if (rowText.includes('ink') && rowText.includes('preferred')) cardKey = 'chase-ink-business-preferred';
      else if (rowText.includes('ink') && rowText.includes('unlimited')) cardKey = 'chase-ink-business-unlimited';
      else if (rowText.includes('platinum') && rowText.includes('business')) cardKey = 'amex-business-platinum';
      else if (rowText.includes('platinum') && !rowText.includes('business')) cardKey = 'amex-platinum';
      else if (rowText.includes('gold') && (rowText.includes('amex') || rowText.includes('american'))) cardKey = 'amex-gold';
      else if (rowText.includes('venture x')) cardKey = 'capital-one-venture-x';
      else if (rowText.includes('venture') && !rowText.includes('venture x')) cardKey = 'capital-one-venture';
      else if (rowText.includes('strata')) cardKey = 'citi-strata-premier';

      if (cardKey && !scraped[cardKey]) {
        const rawBonus = bonusMatch[1].replace(/[$,]/g, '');
        const bonusNum = parseInt(rawBonus);
        scraped[cardKey] = {
          bonusRaw: bonusMatch[1],
          bonus: bonusNum > 10000 ? Math.round(bonusNum * 0.01) : bonusNum,
          bonusPts: bonusMatch[1].startsWith('$') ? bonusMatch[1] : bonusMatch[1] + ' pts',
          minSpend: spendMatch ? parseInt(spendMatch[1].replace(/[k,]/g, '') * (spendMatch[1].includes('k') ? 1000 : 1)) : null,
          days: 90,
          source: 'frequentmiler',
          scrapedAt: new Date().toISOString(),
        };
      }
    });

    console.log(`  FrequentMiler: matched ${Object.keys(scraped).length} cards`);
  } catch (err) {
    console.error('  FrequentMiler scrape failed:', err.message);
  }

  return scraped;
}

// ─────────────────────────────────────────────
// FALLBACK DATA — used when scraping fails
// Update these manually when offers change
// ─────────────────────────────────────────────
const FALLBACK_OFFERS = {
  'chase-sapphire-preferred':       { bonus: 750, bonusPts: '75,000 pts', minSpend: 5000, days: 90 },
  'chase-sapphire-reserve':         { bonus: 750, bonusPts: '60,000 pts', minSpend: 4000, days: 90 },
  'chase-ink-business-preferred':   { bonus: 1000, bonusPts: '100,000 pts', minSpend: 8000, days: 90 },
  'chase-ink-business-unlimited':   { bonus: 750, bonusPts: '$750 cash', minSpend: 6000, days: 90 },
  'chase-ink-business-cash':        { bonus: 750, bonusPts: '$750 cash', minSpend: 6000, days: 90 },
  'chase-freedom-flex':             { bonus: 200, bonusPts: '$200 cash', minSpend: 500, days: 90 },
  'amex-platinum':                  { bonus: 1500, bonusPts: '150,000 pts', minSpend: 8000, days: 180 },
  'amex-gold':                      { bonus: 600, bonusPts: '60,000 pts', minSpend: 6000, days: 180 },
  'amex-business-platinum':         { bonus: 1500, bonusPts: '150,000 pts', minSpend: 20000, days: 180 },
  'amex-blue-business-plus':        { bonus: 250, bonusPts: '15,000 pts', minSpend: 3000, days: 90 },
  'capital-one-venture-x':          { bonus: 750, bonusPts: '75,000 miles', minSpend: 4000, days: 90 },
  'capital-one-venture':            { bonus: 750, bonusPts: '75,000 miles', minSpend: 4000, days: 90 },
  'citi-strata-premier':            { bonus: 600, bonusPts: '75,000 pts', minSpend: 4000, days: 90 },
  'citi-double-cash':               { bonus: 200, bonusPts: '$200 cash', minSpend: 1500, days: 90 },
  'wells-fargo-autograph-journey':  { bonus: 400, bonusPts: '60,000 pts', minSpend: 4000, days: 90 },
  'barclays-aadvantage-aviator-red':{ bonus: 600, bonusPts: '60,000 miles', minSpend: 0, days: 90 },
};

// ─────────────────────────────────────────────
// MERGE — combine scraped data with static metadata
// ─────────────────────────────────────────────
function mergeCardData(docScraped, fmScraped) {
  const cards = [];

  for (const [key, meta] of Object.entries(CARD_META)) {
    // Priority: DoC > FrequentMiler > fallback
    const liveData = docScraped[key] || fmScraped[key] || null;
    const fallback = FALLBACK_OFFERS[key];

    const bonus = liveData?.bonus || fallback.bonus;
    const bonusPts = liveData?.bonusPts || fallback.bonusPts;
    const minSpend = liveData?.minSpend || fallback.minSpend;
    const days = liveData?.days || fallback.days;

    cards.push({
      ...meta,
      bonus,
      bonusPts,
      minSpend,
      days,
      netVal: bonus - meta.fee + meta.credits,
      dataSource: liveData?.source || 'fallback',
      lastUpdated: liveData?.scrapedAt || new Date().toISOString(),
    });
  }

  return cards;
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
async function main() {
  console.log('ChurnCoach scraper starting...');

  const [docData, fmData] = await Promise.allSettled([
    scrapeDoctorofCredit(),
    scrapeFrequentMiler(),
  ]);

  const docScraped = docData.status === 'fulfilled' ? docData.value : {};
  const fmScraped = fmData.status === 'fulfilled' ? fmData.value : {};

  const cards = mergeCardData(docScraped, fmScraped);

  const output = {
    updatedAt: new Date().toISOString(),
    cardCount: cards.length,
    liveCount: cards.filter(c => c.dataSource !== 'fallback').length,
    cards,
  };

  mkdirSync(resolve(__dirname, '../public'), { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(output, null, 2));

  console.log(`\nDone! ${output.liveCount}/${output.cardCount} cards have live data.`);
  console.log(`Output: ${OUTPUT}`);

  // Log which cards used fallback
  const fallbackCards = cards.filter(c => c.dataSource === 'fallback').map(c => c.name);
  if (fallbackCards.length > 0) {
    console.log(`Using fallback for: ${fallbackCards.join(', ')}`);
  }
}

main().catch(err => {
  console.error('Scraper failed:', err);
  process.exit(1);
});
