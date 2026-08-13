import { useEffect, useRef, useState } from 'react'
import type { Journey, PlaceSearchResult, TransferPace } from '../domain/models'
import { formatClock, parseClock } from '../domain/time'
import { resolveWaypointTiming } from '../waypoints/plan'
import type { PlannedRoute, PlannerMode, TransitPlanner } from '../application/transitPlanner'
import type { TimingVariant } from '../routing/hard/types'
import { TransitMap } from './TransitMap'

interface EditableWaypoint {
  id: string
  place?: PlaceSearchResult
  query: string
  arrivalTime: number
  dwellMinutes: number
  departureTime: number
}

interface AppProps { planner: TransitPlanner; mapMode?: 'mock' | 'real'; kakaoJavaScriptKey?: string }

const modes: Array<{ id: PlannerMode; label: string; hint: string }> = [
  { id: 'transfers', label: '최소 환승', hint: '갈아타는 횟수 우선' },
  { id: 'walking', label: '최소 도보', hint: '걷는 거리 우선' },
  { id: 'time', label: '최소 시간', hint: '일반 환승 기준' },
  { id: 'hard', label: '최소 시간 Hard', hint: '빠른 환승까지 탐색' },
]

export function App({ planner, mapMode = 'mock', kakaoJavaScriptKey }: AppProps) {
  const [origin, setOrigin] = useState<PlaceSearchResult>()
  const [destination, setDestination] = useState<PlaceSearchResult>()
  const [waypoints, setWaypoints] = useState<EditableWaypoint[]>([])
  const [departureClock, setDepartureClock] = useState(() => mapMode === 'real' ? currentClock() : '09:00')
  const [mode, setMode] = useState<PlannerMode>('hard')
  const [routes, setRoutes] = useState<PlannedRoute[]>([])
  const [selectedRoute, setSelectedRoute] = useState<PlannedRoute>()
  const [selectedVariant, setSelectedVariant] = useState<TimingVariant>()
  const [activeTrip, setActiveTrip] = useState(false)
  const [status, setStatus] = useState('출발지와 목적지를 확인해 주세요')

  useEffect(() => {
    void planner.searchPlaces('').then((places) => {
      setOrigin(places.find((place) => place.id === 'gwanghwamun') ?? places[0])
      setDestination(places.find((place) => place.id === 'jamsil') ?? places.at(-1))
      setStatus(mapMode === 'real' ? 'Real provider 준비 완료' : 'Mock 시간표 준비 완료')
    }).catch((error: unknown) => setStatus(providerFailureMessage(error)))
  }, [planner, mapMode])

  const chooseRoute = (route: PlannedRoute) => {
    setSelectedRoute(route)
    setSelectedVariant(route.variants[0])
    setActiveTrip(false)
  }

  const search = async () => {
    if (!origin || !destination || waypoints.some((waypoint) => !waypoint.place)) {
      setStatus('모든 장소를 검색 결과에서 선택해 주세요')
      return
    }
    setStatus('시간표를 탐색하고 있습니다…')
    let found: PlannedRoute[]
    try {
      found = await planner.findRoutes({
        originId: origin.id,
        destinationId: destination.id,
        departureTime: parseClock(departureClock),
        waypoints: waypoints.map((waypoint) => ({ id: waypoint.id, placeId: waypoint.place!.id, name: waypoint.place!.name, dwellMinutes: waypoint.dwellMinutes })),
        mode,
      })
    } catch (error: unknown) {
      setStatus(providerFailureMessage(error))
      return
    }
    setRoutes(found)
    if (found[0]) {
      chooseRoute(found[0])
      setWaypoints((items) => items.map((item, index) => {
        const arrivalTime = found[0].waypointArrivals[index] ?? item.arrivalTime
        return { ...item, ...resolveWaypointTiming({ arrivalTime, dwellMinutes: item.dwellMinutes }) }
      }))
      setStatus(`${found.length}개 경로를 찾았습니다`)
    } else {
      setSelectedRoute(undefined)
      setSelectedVariant(undefined)
      setStatus(mapMode === 'real' ? '현재 실데이터에서 가능한 경로가 없습니다' : '현재 mock 시간표에서는 가능한 경로가 없습니다')
    }
  }

  if (activeTrip && selectedRoute && selectedVariant) {
    return <ActiveTrip planner={planner} route={selectedRoute} variant={selectedVariant} mapMode={mapMode} kakaoJavaScriptKey={kakaoJavaScriptKey} onVariantChange={setSelectedVariant} onBack={() => setActiveTrip(false)} />
  }

  return (
    <main className="app-shell">
      <Header mode={mapMode} />
      <div className="workspace">
        <div className="content-column">
          <section className="planner-panel" aria-label="경로 검색">
            <div className="panel-heading">
              <div><span className="kicker">ROUTE PLANNER</span><h1>어디로 갈까요?</h1></div>
              <button className="now-button" onClick={() => setDepartureClock(currentClock())}>지금 출발</button>
            </div>
            <div className="place-stack">
              <PlaceField label="출발" ariaLabel="출발지" marker="origin" value={origin} planner={planner} onSelect={setOrigin} onFailure={(error) => setStatus(providerFailureMessage(error))} />
              {waypoints.map((waypoint, index) => <WaypointField key={waypoint.id} waypoint={waypoint} index={index} planner={planner}
                onChange={(next) => setWaypoints((items) => items.map((item) => item.id === next.id ? next : item))}
                onRemove={() => setWaypoints((items) => items.filter((item) => item.id !== waypoint.id))}
                onMove={(direction) => setWaypoints((items) => moveItem(items, index, index + direction))}
                onFailure={(error) => setStatus(providerFailureMessage(error))} />)}
              <PlaceField label="도착" ariaLabel="도착지" marker="destination" value={destination} planner={planner} onSelect={setDestination} onFailure={(error) => setStatus(providerFailureMessage(error))} />
            </div>
            <button className="add-waypoint" onClick={() => setWaypoints((items) => [...items, newWaypoint(items.length, parseClock(departureClock))])}>＋ 경유지 추가</button>
            <div className="time-row"><label>출발 시간<input aria-label="출발 시간" type="time" value={departureClock} onChange={(event) => setDepartureClock(event.target.value)} /></label></div>
            <div className="mode-grid" aria-label="탐색 모드">{modes.map((item) => <button key={item.id} className={mode === item.id ? `active ${item.id}` : ''} aria-pressed={mode === item.id} onClick={() => setMode(item.id)}><b>{item.label}</b><small>{item.hint}</small></button>)}</div>
            <button className={`primary-action ${mode === 'hard' ? 'hard' : ''}`} onClick={() => void search()}>경로 찾기 <span>→</span></button>
            <p className="search-status" role="status">{status}</p>
          </section>

          {routes.length > 0 && <section className="results-section" aria-label="경로 목록">
            <div className="section-title"><div><span className="kicker">ROUTE OPTIONS</span><h2>추천 경로</h2></div><span>{routes.length}개</span></div>
            <div className="route-list">{routes.map((route, index) => <RouteCard key={route.id} route={route} rank={index + 1} selected={selectedRoute?.id === route.id} onSelect={() => chooseRoute(route)} />)}</div>
          </section>}

          {selectedRoute && selectedVariant && <RouteDetail planner={planner} route={selectedRoute} variant={selectedVariant} onVariantChange={setSelectedVariant} onStart={() => setActiveTrip(true)} />}
        </div>
        <TransitMap journey={selectedVariant?.journey} origin={origin?.coordinate} destination={destination?.coordinate} waypoints={waypoints.flatMap((waypoint) => waypoint.place ? [waypoint.place.coordinate] : [])} mode={mapMode} kakaoJavaScriptKey={kakaoJavaScriptKey} />
      </div>
    </main>
  )
}

