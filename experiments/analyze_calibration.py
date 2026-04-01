"""
Calibration analysis of reference conversations.

Parses the custom line-prefix format used in the XML files:
  [USER]: ...
  [ASSISTANT]: ...
  [TOOL]: ...
  [TOOL_RESULT]: ...

System prompt lives between <system> and </system> tags at the top.
"""

import json
import os
import re
from pathlib import Path
from collections import defaultdict


CONV_DIR = Path(__file__).parent / "reference-conversations"
OUT_DIR = Path(__file__).parent / "data"
OUT_FILE = OUT_DIR / "calibration.json"

CHARS_PER_TOKEN = 4.0  # 1 token ≈ 4 characters


def chars_to_tokens(text: str) -> float:
    return len(text) / CHARS_PER_TOKEN


def parse_file(filepath: Path) -> dict:
    """Parse a single conversation file and return structured data."""
    text = filepath.read_text(encoding="utf-8")

    # --- Extract system prompt ---
    sys_match = re.search(r"<system>(.*?)</system>", text, re.DOTALL)
    system_text = sys_match.group(1) if sys_match else ""
    system_tokens = chars_to_tokens(system_text)

    # --- Get the post-system body ---
    if sys_match:
        body = text[sys_match.end():]
    else:
        body = text

    # --- Split body into segments by role prefix ---
    # Each segment starts at a [ROLE]: marker on a line
    # We split on lines that start with one of the known prefixes
    PREFIX_RE = re.compile(r"^\[(USER|ASSISTANT|TOOL|TOOL_RESULT)\]:(.*)", re.MULTILINE)

    segments = []
    last_end = 0
    last_role = None
    last_start_text = None

    matches = list(PREFIX_RE.finditer(body))
    for i, m in enumerate(matches):
        # Save previous segment
        if last_role is not None:
            # Content is from last_start_text up to the start of this match
            content = last_start_text + body[matches[i-1].end():m.start()]
            segments.append({"role": last_role, "content": content.strip()})
        last_role = m.group(1)
        last_start_text = m.group(2)  # text after "[ROLE]:"

    # Save final segment
    if last_role is not None:
        content = last_start_text + body[matches[-1].end():]
        segments.append({"role": last_role, "content": content.strip()})

    return {
        "filename": filepath.name,
        "system_tokens": system_tokens,
        "system_chars": len(system_text),
        "segments": segments,
    }


def analyze_file(parsed: dict) -> dict:
    """Compute per-file statistics."""
    segments = parsed["segments"]

    tool_call_sizes = []   # tokens per [TOOL]: segment
    tool_result_sizes = [] # tokens per [TOOL_RESULT]: segment
    assistant_text_sizes = []  # tokens for [ASSISTANT]: segments (narrative text only)
    user_sizes = []        # tokens per [USER]: segment

    # Track "tool call cycles" — a cycle is one or more consecutive [TOOL]/[TOOL_RESULT] pairs
    # between two [ASSISTANT] segments (or start/end)
    # We define a cycle as a contiguous run of TOOL+TOOL_RESULT pairs within a single assistant turn.
    # In practice each [TOOL]: line is immediately followed by its [TOOL_RESULT]: line.
    # Count distinct tool-call cycles per user turn.

    tool_calls_count = 0
    user_turns = 0
    tool_calls_between_users = []
    calls_this_user_turn = 0

    i = 0
    while i < len(segments):
        seg = segments[i]
        role = seg["role"]
        tokens = chars_to_tokens(seg["content"])

        if role == "USER":
            if user_turns > 0:
                # Record tool calls for previous user turn
                tool_calls_between_users.append(calls_this_user_turn)
            user_sizes.append(tokens)
            user_turns += 1
            calls_this_user_turn = 0

        elif role == "ASSISTANT":
            assistant_text_sizes.append(tokens)

        elif role == "TOOL":
            tool_call_sizes.append(tokens)
            tool_calls_count += 1
            calls_this_user_turn += 1

        elif role == "TOOL_RESULT":
            tool_result_sizes.append(tokens)

        i += 1

    # Don't forget the last user turn's tool calls
    if user_turns > 0:
        tool_calls_between_users.append(calls_this_user_turn)

    return {
        "filename": parsed["filename"],
        "system_tokens": parsed["system_tokens"],
        "user_turns": user_turns,
        "total_tool_calls": tool_calls_count,
        "tool_call_sizes": tool_call_sizes,
        "tool_result_sizes": tool_result_sizes,
        "assistant_text_sizes": assistant_text_sizes,
        "user_sizes": user_sizes,
        "tool_calls_per_user_turn": tool_calls_between_users,
    }


def mean(lst):
    return sum(lst) / len(lst) if lst else 0.0


