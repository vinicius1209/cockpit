import { describe, test, expect } from 'bun:test'
import { generateBranchName } from '../implement/implementation-runner'

describe('generateBranchName', () => {
  test('feature → feat/ prefix', () => {
    expect(generateBranchName('feature', 'Add login page')).toBe('feat/add-login-page')
  })

  test('bugfix → fix/ prefix', () => {
    expect(generateBranchName('bugfix', 'Fix print layout')).toBe('fix/fix-print-layout')
  })

  test('hotfix → hotfix/ prefix', () => {
    expect(generateBranchName('hotfix', 'Critical crash')).toBe('hotfix/critical-crash')
  })

  test('chore → chore/ prefix', () => {
    expect(generateBranchName('chore', 'Update deps')).toBe('chore/update-deps')
  })

  test('improvement → improve/ prefix', () => {
    expect(generateBranchName('improvement', 'Better UX')).toBe('improve/better-ux')
  })

  test('unknown type → feat/ prefix', () => {
    expect(generateBranchName('unknown', 'Something')).toBe('feat/something')
  })

  test('removes [sub-project] prefix', () => {
    expect(generateBranchName('bugfix', '[Prime] Fix quotation')).toBe('fix/fix-quotation')
  })

  test('removes special characters', () => {
    expect(generateBranchName('feature', 'Add login (v2) @new!')).toBe('feat/add-login-v2-new')
  })

  test('truncates to 50 chars', () => {
    const longTitle = 'This is a very long title that should be truncated at exactly fifty characters total'
    const result = generateBranchName('feature', longTitle)
    const slug = result.split('/')[1]
    expect(slug.length).toBeLessThanOrEqual(50)
  })

  test('removes trailing hyphen after truncation', () => {
    const title = 'Test with trailing hyphen at exactly the cutoff-'
    const result = generateBranchName('feature', title)
    expect(result.endsWith('-')).toBe(false)
  })
})
