// Token Launch Radar — the board page. Reads window.RADAR (written by main.ts
// from the sealed snapshot), renders a sortable, filterable board, and a detail
// view per protocol with the model's factor breakdown and the farm plan.
// No network, no framework: the two views are switched by the URL hash so a
// reader can link straight to a protocol (#/p/<slug>) or a filtered board
// (#/?cat=Lending&chain=Base).

const R = window.RADAR;
const rows = R.rows;
const bySlug = new Map(rows.map((r) => [r.slug, r]));
const maxImplied = Math.max(...rows.map((r) => r.implied_value_usd));

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function money(usd) {
  if (usd >= 1e9) return '$' + (usd / 1e9).toFixed(2) + 'B';
  if (usd >= 1e6) return '$' + (usd / 1e6).toFixed(1) + 'M';
  if (usd >= 1e3) return '$' + (usd / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(usd);
}
const pct = (v) => (v === null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%');
const x = (v) => '×' + v.toFixed(2);

/* ---------- masthead + model strip ---------- */
$('mast-stats').innerHTML = [
  [R.counts.rows, 'protocols ranked'],
  [R.counts.watchlist, 'watchlist covered'],
  [R.counts.tokenised, 'already tokenised, set aside'],
].map(([n, label]) => `<div class="stat"><b>${n}</b><span>${label}</span></div>`).join('');
$('foot-date').textContent = R.as_of;
$('model-strip').innerHTML =
  `<h2>How each implied value is derived</h2>` +
  `<p class="formula">implied value = <b>TVL</b> × <b>category multiple</b> × <b>7d growth</b> × <b>years tokenless</b> × <b>chain breadth</b> × <b>size compression</b></p>` +
  `<div class="mult-table">` +
  R.multiples.slice(0, 10).map((m) => `<span>${esc(m.category)} <b>×${m.multiple.toFixed(2)}</b> (${m.peers} traded peers)</span>`).join('') +
  `<span>other categories <b>×${R.fallback_multiple.toFixed(2)}</b> (all-peers median)</span></div>`;

/* ---------- filters ---------- */
const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();
const chains = [...new Set(rows.flatMap((r) => r.chains))].sort();
$('f-category').innerHTML += categories.map((c) => `<option>${esc(c)}</option>`).join('');
$('f-chain').innerHTML += chains.map((c) => `<option>${esc(c)}</option>`).join('');

const state = { q: '', cat: '', chain: '', watch: false, sort: 'rank' };
function readHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const params = new URLSearchParams(query || '');
  state.cat = params.get('cat') || '';
  state.chain = params.get('chain') || '';
  state.watch = params.get('watch') === '1';
  return path;
}
function visibleRows() {
  let list = rows.filter((r) =>
    (state.cat === '' || r.category === state.cat) &&
    (state.chain === '' || r.chains.includes(state.chain)) &&
    (!state.watch || r.watchlist) &&
    (state.q === '' || r.name.toLowerCase().includes(state.q) || r.slug.includes(state.q)));
  const key = { rank: 'implied_value_usd', tvl: 'tvl_usd', change: 'change_7d', age: 'age_years' }[state.sort];
  list = [...list].sort((a, b) => (b[key] ?? -Infinity) - (a[key] ?? -Infinity));
  return list;
}

/* ---------- board view ---------- */
function renderBoard() {
  $('board-view').hidden = false;
  $('detail-view').hidden = true;
  $('board-controls').style.display = '';
  $('f-category').value = state.cat;
  $('f-chain').value = state.chain;
  $('f-watch').checked = state.watch;
  const list = visibleRows();
  $('row-count').textContent = `${list.length} of ${rows.length} protocols`;
  $('board-body').innerHTML = list.map((r) => `
    <tr data-slug="${esc(r.slug)}">
      <td class="num">${r.rank}</td>
      <td><span class="pname">${esc(r.name)}</span>${r.watchlist ? '<span class="badge">WATCHLIST</span>' : ''}<br><span class="pcat">${esc(r.category ?? 'Uncategorised')}</span></td>
      <td class="num">${money(r.tvl_usd)}</td>
      <td class="num ${r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'}">${pct(r.change_7d)}</td>
      <td class="num">${r.age_years === null ? '—' : r.age_years.toFixed(1) + ' y'}</td>
      <td class="chains">${esc(r.chains.slice(0, 3).join(', '))}${r.chains.length > 3 ? ` +${r.chains.length - 3}` : ''}</td>
      <td><div class="bar-wrap"><div class="bar-bg"><div class="bar" style="width:${Math.max(2, (r.implied_value_usd / maxImplied) * 110)}px"></div></div><span class="ival">${money(r.implied_value_usd)}</span><span class="conf conf-${r.confidence.band}">${r.confidence.band.toUpperCase()}</span></div></td>
      <td>›</td>
    </tr>`).join('');
  $('board-note').textContent = 'Click any row for the protocol\'s factor breakdown and farm plan. Ranks are the model\'s claim: implied value falls as rank ascends.';
  document.querySelectorAll('#board-body tr').forEach((tr) => {
    tr.addEventListener('click', () => { location.hash = '#/p/' + tr.dataset.slug; });
  });
}

/* ---------- detail view ---------- */
function renderDetail(slug) {
  const r = bySlug.get(slug);
  if (!r) { renderBoard(); return; }
  $('board-view').hidden = true;
  $('board-controls').style.display = 'none';
  const d = $('detail-view');
  d.hidden = false;
  const f = r.factors;
  const hasPeers = R.multiples.some((m) => m.category === r.category);
  const factorRow = (name, v, note) => `
    <div class="factor"><span class="fname">${name}</span>
      <div class="fbar-bg"><div class="fbar" style="width:${Math.min(100, (v / 2.5) * 100)}%"></div></div>
      <span class="fval">${x(v)}</span></div>
    <div class="factor"><span></span><span class="chains">${note}</span><span></span></div>`;
  d.innerHTML = `
    <button class="back" id="back-btn">← Back to the board</button>
    <div class="detail-head">
      <div>
        <h2>${esc(r.name)}${r.watchlist ? '<span class="badge">WATCHLIST</span>' : ''}</h2>
        <p class="detail-sub">Rank #${r.rank} of ${rows.length} · ${esc(r.category ?? 'Uncategorised')} · records no token in the snapshot</p>
      </div>
      <div class="big-value"><span>implied launch value</span><b>${money(r.implied_value_usd)}</b><span class="range-line">plausible range ${money(r.confidence.range_usd[0])} – ${money(r.confidence.range_usd[1])}</span></div>
    </div>
    <div class="cards">
      <div class="card">
        <h3>Why this value — the model's workings</h3>
        ${factorRow('Category multiple', f.multiple, hasPeers ? `median market-cap/TVL of traded ${esc(r.category ?? 'peers')} protocols` : `fewer than 3 traded ${esc(r.category ?? '')} peers — the all-peers median stands in`)}
        ${factorRow('7d growth', f.growth, r.change_7d === null ? 'TVL change unreported — no adjustment' : `TVL ${pct(r.change_7d)} over seven days`)}
        ${factorRow('Years tokenless', f.maturity, r.listed_at === null ? 'tracking start unreported' : `tracked since ${r.listed_at} — ${r.age_years.toFixed(1)} years with no token`)}
        ${factorRow('Chain breadth', f.breadth, `live on ${r.chains.length} chain${r.chains.length === 1 ? '' : 's'}`)}
        ${factorRow('Size compression', f.size, r.tvl_usd > 1e9 ? 'TVL past $1B is compressed so giants do not extrapolate whole' : 'no compression under $1B of TVL')}
        <p class="arith">${money(r.tvl_usd)} TVL × ${f.multiple.toFixed(2)} × ${f.growth.toFixed(2)} × ${f.maturity.toFixed(2)} × ${f.breadth.toFixed(2)} × ${f.size.toFixed(2)} = <b>${money(r.implied_value_usd)}</b></p>
      </div>
      <div class="card">
        <h3>The protocol</h3>
        <dl class="kv">
          <dt>TVL</dt><dd>${money(r.tvl_usd)}</dd>
          <dt>TVL change, 7d</dt><dd>${pct(r.change_7d)}</dd>
          <dt>Tracked since</dt><dd>${r.listed_at ?? 'unreported'}</dd>
          <dt>Chains</dt><dd>${esc(r.chains.join(', '))}</dd>
          <dt>On the house watchlist</dt><dd>${r.watchlist ? 'yes — TVL at or above the $50M floor' : 'no — below the floor or outside its rule; the radar ranks it anyway'}</dd>
          <dt>Model confidence</dt><dd>${r.confidence.band} — ${r.confidence.peers > 0 ? `the multiple is the median of ${r.confidence.peers} traded ${esc(r.category ?? '')} peers` : 'no traded peers in its category, so the all-peers median stands in'}; the plausible range widens as the anchoring thins</dd>
        </dl>
      </div>
      <div class="card">
        <h3>How to farm it — the plan</h3>
        <ol class="steps">${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      </div>
    </div>`;
  $('back-btn').addEventListener('click', () => { location.hash = '#/'; });
  window.scrollTo(0, 0);
}

/* ---------- wiring ---------- */
function route() {
  const path = readHash();
  if (path.startsWith('p/')) renderDetail(path.slice(2));
  else renderBoard();
}
$('q').addEventListener('input', (e) => { state.q = e.target.value.toLowerCase(); renderBoard(); });
$('f-sort').addEventListener('change', (e) => { state.sort = e.target.value; renderBoard(); });
for (const [id, key] of [['f-category', 'cat'], ['f-chain', 'chain']]) {
  $(id).addEventListener('change', (e) => {
    const params = new URLSearchParams();
    if (state.cat) params.set('cat', state.cat);
    if (state.chain) params.set('chain', state.chain);
    if (state.watch) params.set('watch', '1');
    params.set(key, e.target.value);
    if (params.get(key) === '') params.delete(key);
    location.hash = '#/?' + params.toString();
  });
}
$('f-watch').addEventListener('change', (e) => {
  const params = new URLSearchParams();
  if (state.cat) params.set('cat', state.cat);
  if (state.chain) params.set('chain', state.chain);
  if (e.target.checked) params.set('watch', '1');
  location.hash = '#/?' + params.toString();
});
window.addEventListener('hashchange', route);
route();