function Header({ mode = 'mock' }: { mode?: 'mock' | 'real' }) {
  return <header className="topbar"><a className="brand" href="#">샛길 <span>WEIRD PATHFINDER</span></a><span className="mock-badge">{mode === 'real' ? 'REAL PROVIDERS' : 'MOCK NETWORK · 2026.08.12'}</span></header>
}

function PlaceField({ label, ariaLabel, marker, value, planner, onSelect, onFailure }: { label: string; ariaLabel: string; marker: string; value?: PlaceSearchResult; planner: TransitPlanner; onSelect: (place: PlaceSearchResult | undefined) => void; onFailure: (error: unknown) => void }) {
  const [query, setQuery] = useState(value?.name ?? '')
  const search = usePlaceSuggestions(planner, onFailure)
  useEffect(() => { if (value) setQuery(value.name) }, [value])
  const change = (next: string) => { setQuery(next); onSelect(undefined); search.load(next) }
  return <label className="place-field"><span className={`place-dot ${marker}`} /><small>{label}</small><input aria-label={ariaLabel} value={query} onFocus={() => search.load(query, true)} onChange={(event) => change(event.target.value)} autoComplete="off" />
    <PlaceSuggestions query={query} search={search} onSelect={(place) => { onSelect(place); setQuery(place.name); search.clear() }} />
  </label>
}

