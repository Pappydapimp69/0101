# ADR 0002 — Sam's cut-off rule and a fading grudge

**Status:** accepted (2026-11-02). Picks option B on Brain tension T77.

## Context
The design says Sam cuts you off when Sam's social is low and Sam's mood is poor, and that you can keep trying. Brain's T77 (🔴 open) asks how NPC memory of interactions should decay:
- With a floor, grudges never fade.
- Without one, all memory fades within weeks.

## Decision
- Cut off when `social < 40` **and** `mood − grudge < 40`.
- Each cut-off: grudge +12, you get +1.5 social. Each completed chat: grudge −10.
- Grudge fades 8 points per game hour, capped at 60, with **no floor**.
- Mood never lowers competence. Low mood only changes Sam's choices and your screen's colour.

## Consequences
- Pestering Sam makes Sam less willing for a few hours, then it passes.
- No lasting relationship memory yet. If one is wanted later, T77's data says a floor makes hostility permanent too, so a sign-aware floor would be needed.
