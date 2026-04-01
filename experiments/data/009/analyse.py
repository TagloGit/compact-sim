"""
Experiment 009 — pRetrieveMax sensitivity analysis
Compares lcm-subagent vs incremental cost across pRetrieveMax × toolCallCycles combos.
"""

import json
from pathlib import Path

DATA_PATH = Path(__file__).parent / "results-pRetrieveMax.json"

runs = json.loads(DATA_PATH.read_text())

# Index by (strategy, pRetrieveMax, toolCallCycles)
indexed: dict[tuple, dict] = {}
for run in runs:
    cfg = run["config"]
    key = (cfg["selectedStrategy"], cfg["pRetrieveMax"], cfg["toolCallCycles"])
    indexed[key] = run["metrics"]

# Collect unique sorted values
p_values = sorted({cfg["pRetrieveMax"] for cfg in (r["config"] for r in runs)})
cycle_values = sorted({cfg["toolCallCycles"] for cfg in (r["config"] for r in runs)})

# For incremental, pRetrieveMax has no effect — grab cost per toolCallCycles
incremental_cost: dict[int, float] = {}
incremental_compactions: dict[int, int] = {}
for cycles in cycle_values:
    # pRetrieveMax=0.0 row is the canonical incremental run (retrieval disabled there too)
    key = ("incremental", 0.0, cycles)
    if key in indexed:
        incremental_cost[cycles] = indexed[key]["totalCost"]
        incremental_compactions[cycles] = indexed[key]["compactionEvents"]

# Print header
col_w = 14
header_parts = ["pRetrieveMax"]
for cycles in cycle_values:
    header_parts += [f"lcm({cycles})", f"inc({cycles})", f"adv({cycles})%"]
print("  ".join(f"{p:<{col_w}}" for p in header_parts))
print("-" * (col_w * len(header_parts) + 2 * (len(header_parts) - 1)))

# Print rows
for p in p_values:
    row = [f"{p:.2f}"]
    for cycles in cycle_values:
        key_lcm = ("lcm-subagent", p, cycles)
        lcm_cost = indexed[key_lcm]["totalCost"] if key_lcm in indexed else float("nan")
        inc_cost = incremental_cost.get(cycles, float("nan"))
        if lcm_cost != lcm_cost or inc_cost != inc_cost:  # nan check
            row += ["N/A", "N/A", "N/A"]
            continue
        advantage_pct = (inc_cost - lcm_cost) / inc_cost * 100
        marker = " WIN" if lcm_cost < inc_cost else " LOSE"
        row.append(f"${lcm_cost:.4f}")
        row.append(f"${inc_cost:.4f}")
        row.append(f"{advantage_pct:+.1f}%{marker}")
    print("  ".join(f"{c:<{col_w}}" for c in row))

# Separator and compaction counts
print()
print("Compaction counts (lcm-subagent):")
header2 = ["pRetrieveMax"] + [f"lcm({c})" for c in cycle_values]
print("  ".join(f"{p:<{col_w}}" for p in header2))
print("-" * (col_w * len(header2) + 2 * (len(header2) - 1)))
for p in p_values:
    row2 = [f"{p:.2f}"]
    for cycles in cycle_values:
        key_lcm = ("lcm-subagent", p, cycles)
        events = indexed[key_lcm]["compactionEvents"] if key_lcm in indexed else "N/A"
        row2.append(str(events))
    print("  ".join(f"{c:<{col_w}}" for c in row2))

print()
print(f"Incremental baseline compaction events: {incremental_compactions}")

# Summary: find crossover pRetrieveMax per toolCallCycles (where lcm-subagent starts losing)
print()
print("Crossover analysis (pRetrieveMax where lcm-subagent flips from WIN to LOSE):")
for cycles in cycle_values:
    inc_cost = incremental_cost.get(cycles, float("nan"))
    crossover = None
    for p in p_values:
        key_lcm = ("lcm-subagent", p, cycles)
        if key_lcm in indexed:
            lcm_cost = indexed[key_lcm]["totalCost"]
            if lcm_cost >= inc_cost:
                crossover = p
                break
    if crossover is not None:
        print(f"  toolCallCycles={cycles}: lcm-subagent loses from pRetrieveMax >= {crossover:.2f}")
    else:
        print(f"  toolCallCycles={cycles}: lcm-subagent wins across all tested pRetrieveMax values")