function WaypointField({ waypoint, index, planner, onChange, onRemove, onMove, onFailure }: { waypoint: EditableWaypoint; index: number; planner: TransitPlanner; onChange: (waypoint: EditableWaypoint) => void; onRemove: () => void; onMove: (direction: -1 | 1) => void; onFailure: (error: unknown) => void }) {
  const suggestions = usePlaceSuggestions(planner, onFailure)
  const search = (query: string) => { onChange({ ...waypoint, query, place: undefined }); suggestions.load(query) }
  const setDwell = (dwellMinutes: number) => onChange({ ...waypoint, ...resolveWaypointTiming({ arrivalTime: waypoint.arrivalTime, dwellMinutes: Math.max(0, dwellMinutes) }) })
  const setDeparture = (departureTime: number) => {
    if (departureTime < waypoint.arrivalTime) return
    onChange({ ...waypoint, ...resolveWaypointTiming({ arrivalTime: waypoint.arrivalTime, departureTime }) })
  }
  return <div className="waypoint-block" data-testid={`waypoint-${index + 1}`}>
    <label className="place-field"><span className="place-dot waypoint" /><small>경유 {index + 1}</small><input aria-label={`경유지 ${index + 1}`} value={waypoint.query} onFocus={() => suggestions.load(waypoint.query, true)} onChange={(event) => search(event.target.value)} autoComplete="off" />
      <span className="waypoint-actions"><button aria-label={`경유지 ${index + 1} 위로`} disabled={index === 0} onClick={() => onMove(-1)}>↑</button><button aria-label={`경유지 ${index + 1} 아래로`} onClick={() => onMove(1)}>↓</button><button aria-label={`경유지 ${index + 1} 삭제`} onClick={onRemove}>×</button></span>
      <PlaceSuggestions query={waypoint.query} search={suggestions} onSelect={(place) => { onChange({ ...waypoint, place, query: place.name }); suggestions.clear() }} />
    </label>
    <div className="waypoint-timing"><span>예상 도착 <b>{formatClock(waypoint.arrivalTime)}</b></span><label>체류 <input aria-label={`경유지 ${index + 1} 체류시간`} type="number" min="0" value={waypoint.dwellMinutes} onChange={(event) => setDwell(Number(event.target.value))} />분</label><label>출발 <input aria-label={`경유지 ${index + 1} 출발시간`} type="time" value={formatClock(waypoint.departureTime)} onChange={(event) => setDeparture(parseClock(event.target.value))} /></label></div>
  </div>
}

