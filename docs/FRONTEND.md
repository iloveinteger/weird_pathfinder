# Frontend 설계

## 목적

현재 프론트엔드는 실제 API 없이 `mockNetwork`와 기존 routing core로 검색부터 실제 이동 화면까지 검증하는 모바일 우선 데모다. Hard 알고리즘은 React 내부로 옮기지 않으며 UI는 공개된 `Journey`, `HardRouteCandidate`, provider 계약만 소비한다.

## 화면 흐름

1. 검색 화면에서 출발지·목적지와 복수 경유지를 선택한다.
2. 경유지별 예상 도착, 체류시간, 출발시간을 편집한다. 체류시간 또는 출발시간 변경은 `resolveWaypointTiming`으로 반대 값을 계산한다.
3. 최소 환승, 최소 도보, 최소 시간, 최소 시간 Hard 중 하나로 검색한다.
4. 경로 카드에서 소요시간, ETA, 환승, 도보 정보를 비교한다. Hard 카드는 최단 가능, 일반 이동, 빠른 환승 횟수를 별도로 표시한다.
5. 상세 화면은 선택한 timing variant의 segment만 한 번 렌더링한다. 최종 ETA가 실제로 달라지는 환승 pace만 환승 지점의 branch control로 표시한다.
6. Active Trip에서 실제 탑승 차량을 사용자가 선택한다. 선택한 차량과 연결된 timing variant가 현재 ETA와 countdown의 기준이 된다.

## 계층 경계

```text
React App / TransitMap
        ↓
TransitPlanner interface
        ↓
CoreTransitPlanner
   ↙             ↘
PlaceProvider   TimeDependentRouter
```

- `App`은 `TransitPlanner`를 prop으로 받는다.
- `CoreTransitPlanner`는 Normal 결과를 UI 모드에 맞게 정렬하고 Hard 결과를 route candidate와 timing variant 형태로 전달한다.
- 복수 경유지는 각 leg를 앞 leg의 실제 도착시각과 경유지 체류시간으로 다시 탐색한다.
- `main.tsx`만 `MockPlaceProvider`, `mockNetwork`, `TimeDependentRouter`를 조립한다.
- `TransitMap`은 `Journey`만 받는 독립 placeholder다. routing과 provider를 알지 못한다.

## 분기와 병합 표현

route 전체를 tree로 그리지 않는다. 선택한 `patternKey`를 고정된 경로로 표시하고, `fast`, `standard`, `relaxed`의 최종 ETA가 다른 경우에만 환승 branch를 노출한다. branch 선택 후 segment 목록은 해당 variant의 단일 `Journey`만 렌더링하므로 동일 차량에서 병합된 이후 구간이 중복되지 않는다.

## 실제 API 연결 시 교체점

- 장소 검색: `MockPlaceProvider`를 Kakao Local 기반 `PlaceProvider`로 교체한다.
- 교통 데이터: bus/subway adapter가 정규화한 `TransitTrip` snapshot으로 `TransitNetwork`를 구성한다.
- 도보: `WalkingProvider` 결과로 walking link를 갱신한다.
- 지도: `TransitMap` 내부 구현만 Kakao Maps SDK adapter로 교체한다.
- 실시간 차량: Active Trip의 차량 선택 목록을 `getArrivals`와 `getVehiclePositions` 결과로 채운다. 자동 확정은 하지 않고 사용자 선택을 유지한다.

## 현재 제한

- 날짜와 현재시각은 2026-08-12 09:00 mock 시나리오를 기준으로 한다.
- 장소·노선·차량 후보는 작은 mock network 범위다.
- countdown은 mock service-day 시각에서 시작하는 화면용 타이머다.
- 지도 선형과 위치는 시각적 placeholder이며 실제 좌표 투영이 아니다.
- 최소 환승·최소 도보는 현재 Normal Pareto 결과의 정렬 기준이다. 더 풍부한 실제 데이터가 연결되면 후보 차이가 명확해진다.

## 검증

`src/ui/App.test.tsx`에서 경유지 추가·삭제·순서 변경, 체류/출발 동기화, 모드 전환, Hard timing branch, ETA 갱신, Active Trip 차량 선택, countdown, 병합 구간 단일 렌더링을 검증한다.
