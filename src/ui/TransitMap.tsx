import { useEffect, useRef, useState } from 'react'
import type { Coordinate, Journey } from '../domain/models'

export interface TransitMapProps {
  journey?: Journey
  active?: boolean
  mode?: 'mock' | 'real'
  kakaoJavaScriptKey?: string
  origin?: Coordinate
  destination?: Coordinate
  waypoints?: Coordinate[]
}

interface KakaoMaps {
  load(callback: () => void): void
  LatLng: new (latitude: number, longitude: number) => unknown
  LatLngBounds: new () => { extend(point: unknown): void }
  Map: new (element: HTMLElement, options: object) => { setBounds(bounds: unknown): void }
  Marker: new (options: object) => unknown
  Polyline: new (options: object) => unknown
}

declare global { interface Window { kakao?: { maps: KakaoMaps } } }

export function TransitMap(props: TransitMapProps) {
  if (props.mode !== 'real') return <MockTransitMap journey={props.journey} active={props.active} />
  if (!props.kakaoJavaScriptKey) return <RealMapUnavailable active={props.active} reason="Kakao Maps 공개 키가 설정되지 않았습니다" />
  return <KakaoTransitMap {...props} kakaoJavaScriptKey={props.kakaoJavaScriptKey} />
}

function KakaoTransitMap({ journey, active = false, kakaoJavaScriptKey, origin, destination, waypoints = [] }: TransitMapProps & { kakaoJavaScriptKey: string }) {
  const elementRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadKakaoMaps(kakaoJavaScriptKey).then((maps) => {
      if (cancelled || !elementRef.current) return
      renderKakaoMap(maps, elementRef.current, journey, origin, destination, waypoints)
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [journey, kakaoJavaScriptKey, origin, destination, waypoints])

  if (failed) return <RealMapUnavailable active={active} reason="Kakao Maps SDK를 불러오지 못했습니다" />
  return <section className={`map-placeholder kakao-map-shell ${active ? 'active' : ''}`} aria-label="카카오 지도"><div ref={elementRef} className="kakao-map-canvas" /><div className="map-label">KAKAO MAPS <small>REAL PROVIDER</small></div></section>
}

function RealMapUnavailable({ active = false, reason }: { active?: boolean; reason: string }) {
  return <section className={`map-placeholder real-map-unavailable ${active ? 'active' : ''}`} aria-label="실제 지도 사용 불가">
    <div className="map-label">KAKAO MAPS <small>PROVIDER UNAVAILABLE</small></div>
    <div className="map-caption"><b>실제 지도를 표시할 수 없습니다</b><span>{reason}</span></div>
  </section>
}

let sdkPromise: Promise<KakaoMaps> | undefined
function loadKakaoMaps(key: string): Promise<KakaoMaps> {
  if (window.kakao?.maps) return new Promise((resolve) => window.kakao!.maps.load(() => resolve(window.kakao!.maps)))
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`
    script.async = true
    script.onload = () => window.kakao?.maps ? window.kakao.maps.load(() => resolve(window.kakao!.maps)) : reject(new Error('Kakao Maps SDK unavailable'))
    script.onerror = () => reject(new Error('Kakao Maps SDK unavailable'))
    document.head.appendChild(script)
  })
  return sdkPromise
}

function renderKakaoMap(maps: KakaoMaps, element: HTMLElement, journey?: Journey, origin?: Coordinate, destination?: Coordinate, waypoints: Coordinate[] = []) {
  const segmentPaths = journey?.segments.flatMap((segment) => segment.path?.length ? [{ segment, path: segment.path }] : []) ?? []
  const inferred = segmentPaths.flatMap(({ path }) => [path[0], path.at(-1)!])
  const markers = [origin ?? inferred[0], ...waypoints, destination ?? inferred.at(-1)].filter((item): item is Coordinate => Boolean(item))
  const center = markers[0] ?? { latitude: 37.5665, longitude: 126.978 }
  const map = new maps.Map(element, { center: new maps.LatLng(center.latitude, center.longitude), level: 5 })
  const bounds = new maps.LatLngBounds()
  markers.forEach((coordinate) => { const position = new maps.LatLng(coordinate.latitude, coordinate.longitude); bounds.extend(position); new maps.Marker({ map, position }) })
  segmentPaths.forEach(({ segment, path }) => {
    const line = path.map((coordinate) => { const point = new maps.LatLng(coordinate.latitude, coordinate.longitude); bounds.extend(point); return point })
    new maps.Polyline({ map, path: line, strokeWeight: segment.type === 'walk' ? 4 : 6, strokeColor: segment.type === 'walk' ? '#f59e0b' : segment.mode === 'bus' ? '#3471ce' : '#21a368', strokeOpacity: 0.9, strokeStyle: segment.type === 'walk' ? 'shortdash' : 'solid' })
  })
  if (markers.length || segmentPaths.length) map.setBounds(bounds)
}

function MockTransitMap({ journey, active = false }: Pick<TransitMapProps, 'journey' | 'active'>) {
  const transitCount = journey?.segments.filter((segment) => segment.type === 'transit').length ?? 0
  return (
    <section className={`map-placeholder ${active ? 'active' : ''}`} aria-label="모형 지도">
      <div className="map-label">MAP PLACEHOLDER <small>KAKAO MAPS ADAPTER POINT</small></div>
      <div className="map-controls"><button aria-label="지도 확대">＋</button><button aria-label="지도 축소">−</button></div>
      <div className="mock-route"><i /><i /><i /></div>
      <div className="map-caption"><b>{journey ? `${transitCount}개 교통 구간 표시 중` : '광화문 → 서울역 → 잠실'}</b><span>{active ? '현재 위치는 모형으로 표시됩니다.' : '버스 · 도보 환승 · 지하철'}</span></div>
    </section>
  )
}
