// TypeScript 6 는 side-effect import 에 대한 타입 선언을 TS 5 보다 엄격하게 요구한다.
// app/layout.tsx 의 `nextra-theme-docs/style.css` import 를 위한 ambient 선언 —
// 없으면 `next build` 타입체크가 "Cannot find module or type declarations
// for side-effect import" 로 실패한다. (muninnWeb/global.d.ts 와 동일 패턴)
declare module "*.css";
