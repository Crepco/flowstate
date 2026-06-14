"""Gemini-powered focus coach.

Takes the user's study-session summary plus a chat history and asks Gemini to
give grounded, practical focus advice. Falls back to a simple data-driven reply
if the API key is missing or the call fails, so the demo never hard-breaks.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()  # read .env (git-ignored)

_KEY = os.environ.get("GEMINI_API_KEY")
_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
_client = None

SYSTEM_PROMPT = """You are the focus coach inside FlowState, an app that measures \
attention from a forehead-EEG sensor and produces a 0-100 focus score.

Your job: after a study session, help the user understand their focus and give \
specific, practical advice on focusing better.

Rules:
- Ground every claim in the SESSION DATA you are given. Do NOT invent numbers.
- Be warm, encouraging, and concise: 2-4 short sentences unless asked for more.
- Give concrete, actionable tips (e.g. Pomodoro timing, environment, breaks), \
tailored to what their data shows.
- Be honest that the focus score is a relative, personal EEG *proxy*, not a \
medical or absolute measurement. Never give medical advice.
- A focus score below 40 counts as "zoned out". Higher beta vs alpha+theta means \
more engagement; rising alpha/theta often means drowsiness or mind-wandering."""


def available() -> bool:
    return bool(_KEY)


def _get_client():
    global _client
    if _client is None and _KEY:
        from google import genai
        _client = genai.Client(api_key=_KEY)
    return _client


def _trend(summary) -> str:
    tl = summary.get("timeline") or []
    if len(tl) < 6:
        return "not enough data to judge a trend"
    third = max(1, len(tl) // 3)
    first = sum(p["f"] for p in tl[:third]) / third
    last = sum(p["f"] for p in tl[-third:]) / third
    diff = last - first
    if diff <= -8:
        return f"focus DECLINED over the session (start ~{first:.0f} -> end ~{last:.0f})"
    if diff >= 8:
        return f"focus IMPROVED over the session (start ~{first:.0f} -> end ~{last:.0f})"
    return f"focus stayed fairly steady (start ~{first:.0f} -> end ~{last:.0f})"


def _session_block(summary) -> str:
    if not summary or not summary.get("n_samples"):
        return "SESSION DATA: (no session recorded yet)"
    b = summary.get("bands", {}) or {}
    dur = summary.get("duration", 0)
    return (
        "SESSION DATA:\n"
        f"- duration: {dur:.0f}s ({dur/60:.1f} min)\n"
        f"- average focus score: {summary.get('avg_focus')}/100\n"
        f"- peak focus: {summary.get('peak_focus')}/100\n"
        f"- time spent focused (score >= 40): {summary.get('pct_focused')}%\n"
        f"- number of zone-outs (lapses): {summary.get('zone_outs')}\n"
        f"- longest unbroken focused streak: {summary.get('longest_streak')}s\n"
        f"- average band mix (relative): theta {b.get('theta')}, alpha {b.get('alpha')}, "
        f"beta {b.get('beta')}, gamma {b.get('gamma')}\n"
        f"- trend: {_trend(summary)}"
    )


def chat(messages, summary) -> dict:
    """messages: [{'role':'user'|'assistant','content':str}]. Returns {'reply', 'ai'}."""
    client = _get_client()
    if client is None:
        return {"reply": _fallback(messages, summary), "ai": False}

    from google.genai import types

    system = SYSTEM_PROMPT + "\n\n" + _session_block(summary)
    contents = []
    for m in messages:
        role = "model" if m.get("role") == "assistant" else "user"
        contents.append(types.Content(role=role,
                                      parts=[types.Part(text=str(m.get("content", "")))]))
    if not contents:
        contents = [types.Content(role="user", parts=[types.Part(text="How was my session?")])]

    try:
        cfg = types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=600,
            temperature=0.7,
        )
        # gemini-2.5 "thinking" models spend the token budget on hidden
        # reasoning, truncating the reply. We want snappy tips, so disable it.
        try:
            cfg.thinking_config = types.ThinkingConfig(thinking_budget=0)
        except Exception:
            pass
        resp = client.models.generate_content(
            model=_MODEL, contents=contents, config=cfg)
        text = (resp.text or "").strip()
        return {"reply": text or _fallback(messages, summary), "ai": True}
    except Exception as exc:
        return {"reply": _fallback(messages, summary, error=str(exc)), "ai": False}


def _fallback(messages, summary, error=None) -> str:
    """Templated, data-aware reply when Gemini is unavailable."""
    if not summary or not summary.get("n_samples"):
        base = "Run a study session first, then I can give you tailored focus advice."
    else:
        pct = summary.get("pct_focused", 0)
        z = summary.get("zone_outs", 0)
        if pct >= 75:
            base = (f"Solid session — you held focus {pct}% of the time. "
                    "To push further, try slightly longer focus blocks and protect them from interruptions.")
        elif pct >= 50:
            base = (f"You focused {pct}% of the time with {z} lapse(s). "
                    "Try the Pomodoro method (25 min focus / 5 min break) and clear distractions before you start.")
        else:
            base = (f"Focus was scattered ({pct}%, {z} lapses). "
                    "Start with shorter 15-minute blocks, remove your phone from reach, and take a real break between blocks.")
    if error:
        base += "  (AI coach offline — check the Gemini API key.)"
    return base
