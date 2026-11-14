// Token Launch Radar — the valuation model and board builder.
//
// Idea: a pre-token protocol's launch value is estimated from the snapshot's
// own figures only. Protocols whose token already trades give, per category,
// a market-cap-to-TVL multiple. A protocol that records no token is priced as
// its TVL times its category's multiple, then adjusted by four factors the
// snapshot also carries: its seven-day TVL growth, how long it has run with
// no token (maturity), how many chains it spans (breadth), and a size
// compression so the very largest TVLs do not extrapolate without limit.
//
// The board is every protocol that records no token and is not a wrapped,
// staked, bridged or exchange product of one that trades — the watchlist's
// rule, but without its $50M floor, so the radar also catches the early ones.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

export interface RadarRow extends BoardRow {
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_years: number | null;
  watchlist: boolean;
  factors: { multiple: number; growth: number; maturity: number; breadth: number; size: number };
}

export interface Radar {
  as_of: string;
  floor_usd: number;
  counts: { protocols: number; tokenised: number; eligible: number; watchlist: number; rows: number };
  multiples: { category: string; peers: number; multiple: number }[];
  fallback_multiple: number;
  rows: RadarRow[];
}

/** Parse and lightly validate the sealed snapshot. */
export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return raw;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Categories that are products of a token that already trades, or an exchange's own book. */
const PRODUCT_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** True when the protocol is a versioned instance or a wrapped/staked/bridged/exchange product. */
export function isProduct(p: Protocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return true;
  if (VERSION_SUFFIX.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  return EXCHANGE_PREFIXES.some((x) => p.name === x || p.name.startsWith(`${x} `));
}

/** A protocol belongs on the radar when it records no token and is not such a product. */
export function isEligible(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null && !isProduct(p);
}

/** Per-category market-cap/TVL multiples from the protocols whose token trades. */
export function categoryMultiples(snapshot: Snapshot): { table: Map<string, { peers: number; multiple: number }>; fallback: number } {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.gecko_id === null || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    all.push(ratio);
    const key = p.category ?? 'Uncategorised';
    const list = byCategory.get(key) ?? [];
    list.push(ratio);
    byCategory.set(key, list);
  }
  const fallback = clamp(median(all), 0.02, 2.5);
  const table = new Map<string, { peers: number; multiple: number }>();
  for (const [category, ratios] of byCategory) {
    if (ratios.length < 3) continue; // too few peers to price a category from
    table.set(category, { peers: ratios.length, multiple: clamp(median(ratios), 0.02, 2.5) });
  }
  return { table, fallback };
}

/** Whole days between two YYYY-MM-DD dates. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export interface Factors { multiple: number; growth: number; maturity: number; breadth: number; size: number }

/** The four adjustments, each derived from the snapshot's own fields. */
export function factorsFor(p: Protocol, multiple: number, asOf: string): Factors {
  const growth = p.change_7d === null ? 1 : clamp(1 + (p.change_7d / 100) * 1.5, 0.6, 1.8);
  let maturity = 0.95; // unreported start: slight discount, neither credited nor punished
  if (p.listed_at !== null) {
    const years = daysBetween(p.listed_at, asOf) / 365.25;
    maturity = 0.8 + 0.45 * (1 - Math.exp(-years / 2));
  }
  const breadth = 1 + 0.02 * Math.min(Math.max(p.chains.length - 1, 0), 10);
  const size = p.tvl_usd > 1_000_000_000 ? Math.pow(1_000_000_000 / p.tvl_usd, 0.08) : 1;
  return { multiple, growth, maturity, breadth, size };
}

export function impliedValue(p: Protocol, f: Factors): number {
  const raw = p.tvl_usd * f.multiple * f.growth * f.maturity * f.breadth * f.size;
  return Math.max(1, Math.round(raw));
}

