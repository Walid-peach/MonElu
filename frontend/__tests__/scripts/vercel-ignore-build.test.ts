/**
 * @jest-environment node
 */
// Runs the real Vercel ignore script (#356) against a throwaway git repo shaped
// like this monorepo. Exit 0 means Vercel skips the deployment, 1 means it
// builds - a wrong 0 leaves production stale, so every uncertain case must be 1.
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const FRONTEND = path.resolve(__dirname, '../..')
const SCRIPT = path.join(FRONTEND, 'scripts/vercel-ignore-build.sh')

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

let repo: string

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, env: GIT_ENV }).toString().trim()
}

function commit(file: string, content: string): string {
  const full = path.join(repo, file)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, content)
  git('add', '-A')
  git('commit', '-q', '-m', `touch ${file}`)
  return git('rev-parse', 'HEAD')
}

function runIgnore(previousSha?: string): number {
  const env: NodeJS.ProcessEnv = { ...GIT_ENV }
  delete env.VERCEL_GIT_PREVIOUS_SHA
  if (previousSha !== undefined) env.VERCEL_GIT_PREVIOUS_SHA = previousSha
  const result = spawnSync('bash', ['scripts/vercel-ignore-build.sh'], {
    cwd: path.join(repo, 'frontend'),
    env,
  })
  return result.status ?? -1
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'vercel-ignore-'))
  git('init', '-q')
  mkdirSync(path.join(repo, 'frontend/scripts'), { recursive: true })
  copyFileSync(SCRIPT, path.join(repo, 'frontend/scripts/vercel-ignore-build.sh'))
  commit('frontend/src/page.tsx', 'v1')
})

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

describe('vercel-ignore-build.sh', () => {
  it('skips a commit confined to the backend', () => {
    commit('api/main.py', 'backend change')
    expect(runIgnore()).toBe(0)
  })

  it('skips docs, dbt, RAG and workflow changes', () => {
    commit('docs/decisions.md', 'x')
    commit('transform/models/m.sql', 'x')
    commit('rag/chain/rag_chain.py', 'x')
    commit('.github/workflows/ci.yml', 'x')
    expect(runIgnore(git('rev-parse', 'HEAD~4'))).toBe(0)
  })

  it('builds a commit that changes the frontend', () => {
    commit('frontend/src/page.tsx', 'v2')
    expect(runIgnore()).toBe(1)
  })

  it('builds when a mixed commit touches the frontend', () => {
    mkdirSync(path.join(repo, 'api'), { recursive: true })
    writeFileSync(path.join(repo, 'api/main.py'), 'x')
    writeFileSync(path.join(repo, 'frontend/src/page.tsx'), 'v2')
    git('add', '-A')
    git('commit', '-q', '-m', 'mixed')
    expect(runIgnore()).toBe(1)
  })

  it('builds when frontend/vercel.json itself changes', () => {
    commit('frontend/vercel.json', '{}')
    expect(runIgnore()).toBe(1)
  })

  it('compares against the last deployment, not only the parent commit', () => {
    const deployed = git('rev-parse', 'HEAD')
    commit('frontend/src/page.tsx', 'v2')
    commit('api/main.py', 'backend change')
    // HEAD^ alone would see a backend-only diff and wrongly skip.
    expect(runIgnore(deployed)).toBe(1)
  })

  it('falls back to the parent commit when the previous SHA is not in the clone', () => {
    commit('api/main.py', 'backend change')
    // A well-formed SHA that exists in no repository.
    expect(runIgnore('ab'.repeat(20))).toBe(0)
  })

  it('builds when there is no parent commit to compare against', () => {
    expect(runIgnore()).toBe(1)
  })
})

describe('vercel.json', () => {
  it('wires the ignore script in as the Ignored Build Step', () => {
    const config = JSON.parse(readFileSync(path.join(FRONTEND, 'vercel.json'), 'utf8'))
    expect(config.ignoreCommand).toBe('bash scripts/vercel-ignore-build.sh')
  })
})
