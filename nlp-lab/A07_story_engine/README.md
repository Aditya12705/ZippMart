# A07 — Choose-Your-Own-Adventure Story Engine

NLP lab project: LLM-driven interactive fiction with **structured world-state JSON**, **narrative anchors** for long-term continuity, and automated continuity scoring.

## Setup

```bash
cd nlp-lab/A07_story_engine
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
jupyter notebook A07_Story_Engine.ipynb
```

Set one of:

- `OPENAI_API_KEY` — uses `gpt-4o-mini` (recommended)
- Or run [Ollama](https://ollama.com) with `llama3.2` and set `STORY_ENGINE_PROVIDER=ollama`

Optional: copy `.env.example` to `.env` and add your key.

## Deliverables (in notebook)

1. Engine code with state tracking  
2. 10+ turn playthrough log (interactive or autoplay)  
3. Continuity demo (anchor from early turn referenced later)  
4. Failure analysis section  