/** $1,234 / $12.3M / $1.24B formatting for farm-plan text. */
export function money(usd: number): string {
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(1)}K`;
  return `$${Math.round(usd)}`;
}

const L2_CHAINS = new Set(['Arbitrum', 'Base', 'Optimism', 'zkSync Era', 'Linea', 'Scroll', 'Mantle', 'Blast', 'Mode', 'Taiko', 'Polygon', 'Polygon zkEVM', 'Starknet', 'BSC', 'Avalanche', 'Fantom', 'Gnosis', 'Celo']);

/** A plain-language gas budget for the protocol's first chain. */
function gasNote(chain: string | undefined): string {
  if (chain === 'Ethereum') return 'budget $5–25 of mainnet gas per transaction at typical fees';
  if (chain === 'Solana') return 'budget well under $0.05 of gas per transaction';
  if (chain !== undefined && L2_CHAINS.has(chain)) return 'budget a few cents to about $1 of gas per transaction';
  return 'budget $1–10 of gas per transaction';
}

/**
 * A concrete farm plan for one protocol: five steps with amounts, costs and
 * durations, templated by what the protocol does and filled with its own
 * figures — its name, first chain, TVL and chain count.
 */
/** DefiLlama's chain names a reader may misread, written the way people say them. */
function chainName(chain: string): string {
  return chain === 'Binance' ? 'BNB Chain' : chain;
}

export function farmSteps(p: Protocol): string[] {
  const chain = p.chains[0] === undefined ? 'its main chain' : chainName(p.chains[0]);
  const gas = gasNote(p.chains[0]);
  const more = p.chains.length > 1 ? `, then repeat the core action on ${chainName(p.chains[1]!)} so the wallet shows multi-chain use` : '';
  const cat = p.category ?? '';
  const working = p.tvl_usd >= 1e9 ? '$500–2,000' : p.tvl_usd >= 1e8 ? '$250–1,000' : '$100–500';
  const weeks = p.tvl_usd >= 1e8 ? '10–12 weeks' : '6–10 weeks';
  const head = `Open ${p.name} on ${chain} and connect a wallet you control; ${gas}, and setup takes about 15 minutes.`;
  const tail = `Keep the routine running for ${weeks}: consistency across many weeks is what points systems and snapshots usually reward, and stopping after one session wastes the gas already spent.`;
  const record = `Log every transaction hash, date and amount in a simple sheet as you go; if ${p.name} later opens a claim or a checker, that record proves the wallet's history in minutes instead of hours.`;

  if (cat === 'Lending' || cat === 'CDP') {
    return [
      head,
      `Supply ${working} of a blue-chip asset (ETH or a major stablecoin) as collateral on ${chain}; at ${money(p.tvl_usd)} of TVL your deposit is small, so favour the largest, most liquid market it offers.`,
      `Borrow 25–40% of the collateral's value in a stablecoin, hold it one to two weeks, then repay in full; one clean borrow-and-repay cycle shows real use and costs only the interest spread plus gas.`,
      `Keep the position's health factor above 1.6 at all times and check it weekly for 10 minutes; a liquidation erases both the funds and the farming history you are building.`,
      tail,
      record,
    ];
  }
  if (cat === 'Dexs' || cat === 'DEX Aggregator' || cat === 'Dex Aggregator') {
    return [
      head,
      `Make two or three swaps a week in the ${working} range, in both directions and in the pairs with the deepest liquidity; steady volume over ${weeks} reads as a real user, one large swap does not.`,
      `Add a small liquidity position (about $100–300) in a core pair and leave it at least a month; LP positions are the strongest usage signal a DEX records, and withdrawing early forfeits it.`,
      `Use one of its limit-order or advanced order types at least twice if it offers them${more}; feature breadth is cheap to show and few farmers bother.`,
      tail,
      record,
    ];
  }
  if (cat === 'Derivatives' || cat === 'Options' || cat === 'Perps') {
    return [
      head,
      `Deposit ${working} as margin and open small hedged positions (long one market, short a correlated one) so market moves cost little while the account records genuine trading activity.`,
      `Trade two or three sessions a week for ${weeks}, keeping each position under 2× leverage; volume and session count are what these protocols track, not profit.`,
      `Withdraw a small amount once, mid-way, and deposit it back a few days later${more}; a full deposit-trade-withdraw cycle is the complete user journey and is cheap in gas.`,
      tail,
      record,
    ];
  }
  if (cat === 'Yield' || cat === 'Yield Aggregator' || cat === 'Indexes' || cat === 'Basis Trading' || cat === 'RWA') {
    return [
      head,
      `Deposit ${working} into its flagship vault or product on ${chain} and hold it; at ${money(p.tvl_usd)} of TVL the flagship is where any future points or shares would concentrate.`,
      `After two to three weeks, move a third of the position into a second vault or product it offers${more}; holding more than one product shows deliberate use rather than a parked deposit.`,
      `Claim or compound any yield it pays at least twice, a few weeks apart; repeated claim transactions build the on-chain history that distinguishes a farmer from a passer-by.`,
      tail,
      record,
    ];
  }
  return [
    head,
    `Use its core product on ${chain} at least once a week for ${weeks} with ${working} of working capital; regular, modest activity is the pattern airdrop criteria are written to find.`,
    `Complete one full journey end to end — deposit or start, use the main feature, then withdraw or finish — rather than touching only the landing action${more}.`,
    `Add a second wallet action it offers, such as a governance vote, a referral-free signup or a testnet-to-mainnet bridge through its official route, whenever one exists.`,
    tail,
    record,
  ];
}

