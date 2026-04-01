# Reference Conversations

This directory contains real Models Agent conversation examples (JSON) that serve as realistic starting points for calibrating simulation configs.

## Adding conversations

Export conversation JSON and place it here. Each file should be a single conversation session.

## What to look for

When studying these conversations, pay attention to:

- **Total token count** — how long do real sessions get?
- **Tool call frequency** — what fraction of turns are tool calls vs. assistant text?
- **Tool result sizes** — how large are typical tool results (in tokens)?
- **Conversation shape** — is it tool-heavy, chat-heavy, or mixed?
- **Turn count** — how many turns in a typical session?

These parameters map directly to simulation config fields (`toolCallFrequency`, `avgToolResultTokens`, `totalMessages`, etc.).
