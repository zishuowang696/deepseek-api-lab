import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

interface Task {
  id: string
  category: string
  prompt: string
  expectJson?: boolean
}

interface Result {
  id: string
  category: string
  ok: boolean
  status: number
  ttftMs: number | null
  totalMs: number
  chars: number
  tokens: number | null
  jsonOk: boolean | null
  error: string
  text: string
}

const root = join(import.meta.dir, '..')
const tasks = JSON.parse(readFileSync(join(root, 'prompts/tasks.json'), 'utf8')) as Task[]
const dry = process.argv.includes('--dry-run')
const apiKey = process.env.DEEPSEEK_API_KEY ?? ''
const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/+$/, '')
const model = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'

if (dry) {
  console.log(`dry run: ${tasks.length} tasks`)
  for (const t of tasks) console.log(`- ${t.id} [${t.category}]`)
  process.exit(0)
}
if (!apiKey) {
  console.error('DEEPSEEK_API_KEY is missing')
  process.exit(1)
}

async function run(task: Task): Promise<Result> {
  const started = performance.now()
  let ttftMs: number | null = null
  let text = ''
  let tokens: number | null = null
  let status = 0
  let error = ''
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: true,
        stream_options: { include_usage: true },
        temperature: 0,
        max_tokens: 512,
        messages: [{ role: 'user', content: task.prompt }],
      }),
    })
    status = res.status
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta?.content ?? ''
        if (delta && ttftMs === null) ttftMs = performance.now() - started
        text += delta
        if (json.usage?.completion_tokens) tokens = json.usage.completion_tokens
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  const totalMs = performance.now() - started
  let jsonOk: boolean | null = null
  if (task.expectJson) {
    try {
      const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
      JSON.parse(cleaned)
      jsonOk = true
    } catch {
      jsonOk = false
    }
  }
  return {
    id: task.id,
    category: task.category,
    ok: !error && status >= 200 && status < 300,
    status,
    ttftMs: ttftMs === null ? null : Math.round(ttftMs),
    totalMs: Math.round(totalMs),
    chars: text.length,
    tokens,
    jsonOk,
    error,
    text,
  }
}

const results: Result[] = []
for (const task of tasks) {
  const r = await run(task)
  results.push(r)
  console.log(`${r.ok ? 'OK ' : 'ERR'} ${r.id} ${r.ttftMs ?? '-'}ms ${r.totalMs}ms chars=${r.chars} json=${r.jsonOk ?? '-'}`)
}

const outDir = join(root, 'results')
mkdirSync(outDir, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
writeFileSync(join(outDir, `deepseek-${stamp}.json`), JSON.stringify({ model, baseUrl, at: new Date().toISOString(), results }, null, 2))
const csv = ['id,category,ok,status,ttft_ms,total_ms,chars,tokens,json_ok,error', ...results.map((r) => [r.id, r.category, r.ok, r.status, r.ttftMs ?? '', r.totalMs, r.chars, r.tokens ?? '', r.jsonOk ?? '', JSON.stringify(r.error)].join(','))].join('\n')
writeFileSync(join(outDir, `deepseek-${stamp}.csv`), csv)
console.log(`wrote results/deepseek-${stamp}.json|csv`)
