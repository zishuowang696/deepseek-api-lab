# DeepSeek API Lab

Reproducible consumer-oriented DeepSeek API checks: latency, streaming, JSON reliability, long-context behavior and cost per successful task.

## Scope

This is not a model leaderboard. It measures what a buyer actually experiences:

- TTFT (time to first token)
- total latency
- output tokens / estimated cost
- JSON success rate
- long-context answer quality
- HTTP errors and rate-limit behavior

## Run

```sh
bun install
cp .env.example .env
# put DEEPSEEK_API_KEY in .env
bun run bench
```

Dry run (no network, validates task loading):

```sh
bun run dry
```

## GitHub Actions

Add `DEEPSEEK_API_KEY` as a repository secret, then run the **DeepSeek API bench** workflow manually. Results are uploaded as an artifact. Never commit `.env` or keys.

## Results

Raw results go to `results/`; reports should include date, model, endpoint, region and whether the run was sponsored.
