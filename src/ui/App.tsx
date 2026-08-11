import { useState } from 'react'

type Mode = 'normal' | 'hard'

export function App() {
  const [mode, setMode] = useState<Mode>('normal')
  const [waypoints, setWaypoints] = useState<string[]>(['서울역'])

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#">샛길 <span>weird pathfinder</span></a>
        <span className="status"><i /> MOCK NETWORK</span>
      </header>

      <section className="hero">
        <div className="eyebrow">TIME-DEPENDENT TRANSIT LAB</div>
        <h1>조금 이상해도,<br /><em>더 빨리.</em></h1>
        <p>평범한 환승만으로는 놓치는 가장 빠른 길을 찾습니다.<br />지하철, 버스, 도보를 시간표 위에서 직접 계산합니다.</p>
      </section>

      <section className="planner" aria-label="경로 검색">
        <div className="mode-tabs">
          <button className={mode === 'normal' ? 'active' : ''} onClick={() => setMode('normal')}>
            <b>Normal</b><small>안정적인 환승</small>
          </button>
          <button className={mode === 'hard' ? 'active hard' : ''} onClick={() => setMode('hard')}>
            <b>Hard <span>⚡</span></b><small>공격적 최단시간</small>
          </button>
        </div>

        <div className="route-form">
          <label><span className="marker start">출</span><input aria-label="출발지" placeholder="출발지를 입력하세요" defaultValue="광화문" /></label>
          {waypoints.map((point, index) => (
            <label key={`${point}-${index}`}>
              <span className="marker via">{index + 1}</span>
              <input aria-label={`경유지 ${index + 1}`} value={point} onChange={(e) => setWaypoints(items => items.map((item, i) => i === index ? e.target.value : item))} />
              <button className="remove" aria-label={`경유지 ${index + 1} 삭제`} onClick={() => setWaypoints(items => items.filter((_, i) => i !== index))}>×</button>
            </label>
          ))}
          <label><span className="marker end">도</span><input aria-label="도착지" placeholder="도착지를 입력하세요" defaultValue="잠실역" /></label>
          <div className="form-actions">
            <button className="add" onClick={() => setWaypoints(items => [...items, ''])}>＋ 경유지 추가</button>
            <label className="time">출발 <input type="time" defaultValue="09:00" /></label>
            <button className="search">가장 빠른 길 찾기 <span>→</span></button>
          </div>
        </div>
      </section>

      <aside className={`mode-note ${mode}`}>
        <span>{mode === 'hard' ? '⚡' : '✓'}</span>
        <div><b>{mode === 'hard' ? 'Hard 모드는 더 깊게 탐색합니다' : 'Normal 모드는 여유 있게 탐색합니다'}</b>
          <p>{mode === 'hard' ? '빠른 환승, 긴 도보, 반대 방향 이동까지 열어두고 도착시간을 비교합니다.' : '일반 보행과 충분한 환승시간을 기준으로 실용적인 경로를 찾습니다.'}</p></div>
      </aside>
    </main>
  )
}
