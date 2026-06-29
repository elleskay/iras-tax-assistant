# Operational Insights pipeline

Data-Science showcase for the IRAS Tax Assistant platform demo. It mines the
platform's **own usage** (officer prompts + interaction telemetry) and produces
**operational intelligence per workspace** (a workspace = a tax type):

| Workspace            | Tax type                |
| -------------------- | ----------------------- |
| `individual-income`  | Individual Income Tax   |
| `corporate`          | Corporate Tax           |

> **The data is SYNTHETIC.** Live platform usage is too sparse for a demo, so the
> pipeline generates a realistic, seeded officer-interaction dataset. Every
> output object carries `"synthetic": true`.

## What it produces

For each workspace the pipeline writes three analyses to
`apps/web/public/insights.json`:

- **`trainingNeeds`** — the largest prompt clusters (topics officers ask about
  most). Each has a human label, count, 2-3 example prompts, and a one-line
  training recommendation. *High volume = upskilling target.*
- **`docGaps`** — clusters with low/zero retrieval or low eval scores. Each has a
  reason and a count. *Poor retrieval / weak answers = documentation gap.*
- **`processImprovements`** — clusters with the highest officer effort (avg
  turns, steps, time). Each is a redesign candidate with its metrics. *High
  effort = process-redesign candidate.*

## How it works

```
synthetic interactions  ->  embeddings  ->  KMeans clusters  ->  3 analyses  ->  insights.json
   (datagen.py)            (embeddings.py)   (cluster.py)       (analyze.py)     (pipeline.py)
```

1. **Synthetic data** (`datagen.py`). ~300-600 interactions per workspace,
   seeded/deterministic. Each interaction has a prompt, `retrieval_hit` +
   `retrieval_score`, `turn_count`, `step_count`, `time_seconds`, and
   `eval_score`. Topics carry a behavioural *profile* so the data tells a story:
   a few topics are asked very often (training needs), some consistently miss
   retrieval or score badly (doc gaps), some cost much more effort (process
   improvements).
2. **Embeddings** (`embeddings.py`). Three paths, tried in order; the one that
   ran is recorded in `_meta.embeddingPath`:
   - `sentence-transformers/all-MiniLM-L6-v2` — best semantic quality.
   - `sklearn/TfidfVectorizer` — deterministic, offline.
   - `numpy/hashing-tfidf` — pure-numpy hashing + n-gram TF-IDF, **always
     available, no external deps**, deterministic (FNV-1a hashing, not Python's
     salted `hash()`).
3. **Clustering** (`cluster.py`). `sklearn.cluster.KMeans` if installed, else a
   deterministic pure-numpy KMeans with k-means++ seeding. Recorded in
   `_meta.clusterPath`. Embeddings are L2-normalised, so Euclidean KMeans
   approximates cosine clustering.
4. **Analysis** (`analyze.py`). Aggregates each cluster (size, retrieval health,
   eval health, effort) and derives the three sections.

## Which path actually ran

This environment is **offline** (no `scikit-learn` / `sentence-transformers`
available, `pip install` blocked), so the committed `insights.json` was produced
with:

- embedding path: **`numpy/hashing-tfidf`**
- cluster path: **`numpy/kmeans`**

Install the optional packages to upgrade quality (the pipeline auto-detects and
switches paths — no code change needed):

```bash
pip install scikit-learn sentence-transformers
```

The pure-numpy embeddings are intentionally lightweight; cluster purity is lower
than with real sentence embeddings, so a small number of example prompts in a
cluster may come from an adjacent topic. Cluster **labels** always reflect the
dominant topic. With `sentence-transformers` installed, separation improves
markedly.

## Run

From `services/insights/`:

```bash
python generate.py                 # auto-detect best path, write the default output
python generate.py --prefer numpy  # force the offline fallback
python generate.py --prefer sklearn
python generate.py --k 14 --seed 42 --n 500
python generate.py --out /custom/path/insights.json
```

Default output path: `../../apps/web/public/insights.json` (relative to this
directory, i.e. `apps/web/public/insights.json` in the repo).

## Test

Offline smoke test (forces the deterministic numpy fallback, asserts the three
sections exist for both workspaces and round-trips the JSON):

```bash
pip install -r requirements.txt   # numpy + pytest only
pytest -q
```

## Files

```
services/insights/
  generate.py                 CLI entry point
  requirements.txt            numpy + pytest required; sklearn/ST optional
  README.md                   this file
  insights_pipeline/
    __init__.py
    datagen.py                seeded synthetic officer-interaction generator
    embeddings.py             3-tier embedding with offline fallback
    cluster.py                sklearn or pure-numpy KMeans
    analyze.py                trainingNeeds / docGaps / processImprovements
    pipeline.py               orchestration + JSON writer
  tests/
    test_smoke.py             offline pytest smoke test
```

## Output schema

```jsonc
{
  "<workspace>": {
    "name": "Individual Income Tax",
    "generatedAt": "<ISO-8601 UTC>",   // datetime.now(timezone.utc) at run time
    "synthetic": true,
    "totalInteractions": 563,
    "trainingNeeds": [
      { "label": "...", "count": 90,
        "examplePrompts": ["...", "..."],
        "recommendation": "..." }
    ],
    "docGaps": [
      { "topic": "...", "reason": "...", "count": 24 }
    ],
    "processImprovements": [
      { "topic": "...", "avgTurns": 5.2, "avgSteps": 6.2,
        "avgTimeSeconds": 106.0, "count": 20 }
    ]
  },
  "_meta": {
    "embeddingPath": "numpy/hashing-tfidf",
    "clusterPath": "numpy/kmeans",
    "note": "Synthetic demo data."
  }
}
```