/** Score every eligible protocol and build the ranked board plus the dashboard's data. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const { table, fallback } = categoryMultiples(snapshot);
  const watch = new Set(snapshot.watchlist);

  const scored: { p: Protocol; factors: Factors; value: number }[] = [];
  for (const p of snapshot.protocols) {
    if (!isEligible(p) && !watch.has(p.slug)) continue;
    const multiple = table.get(p.category ?? 'Uncategorised')?.multiple ?? fallback;
    const factors = factorsFor(p, multiple, snapshot.as_of);
    scored.push({ p, factors, value: impliedValue(p, factors) });
  }
  scored.sort((a, b) => b.value - a.value || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));

  const BOARD_CAP = 400;
  const kept = scored.slice(0, BOARD_CAP);
  const keptSlugs = new Set(kept.map((s) => s.p.slug));
  for (const slug of snapshot.watchlist) {
    if (keptSlugs.has(slug)) continue;
    const extra = scored.find((s) => s.p.slug === slug);
    if (extra !== undefined) kept.push(extra);
  }
  kept.sort((a, b) => b.value - a.value || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));

  const rows: RadarRow[] = kept.map((s, i) => ({
    slug: s.p.slug,
    name: s.p.name,
    rank: i + 1,
    implied_value_usd: s.value,
    farm_steps: farmSteps(s.p),
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_years: s.p.listed_at === null ? null : Math.round((daysBetween(s.p.listed_at, snapshot.as_of) / 365.25) * 10) / 10,
    watchlist: watch.has(s.p.slug),
    factors: s.factors,
  }));

  const multiples = [...table.entries()]
    .map(([category, v]) => ({ category, peers: v.peers, multiple: Math.round(v.multiple * 1000) / 1000 }))
    .sort((a, b) => b.peers - a.peers);

  const radar: Radar = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    counts: {
      protocols: snapshot.protocols.length,
      tokenised: snapshot.protocols.filter((p) => p.gecko_id !== null).length,
      eligible: scored.length,
      watchlist: snapshot.watchlist.length,
      rows: rows.length,
    },
    multiples,
    fallback_multiple: Math.round(fallback * 1000) / 1000,
    rows,
  };
  return { board: rows.map(({ slug, name, rank, implied_value_usd, farm_steps }) => ({ slug, name, rank, implied_value_usd, farm_steps })), radar };
}

/** The dashboard's data file: the same figures the board carries, plus the model's workings. */
export function dataScript(radar: Radar): string {
  const json = JSON.stringify(radar).replace(/</g, '\\u003c');
  return `// Written by main.ts from the sealed snapshot — the dashboard reads no network.\nwindow.RADAR = ${json};\n`;
}

/** Mirror of the scorer's board checks; returns the first problem, or null when the board is valid. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `rows ${board.length} outside 100..4000`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < byRank.length; i++) {
    const row = byRank[i]!;
    if (row.rank !== i + 1) return `rank ${row.rank} breaks the 1..N sequence`;
    if (!known.has(row.slug)) return `${row.slug} is not in the snapshot`;
    if (seen.has(row.slug)) return `${row.slug} appears twice`;
    seen.add(row.slug);
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0 || row.implied_value_usd > 1e14) return `${row.slug} has a bad implied value`;
    if (i > 0 && row.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `${row.slug} rises against rank order`;
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug} farm_steps count`;
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `${row.slug} has a farm step of ${len} characters`;
    }
  }
  if (byRank.length > 1 && byRank.every((r) => r.implied_value_usd === byRank[0]!.implied_value_usd)) return 'all implied values are equal';
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist protocol ${slug} is missing`;
  }
  return null;
}
