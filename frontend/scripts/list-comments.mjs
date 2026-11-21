#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const kindFor = (path) => {
  if (path.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (path.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (path.endsWith('.ts')) return ts.ScriptKind.TS
  return ts.ScriptKind.JS
}

const result = {}
for (const path of process.argv.slice(2)) {
  const text = readFileSync(path, 'utf8')
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kindFor(path))
  const seen = new Map()
  const collect = (ranges) => {
    for (const range of ranges ?? []) {
      if (!seen.has(range.pos)) seen.set(range.pos, range)
    }
  }
  const visit = (node) => {
    collect(ts.getLeadingCommentRanges(text, node.pos))
    collect(ts.getTrailingCommentRanges(text, node.end))
    for (const child of node.getChildren(source)) visit(child)
  }
  visit(source)
  result[path] = [...seen.values()]
    .sort((a, b) => a.pos - b.pos)
    .map((range) => ({
      line: source.getLineAndCharacterOfPosition(range.pos).line + 1,
      text: text.slice(range.pos, range.end),
    }))
}
process.stdout.write(JSON.stringify(result))
