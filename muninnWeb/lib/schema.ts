// Muninn 메모리 metaDB 스키마 (Drizzle ORM) — 타입·쿼리의 단일 소스.
//
// 설계 §7. lib/db.ts 가 이 스키마로 타입세이프 CRUD/리스트를 수행하고, 검색 랭킹
// (to_tsvector + ts_rank_cd, BM25 근사)만 sql`` escape hatch 로 둔다.
//
// 검색은 **postgres 텍스트 검색(키워드)** 전용이다 — 외부 임베딩/onnxruntime/pgvector 의존을
// 의도적으로 제거해 어떤 postgres(또는 CNPG stock 이미지)에서도 동작하게 한다. 의미(시맨틱)
// 검색은 후속에서 정당화될 때 다시 얹는다.

import { pgTable, text, real, boolean, timestamp, bigserial, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const memory = pgTable(
  "memory",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(), // 'global' | 'app'
    appId: text("app_id"),
    appName: text("app_name"),
    fact: text("fact").notNull(),
    tags: text("tags").array().notNull().default([]),
    score: real("score").notNull().default(0.5),
    curated: boolean("curated").notNull().default(false),
    sourceRunId: text("source_run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // 키워드 검색(BM25 근사) GIN 인덱스 — fact(2-arg to_tsvector 는 IMMUTABLE).
    // tags 는 array_to_string 이 STABLE 이라 인덱스 표현식에 못 넣는다 → 별도 array GIN 으로
    // 색인하고 recall 에서 array overlap(&&)으로 매칭한다.
    index("memory_fact_fts").using("gin", sql`to_tsvector('simple', ${t.fact})`),
    index("memory_tags_idx").using("gin", t.tags),
    index("memory_app_idx").on(t.appId),
  ],
);

export const memoryHistory = pgTable("memory_history", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  memoryId: text("memory_id").notNull(),
  prevFact: text("prev_fact"),
  newFact: text("new_fact"),
  changedBy: text("changed_by"),
  reason: text("reason"),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const incidentLog = pgTable("incident_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  issueName: text("issue_name"),
  runName: text("run_name"),
  appId: text("app_id"),
  appName: text("app_name"),
  issuingUser: text("issuing_user"),
  userPrompt: text("user_prompt"),
  goal: text("goal"),
  recalledMemoryIds: text("recalled_memory_ids").array(), // 위임 근거 기억 id(감사 추적)
  status: text("status"),
  outcome: text("outcome"),
  summary: text("summary"),
  cost: real("cost"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MemoryRowDb = typeof memory.$inferSelect;
