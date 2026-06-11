import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

// ESLint 9 flat config. eslint-config-next 15.x 는 아직 legacy(eslintrc) preset 만
// 제공하므로 @eslint/eslintrc 의 FlatCompat 으로 브리지한다 (Next 공식 권장 방식).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

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
  ...compat.extends("next/core-web-vitals", "next/typescript"),
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
    },
  },
];

export default eslintConfig;
