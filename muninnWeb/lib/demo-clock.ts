// 데모 기준 시각(decoupled from lib/data).
//
// mock 데이터의 모든 timestamp 는 이 고정 시각 기준 상대값으로 생성된다(lib/data.ts).
// 따라서 상대시간 포매터(fmtTimeAgo 등)도 실제 벽시계(Date.now())가 아니라 이 값을 기준으로
// 경과시간을 계산해야 데모 화면이 "방금 전"으로 자연스럽게 보인다.
//
// 이 상수를 별도 모듈로 분리해, 표현 계층(common.tsx/runs.tsx)이 mock 데이터 모듈(lib/data) 전체를
// import 하지 않고도 기준 시각만 참조할 수 있게 한다(mock 결합 최소화).
export const DEMO_NOW = new Date("2026-05-21T14:33:40+09:00");
