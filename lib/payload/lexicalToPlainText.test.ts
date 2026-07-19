import { describe, expect, it } from 'vitest'
import { lexicalToPlainText } from './lexicalToPlainText'

describe('lexicalToPlainText', () => {
  it('concatenates text from nested children', () => {
    const root = {
      children: [
        { children: [{ text: 'Hello' }, { text: 'world' }] },
        { text: 'Second paragraph' },
      ],
    }
    expect(lexicalToPlainText(root)).toBe('Hello world Second paragraph')
  })

  it('returns an empty string for null or non-object input', () => {
    expect(lexicalToPlainText(null)).toBe('')
    expect(lexicalToPlainText(undefined)).toBe('')
    expect(lexicalToPlainText('not an object')).toBe('')
  })

  it('returns an empty string for a node with no text and no children', () => {
    expect(lexicalToPlainText({})).toBe('')
  })
})
