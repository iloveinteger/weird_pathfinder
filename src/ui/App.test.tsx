import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CoreTransitPlanner } from '../application/transitPlanner'
import { mockNetwork } from '../mock/network'
import { MockPlaceProvider } from '../mock/providers'
import { TimeDependentRouter } from '../routing/router'
import { App } from './App'

const createPlanner = () => new CoreTransitPlanner(
  new MockPlaceProvider(),
  new TimeDependentRouter(mockNetwork),
  mockNetwork.points,
)

async function renderReadyApp() {
  render(<App planner={createPlanner()} />)
  await screen.findByText('Mock 시간표 준비 완료')
}

async function searchHardRoute() {
  await renderReadyApp()
  fireEvent.click(screen.getByRole('button', { name: /경로 찾기/ }))
  await screen.findByLabelText('경로 상세')
}

describe('App planner', () => {
  afterEach(() => vi.useRealTimers())

  it('uses the current local time for real mode and refreshes it for now departure', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 13, 14, 27))
    render(<App planner={createPlanner()} mapMode="real" />)
    const departure = screen.getByLabelText('출발 시간')
    expect(departure).toHaveValue('14:27')
    fireEvent.change(departure, { target: { value: '10:00' } })
    vi.setSystemTime(new Date(2026, 7, 13, 14, 29))
    fireEvent.click(screen.getByRole('button', { name: '지금 출발' }))
    expect(departure).toHaveValue('14:29')
  })

  it('selects places through the injected mock provider', async () => {
    await renderReadyApp()
    const origin = screen.getByLabelText('출발지')
    fireEvent.change(origin, { target: { value: '서울역' } })
    const suggestion = (await screen.findByText('서울역', { selector: '.suggestions b' })).closest('button')!
    fireEvent.click(suggestion)
    expect(origin).toHaveValue('서울역')
  })

  it('debounces free-form regional searches to the latest keyword', async () => {
    const planner = createPlanner()
    const searchPlaces = vi.spyOn(planner, 'searchPlaces')
    render(<App planner={planner} />)
    await screen.findByText('Mock 시간표 준비 완료')
    searchPlaces.mockClear()
    const origin = screen.getByLabelText('출발지')
    fireEvent.change(origin, { target: { value: '서' } })
    fireEvent.change(origin, { target: { value: '서울역' } })
    await screen.findByText('서울역', { selector: '.suggestions b' })
    expect(searchPlaces).toHaveBeenCalledTimes(1)
    expect(searchPlaces).toHaveBeenCalledWith('서울역')
  })

  it('adds, reorders and removes multiple waypoints', async () => {
    await renderReadyApp()
    const add = screen.getByRole('button', { name: '＋ 경유지 추가' })
    fireEvent.click(add)
    fireEvent.click(add)
    const inputs = screen.getAllByLabelText(/경유지 \d$/)
    fireEvent.change(inputs[0], { target: { value: '첫 경유지' } })
    fireEvent.change(inputs[1], { target: { value: '둘 경유지' } })
    fireEvent.click(screen.getByLabelText('경유지 2 위로'))
    expect(screen.getAllByLabelText(/경유지 \d$/).map((input) => (input as HTMLInputElement).value)).toEqual(['둘 경유지', '첫 경유지'])
    fireEvent.click(screen.getByLabelText('경유지 1 삭제'))
    fireEvent.click(screen.getByLabelText('경유지 1 삭제'))
    expect(screen.queryAllByLabelText(/경유지 \d$/)).toHaveLength(0)
  })

  it('synchronizes waypoint dwell and departure times', async () => {
    await renderReadyApp()
    fireEvent.click(screen.getByRole('button', { name: '＋ 경유지 추가' }))
    const dwell = screen.getByLabelText('경유지 1 체류시간')
    const departure = screen.getByLabelText('경유지 1 출발시간') as HTMLInputElement
    fireEvent.change(dwell, { target: { value: '15' } })
    expect(departure.value).toBe('09:35')
    fireEvent.change(departure, { target: { value: '09:40' } })
    expect((dwell as HTMLInputElement).value).toBe('20')
  })

  it('routes through a selected waypoint and updates its arrival', async () => {
    await renderReadyApp()
    fireEvent.click(screen.getByRole('button', { name: '＋ 경유지 추가' }))
    const waypoint = screen.getByLabelText('경유지 1')
    fireEvent.change(waypoint, { target: { value: '서울역' } })
    fireEvent.click((await screen.findByText('서울역', { selector: '.suggestions b' })).closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: /경로 찾기/ }))
    await screen.findByLabelText('경로 상세')
    expect(within(screen.getByTestId('waypoint-1')).getByText('09:13')).toBeInTheDocument()
  })

  it('changes among all four routing modes', async () => {
    await renderReadyApp()
    for (const mode of ['최소 환승', '최소 도보', '최소 시간', '최소 시간 Hard']) {
      const button = screen.getByText(mode, { selector: '.mode-grid b' }).closest('button')!
      fireEvent.click(button)
      expect(button).toHaveAttribute('aria-pressed', 'true')
    }
  })

  it('renders only ETA-changing Hard timing variants', async () => {
    await searchHardRoute()
    const branches = screen.getByLabelText('환승 timing variants')
    expect(within(branches).getByText('Fast')).toBeInTheDocument()
    expect(within(branches).getByText('Standard')).toBeInTheDocument()
    expect(within(branches).getByText('Relaxed')).toBeInTheDocument()
    expect(within(branches).getByText(/09:13 탑승/)).toBeInTheDocument()
  })

  it('updates the final ETA when a timing branch is selected', async () => {
    await searchHardRoute()
    const detail = screen.getByLabelText('경로 상세')
    expect(within(detail).getByText('09:35 도착')).toBeInTheDocument()
    fireEvent.click(within(screen.getByLabelText('환승 timing variants')).getByText('Standard'))
    await waitFor(() => expect(within(detail).getByText('09:37 도착')).toBeInTheDocument())
  })

  it('lets the rider choose a vehicle and changes Active Trip ETA', async () => {
    await searchHardRoute()
    fireEvent.click(screen.getByRole('button', { name: /이 경로로 출발/ }))
    expect(screen.getByText('ACTIVE TRIP')).toBeInTheDocument()
    expect(screen.getByLabelText('다음 차량 출발 countdown')).toHaveTextContent(/^\d+분 \d{2}초$/)
    fireEvent.click(screen.getByRole('button', { name: /09:15 열차 탑승/ }))
    expect(screen.getByText('09:37', { selector: '.eta-card b' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /다른 차량/ }))
    expect(screen.getByText('09:40', { selector: '.eta-card b' })).toBeInTheDocument()
  })

  it('renders the merged downstream segment only once', async () => {
    await searchHardRoute()
    const detail = screen.getByLabelText('경로 상세')
    fireEvent.click(within(screen.getByLabelText('환승 timing variants')).getByText('Standard'))
    expect(within(detail).getAllByText('잠실역 도착')).toHaveLength(1)
  })
})
