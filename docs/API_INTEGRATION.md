# API 연동 준비

현재 기본값은 `mock`이며 실제 네트워크 요청은 발생하지 않는다. `VITE_PROVIDER_MODE=real`로 빌드하면 아직 구현되지 않은 provider가 `ProviderUnavailableError`(`code: PROVIDER_UNAVAILABLE`)를 반환한다. 실제 키를 연결하기 전까지 지도 역시 기존 `TransitMap` placeholder를 유지한다.

## 환경변수와 실행 위치

| 환경변수 | 사용 위치 | 예정 용도 | 브라우저 노출 |
|---|---|---|---|
| `VITE_KAKAO_JAVASCRIPT_KEY` | frontend | Kakao Maps JavaScript SDK 지도 표시 | 허용 |
| `KAKAO_REST_API_KEY` | backend/serverless | Kakao Local 장소 검색·역지오코딩 | 금지 |
| `DATA_GO_KR_SERVICE_KEY` | backend/serverless | 공공데이터포털/TAGO 버스 정적·실시간 데이터 | 금지 |
| `SEOUL_OPEN_API_KEY` | backend/serverless | 서울 열린데이터광장 교통 데이터 | 금지 |
| `SEOUL_SUBWAY_REALTIME_API_KEY` | backend/serverless | 서울 지하철 실시간 도착 데이터 | 금지 |

`VITE_PROVIDER_MODE`는 비밀이 아닌 빌드 설정이며 `mock` 또는 `real`만 허용한다. Vite는 `VITE_` 접두사가 붙은 값을 브라우저 bundle에 포함할 수 있으므로 server key에는 절대 이 접두사를 붙이지 않는다. 저장소에는 빈 템플릿인 `.env.example`만 커밋한다. `.env`, `.env.local`, 기타 `.env.*` 파일은 ignore 대상이다.

## mock에서 real로 교체하는 지점

```text
main.tsx
  → loadPublicRuntimeConfig(import.meta.env)
  → createTransitApplication(config)       application composition root
      ├─ mock → createMockProviderSet()
      └─ real → createRealProviderSet()     현재 unavailable stub
                    ↓
             normalized domain models
                    ↓
             TimeDependentRouter
```

- 공통 계약과 provider 묶음: `src/providers/interfaces.ts`
- mode 선택과 planner 조립: `src/application/createApplication.ts`
- mock 구현: `src/mock/providers.ts`
- real adapter 자리: `src/providers/real/providers.ts`
- 안정적인 미구현 오류: `src/providers/availability.ts`
- public frontend 설정 파싱: `src/config/runtime.ts`
- Kakao Maps 교체점: `src/ui/TransitMap.tsx`

Kakao Local, 공공데이터, 서울 API의 원본 응답은 향후 backend adapter에서 공통 `PlaceSearchResult`, `TransitPoint`, `TransitRoute`, `TransitTrip`, `ArrivalEstimate`, `VehiclePosition`으로 정규화한다. application layer가 이 snapshot을 `TransitNetwork`로 조립하고 routing core에 전달한다. routing core는 API URL, 인증키, 응답 DTO나 provider mode를 알지 않는다.

Kakao Maps JavaScript SDK는 경로 계산 provider가 아니다. 실제 지도 연결 시 `TransitMap` 내부 렌더러만 교체하고 `Journey` 입력 계약과 현재 mock map fallback은 유지한다. 도보 경로 데이터 소스는 아직 결정하지 않았으므로 `RealWalkingProvider`도 명시적으로 unavailable을 반환한다.

## GitHub Pages와 향후 backend

현재 GitHub Pages workflow는 테스트 후 build 단계에 repository secret `VITE_KAKAO_JAVASCRIPT_KEY`만 주입한다. secret이 등록되지 않아도 mock mode build는 동작한다. GitHub Pages는 정적 호스팅이므로 REST/service key가 필요한 호출을 안전하게 대신할 수 없다.

실제 연동 단계에서는 별도 backend 또는 serverless endpoint를 둔다.

```text
GitHub Pages frontend
  ├─ Kakao Maps JS (JavaScript key)
  └─ HTTPS → backend/serverless
                ├─ Kakao Local (REST key)
                ├─ 공공데이터포털 (service key)
                └─ 서울 교통 API (server keys)
```

backend는 입력 검증, provider별 timeout/retry, rate limit, 캐시, 원본 응답 정규화와 오류 변환을 담당한다. frontend의 real provider는 backend의 안정적인 자체 API만 호출해야 한다.

## 보안 주의사항

- 실제 key를 코드, 문서, 테스트 fixture, URL query가 찍히는 로그에 넣지 않는다.
- GitHub Actions에서는 secret 값을 출력하지 않고 `${{ secrets.VITE_KAKAO_JAVASCRIPT_KEY }}` 참조만 build 환경에 전달한다.
- repository secret의 존재나 값 확인을 위해 secret을 echo하거나 로컬로 내려받지 않는다.
- browser devtools에서 확인 가능한 모든 값은 공개 값으로 취급한다. Kakao JavaScript key에는 허용 도메인 제한을 설정한다.
- backend key는 배포 플랫폼의 secret manager에 저장하고 최소 권한, 사용량 제한, 주기적 rotation 정책을 적용한다.
- 오류 응답과 telemetry에는 key, 인증 header, 전체 provider URL을 남기지 않는다.

## 실제 연결 시 작업 순서

1. backend/serverless API 계약과 인증·CORS·캐시 정책을 정한다.
2. real adapter stub을 backend client 구현으로 바꾸고 provider 응답 정규화 contract test를 추가한다.
3. 정적 시간표와 실시간 도착정보를 결합해 불변 `TransitNetwork` snapshot을 application layer에서 만든다.
4. `TransitMap`에 Kakao Maps SDK adapter를 추가하되 key 미설정 시 mock map으로 fallback한다.
5. staging에서 `real` mode의 timeout, unavailable, 부분 provider 장애와 key 미설정 동작을 검증한다.
