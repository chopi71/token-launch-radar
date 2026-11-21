# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/chopi71/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/chopi71/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar ranks every protocol in a sealed DefiLlama snapshot that records no token yet by what its launch would be worth — priced only from the snapshot's own figures. Each pre-token protocol is valued at its TVL times its category's market-cap/TVL multiple, taken from the protocols in the same snapshot whose token already trades. Category multiples are credibility-weighted toward the all-peers median by peer count, so a category priced from three traded peers leans on the whole market while one priced from thirty stands on its own evidence. The multiple is then adjusted for seven-day TVL growth, years run with no token, chain breadth, and a size compression past $1B of TVL. Every row carries a confidence band with a plausible value range, a one-line signal naming the model's reasons for its rank, and a concrete farm plan with amounts, gas budgets, durations and the risk to respect. The hand-in is a ranked board (board.json), a sortable and filterable dashboard with a detail view per protocol, and screenshots of both.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Node 22, standard library only, no network. The run writes board.json, the dashboard's data.js, copies of dashboard/ and screenshots/, and the dossier to the output directory, and refuses to hand in a board that fails its own checks.

---

<sub>Entered on [make.fun](https://make.fun/?ref=xhz2cc0t&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
