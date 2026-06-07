// muninnWeb = Muninn Memory Service — postgres (Drizzle ORM, 서버 전용).
//
// 기억(memory) recall/store + 이력(memory_history) + 사건 이력(incident_log) + 요약.
// 검색은 **postgres 텍스트 검색**(to_tsvector + ts_rank_cd, BM25 근사)이다 — 외부 임베딩/
// onnxruntime/pgvector 의존을 제거해 어떤 postgres(CNPG stock 이미지 포함)에서도 동작한다.
// CRUD/리스트는 Drizzle 타입빌더로, 검색 랭킹만 sql`` raw 로 둔다(스키마는 lib/schema.ts).
//
// DATABASE_URL 미설정 시 dbEnabled()=false → 도구/라우트가 graceful 하게 안내.

import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { generateText } from "ai";
import { anthropicProvider, COPILOT_MODEL } from "./copilot-anthropic";
import { memory, memoryHistory, incidentLog } from "./schema";

export interface MemoryRow {
  id: string;
  scope: "global" | "app";
  appId: string | null;
  appName: string | null;
  fact: string;
  tags: string[];
  score: number;
  curated: boolean;
  run: string | null;
  when: string;
}

export function dbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

let _pool: Pool | null = null;
function pool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL 미설정 — Muninn 메모리(postgres) 비활성");
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  return _pool;
}

let _db: NodePgDatabase | null = null;
function db(): NodePgDatabase {
  if (!_db) _db = drizzle(pool());
  return _db;
}

// embedding 컬럼이 없으므로 모든 select/returning 은 명시 컬럼만 사용(전체 컬럼 = 안전).
type MemSelect = typeof memory.$inferSelect;

// 스키마 부트스트랩 = Drizzle 마이그레이션 적용(raw DDL 없음). 스키마/인덱스의 단일 소스는
// lib/schema.ts 이고, drizzle-kit 이 ./drizzle/*.sql 로 버전관리한다. migrate() 는 idempotent
// (__drizzle_migrations 로 적용분 추적)하며, 표준 컨테이너에선 drizzle/ 폴더를 함께 배포해야 한다
// (Dockerfile COPY; 경로는 DRIZZLE_MIGRATIONS_DIR 로 override).
let _schemaReady: Promise<void> | null = null;
export function ensureSchema(): Promise<void> {
  if (!_schemaReady) {
    _schemaReady = migrate(db(), {
      migrationsFolder: process.env.DRIZZLE_MIGRATIONS_DIR || "drizzle",
    }).catch((err) => {
      _schemaReady = null; // 실패 시 캐시하지 않는다(다음 호출에서 재시도)
      throw err;
    });
  }
  return _schemaReady;
}

function mapRow(r: MemSelect): MemoryRow {
  return {
    id: r.id,
    scope: r.scope as "global" | "app",
    appId: r.appId,
    appName: r.appName,
    fact: r.fact,
    tags: r.tags ?? [],
    score: Number(r.score),
    curated: r.curated,
    run: r.sourceRunId,
    when: (r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt)).slice(0, 10),
  };
}

// scope/appId → Drizzle where 조건(빌더용)
function scopeWhere(scope?: string, appId?: string) {
  const conds = [];
  if (scope) conds.push(eq(memory.scope, scope));
  if (appId) conds.push(eq(memory.appId, appId));
  return conds.length ? and(...conds) : undefined;
}
// scope/appId → raw sql 조각(검색 랭킹 쿼리용)
function scopeSql(scope?: string, appId?: string) {
  const parts = [];
  if (scope) parts.push(sql`AND scope = ${scope}`);
  if (appId) parts.push(sql`AND app_id = ${appId}`);
  return parts.length ? sql.join(parts, sql` `) : sql``;
}

export interface RecallOpts {
  scope?: "global" | "app";
  appId?: string;
  k?: number;
}

/** 텍스트(BM25 근사) recall. query 없으면 score/recency 상위. */
export async function recall(query: string | undefined, opts: RecallOpts = {}): Promise<MemoryRow[]> {
  await ensureSchema();
  const k = opts.k ?? 8;
  const q = (query ?? "").trim();

  if (q) {
    // fact 는 FTS(ts_rank_cd) 랭킹, tags 는 array overlap(토큰 일치)로 함께 매칭. 둘 다 인덱스 사용.
    // tags 매칭은 ts_rank 가 0 이므로 fact 매칭 뒤에 정렬된다(태그-only 매칭도 회수되도록 보강).
    const ranked = await db().execute(sql`
      SELECT id FROM memory
      WHERE (to_tsvector('simple', fact) @@ plainto_tsquery('simple', ${q})
             OR tags && string_to_array(lower(${q}), ' ')) ${scopeSql(opts.scope, opts.appId)}
      ORDER BY ts_rank_cd(to_tsvector('simple', fact), plainto_tsquery('simple', ${q})) DESC
      LIMIT ${k}`);
    const ids = (ranked.rows as Array<{ id: string }>).map((r) => r.id);
    if (ids.length > 0) {
      const rows = await db().select().from(memory).where(inArray(memory.id, ids));
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.map((id) => byId.get(id)).filter(Boolean).map((r) => mapRow(r as MemSelect));
    }
    // 키워드 무매칭 → recency fallback 으로 진행
  }

  // query 없음/무매칭 → curated·score·recency 상위.
  const rows = await db()
    .select()
    .from(memory)
    .where(scopeWhere(opts.scope, opts.appId))
    .orderBy(desc(memory.curated), desc(memory.score), desc(memory.updatedAt))
    .limit(k);
  return rows.map(mapRow);
}