interface PlaceSuggestionState {
  suggestions: PlaceSearchResult[]
  status: 'idle' | 'loading' | 'ready' | 'empty'
  load(query: string, immediate?: boolean): void
  clear(): void
}

function usePlaceSuggestions(planner: TransitPlanner, onFailure: (error: unknown) => void): PlaceSuggestionState {
  const [suggestions, setSuggestions] = useState<PlaceSearchResult[]>([])
  const [status, setStatus] = useState<PlaceSuggestionState['status']>('idle')
  const timer = useRef<number | undefined>(undefined)
  const request = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const clear = () => {
    window.clearTimeout(timer.current)
    request.current += 1
    setSuggestions([])
    setStatus('idle')
  }
  const load = (query: string, immediate = false) => {
    window.clearTimeout(timer.current)
    const keyword = query.trim()
    const sequence = ++request.current
    if (!keyword) { setSuggestions([]); setStatus('idle'); return }
    setStatus('loading')
    const run = () => { void planner.searchPlaces(keyword).then((places) => {
      if (sequence !== request.current) return
      setSuggestions(places)
      setStatus(places.length ? 'ready' : 'empty')
    }).catch((error: unknown) => {
      if (sequence !== request.current) return
      setSuggestions([]); setStatus('idle'); onFailure(error)
    }) }
    if (immediate) run(); else timer.current = window.setTimeout(run, 250)
  }
  return { suggestions, status, load, clear }
}

function PlaceSuggestions({ query, search, onSelect }: { query: string; search: PlaceSuggestionState; onSelect: (place: PlaceSearchResult) => void }) {
  if (!query.trim() || search.status === 'idle') return null
  return <span className="suggestions" role="listbox" aria-label={`${query} 장소 검색 결과`}>
    {search.status === 'loading' && <span className="suggestion-message">검색 중…</span>}
    {search.status === 'empty' && <span className="suggestion-message">검색 결과가 없습니다</span>}
    {search.suggestions.map((place) => <button type="button" role="option" key={place.id} onClick={() => onSelect(place)}><b>{place.name}</b><small>{place.address}</small></button>)}
  </span>
}

function RouteCard({ route, rank, selected, onSelect }: { route: PlannedRoute; rank: number; selected: boolean; onSelect: () => void }) {
  const variant = route.variants[0]
  const journey = variant.journey
  const walkMinutes = journey.segments.filter((segment) => segment.type === 'walk').reduce((sum, segment) => sum + segment.durationMinutes, 0)
  return <button className={`route-card ${route.hard ? 'hard' : ''} ${selected ? 'selected' : ''}`} onClick={onSelect} aria-expanded={selected}>
    <span className="route-rank">{route.hard ? 'HARD' : `${rank}`}</span><span className="route-main"><b>{durationLabel(journey.departureTime, variant.arrivalTime)}</b><small>{formatClock(variant.arrivalTime)} 도착</small></span>
    <span className="route-metrics"><span>환승 {journey.transferCount}회</span><span>도보 {walkMinutes}분 · {distanceLabel(journey.walkingDistanceMeters)}</span></span>
    {route.hard && <span className="hard-summary"><span>최단 가능 <b>{durationLabel(journey.departureTime, route.bestPossibleArrival)}</b></span><span>일반 이동 <b>{route.standardWalkingArrival ? durationLabel(journey.departureTime, route.standardWalkingArrival) : '—'}</b></span><span>빠른 환승 <b>{route.aggressiveTransferCount}회</b></span></span>}
  </button>
}

