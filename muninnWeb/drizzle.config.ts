// drizzle-kit 설정 — 스키마 진화 시 마이그레이션 생성/적용용.
//
// 현재 런타임은 lib/db.ensureSchema(idempotent CREATE)로 부트스트랩한다. 스키마가 커지면
// `pnpm drizzle-kit generate`(→ ./drizzle/*.sql) + `drizzle-kit migrate` 워크플로로 전환한다.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL || "postgres://muninn:muninn@localhost:5432/muninn" },
});
