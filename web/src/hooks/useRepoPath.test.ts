import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useRepoPath } from './useRepoPath'

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('useRepoPath', () => {
  it('returns empty string when localStorage is empty', () => {
    const { result } = renderHook(() => useRepoPath())
    expect(result.current[0]).toBe('')
  })

  it('loads initial value from localStorage', () => {
    localStorage.setItem('ameliso:repoPath', '/my/repo')
    const { result } = renderHook(() => useRepoPath())
    expect(result.current[0]).toBe('/my/repo')
  })

  it('updates state and localStorage on set', () => {
    const { result } = renderHook(() => useRepoPath())
    act(() => result.current[1]('/new/path'))
    expect(result.current[0]).toBe('/new/path')
    expect(localStorage.getItem('ameliso:repoPath')).toBe('/new/path')
  })
})