function RouteDetail({ planner, route, variant, onVariantChange, onStart }: { planner: TransitPlanner; route: PlannedRoute; variant: TimingVariant; onVariantChange: (variant: TimingVariant) => void; onStart: () => void }) {
  const paceVariants = meaningfulPaceVariants(route.variants)
  return <section className={`route-detail ${route.hard ? 'hard' : ''}`} aria-label="경로 상세">
    <div className="section-title"><div><span className="kicker">ROUTE DETAIL</span><h2>이동 상세</h2></div><b>{formatClock(variant.arrivalTime)} 도착</b></div>
    {paceVariants.length > 1 && <div className="timing-branches" aria-label="환승 timing variants"><div className="branch-heading"><b>서울역 환승 선택</b><small>최종 도착이 달라지는 분기만 표시합니다</small></div>{paceVariants.map((item) => {
      const choice = item.transferChoices[0]
      const pace = variantPace(item)
      return <button key={item.id} className={item.id === variant.id ? 'selected' : ''} onClick={() => onVariantChange(item)}><span className={`pace ${pace}`}>{paceLabel(pace)}</span><b>{choice ? `${choice.requiredMinutes}분 이내` : transferWalkDuration(item)} → {choice ? formatClock(choice.vehicleDepartureTime) : nextTransitClock(item)} 탑승</b><small>최종 {durationLabel(item.journey.departureTime, item.arrivalTime)}</small></button>
    })}</div>}
    {route.hard && <HardTransferDifficulty variant={variant} planner={planner} />}
    <ol className="segment-list">{variant.journey.segments.map((segment, index) => <li key={`${segment.type}-${index}`} className={segment.type === 'walk' ? 'walk' : segment.mode}>
      <span className="segment-icon">{segment.type === 'walk' ? (segment.purpose === 'transfer' ? '↗' : '●') : segment.mode === 'bus' ? 'B' : 'M'}</span>
      <div><small>{formatClock(segment.departureTime)} → {formatClock(segment.arrivalTime)}</small><b>{segmentTitle(segment, planner)}</b><span>{segment.type === 'walk' ? `${segment.durationMinutes}분 · ${distanceLabel(segment.distanceMeters)}${segment.purpose === 'transfer' ? ` · ${paceLabel(segment.pace)} 환승` : ''}` : `${planner.pointName(segment.toStopId)} 도착`}</span></div>
    </li>)}</ol>
    <button className={`primary-action ${route.hard ? 'hard' : ''}`} onClick={onStart}>이 경로로 출발 <span>→</span></button>
  </section>
}

function HardTransferDifficulty({ variant, planner }: { variant: TimingVariant; planner: TransitPlanner }) {
  return <section className="hard-transfer-guide" aria-label="Hard 환승 난이도">
    <div className="branch-heading"><b>환승 난이도</b><small>환승 통로 이동 속도와 다음 차량 대기시간 기준</small></div>
    {variant.transferChoices.length === 0
      ? <p>환승 없는 경로입니다.</p>
      : variant.transferChoices.map((choice, index) => {
        const waitMinutes = Math.max(0, choice.vehicleDepartureTime - choice.readyTime)
        const savedMinutes = Math.max(0, choice.standardMinutes - choice.requiredMinutes)
        const difficulty = choice.pace === 'fast' || waitMinutes <= 1 ? '매우 촉박' : waitMinutes <= 3 ? '촉박' : waitMinutes <= 6 ? '보통' : '여유'
        return <div className={`transfer-difficulty ${choice.pace}`} key={choice.id}>
          <span><b>{index + 1}. {planner.pointName(choice.atStopId)}</b><em>{difficulty}</em></span>
          <small>{choice.requiredMinutes}분 안에 환승 이동 · 이동 후 {waitMinutes}분 대기 · {formatClock(choice.vehicleDepartureTime)} 탑승{savedMinutes ? ` · 평소보다 ${savedMinutes}분 빠르게 이동 필요` : ''}</small>
        </div>
      })}
  </section>
}

