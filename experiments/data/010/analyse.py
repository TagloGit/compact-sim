"""
Experiment 010: compressedTokensCap sensitivity analysis.

Rows: compressedTokensCap values
Columns: (lcm_100, inc_100, adv_100, lcm_150, inc_150, adv_150, lcm_200, inc_200, adv_200)
  where adv = lcm advantage % over incremental (positive = lcm cheaper)

Also reports: at what compressedTokensCap does the advantage flip (incremental wins)?
"""

import json

DATA_PATH = "experiments/data/010/results-compressedTokensCap.json"

with open(DATA_PATH) as f:
    runs = json.load(f)

# Index by (strategy, toolCallCycles, compressedTokensCap) -> totalCost
index = {}
for run in runs:
    cfg = run["config"]
    key = (cfg["selectedStrategy"], cfg["toolCallCycles"], cfg["compressedTokensCap"])
    index[key] = run["metrics"]["totalCost"]

cap_values = sorted({r["config"]["compressedTokensCap"] for r in runs})
cycle_values = sorted({r["config"]["toolCallCycles"] for r in runs})

# Header
col_labels = []
for c in cycle_values:
    col_labels += [f"lcm_{c}", f"inc_{c}", f"adv_{c}%"]

header = f"{'cap':>10}" + "".join(f"  {lbl:>12}" for lbl in col_labels)
sep = "-" * len(header)

print("Experiment 010 — compressedTokensCap Sensitivity")
print(sep)
print(header)
print(sep)

flip_caps = {}  # cycle -> first cap where incremental wins (lcm_cost > inc_cost)

for cap in cap_values:
    row = f"{cap:>10}"
    for cycles in cycle_values:
        lcm_cost = index.get(("lcm-subagent", cycles, cap))
        inc_cost = index.get(("incremental", cycles, cap))
        if lcm_cost is None or inc_cost is None:
            row += f"  {'N/A':>12}  {'N/A':>12}  {'N/A':>12}"
            continue
        # advantage: positive means lcm is cheaper than incremental
        adv = (inc_cost - lcm_cost) / inc_cost * 100
        row += f"  {lcm_cost:>12.4f}  {inc_cost:>12.4f}  {adv:>+11.1f}%"
        # track flip point
        if adv < 0 and cycles not in flip_caps:
            flip_caps[cycles] = cap
    print(row)

print(sep)

print()
print("Retrieval advantage flip points (cap where incremental first wins):")
for cycles in cycle_values:
    if cycles in flip_caps:
        print(f"  toolCallCycles={cycles}: lcm loses at compressedTokensCap={flip_caps[cycles]}")
    else:
        print(f"  toolCallCycles={cycles}: lcm always wins across all tested cap values")

# Summary: cost at lowest vs highest cap
print()
print("Cost delta (lowest vs highest cap) for lcm-subagent:")
for cycles in cycle_values:
    low = index.get(("lcm-subagent", cycles, cap_values[0]))
    high = index.get(("lcm-subagent", cycles, cap_values[-1]))
    if low and high:
        delta = high - low
        pct = delta / low * 100
        print(f"  toolCallCycles={cycles}: cap={cap_values[0]} -> ${low:.4f}, cap={cap_values[-1]} -> ${high:.4f}  ({delta:+.4f}, {pct:+.1f}%)")
