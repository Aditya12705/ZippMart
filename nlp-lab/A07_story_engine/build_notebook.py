"""One-off script to generate A07_Story_Engine.ipynb."""
import json
from pathlib import Path

engine_src = Path("story_engine.py").read_text(encoding="utf-8")
cells: list[dict] = []


def md(s: str) -> None:
    cells.append(
        {"cell_type": "markdown", "metadata": {}, "source": [line + "\n" for line in s.split("\n")]}
    )


def code(s: str) -> None:
    cells.append(
        {
            "cell_type": "code",
            "metadata": {},
            "outputs": [],
            "execution_count": None,
            "source": [line + "\n" for line in s.split("\n")],
        }
    )


md(
    """# A07 — Choose-Your-Own-Adventure Story Engine

**NLP Lab · Creative & Generative · Ambitious**

This notebook implements an LLM-driven CYOA engine with **novel features** beyond a basic prompt loop:

| Feature | Purpose |
|---------|---------|
| **Narrative Anchors** | Memorable plot elements in `world_state.anchors`, scored for late callbacks |
| **Dual-layer memory** | Structured JSON + rolling `narrative_summary` each turn |
| **Continuity Guardian** | Rule checks after each turn (inventory, anchors, travel) |
| **Genre extensions** | Extra state for `fantasy`, `noir`, or `sci_fi` |
| **Playthrough export** | Markdown log for report / demo |

**Deliverables:** engine code · 10+ turn log · early→late callback · failure analysis"""
)

md(
    """## 0. Setup

```bash
pip install -r requirements.txt
```

Set `OPENAI_API_KEY`, or `STORY_ENGINE_PROVIDER=ollama` with Ollama running.  
Without either, **mock mode** runs a deterministic 12-turn demo (continuity-friendly)."""
)

code("%pip install -q openai python-dotenv")

code(
    """import json
import os
from pathlib import Path
from IPython.display import display, Markdown

engine_path = Path("story_engine.py")
if not engine_path.exists():
    engine_path = Path("nlp-lab/A07_story_engine/story_engine.py")

exec(engine_path.read_text(encoding="utf-8"), globals())

provider = "openai" if os.getenv("OPENAI_API_KEY") else os.getenv("STORY_ENGINE_PROVIDER", "mock")
print("Backend:", provider)
print("Ready.")"""
)

md("## 1. Engine implementation\n\nCore class: `StoryEngine` — see next cell (full source).")

code(engine_src)

md("## 2. Start a story")

code(
    """GENRE = "fantasy"  # fantasy | noir | sci_fi
TITLE = "The Anchor Below"

engine = StoryEngine(title=TITLE, genre=GENRE)
print("Story:", TITLE, "| Genre:", GENRE, "| Backend:", engine.provider)"""
)

md("## 3. Interactive play")

code(
    '''def play_one_turn(engine: StoryEngine, choice: str | None = None):
    rec = engine.step(choice)
    display(Markdown("### Turn %d\\n\\n%s" % (rec.turn, rec.scene)))
    lines = "\\n".join("%d. %s" % (i, c) for i, c in enumerate(rec.choices, 1))
    display(Markdown("**Choices:**\\n" + lines))
    if rec.anchor_callbacks:
        display(Markdown("**Anchor callbacks:** " + ", ".join(rec.anchor_callbacks)))
    if rec.continuity_notes:
        display(Markdown("**Continuity guardian:** " + "; ".join(rec.continuity_notes)))
    return rec

play_one_turn(engine)'''
)

code(
    '''# Edit choice text each run
play_one_turn(engine, choice="Follow the warming map west")'''
)

md("## 4. Autoplay — 12-turn submission log")

code(
    '''SCRIPTED_CHOICES = [
    "Step through the cracked archway",
    "Follow the warming map west",
    "Accept the ghost librarian's bargain",
    "Light the brass lantern",
    "Descend the spiral stairs",
    "Read the copper-scented map aloud",
    "Hide when footsteps approach",
    "Confront the figure at the sealed stack",
    "Return the map as promised",
    "Open the final door",
    "Claim what waits inside",
    "Walk back into the rain",
]

demo = StoryEngine(title="Autoplay — The Anchor Below", genre="fantasy")
for i, ch in enumerate(SCRIPTED_CHOICES):
    rec = demo.step(None if i == 0 else ch)
    print("--- Turn %d ---" % rec.turn)
    print(rec.scene[:500])
    print("Choices:", rec.choices)
    print("Anchors:", [a.get("id") for a in rec.world_state.get("anchors", [])])
    print()

print(json.dumps(demo.continuity_score(), indent=2))'''
)

md("## 5. Export playthrough & continuity check")

code(
    '''OUT = Path("playthrough_log.md")
OUT.write_text(demo.log.to_markdown(), encoding="utf-8")
print("Saved", OUT.resolve())
demo.continuity_score()'''
)

md(
    """## 6. Failure analysis (complete after a real LLM run)

Document cases where the model lost state or broke continuity:

| Turn | Symptom | Likely cause | Mitigation | Result |
|------|---------|--------------|------------|--------|
| | | | | |

*Use OpenAI/Ollama for honest failures; mock mode is for structure testing only.*"""
)

nb = {
    "nbformat": 4,
    "nbformat_minor": 5,
    "metadata": {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python", "pygments_lexer": "ipython3"},
    },
    "cells": cells,
}
Path("A07_Story_Engine.ipynb").write_text(json.dumps(nb, indent=1), encoding="utf-8")
print("Wrote A07_Story_Engine.ipynb,", len(cells), "cells")
