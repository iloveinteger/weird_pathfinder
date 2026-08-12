import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockNetwork } from '../mock/network'
import { TimeDependentRouter } from '../routing/router'
import { TransitMap } from './TransitMap'

afterEach(() => { delete window.kakao })

describe('TransitMap provider boundary', () => {
  it('does not show mock map content when real mode is not configured', () => {
    render(<TransitMap mode="real" />)
    expect(screen.getByLabelText('실제 지도 사용 불가')).toBeInTheDocument()
    expect(screen.queryByLabelText('모형 지도')).not.toBeInTheDocument()
  })

  it('renders markers, route polylines and adjusted bounds through Kakao Maps', async () => {
    const marker = vi.fn()
    const polyline = vi.fn()
    const setBounds = vi.fn()
    const extend = vi.fn()
    class LatLng { constructor(readonly latitude: number, readonly longitude: number) {} }
    class LatLngBounds { extend = extend }
    class Map { setBounds = setBounds }
    class Marker { constructor(options: object) { marker(options) } }
    class Polyline { constructor(options: object) { polyline(options) } }
    window.kakao = { maps: { load: (callback) => callback(), LatLng, LatLngBounds, Map, Marker, Polyline } }
    const journey = new TimeDependentRouter(mockNetwork).findJourneys({ originId: 'gwanghwamun', destinationId: 'jamsil', departureTime: 540, mode: 'normal' })[0]
    const mappedJourney = { ...journey, segments: journey.segments.map((segment, index) => index === 0 ? { ...segment, path: [{ latitude: 37.57, longitude: 126.98 }, { latitude: 37.55, longitude: 126.99 }] } : segment) }

    render(<TransitMap mode="real" kakaoJavaScriptKey="public-test-key" journey={mappedJourney}
      origin={{ latitude: 37.57, longitude: 126.98 }}
      destination={{ latitude: 37.51, longitude: 127.10 }}
      waypoints={[{ latitude: 37.55, longitude: 126.99 }]} />)

    expect(await screen.findByLabelText('카카오 지도')).toBeInTheDocument()
    await waitFor(() => expect(marker).toHaveBeenCalledTimes(3))
    expect(polyline).toHaveBeenCalled()
    expect(extend).toHaveBeenCalled()
    expect(setBounds).toHaveBeenCalledOnce()
  })
})
