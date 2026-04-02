import json

with open("experiments/data/011/crossover-results.json") as f:
    results = json.load(f)

data = {}
for r in results:
    cfg = r["config"]
    key = (cfg["selectedStrategy"], cfg["cacheReliability"], cfg["toolCallCycles"])
    data[key] = r["metrics"]

reliabilities = [1.0, 0.9, 0.8, 0.7]
cycles_list = [60, 70, 80, 90, 100, 110, 120]

print("LCM vs INCREMENTAL CROSSOVER ANALYSIS")
print("=" * 80)
header = f"{'cycles':<10}" + "".join(f"{'rel='+str(r):<20}" for r in reliabilities)
print(header)
print("-" * 90)

for cycles in cycles_list:
    parts = []
    for rel in reliabilities:
        inc = data[("incremental", rel, cycles)]["totalCost"]
        lcm = data[("lcm-subagent", rel, cycles)]["totalCost"]
        diff = lcm - inc
        winner = "lcm" if diff < 0 else "inc"
        parts.append(f"${inc:.3f} vs ${lcm:.3f} ({winner})")
    print(f"{cycles:<10}" + "".join(f"{p:<20}" for p in parts))

print("\nCROSSOVER POINTS:")
for rel in reliabilities:
    prev_winner = None
    for i, cycles in enumerate(cycles_list):
        inc = data[("incremental", rel, cycles)]["totalCost"]
        lcm = data[("lcm-subagent", rel, cycles)]["totalCost"]
        winner = "lcm" if lcm < inc else "inc"
        if prev_winner and winner != prev_winner:
            print(f"  rel={rel}: crossover between {cycles_list[i-1]} and {cycles} cycles")
        prev_winner = winner
