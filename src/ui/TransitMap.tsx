import type { Journey } from '../domain/models'

export interface TransitMapProps {
  journey?: Journey
  active?: boolean
}

/** UI-only seam for a future Kakao Maps SDK adapter. */
export function TransitMap({ journey, active = false }: TransitMapProps) {
  const transitCount = journey?.segments.filter((segment) => segment.type === 'transit').length ?? 0
  return (
    <section className={`map-placeholder ${active ? 'active' : ''}`} aria-label="목업 지도">
      <div className="map-label">MAP PLACEHOLDER <small>KAKAO MAPS ADAPTER POINT</small></div>
      <div className="map-controls"><button aria-label="지도 확대">＋</button><button aria-label="지도 축소">−</button></div>
      <div className="mock-route"><i /><i /><i /></div>
      <div className="map-caption">
        <b>{journey ? `${transitCount}개 교통 구간 표시 중` : '광화문 → 서울역 → 잠실역'}</b>
        <span>{active ? '현재 위치는 목업으로 표시됩니다' : '버스 · 도보 환승 · 지하철'}</span>
      </div>
    </section>
  )
}