def aggregate(file_stats: list[dict]) -> dict:
    all_tool_call_sizes = []
    all_tool_result_sizes = []
    all_assistant_text_sizes = []
    all_user_sizes = []
    all_system_tokens = []
    all_tool_calls_per_user_turn = []

    per_file = []

    for fs in file_stats:
        all_system_tokens.append(fs["system_tokens"])
        all_tool_call_sizes.extend(fs["tool_call_sizes"])
        all_tool_result_sizes.extend(fs["tool_result_sizes"])
        all_assistant_text_sizes.extend(fs["assistant_text_sizes"])
        all_user_sizes.extend(fs["user_sizes"])
        all_tool_calls_per_user_turn.extend(fs["tool_calls_per_user_turn"])

        per_file.append({
            "filename": fs["filename"],
            "system_tokens": round(fs["system_tokens"]),
            "user_turns": fs["user_turns"],
            "total_tool_calls": fs["total_tool_calls"],
            "avg_tool_calls_per_user_turn": round(mean(fs["tool_calls_per_user_turn"]), 1),
            "avg_tool_call_tokens": round(mean(fs["tool_call_sizes"])),
            "avg_tool_result_tokens": round(mean(fs["tool_result_sizes"])),
            "avg_assistant_text_tokens": round(mean(fs["assistant_text_sizes"])),
            "avg_user_tokens": round(mean(fs["user_sizes"])),
        })

    # User message frequency: on average, how many tool calls happen per user message?
    avg_tool_calls_per_user = mean(all_tool_calls_per_user_turn)

    return {
        "summary": {
            "system_prompt_tokens": {
                "mean": round(mean(all_system_tokens)),
                "min": round(min(all_system_tokens)),
                "max": round(max(all_system_tokens)),
                "note": "All files appear to use the same system prompt"
            },
            "tool_call_tokens": {
                "mean": round(mean(all_tool_call_sizes)),
                "min": round(min(all_tool_call_sizes)) if all_tool_call_sizes else 0,
                "max": round(max(all_tool_call_sizes)) if all_tool_call_sizes else 0,
                "count": len(all_tool_call_sizes),
            },
            "tool_result_tokens": {
                "mean": round(mean(all_tool_result_sizes)),
                "min": round(min(all_tool_result_sizes)) if all_tool_result_sizes else 0,
                "max": round(max(all_tool_result_sizes)) if all_tool_result_sizes else 0,
                "count": len(all_tool_result_sizes),
            },
            "assistant_text_tokens": {
                "mean": round(mean(all_assistant_text_sizes)),
                "min": round(min(all_assistant_text_sizes)) if all_assistant_text_sizes else 0,
                "max": round(max(all_assistant_text_sizes)) if all_assistant_text_sizes else 0,
                "count": len(all_assistant_text_sizes),
            },
            "user_message_tokens": {
                "mean": round(mean(all_user_sizes)),
                "min": round(min(all_user_sizes)) if all_user_sizes else 0,
                "max": round(max(all_user_sizes)) if all_user_sizes else 0,
                "count": len(all_user_sizes),
            },
            "tool_calls_per_user_turn": {
                "mean": round(avg_tool_calls_per_user, 2),
                "min": round(min(all_tool_calls_per_user_turn)) if all_tool_calls_per_user_turn else 0,
                "max": round(max(all_tool_calls_per_user_turn)) if all_tool_calls_per_user_turn else 0,
                "interpretation": f"On average, {round(avg_tool_calls_per_user, 1)} tool calls occur per user message"
            },
        },
        "per_file": per_file,
        "methodology": {
            "token_estimate": "1 token = 4 characters",
            "tool_call_definition": "[TOOL]: line = one tool call (the call arguments)",
            "tool_result_definition": "[TOOL_RESULT]: line = one tool result (the response)",
            "assistant_text_definition": "[ASSISTANT]: segment = narrative text only (may include inline [TOOL] on same turn in some formats)",
            "tool_calls_per_user_turn": "Number of [TOOL]: occurrences between consecutive [USER]: messages",
        }
    }


def main():
    xml_files = sorted(CONV_DIR.glob("*.xml"))
    print(f"Found {len(xml_files)} XML files")

    all_stats = []
    for f in xml_files:
        print(f"  Parsing {f.name} ...")
        parsed = parse_file(f)
        stats = analyze_file(parsed)
        all_stats.append(stats)
        print(f"    system={round(parsed['system_tokens'])} tokens, "
              f"user_turns={stats['user_turns']}, "
              f"tool_calls={stats['total_tool_calls']}, "
              f"tool_results={len(stats['tool_result_sizes'])}")

    result = aggregate(all_stats)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2)

    print(f"\nResults saved to {OUT_FILE}")

    # Print summary to stdout
    s = result["summary"]
    print("\n=== CALIBRATION SUMMARY ===")
    print(f"System prompt tokens (mean):        {s['system_prompt_tokens']['mean']}")
    print(f"Tool call tokens (mean):             {s['tool_call_tokens']['mean']}  (range {s['tool_call_tokens']['min']}–{s['tool_call_tokens']['max']}, n={s['tool_call_tokens']['count']})")
    print(f"Tool result tokens (mean):           {s['tool_result_tokens']['mean']}  (range {s['tool_result_tokens']['min']}–{s['tool_result_tokens']['max']}, n={s['tool_result_tokens']['count']})")
    print(f"Assistant text tokens (mean):        {s['assistant_text_tokens']['mean']}  (range {s['assistant_text_tokens']['min']}–{s['assistant_text_tokens']['max']}, n={s['assistant_text_tokens']['count']})")
    print(f"User message tokens (mean):          {s['user_message_tokens']['mean']}  (range {s['user_message_tokens']['min']}–{s['user_message_tokens']['max']}, n={s['user_message_tokens']['count']})")
    print(f"Tool calls per user turn (mean):     {s['tool_calls_per_user_turn']['mean']}")

    print("\n=== PER FILE ===")
    for pf in result["per_file"]:
        print(f"  {pf['filename'][:50]:50s}  "
              f"sys={pf['system_tokens']:5d}  "
              f"user_turns={pf['user_turns']:3d}  "
              f"tool_calls={pf['total_tool_calls']:4d}  "
              f"avg_calls/turn={pf['avg_tool_calls_per_user_turn']:5.1f}  "
              f"avg_call_tok={pf['avg_tool_call_tokens']:5d}  "
              f"avg_result_tok={pf['avg_tool_result_tokens']:6d}  "
              f"avg_asst_tok={pf['avg_assistant_text_tokens']:5d}  "
              f"avg_user_tok={pf['avg_user_tokens']:5d}")


if __name__ == "__main__":
    main()
