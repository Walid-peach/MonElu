import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EMBEDDING_MODEL, LLM_MODEL } from '@/lib/aiModels'

const constants = readFileSync(join(__dirname, '..', '..', '..', 'rag', 'constants.py'), 'utf8')

describe('the models the site names (#635)', () => {
  it('match the ones the API runs', () => {
    expect(constants).toContain(`LLM_MODEL = "${LLM_MODEL}"`)
    expect(constants).toContain(`EMBEDDING_MODEL = "${EMBEDDING_MODEL}"`)
  })
})
