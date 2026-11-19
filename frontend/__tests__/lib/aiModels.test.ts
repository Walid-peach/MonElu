import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EMBEDDING_MODEL, EMBEDDING_PROVIDER, LLM_MODEL } from '@/lib/aiModels'

const constants = readFileSync(join(__dirname, '..', '..', '..', 'rag', 'constants.py'), 'utf8')
const retriever = readFileSync(join(__dirname, '..', '..', '..', 'rag', 'chain', 'retriever.py'), 'utf8')

describe('the models the site names (#635)', () => {
  it('match the ones the API runs', () => {
    expect(constants).toContain(`LLM_MODEL = "${LLM_MODEL}"`)
    expect(constants).toContain(`EMBEDDING_MODEL = "${EMBEDDING_MODEL}"`)
  })

  it('name the provider that embeds a question (#708)', () => {
    expect(EMBEDDING_PROVIDER).toBe('OpenAI')
    expect(retriever).toContain('from openai import OpenAI')
    expect(retriever).toContain('embeddings.create(')
  })
})
