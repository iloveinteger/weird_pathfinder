# Hard routing 설계

## 목적과 경계

Hard는 경로의 익숙함이나 환승 편의보다 **실제 시간표상 가장 이른 도착**을 우선한다. 현재 구현은 정적 `TransitTrip` snapshot과 도보 link를 사용하는 correctness-first label-setting 탐색이다. 실제 API, 실시간 지연, 서비스 캘린더와 전국 규모 인덱싱은 아직 범위 밖이다.

Normal은 기존 `TimeDependentRouter`의 제한 정책을 그대로 사용한다. `mode: hard` 요청만 독립된 `HardRouter`로 전달되므로 Hard의 상태 수나 pruning 변경이 Normal에 영향을 주지 않는다.

## 상태

`HardSearchState`는 다음 정보를 가진다.

- 위치와 절대 시각
- 직전 탑승 노선과 실제 trip ID
- 탑승·환승 횟수
- 누적 도보 시간과 거리
- fast 환승 횟수와 절약한 시간
- 확정된 `AggressiveTransferChoice` 목록
- route pattern
- 단일 predecessor와 병합된 predecessor 목록

predecessor에는 이전 state ID와 실제 `WalkSegment` 또는 `TransitSegment`가 들어간다. 탐색 label이 전체 경로 배열을 복사하지 않으며, 목적지에서 predecessor chain을 역추적해 `Journey`를 만든다.

## 시간 의존 확장

고정 edge cost를 사용하지 않는다. 현재 state의 시각 이후에 해당 정류장에서 출발하는 `TransitTrip`을 모두 조회하고, 각 trip의 뒤쪽 모든 하차 지점으로 label을 만든다.

Hard에서는 `maxBoardingOptions` 같은 개수 제한을 적용하지 않는다. 늦게 출발한 급행이 앞 차량을 추월하거나 다음 환승을 바꿀 수 있으므로, catchable trip을 출발 순서와 무관하게 모두 유지한 뒤 dominance로 정리한다.

도보 link가 `purpose: transfer`이면 현재 mock 정책의 `fast`, `standard`, `relaxed` 물리 시간을 각각 만든다. 이 세 이름은 UI 설명용 profile이며 차량 후보 수 제한이 아니다. 각 profile state에서 잡을 수 있는 모든 차량을 확장한다. `access`와 `egress` 보행은 Hard에서도 표준 provider 시간만 사용하므로 전체 보행속도를 일괄 가속하지 않는다.

차량 탑승 시 `AggressiveTransferChoice`에는 다음을 기록한다.

- 실제 필요 환승시간과 표준 환승시간
- 환승 준비 완료시각
- 탑승 trip
- 차량 출발시각
- 해당 label의 하차 도착시각

따라서 동일 노선 조합이더라도 서로 다른 trip을 잡은 상태는 별도 timing variant로 남는다.

## Pareto dominance

Hard는 scalar score를 사용하지 않는다. 같은 operational signature 안에서 다음 벡터를 성분별로 비교한다.

```text
(시각, 환승 수, 도보 시간, 도보 거리,
 fast 환승 수, aggressive 절약 시간)
```

A의 모든 성분이 B 이하이고 하나 이상이 더 작을 때만 A가 B를 지배한다. 빠르지만 더 걷는 상태, 빠르지만 fast 환승 부담이 큰 상태, 환승이 많지만 더 빠른 상태는 서로 non-dominated이므로 모두 유지된다.

operational signature는 `위치 + 직전 노선 + 직전 실제 차량 + 진행 중인 환승 pace`이다. 단순히 같은 정류장에 있다는 이유로 다른 차량 문맥을 합치지 않으며, 아직 탑승 결과에 기록되지 않은 standard/relaxed 분기도 서로 지배하지 않는다. 현재 Hard에는 경로 이력 기반 금지 규칙이 없으므로 반대 방향, 동일역 재진입, 우회, 긴 도보와 다환승도 자연스럽게 확장된다.

## 안전한 병합

다음이 모두 같을 때만 미래 선택 가능성이 동일한 state로 병합한다.

- operational signature
- 현재 시각
- 환승 수
- 도보 시간·거리
- aggressive 횟수·부담

즉 서로 다른 timing branch가 같은 실제 차량을 타고 같은 지점·시각·자원벡터에 도달한 경우에만 하나의 continuation으로 접는다. 대표 predecessor는 유지하고 다른 predecessor는 `mergedPredecessors`에 보관한다. 다른 차량으로 같은 정류장에 도착한 상태는 병합하지 않는다.

## 종료 조건

모든 schedule과 walking duration이 음수가 아니라는 조건을 사용한다. 요청한 route candidate 수만큼 서로 다른 pattern의 목적지를 이미 찾았다면, 그중 가장 늦은 top-K 도착시각이 안전한 상한이 된다. 다음 state 시각이 이 상한보다 **큰** 경우 새 top-K candidate를 만들 수 없으므로 제거한다. 다만 이미 선택된 pattern의 prefix인 state는 더 느린 standard/relaxed timing variant를 만들 수 있어 계속 확장한다.

pattern 수가 K보다 적으면 이 bound를 쓰지 않고 유한한 mock schedule을 끝까지 탐색한다. 임의의 환승 수, 도보 거리, segment 수 제한은 Hard에 적용하지 않는다.

## 결과 집계

목적지 label은 transit route ID 순서로 묶는다. `HardRouteCandidate`는 다음을 제공한다.

- `bestPossibleArrival`
- `standardWalkingArrival`
- 환승 수
- 총 도보 시간·거리
- aggressive transfer 수
- 모든 고유 timing variant

candidate는 `bestPossibleArrival` 오름차순이며, 동률이면 환승 수와 도보 거리로 정렬한다. 목적지 label은 frontier 제거 전에 수집해, 빠른 variant에 비해 늦더라도 같은 pattern의 standard-walking ETA를 표시할 수 있다.

## 진단과 현재 위험요소

`npm run test:diagnostic`은 작은 mock과 24-stop synthetic network에서 상태 생성·확장·dominance·병합·queue 크기·실행시간을 출력한다. 2026-08-12 개발 환경에서 timing variant 보존을 포함한 synthetic 기준 예시는 약 227,000개 생성, 5,800개 확장, 최대 queue 약 1,400, 검색 약 1초였다. 수치는 하드웨어와 런타임에 따라 달라진다.

현재 성능상 위험요소:

- queue를 정렬 배열로 구현해 pop마다 `O(n log n)` 비용이 든다.
- catchable trip과 모든 하차 지점을 전부 열거해 dense timetable에서 후보가 급증한다.
- frontier가 선형 배열이라 dominance 비교가 label 수에 비례한다.
- 목적지 timing variant를 설명용으로 pruning 전에 모으므로 매우 촘촘한 시간표에서 결과 메모리가 커질 수 있다.
- 동일 비용으로 병합된 여러 predecessor의 모든 완전 경로 조합은 아직 materialize하지 않는다.
- 실시간 지연, 운행일, 자정 이후 service day가 들어오면 snapshot 일관성과 시간 범위 처리가 추가로 필요하다.

우선순위는 correctness 검증이다. 이후 binary heap, stop-time index, route/trip별 overtaking dominance, compact predecessor DAG를 계측 결과에 따라 적용할 수 있다.
