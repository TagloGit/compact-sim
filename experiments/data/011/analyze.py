import json
import sys

with open("experiments/data/011/sweep-results.json") as f:
    results = json.load(f)

# Build lookup: (strategy, cacheReliability, cycles) -> metrics
data = {}
for r in results:
    cfg = r["config"]
    key = (cfg["selectedStrategy"], cfg["cacheReliability"], cfg["toolCallCycles"])
    data[key] = r["metrics"]

strategies = ["full-compaction", "incremental", "lossless-append", "lossless-hierarchical", "lossless-tool-results", "lcm-subagent"]
reliabilities = [1.0, 0.95, 0.9, 0.8, 0.7, 0.5]
cycles_list = [100, 150, 200]

# --- Table 1: Total cost by strategy × reliability at each session length ---
for cycles in cycles_list:
    print(f"\n{'='*80}")
    print(f"TOTAL COST ($) — {cycles} cycles")
    print(f"{'='*80}")
    header = f"{'Strategy':<25}" + "".join(f"{'rel='+str(r):<12}" for r in reliabilities) + f"{'chg(1->0.5)':<12}"
    print(header)
    print("-" * len(header))
    for s in strategies:
        costs = [data[(s, r, cycles)]["totalCost"] for r in reliabilities]
        delta = costs[-1] - costs[0]
        pct = (delta / costs[0]) * 100
        row = f"{s:<25}" + "".join(f"${c:>8.2f}   " for c in costs) + f"+${delta:.2f} ({pct:+.1f}%)"
        print(row)

# --- Table 2: Strategy ranking at each (reliability, cycles) ---
print(f"\n{'='*80}")
print("STRATEGY RANKINGS (by total cost, cheapest first)")
print(f"{'='*80}")
for cycles in cycles_list:
    print(f"\n  --- {cycles} cycles ---")
    for rel in reliabilities:
        ranked = sorted(strategies, key=lambda s: data[(s, rel, cycles)]["totalCost"])
        costs_str = ", ".join(f"{s}=${data[(s, rel, cycles)]['totalCost']:.2f}" for s in ranked)
        print(f"  rel={rel}: {costs_str}")

# --- Table 3: lcm-subagent vs incremental comparison ---
print(f"\n{'='*80}")
print("LCM-SUBAGENT vs INCREMENTAL")
print(f"{'='*80}")
header = f"{'cycles':<10}{'reliability':<15}{'incremental':<14}{'lcm-subagent':<14}{'cheaper':<16}{'gap':<10}{'gap%':<10}"
print(header)
print("-" * len(header))
for cycles in cycles_list:
    for rel in reliabilities:
        inc = data[("incremental", rel, cycles)]["totalCost"]
        lcm = data[("lcm-subagent", rel, cycles)]["totalCost"]
        cheaper = "lcm-subagent" if lcm < inc else "incremental" if inc < lcm else "tie"
        gap = abs(lcm - inc)
        gap_pct = (gap / max(inc, lcm)) * 100
        print(f"{cycles:<10}{rel:<15}${inc:<12.3f}${lcm:<12.3f}{cheaper:<16}${gap:<8.3f}{gap_pct:<8.1f}%")

# --- Table 4: Cache hit rates ---
print(f"\n{'='*80}")
print("AVERAGE CACHE HIT RATE")
print(f"{'='*80}")
for cycles in cycles_list:
    print(f"\n  --- {cycles} cycles ---")
    header = f"  {'Strategy':<25}" + "".join(f"{'rel='+str(r):<12}" for r in reliabilities)
    print(header)
    for s in strategies:
        rates = [data[(s, r, cycles)]["averageCacheHitRate"] for r in reliabilities]
        row = f"  {s:<25}" + "".join(f"{r*100:>8.1f}%   " for r in rates)
        print(row)

# --- Table 5: Absolute cost increase per strategy ---
print(f"\n{'='*80}")
print("COST INCREASE vs PERFECT CACHE (rel=1.0)")
print(f"{'='*80}")
for cycles in cycles_list:
    print(f"\n  --- {cycles} cycles ---")
    header = f"  {'Strategy':<25}" + "".join(f"{'rel='+str(r):<12}" for r in reliabilities[1:])
    print(header)
    for s in strategies:
        base = data[(s, 1.0, cycles)]["totalCost"]
        deltas = [(data[(s, r, cycles)]["totalCost"] - base) / base * 100 for r in reliabilities[1:]]
        row = f"  {s:<25}" + "".join(f"{d:>+8.1f}%   " for d in deltas)
        print(row)

# --- Table 6: full-compaction sensitivity ---
print(f"\n{'='*80}")
print("FULL-COMPACTION vs LCM-SUBAGENT GAP")
print(f"{'='*80}")
header = f"{'cycles':<10}{'reliability':<15}{'full-compact':<14}{'lcm-subagent':<14}{'ratio':<10}"
print(header)
print("-" * len(header))
for cycles in cycles_list:
    for rel in reliabilities:
        fc = data[("full-compaction", rel, cycles)]["totalCost"]
        lcm = data[("lcm-subagent", rel, cycles)]["totalCost"]
        ratio = fc / lcm
        print(f"{cycles:<10}{rel:<15}${fc:<12.2f}${lcm:<12.2f}{ratio:<8.2f}x")
