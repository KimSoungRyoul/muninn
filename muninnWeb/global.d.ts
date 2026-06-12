// TypeScript 6 는 side-effect import 에 대한 타입 선언을 TS 5 보다 엄격하게 요구한다.
// CSS 사이드이펙트 import(예: app/layout.tsx 의 `@copilotkit/react-core/v2/styles.css`,
// `./styles.css`)를 위한 ambient 모듈 선언 — 없으면 `next build` 의 타입체크가
// "Cannot find module or type declarations for side-effect import" 로 실패한다.
declare module "*.css";
