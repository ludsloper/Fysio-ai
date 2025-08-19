// Parse an intake JSON (as produced in run-output) and print Q&A pairs.
// Usage:
//   node scripts/parse-intake.js [path/to/intake.json | path/to/dir]
// If no path is provided, all intake_*.json from run_output/ (or run-output/) are parsed into parsed_output/.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

async function listIntakeJsons(dir) {
  try {
    const entries = await fs.readdir(dir)
    return entries
      .filter((f) => f.endsWith('.json') && /^intake_.*\.json$/.test(f))
      .map((f) => path.join(dir, f))
  } catch {
    return []
  }
}

function asYesNo(value) {
  if (value === true) return 'Ja'
  if (value === false) return 'Nee'
  return String(value)
}

function formatAnswerForToolCall(toolCall, result) {
  const name = toolCall?.name ?? ''
  const args = toolCall?.args ?? {}
  const notes = result?.notes
  const withNotes = (txt) => (notes ? `${txt} (${notes})` : txt)

  switch (name) {
    case 'ask_text': {
      const v = result?.value ?? ''
      return withNotes(String(v))
    }
    case 'ask_yesno': {
      const v = result?.value
      return withNotes(asYesNo(v))
    }
    case 'ask_select': {
      const value = result?.value
      const options = Array.isArray(args.options) ? args.options : []
      const match = options.find((o) => o?.value === value)
      const label = match?.label ?? String(value)
      return withNotes(label)
    }
    case 'ask_pain_scale': {
      const v = result?.value
      if (typeof v === 'number') {
        return withNotes(`${v}/10`)
      }
      return withNotes(String(v))
    }
    // Generic numeric input
    case 'ask_number': {
      const v = result?.value
      return withNotes(String(v))
    }
    default: {
      const v = result?.value
      return withNotes(typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''))
    }
  }
}

function buildResultMap(messages) {
  const map = new Map()
  for (const m of messages ?? []) {
    // Tool result shape in the provided sample: role: 'tool', toolResult: { id, key, value, notes? }
    if (m && m.role === 'tool' && m.toolResult && m.toolResult.id) {
      map.set(m.toolResult.id, m.toolResult)
    }
  }
  return map
}

function* iterateQAPairs(messages) {
  const resultById = buildResultMap(messages)
  for (const m of messages ?? []) {
    if (!m || m.role !== 'assistant' || !m.toolCall) continue
    const toolCall = m.toolCall
    const args = toolCall.args || {}
    const label = args.label || '(geen label)'
    const id = args.id
    if (!id) continue
    const result = resultById.get(id)
    if (!result) continue
    const answer = formatAnswerForToolCall(toolCall, result)
    yield { question: label, answer }
  }
}

async function parseAndPrint(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  const data = JSON.parse(raw)
  const messages = data?.messages ?? []

  let count = 0
  for (const qa of iterateQAPairs(messages)) {
    count++
    process.stdout.write(`Q: ${qa.question}\n`)
    process.stdout.write(`A: ${qa.answer}\n\n`)
  }

  if (count === 0) {
    console.error('Geen Q&A-paren gevonden in dit bestand.')
  }
}

function buildQAText(messages) {
  const lines = []
  for (const { question, answer } of iterateQAPairs(messages)) {
    lines.push(`Q: ${question}`)
    lines.push(`A: ${answer}`)
    lines.push('')
  }
  return lines.join('\n')
}

async function parseAndWrite(filePath, outDir) {
  const raw = await fs.readFile(filePath, 'utf8')
  const data = JSON.parse(raw)
  const messages = data?.messages ?? []
  const qaText = buildQAText(messages)

  const base = path.basename(filePath).replace(/\.json$/i, '')
  const outPath = path.join(outDir, `${base}.txt`)
  await fs.writeFile(outPath, qaText || 'Geen Q&A-paren gevonden in dit bestand.\n', 'utf8')
  return outPath
}

async function main() {
  try {
    const inputArg = process.argv[2]
    const defaultDirs = [
      path.resolve(projectRoot, 'run_output'),
      path.resolve(projectRoot, 'run-output'),
    ]

    let files = []
    if (!inputArg) {
      // No arg: collect from default run_output dirs
      for (const d of defaultDirs) {
        const found = await listIntakeJsons(d)
        files.push(...found)
      }
    } else {
      const abs = path.isAbsolute(inputArg) ? inputArg : path.resolve(process.cwd(), inputArg)
      try {
        const stat = await fs.stat(abs)
        if (stat.isDirectory()) {
          files = await listIntakeJsons(abs)
        } else {
          files = [abs]
        }
      } catch {
        // Treat as single file path that might not exist
        files = [abs]
      }
    }

    // Ensure output dir
    const outDir = path.resolve(projectRoot, 'parsed_output')
    await fs.mkdir(outDir, { recursive: true })

    if (files.length === 0) {
      console.error('Geen intake_*.json bestanden gevonden. Zocht in run_output/ en run-output/.')
      process.exitCode = 1
      return
    }

    let ok = 0
    for (const f of files) {
      try {
        const written = await parseAndWrite(f, outDir)
        ok++
  console.log(`Parsed -> ${path.relative(projectRoot, written)}`)
      } catch (e) {
        console.error(`Fout bij verwerken van ${f}:`, e?.message || e)
      }
    }
    console.log(`Klaar. ${ok}/${files.length} bestanden verwerkt naar ${path.relative(projectRoot, outDir)}/`)
  } catch (err) {
    console.error('Fout bij verwerken:', err?.message || err)
    process.exitCode = 1
  }
}

// Run only when executed directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