export interface StoreInput {
  fact: string;
  scope?: "global" | "app";
  appId?: string | null;
  appName?: string | null;
  tags?: string[];
  sourceRunId?: string | null;
  curated?: boolean;
  changedBy?: string;
}

/** 기억 저장(insert) + 이력 기록. */
export async function store(input: StoreInput): Promise<MemoryRow> {
  await ensureSchema();
  const id = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const [row] = await db()
    .insert(memory)
    .values({
      id,
      scope: input.scope ?? (input.appId ? "app" : "global"),
      appId: input.appId ?? null,
      appName: input.appName ?? null,
      fact: input.fact,
      tags: input.tags ?? [],
      score: 0.6,
      curated: input.curated ?? false,
      sourceRunId: input.sourceRunId ?? null,
    })
    .returning();
  await db().insert(memoryHistory).values({
    memoryId: id,
    prevFact: null,
    newFact: input.fact,
    changedBy: input.changedBy ?? "agent",
    reason: "store",
  });
  return mapRow(row);
}

/** 메모리 목록(필터). query 있으면 recall(검색) 위임. */
export async function listMemories(
  opts: { scope?: string; appId?: string; query?: string; limit?: number } = {},
): Promise<MemoryRow[]> {
  if (opts.query) return recall(opts.query, { scope: opts.scope as any, appId: opts.appId, k: opts.limit ?? 20 });
  await ensureSchema();
  const rows = await db()
    .select()
    .from(memory)
    .where(scopeWhere(opts.scope, opts.appId))
    .orderBy(desc(memory.curated), desc(memory.score), desc(memory.updatedAt))
    .limit(opts.limit ?? 50);
  return rows.map(mapRow);
}

/** 사건 이력 기록(위임 시작). 반환 id 로 이후 갱신. */
export async function recordIncident(rec: {
  issueName?: string; runName?: string; appId?: string; appName?: string;
  issuingUser?: string; userPrompt?: string; goal?: string; status?: string;
  recalledMemoryIds?: string[];
}): Promise<number> {
  await ensureSchema();
  const [r] = await db()
    .insert(incidentLog)
    .values({
      issueName: rec.issueName ?? null,
      runName: rec.runName ?? null,
      appId: rec.appId ?? null,
      appName: rec.appName ?? null,
      issuingUser: rec.issuingUser ?? null,
      userPrompt: rec.userPrompt ?? null,
      goal: rec.goal ?? null,
      recalledMemoryIds: rec.recalledMemoryIds ?? null,
      status: rec.status ?? "delegated",
    })
    .returning({ id: incidentLog.id });
  return r.id;
}

type IncidentPatch = { status?: string; outcome?: string; summary?: string; cost?: number; runName?: string };
function incidentSet(patch: IncidentPatch): Partial<typeof incidentLog.$inferInsert> {
  const set: Partial<typeof incidentLog.$inferInsert> = { updatedAt: new Date() };
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.outcome !== undefined) set.outcome = patch.outcome;
  if (patch.summary !== undefined) set.summary = patch.summary;
  if (patch.cost !== undefined) set.cost = patch.cost;
  if (patch.runName !== undefined) set.runName = patch.runName;
  return set;
}

export async function updateIncident(id: number, patch: IncidentPatch): Promise<void> {
  await ensureSchema();
  await db().update(incidentLog).set(incidentSet(patch)).where(eq(incidentLog.id, id));
}

/**
 * issueName 으로 incident_log 갱신(회수 폐루프). 에이전트는 incidentId 를 모르지만
 * MUNINN_ISSUE_NAME 은 알므로, 보고 라우트가 issueName 으로 결과/요약/비용을 종결한다.
 * 한 이슈당 위임 이력 1건이라 issue_name 으로 안전하게 특정된다.
 */
export async function updateIncidentByIssue(issueName: string, patch: IncidentPatch): Promise<void> {
  await ensureSchema();
  await db().update(incidentLog).set(incidentSet(patch)).where(eq(incidentLog.issueName, issueName));
}

export async function listIncidents(limit = 30): Promise<any[]> {
  await ensureSchema();
  return db().select().from(incidentLog).orderBy(desc(incidentLog.updatedAt)).limit(limit);
}

/** Claude 로 결과/사건을 1~2줄 한국어 요약(기억화 전 distill). */
export async function summarize(text: string): Promise<string> {
  const { text: out } = await generateText({
    model: anthropicProvider(COPILOT_MODEL),
    prompt:
      "다음 DevOps 사건 처리 결과를 재사용 가능한 '기억'으로 1~2줄 한국어 Markdown 으로 요약하라. " +
      "원인·해결·재발방지 핵심만, 군더더기 없이:\n\n" + text,
  });
  return out.trim();
}
