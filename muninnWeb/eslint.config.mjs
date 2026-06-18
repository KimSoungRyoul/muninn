import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// ESLint 9 flat config. eslint-config-next 16 부터는 flat config preset 을 직접 export 하므로
// (legacy eslintrc preset + @eslint/eslintrc FlatCompat 브리지는 폐기됨, Next 16 공식 권장 방식)
// preset 배열을 그대로 spread 한다.
//   - core-web-vitals: next 베이스 규칙(next/react/react-hooks/import/jsx-a11y) + Core Web Vitals
//   - typescript:      typescript-eslint recommended
const eslintConfig = [
  {
    // 생성물·벤더 디렉토리는 린트 대상에서 제외.
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "drizzle/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // 프로토타입 코드 기준에 맞춘 합리적 규칙 조정.
    // mock/dual-mode 경계에서 any 와 비명시 의존성이 광범위하므로 에러가 아닌 허용/경고로 둔다.
    rules: {
      // dual-mode(k8s/db/mock) 매핑 레이어가 외부 SDK 의 untyped payload 를 다룬다 → any 허용.
      "@typescript-eslint/no-explicit-any": "off",
      // 빠른 프로토타입 — 미사용 변수는 경고로(빌드 차단 안 함), _ 접두사는 무시.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // <img> 사용 경고(데모 UI). 최적화 강제는 후속 작업.
      "@next/next/no-img-element": "off",
      // eslint-config-next 16 이 새로 켠 React Compiler 계열 규칙(react-hooks 신규).
      // 프로토타입 데모 컴포넌트(charts/ui/new-app)가 이 규칙들보다 먼저 작성됨 — 동작은
      // 정상이나 패턴이 비순수/렌더내 정의다. 버전 업그레이드 범위를 동작-중립으로 유지하기 위해
      // 에러가 아닌 경고로 두고, React Compiler 정합화는 후속 작업으로 분리한다.
      "react-hooks/purity": "warn", // 렌더내 Math.random/Date.now 등 → 후속에서 순수화
      "react-hooks/immutability": "warn", // Donut 의 루프 누적 변이
      "react-hooks/static-components": "warn", // new-app 의 렌더내 컴포넌트 정의 → 후속에서 hoist
    },
  },
];

export default eslintConfig;
