# weird_pathfinder

한국의 지하철·도시철도, 시내·마을·광역버스와 도보를 조합하는 시간 기반 대중교통 길찾기 실험 프로젝트입니다. 외부 대중교통 길찾기 API에 경로 계산을 위임하지 않고, 자체 라우팅 엔진으로 시간표와 환승 가능성을 계산하는 구조를 목표로 합니다.

현재 단계는 **실제 API를 호출하지 않는 초기 코어**입니다. 서울 도심의 작은 mock 교통망으로 Normal/Hard의 시간 분기, 상태 병합, 경유지 시간 계산을 검증합니다. KTX, SRT, 고속·시외버스와 항공은 범위에 포함하지 않습니다.

## 실행

Node.js 22 이상을 권장합니다.

```bash
npm install
npm run dev
```

검증과 프로덕션 빌드:

```bash
npm test
npm run build
```

GitHub Pages 배포 경로는 `/weird_pathfinder/`로 설정되어 있습니다. `main` 브랜치에 push하면 `.github/workflows/deploy.yml`이 테스트와 빌드를 실행하고 `dist`를 Pages에 배포합니다. 저장소의 **Settings → Pages → Source**는 **GitHub Actions**로 선택해야 합니다.

## 구조

```text
src/
├─ application/  provider와 routing core를 UI용 결과로 조합
├─ domain/       핵심 교통 모델과 시간 유틸리티
├─ providers/    외부 데이터 소스 adapter interface
├─ mock/         작은 버스·지하철망과 mock provider
├─ routing/      시간 기반 탐색, 정책, 분기·병합, Pareto pruning
├─ waypoints/    경유지 편집과 체류/출발시간 계산
├─ ui/           최소 React 검색 화면
└─ test/         Vitest DOM 설정
```

도메인에는 `Stop`, `Station`, `TransitRoute`, `TransitTrip`, `ScheduledStop`, `WalkSegment`, `TransitSegment`, `Transfer`, `Journey`, `Waypoint`이 정의되어 있습니다. 시간은 첫 단계의 단순성과 자정 이후 운행 지원을 위해 서비스일 시작부터의 분(`Minutes`)으로 표현합니다.

## 라우팅 코어

`TimeDependentRouter`는 Normal 요청을 기존 제한 탐색기로, Hard 요청을 별도 `HardRouter`로 전달합니다. 두 모드의 frontier와 pruning은 공유되지 않습니다.

- **Normal**: 표준 환승시간, 짧은 도보, 적은 환승과 강한 탐색 제한
- **Hard**: 모든 탑승 가능 차량을 시간표로 확장하고 빠른/표준/여유 환승, 긴 도보, 많은 환승, 반대 방향·동일역 재진입을 허용하는 multi-label 탐색

Hard는 전체 보행시간에 일괄 배수를 적용하지 않습니다. `purpose: transfer`인 도보 링크에서만 `fast`, `standard`, `relaxed` 상태를 만들며, 각 상태에서 잡을 수 있는 차량 후보 수는 제한하지 않습니다. 위치·차량 문맥·시각·Pareto 자원벡터가 모두 같은 경우에만 분기 상태를 병합합니다.

Hard 결과는 route pattern별로 묶이며 최단 도착, 표준 보행 도착, 환승·도보·aggressive 부담과 timing variant를 제공합니다. dominance, 안전한 top-K 종료와 현재 성능 위험요소는 [Hard routing 설계](docs/HARD_ROUTING.md)에 정리했습니다.

## 프론트엔드

모바일 우선 React 화면에서 mock 장소 검색, 복수 경유지 편집, 네 가지 탐색 모드, 경로 목록·상세, Hard timing branch와 Active Trip 차량 선택까지 한 흐름으로 확인할 수 있습니다. 데스크톱에서는 경로 패널과 지도 placeholder를 나란히 배치하고, 모바일에서는 지도를 위에 둔 단일 열 구조로 전환합니다.

UI는 routing class나 mock data를 직접 계산하지 않습니다. `CoreTransitPlanner`가 `PlaceProvider`와 `TimeDependentRouter`를 주입받아 화면용 `PlannedRoute`를 만들며, 앱 시작점인 `main.tsx`만 mock 구현을 조립합니다. 실제 연동 시 provider와 지도 adapter를 교체하는 방법은 [Frontend 설계](docs/FRONTEND.md)에 정리했습니다.

## 경유지

`WaypointPlan`은 여러 경유지의 추가, 삭제, 순서 변경을 불변 연산으로 제공합니다. 경유지 도착시각과 체류시간으로 다음 출발시각을 구하거나, 지정한 출발시각에서 체류시간을 역산할 수 있습니다.

`routeWaypointPlan`은 앞 구간의 실제 도착시각에 경유지 체류시간을 더한 뒤 다음 구간을 새로 탐색합니다. 따라서 체류시간 변경 시 뒤 구간의 탑승 차량도 함께 바뀔 수 있습니다.

## 외부 API 연결 지점

실제 연동은 `src/providers/interfaces.ts`의 계약을 구현하는 adapter를 추가하는 방식입니다.

| Provider | 예정 구현 | 책임 |
|---|---|---|
| `PlaceProvider` | Kakao Local adapter | 장소/주소 검색, 역지오코딩 |
| `WalkingProvider` | Kakao Walking Route adapter | 도보 경로, 거리, 예상시간 |
| `BusProvider` | 공공데이터포털/TAGO/지자체 adapter | 버스 노선·정류장·운행·차량 위치·도착정보 |
| `SubwayProvider` | TAGO/지자체 adapter | 도시철도 역·노선·시간표·실시간 도착정보 |

Kakao Maps는 UI의 지도 표시 계층에만 연결하고 라우팅 코어에 직접 의존시키지 않습니다. provider 원본 응답은 adapter에서 공통 도메인 모델로 정규화해야 합니다. 정적 시간표와 실시간 도착정보를 결합할 때도 코어에는 보정된 `TransitTrip` snapshot을 전달하는 방향을 권장합니다.

## Mock 시나리오

광화문에서 09:00 버스를 타면 서울역버스환승센터에 09:10 도착합니다. 서울역 승강장까지의 환승은 다음과 같이 갈립니다.

- 빠른 환승 3분: 09:13 차량 탑승, 잠실 09:35 도착
- 표준 환승 4분: 09:15 차량 탑승, 잠실 09:37 도착
- 여유 환승 6분: 09:18 차량 탑승, 잠실 09:40 도착

단위 테스트는 이 분기, 연속 환승 차량 변경, 반대 방향 우회, 긴 도보, 다환승, 접근 보행 비가속, 동일 차량 병합, Pareto dominance, route timing variant, 경유지 편집과 시간 변환, mock provider 계약을 검증합니다. UI 테스트는 복수 경유지 편집, 시간 동기화, 네 가지 모드, Hard branch 렌더링·선택, Active Trip 차량 선택·countdown, 병합 이후 segment 단일 표시를 검증합니다. `npm run test:diagnostic`으로 작은 mock과 synthetic network의 상태 수와 실행시간도 확인할 수 있습니다.

## 다음 단계

1. provider별 응답 정규화 및 캐시 계층 추가
2. 운행일·자정·요일·공휴일 서비스 캘린더 모델 추가
3. 실시간 지연을 반영한 trip snapshot 생성
4. RAPTOR/CSA 계열 탐색과 walking transfer graph 인덱싱 검토
5. Hard queue·stop-time index·predecessor DAG 성능 개선
6. Kakao Maps 지도 및 검색 UI adapter 연결