function ActiveTrip({ planner, route, variant, mapMode, kakaoJavaScriptKey, onVariantChange, onBack }: { planner: TransitPlanner; route: PlannedRoute; variant: TimingVariant; mapMode: 'mock' | 'real'; kakaoJavaScriptKey?: string; onVariantChange: (variant: TimingVariant) => void; onBack: () => void }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  useEffect(() => { const timer = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1000); return () => window.clearInterval(timer) }, [])
  const transitSegments = variant.journey.segments.filter((segment) => segment.type === 'transit')
  const current = transitSegments[0]
  const upcoming = transitSegments[1] ?? current
  const vehicleVariants = uniqueVehicleVariants(route.variants)
  const countdown = Math.max(0, upcoming.departureTime * 60 - variant.journey.departureTime * 60 - elapsedSeconds)
  return <main className="app-shell active-shell"><Header mode={mapMode} /><div className="active-workspace"><section className="active-panel">
    <button className="back-button" onClick={onBack}>← 경로 상세</button><span className="live-badge"><i /> ACTIVE TRIP</span>
    <div className="active-hero"><span>{current?.mode === 'subway' ? '지하철' : '버스'}</span><h1>{current ? transitLabel(planner.pointName(current.routeId), current.mode) : '도보 이동'}</h1><p>현재 이용 중인 교통수단</p></div>
    <div className="progress-track"><i /><i className="future" /><i className="future" /></div>
    <div className="active-grid"><div><small>현재 단계</small><b>1 / {variant.journey.segments.length}</b></div><div><small>다음 목표</small><b>{upcoming ? `${planner.pointName(upcoming.fromStopId)} 탑승` : '목적지 도착'}</b></div></div>
    <div className="countdown-card"><small>다음 차량 출발까지</small><b aria-label="다음 차량 출발 countdown">{countdownLabel(countdown)}</b><span>{upcoming ? `${formatClock(upcoming.departureTime)} 출발 예정` : '도착 예정'}</span></div>
    <div className="vehicle-choice"><div><b>실제 탑승 차량을 선택하세요</b><small>GPS로 자동 확정하지 않습니다</small></div>{vehicleVariants.slice(0, 2).map((item) => {
      const vehicle = item.journey.segments.filter((segment) => segment.type === 'transit')[1] ?? item.journey.segments.find((segment) => segment.type === 'transit')
      return vehicle && <button key={item.id} aria-pressed={item.id === variant.id} onClick={() => onVariantChange(item)}>{formatClock(vehicle.departureTime)} {vehicle.mode === 'subway' ? '열차' : '버스'} 탑승 <span>ETA {formatClock(item.arrivalTime)}</span></button>
    })}<button aria-pressed={vehicleVariants.at(-1)?.id === variant.id} onClick={() => vehicleVariants.at(-1) && onVariantChange(vehicleVariants.at(-1)!)}>다른 차량 <span>{vehicleVariants.at(-1) ? `ETA ${formatClock(vehicleVariants.at(-1)!.arrivalTime)}` : '직접 선택'}</span></button></div>
    <div className="eta-card"><small>현재 예상 최종 도착시간</small><b>{formatClock(variant.arrivalTime)}</b><span>총 {durationLabel(variant.journey.departureTime, variant.arrivalTime)}</span></div>
  </section><TransitMap journey={variant.journey} active mode={mapMode} kakaoJavaScriptKey={kakaoJavaScriptKey} /></div></main>
}

function newWaypoint(index: number, departureTime: number): EditableWaypoint {
  const arrivalTime = departureTime + 20 + index * 10
  return { id: `waypoint-${Date.now()}-${index}`, query: '', arrivalTime, dwellMinutes: 0, departureTime: arrivalTime }
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items
  const copy = [...items]; const [item] = copy.splice(from, 1); copy.splice(to, 0, item); return copy
}

function meaningfulPaceVariants(variants: TimingVariant[]): TimingVariant[] {
  const byPace = new Map<TransferPace, TimingVariant>()
  for (const variant of variants) {
    const pace = variantPace(variant)
    const current = byPace.get(pace)
    if (!current || variant.arrivalTime < current.arrivalTime) byPace.set(pace, variant)
  }
  const ordered = (['fast', 'standard', 'relaxed'] as TransferPace[]).flatMap((pace) => byPace.get(pace) ? [byPace.get(pace)!] : [])
  return new Set(ordered.map((variant) => variant.arrivalTime)).size > 1 ? ordered : []
}

