# API 연동

## 구현 상태

외부 호출은 `server/`의 Vercel-compatible serverless backend에서만 수행한다. frontend의 real provider는 자체 `/api` endpoint가 반환한 공통 domain model만 사용한다. routing core에는 upstream URL, key, raw DTO가 들어가지 않는다.

```text
Kakao / TAGO / 서울 API
  → server provider + normalizer
  → PlaceSearchResult / WalkingRoute / TransitNetwork / realtime overlay
  → TimeDependentRouter / HardRouter
  → RealTransitPlanner
  → React UI / Kakao Maps
```

연결된 공식 API:

- Kakao Local: keyword 장소 검색, 좌표→주소 변환
- Kakao Map REST: 보행 경로, 대중교통 경로 bootstrap snapshot
- Kakao Maps JavaScript SDK: 실제 지도, marker, segment별 polyline
- 국토교통부 TAGO: 좌표기반 버스 정류장, 버스 노선, 노선별 경유 정류장, 버스 도착, 버스 위치, 지하철역, 역별 시간표
- 서울 열린데이터광장: 노선별 지하철역 정보
- 서울 지하철 실시간: 역명 기반 실시간 도착정보

참조: [Kakao Map REST API](https://developers.kakao.com/docs/en/kakaomap/rest-api), [TAGO 버스노선](https://www.data.go.kr/data/15098529/openapi.do), [TAGO 버스도착](https://www.data.go.kr/data/15098530/openapi.do), [TAGO 버스위치](https://www.data.go.kr/data/15098533/openapi.do), [TAGO 버스정류소](https://www.data.go.kr/data/15098534/openapi.do), [TAGO 지하철](https://www.data.go.kr/data/15098554/openapi.do), [서울 지하철 실시간](https://data.seoul.go.kr/dataList/OA-12764/A/1/datasetView.do).

## Backend endpoint

`VITE_API_BASE_URL=https://<backend-host>/api`를 기준으로 한다.

| Endpoint | 결과 | Cache |
|---|---|---:|
| `GET /places/search?q=` | `PlaceSearchResult[]` | 10분 |
| `GET /places/reverse?lat=&lng=` | `PlaceSearchResult \| null` | 10분 |
| `GET /walking?fromLat=&fromLng=&toLat=&toLng=` | `WalkingRoute` | 15분 |
| `GET /transit/network?originLat=&originLng=&destinationLat=&destinationLng=&departureTime=&serviceDate=` | normalized `TransitNetwork` | 15초 |
| `GET /bus/stops?lat=&lng=` | `TransitPoint[]` | 6시간 |
| `GET /bus/routes?cityCode=&routeNo=` | `TransitRoute[]` | 6시간 |
| `GET /bus/route-stops?cityCode=&routeId=` | 순서가 보존된 `TransitPoint[]` | 6시간 |
| `GET /bus/arrivals?cityCode=&stopId=` | `ArrivalEstimate[]` | 15초 |
| `GET /bus/vehicles?cityCode=&routeId=` | `VehiclePosition[]` | 15초 |
| `GET /subway/stations?q=` | `TransitPoint[]` | 6시간 |
| `GET /subway/timetable?stationId=&serviceDate=&dayType=&direction=` | `TransitTrip[]` 형식의 역별 event | 6시간 |
| `GET /subway/realtime?stationName=&stationId=` | realtime arrival overlay | 15초 |
| `GET /seoul/stations?stationName=` | 서울 노선별 역 원본 확인 endpoint | 6시간 |
| `GET /health` | backend 상태 | 짧음 |

in-memory TTL cache는 같은 serverless instance에서 동작하며 동일 key의 동시 요청은 하나의 upstream 요청으로 합친다. 응답에는 CDN용 `Cache-Control`도 설정한다. 여러 instance 사이의 강한 cache 공유가 필요하면 이후 Vercel KV/Redis adapter로 교체한다.

upstream 호출은 기본 5초 timeout, transient failure 1회 retry, HTTP 429 quota 변환, malformed JSON/response 검증을 적용한다. client에는 key, 인증 header, 전체 upstream URL을 반환하지 않는다. 일부 provider 장애는 해당 endpoint의 구조화된 오류로 제한되며 mock mode와 지도 fallback은 계속 동작한다.

## 환경변수

### Frontend public

| 이름 | 설명 |
|---|---|
| `VITE_PROVIDER_MODE` | `mock` 또는 `real` |
| `VITE_API_BASE_URL` | 배포된 backend의 `/api` URL |
| `VITE_KAKAO_JAVASCRIPT_KEY` | Kakao Maps JavaScript SDK key |

GitHub repository secret 이름은 `KAKAO_JAVASCRIPT_KEY`이며 Pages workflow가 build 시 `VITE_KAKAO_JAVASCRIPT_KEY`로 매핑한다. `API_BASE_URL`과 `PROVIDER_MODE`는 비밀이 아니므로 GitHub Actions repository variable로 둔다.

### Backend secret

- `KAKAO_REST_API_KEY`
- `DATA_GO_KR_SERVICE_KEY`
- `SEOUL_OPEN_API_KEY`
- `SEOUL_SUBWAY_REALTIME_API_KEY`
- `ALLOWED_ORIGIN` (선택, comma-separated)

backend key에 `VITE_` prefix를 붙이지 않는다. `.env`, `.env.local`, `.env.*`는 추적하지 않고 `.env.example`만 유지한다.

## 실행과 mode 전환

mock frontend:

```bash
npm run dev
```

real frontend는 로컬 serverless backend가 먼저 떠 있어야 한다.

```bash
npx vercel dev
```

로컬의 추적되지 않는 `.env.local`에 `VITE_PROVIDER_MODE=real`, `VITE_API_BASE_URL=http://localhost:3000/api`, public JavaScript key와 backend secret을 설정한다. 실제 값은 출력하지 않는다.

## Backend 배포

가장 단순한 배포 대상으로 Vercel Functions를 선택했다. `api/index.ts`, `server/app.ts`, `vercel.json`이 배포 단위다.

1. Vercel에서 GitHub repository를 import한다.
2. 위 네 backend secret과 `ALLOWED_ORIGIN=https://iloveinteger.github.io`를 Vercel project environment에 등록한다.
3. 배포 후 `/api/health`를 확인한다.
4. GitHub repository variable `API_BASE_URL`을 `https://<vercel-project>/api`, `PROVIDER_MODE`를 `real`로 설정한다.
5. Pages workflow를 재실행한다.

GitHub repository secret은 Vercel로 자동 전달되지 않는다. Vercel deployment credential이 저장소에 없으므로 repository code만으로 원격 backend를 자동 생성하거나 secret을 이관할 수 없다. 자동 배포가 필요하면 별도로 `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`를 추가해야 한다.

## 정적 그래프와 실시간 overlay

서울 실시간 응답은 `RealtimeArrivalOverlay` 형태로 정규화하며 `observedAt`, `expectedAt`, source를 별도로 유지한다. 정적 `TransitTrip`을 수정하지 않는다. 이후 snapshot builder가 overlay freshness와 train/route matching을 확인한 뒤 검색 시점의 복사본에만 delay를 적용해야 한다.

현재 real routing bootstrap은 Kakao 대중교통 후보의 step/path/duration을 `TransitNetwork`로 정규화한 뒤 기존 `TimeDependentRouter`와 `HardRouter`에 전달한다. core 코드는 API 형식에 맞춰 변경하지 않았다. TAGO 정적·실시간 endpoint도 domain model로 연결되어 있지만, TAGO 버스 API가 전체 운행시각표를 제공하지 않기 때문에 아직 TAGO 데이터만으로 전국 독립 시간의존 graph를 만들지는 못한다.

## 알려진 제약과 미지원

- TAGO 버스의 완전한 정적 운행시각표가 없어 bus `getTrips`는 명시적으로 `bus-timetable` unavailable을 반환한다.
- Kakao 대중교통 snapshot은 upstream 후보와 duration을 core가 재탐색하는 bootstrap이다. 독립 전국 graph를 대체하지 않는다.
- TAGO 지하철 시간표 응답은 역 단위 event다. 같은 열차번호의 여러 역 event를 수집·결합해야 완전한 multi-stop `TransitTrip`이 된다.
- provider별 활용신청은 service 단위일 수 있다. 같은 공공데이터 key가 있어도 미승인 API는 접근 거부될 수 있다.
- TAGO 도시코드와 지역별 데이터 품질이 다르다. frontend bus adapter의 현재 기본 도시코드는 서울 `11`이다.
- 서울 실시간 정보는 서울권 및 제공 노선 범위에 한정된다.
- 서울 Open API와 지하철 실시간 API의 공식 endpoint는 현재 HTTP URL을 게시한다. backend에서만 호출하지만 upstream 구간 TLS가 보장되지 않는 제약이 있어 운영 전 서울시의 HTTPS 지원 여부를 다시 확인해야 한다.
- Kakao Maps 허용 도메인에 localhost, GitHub Pages domain을 등록해야 실제 지도가 표시된다. real mode에서 SDK/key가 없으면 mock 지도로 fallback하지 않고 provider unavailable 상태를 표시한다.
- serverless instance 간 shared cache, realtime overlay의 정적 trip 자동 matching, 전국 service calendar/공휴일 graph는 아직 미지원이다.

## 테스트

- unit: response normalization, malformed payload, quota mapping, retry, backend routing/CORS, TTL/single-flight, mock/real mode
- `npm run test:smoke`: 네 backend key가 모두 있는 환경에서 실제 provider 및 서울역→강남역 direct/waypoint/Hard pipeline을 호출하며, 없으면 skip. TAGO gateway timeout 또는 특정 TAGO service의 HTTP 403은 외부 접근 불가/활용승인 없음으로 명시적으로 skip한다. malformed response, quota, 그 밖의 HTTP 오류는 계속 실패한다.
- `.github/workflows/api-smoke.yml`: GitHub repository secrets를 값 출력 없이 smoke test env로 주입하는 수동 workflow

2026-08-13 TAGO 지하철 활용신청 후 HTTP 403은 해소되었다. 실제 응답 field가 camelCase(`subwayStationId`, `subwayRouteName`, `arrTime`, `depTime`)이고 역 검색어가 `서울역`이어야 한다는 점을 adapter에 반영했다. 역별 시간표는 같은 역의 노선별 station ID와 상·하행에 따라 0건일 수 있으므로, smoke는 실제 역 검색 결과에서 데이터가 제공되는 노선·방향 조합을 확인한다. TAGO gateway는 간헐적으로 timeout을 반환하므로 제한된 retry 뒤 구조화된 timeout으로 처리한다.

real mode의 최초 출발시각과 `지금 출발`은 브라우저의 현재 로컬 시각을 사용한다. 사용자가 time input을 변경하면 해당 지정 시각이 network와 Normal/Hard routing input에 그대로 전달된다. real mode는 API나 지도 실패 시 mock 데이터를 표시하지 않는다.

Vercel 배포 자격증명이 repository에 없는 경우 다음 순서로 배포한다.

```bash
npx vercel link
npx vercel env add KAKAO_REST_API_KEY production
npx vercel env add DATA_GO_KR_SERVICE_KEY production
npx vercel env add SEOUL_OPEN_API_KEY production
npx vercel env add SEOUL_SUBWAY_REALTIME_API_KEY production
npx vercel env add ALLOWED_ORIGIN production
npx vercel deploy --prod
```

그 후 GitHub repository variables `API_BASE_URL=https://<vercel-project>/api`, `PROVIDER_MODE=real`을 설정하고 Pages workflow를 재실행한다. CI 자동 backend 배포를 원하면 `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`도 repository secrets에 추가해야 한다.

보안 검증 시 frontend `dist`에 backend secret 이름/값이 없는지, tracked `.env`가 없는지, key assignment가 빈 example 또는 Actions secret reference뿐인지 확인한다.
