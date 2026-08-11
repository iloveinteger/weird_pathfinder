import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('switches mode and manages waypoint inputs', () => {
    render(<App />)
    fireEvent.click(screen.getByText('Hard', { exact: false }))
    expect(screen.getByText('Hard 모드는 더 깊게 탐색합니다')).toBeInTheDocument()
    fireEvent.click(screen.getByText('＋ 경유지 추가'))
    expect(screen.getAllByLabelText(/경유지 \d$/)).toHaveLength(2)
    fireEvent.click(screen.getByLabelText('경유지 1 삭제'))
    expect(screen.getAllByLabelText(/경유지 \d$/)).toHaveLength(1)
  })
})