function uniqueVehicleVariants(variants: TimingVariant[]): TimingVariant[] {
  const seen = new Set<number>()
  return variants.filter((variant) => {
    const transit = variant.journey.segments.filter((segment) => segment.type === 'transit')[1] ?? variant.journey.segments.find((segment) => segment.type === 'transit')
    if (!transit || seen.has(transit.departureTime)) return false
    seen.add(transit.departureTime); return true
  }).sort((a, b) => a.arrivalTime - b.arrivalTime)
}

function variantPace(variant: TimingVariant): TransferPace {
  return variant.transferChoices[0]?.pace ?? findTransferWalk(variant)?.pace ?? 'standard'
}

function findTransferWalk(variant: TimingVariant) { return variant.journey.segments.find((segment) => segment.type === 'walk' && segment.purpose === 'transfer') as Extract<Journey['segments'][number], { type: 'walk' }> | undefined }
function transferWalkDuration(variant: TimingVariant): string { const walk = findTransferWalk(variant); return walk ? `${walk.durationMinutes}분 이내` : '바로 환승' }
function nextTransitClock(variant: TimingVariant): string { const transits = variant.journey.segments.filter((segment) => segment.type === 'transit'); return transits[1] ? formatClock(transits[1].departureTime) : formatClock(transits[0]?.departureTime ?? variant.arrivalTime) }
function segmentTitle(segment: Journey['segments'][number], planner: TransitPlanner): string { if (segment.type === 'walk') return segment.purpose === 'transfer' ? `${planner.pointName(segment.toStopId)}까지 환승` : `${planner.pointName(segment.toStopId)}까지 도보`; return `${transitLabel(planner.pointName(segment.routeId), segment.mode)} · ${planner.pointName(segment.toStopId)} 방면` }
function transitLabel(routeName: string, mode: 'bus' | 'subway'): string {
  const name = routeName.replace(mode === 'bus' ? /^bus-/ : /^subway-/, '')
  if (mode === 'subway') return /선$/.test(name) ? name : `${name}호선`
  return /버스|심야/.test(name) ? name : `${name}번 버스`
}
function durationLabel(from: number, to: number): string { return `${Math.max(0, to - from)}분` }
function distanceLabel(meters: number): string { return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${meters}m` }
function paceLabel(pace: TransferPace): string { return pace === 'fast' ? 'Fast' : pace === 'standard' ? 'Standard' : 'Relaxed' }
function countdownLabel(seconds: number): string { const minutes = Math.floor(seconds / 60); const rest = seconds % 60; return `${minutes}분 ${String(rest).padStart(2, '0')}초` }
function currentClock(now = new Date()): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function providerFailureMessage(error: unknown): string {
  if (!(error instanceof Error)) return '실데이터 provider를 사용할 수 없습니다'
  const messages: Record<string, string> = {
    PROVIDER_UNAVAILABLE: '실데이터 provider를 사용할 수 없습니다',
    NOT_CONFIGURED: '실데이터 provider 설정이 완료되지 않았습니다',
    QUOTA_EXCEEDED: '외부 API 호출 한도를 초과했습니다',
    UNSUPPORTED_REGION: '현재 지역은 실데이터 제공 범위가 아닙니다',
    UPSTREAM_TIMEOUT: '외부 API 응답 시간이 초과되었습니다',
    UPSTREAM_UNAVAILABLE: '외부 API가 현재 응답하지 않습니다',
    MALFORMED_UPSTREAM: '외부 API 응답 형식이 올바르지 않습니다',
  }
  const code = (error as Error & { code?: string }).code ?? error.name
  return messages[code] ?? error.message
}
