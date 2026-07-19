import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cleanEnv, configureEnvPassthrough } from '../env.js'

// ── cleanEnv ─────────────────────────────────────────────────────────────────

describe('cleanEnv', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    // Restore the original environment after each test
    process.env = { ...originalEnv }
    configureEnvPassthrough([])
  })

  it('returns an object (not null or undefined)', () => {
    const result = cleanEnv()
    expect(result).toBeDefined()
    expect(typeof result).toBe('object')
  })

  it('includes PATH when present in process.env', () => {
    process.env.PATH = '/usr/bin:/usr/local/bin'
    const result = cleanEnv()
    expect(result.PATH).toBe('/usr/bin:/usr/local/bin')
  })

  it('includes HOME when present in process.env', () => {
    process.env.HOME = '/Users/test'
    const result = cleanEnv()
    expect(result.HOME).toBe('/Users/test')
  })

  it('includes ANTHROPIC_API_KEY when present in process.env', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key'
    const result = cleanEnv()
    expect(result.ANTHROPIC_API_KEY).toBe('sk-test-key')
  })

  it('includes NODE_ENV when present in process.env', () => {
    process.env.NODE_ENV = 'test'
    const result = cleanEnv()
    expect(result.NODE_ENV).toBe('test')
  })

  it('excludes variables not on the allowlist', () => {
    process.env.SECRET_INTERNAL_VAR = 'should-not-appear'
    process.env.DATABASE_URL = 'postgres://localhost'
    process.env.AWS_SECRET_KEY = 'super-secret'

    const result = cleanEnv()

    expect(result.SECRET_INTERNAL_VAR).toBeUndefined()
    expect(result.DATABASE_URL).toBeUndefined()
    expect(result.AWS_SECRET_KEY).toBeUndefined()
  })

  it('omits allowlisted keys that are not in process.env', () => {
    // Remove OPENAI_API_KEY entirely if present
    delete process.env.OPENAI_API_KEY
    const result = cleanEnv()
    expect(result).not.toHaveProperty('OPENAI_API_KEY')
  })

  it('returns only allowlisted keys', () => {
    const allowlist = new Set([
      'PATH',
      'HOME',
      'LANG',
      'TERM',
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'OPENCODE_CONFIG',
      'OPENCODE_CONFIG_DIR',
      'GH_TOKEN',
      'GITHUB_TOKEN',
      'NODE_ENV',
      'SHELL',
      'USER',
      'TMPDIR',
    ])

    // Inject many extra env vars
    process.env.RANDOM_VAR_1 = 'x'
    process.env.RANDOM_VAR_2 = 'y'

    const result = cleanEnv()

    for (const key of Object.keys(result)) {
      expect(allowlist.has(key)).toBe(true)
    }
  })

  it('preserves the exact value without trimming or modification', () => {
    process.env.LANG = '  en_US.UTF-8  '
    const result = cleanEnv()
    expect(result.LANG).toBe('  en_US.UTF-8  ')
  })

  it('includes project-configured environment variables when present', () => {
    process.env.AWS_BEARER_TOKEN_BEDROCK = 'test-token'
    process.env.AWS_REGION = 'us-west-2'
    configureEnvPassthrough(['AWS_BEARER_TOKEN_BEDROCK', 'AWS_REGION'])

    expect(cleanEnv()).toMatchObject({
      AWS_BEARER_TOKEN_BEDROCK: 'test-token',
      AWS_REGION: 'us-west-2',
    })
  })

  it('does not include an environment variable until it is configured', () => {
    process.env.AWS_REGION = 'us-west-2'
    expect(cleanEnv().AWS_REGION).toBeUndefined()
  })

  it('replaces the configured passthrough list', () => {
    process.env.FIRST_VALUE = 'first'
    process.env.SECOND_VALUE = 'second'
    configureEnvPassthrough(['FIRST_VALUE'])
    configureEnvPassthrough(['SECOND_VALUE'])

    const result = cleanEnv()
    expect(result.FIRST_VALUE).toBeUndefined()
    expect(result.SECOND_VALUE).toBe('second')
  })

  it('ignores invalid configured names', () => {
    process.env.VALID_NAME = 'present'
    configureEnvPassthrough(['VALID_NAME', 'INVALID-NAME'])

    expect(cleanEnv().VALID_NAME).toBe('present')
    expect(cleanEnv()).not.toHaveProperty('INVALID-NAME')
  })
})
