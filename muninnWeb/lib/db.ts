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
import { memory, memoryHistory, incidentLog, inboundEvent } from "./schema";

export interface MemoryRow {
  id: string;
  workspace: string;
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

// 멀티테넌시(CONTRACT §2): workspace = K8s 네임스페이스. 요청 컨텍스트에서 결정하지 못하면
// env MUNINN_WORKSPACE, 그것도 없으면 'default'. 빈 문자열/공백은 폴백으로 정규화한다.
export function defaultWorkspace(): string {
  const env = process.env.MUNINN_WORKSPACE?.trim();
  return env || "default";
}
export function resolveWorkspace(ws?: string | null): string {
  const v = ws?.trim();
  return v || defaultWorkspace();
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
    workspace: r.workspace,
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

// workspace/scope/appId → Drizzle where 조건(빌더용). workspace 는 항상 강제(멀티테넌시 격리).
function scopeWhere(workspace: string, scope?: string, appId?: string) {
  const conds = [eq(memory.workspace, workspace)];
  if (scope) conds.push(eq(memory.scope, scope));
  if (appId) conds.push(eq(memory.appId, appId));
  return and(...conds);
}
// workspace/scope/appId → raw sql 조각(검색 랭킹 쿼리용). workspace 는 항상 포함.
function scopeSql(workspace: string, scope?: string, appId?: string) {
  const parts = [sql`AND workspace = ${workspace}`];
  if (scope) parts.push(sql`AND scope = ${scope}`);
  if (appId) parts.push(sql`AND app_id = ${appId}`);
  return sql.join(parts, sql` `);
}

export interface RecallOpts {
  workspace?: string;
  scope?: "global" | "app";
  appId?: string;
  k?: number;
  // query 가 있으나 무매칭일 때 recency 상위로 폴백할지. recall(에이전트 seed/코파일럿 회상)은
  // 기본 false — 무관한 기억을 "관련 회상"인 척 주입하면 에이전트를 오도하고 메모리 오염을 부른다.
  // 브라우즈/리스트(listMemories) 처럼 "뭐라도 보여줘야" 하는 경로만 true 로 켠다.
  fallbackToRecency?: boolean;
}

// 점수/recency 상위 목록(query 없음 또는 폴백용). curated·score·recency 순.
async function topMemories(opts: RecallOpts, k: number): Promise<MemoryRow[]> {
  const rows = await db()
    .select()
    .from(memory)
    .where(scopeWhere(resolveWorkspace(opts.workspace), opts.scope, opts.appId))
    .orderBy(desc(memory.curated), desc(memory.score), desc(memory.updatedAt))
    .limit(k);
  return rows.map(mapRow);
}

/**
 * 텍스트(BM25 근사) recall. query 없으면 score/recency 상위.
 * query 가 있으나 매칭 0 이면 기본적으로 **빈 결과**를 반환한다(무관 기억을 관련인 척 주입 금지).
 * 브라우즈 목적의 폴백이 필요하면 opts.fallbackToRecency=true.
 */
export async function recall(query: string | undefined, opts: RecallOpts = {}): Promise<MemoryRow[]> {
  await ensureSchema();
  const k = opts.k ?? 8;
  const q = (query ?? "").trim();
  const workspace = resolveWorkspace(opts.workspace);

  if (q) {
    // fact 는 FTS(ts_rank_cd) 랭킹, tags 는 array overlap(토큰 일치)로 함께 매칭. 둘 다 인덱스 사용.
    // websearch_to_tsquery 는 임의 사용자 입력을 안전하게 파싱(예외 없이 토큰화)하고 구문/OR 를 지원한다.
    // 부분 매칭도 넓게 회수하려고, 영숫자만 남긴 토큰들을 prefix(:*) + OR(|) 로 묶은 보조 쿼리를 함께 본다.
    // (to_tsquery 는 잘못된 구문에 예외를 던지므로 토큰을 영숫자로 sanitize 한 뒤에만 사용.)
    const orTokens = q
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9가-힣]/gi, ""))
      .filter(Boolean)
      .map((t) => `${t}:*`);
    const orQuery = orTokens.join(" | ");
    const hasOr = orTokens.length > 0;
    const ranked = await db().execute(sql`
      SELECT id FROM memory
      WHERE (to_tsvector('simple', fact) @@ websearch_to_tsquery('simple', ${q})
             ${hasOr ? sql`OR to_tsvector('simple', fact) @@ to_tsquery('simple', ${orQuery})` : sql``}
             OR tags && string_to_array(lower(${q}), ' ')) ${scopeSql(workspace, opts.scope, opts.appId)}
      ORDER BY ts_rank_cd(to_tsvector('simple', fact), websearch_to_tsquery('simple', ${q})) DESC
      LIMIT ${k}`);
    const ids = (ranked.rows as Array<{ id: string }>).map((r) => r.id);
    if (ids.length > 0) {
      // ids 는 이미 workspace 필터된 랭킹 결과지만, 2차 select 에도 workspace 를 강제(교차테넌트 차단).
      const rows = await db().select().from(memory).where(and(inArray(memory.id, ids), eq(memory.workspace, workspace)));
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.map((id) => byId.get(id)).filter(Boolean).map((r) => mapRow(r as MemSelect));
    }
    // 키워드 무매칭 — 폴백 비활성(기본)이면 빈 결과. 무관 기억 주입 금지.
    if (!opts.fallbackToRecency) return [];
  }

  // query 없음 또는 폴백 허용 + 무매칭 → curated·score·recency 상위.
  return topMemories(opts, k);
}

export interface StoreInput {
  fact: string;
  workspace?: string;
  scope?: "global" | "app";
  appId?: string | null;
  appName?: string | null;
  tags?: string[];
  sourceRunId?: string | null;
  curated?: boolean;
  changedBy?: string;
}

/** 기억 저장(insert) + 이력 기록. memory·memory_history 는 원자적으로 함께 기록(트랜잭션). */
export async function store(input: StoreInput): Promise<MemoryRow> {
  await ensureSchema();
  const id = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const row = await db().transaction(async (tx) => {
    const [r] = await tx
      .insert(memory)
      .values({
        id,
        workspace: resolveWorkspace(input.workspace),
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
    await tx.insert(memoryHistory).values({
      memoryId: id,
      prevFact: null,
      newFact: input.fact,
      changedBy: input.changedBy ?? "agent",
      reason: "store",
    });
    return r;
  });
  return mapRow(row);
}

/** 메모리 목록(필터). query 있으면 recall(검색) 위임. workspace 로 격리(멀티테넌시). */
export async function listMemories(
  opts: { workspace?: string; scope?: string; appId?: string; query?: string; limit?: number } = {},
): Promise<MemoryRow[]> {
  // 브라우즈/리스트는 검색 무매칭 시에도 최근 항목을 보여주는 게 유용 → fallbackToRecency.
  if (opts.query) return recall(opts.query, { workspace: opts.workspace, scope: opts.scope as any, appId: opts.appId, k: opts.limit ?? 20, fallbackToRecency: true });
  await ensureSchema();
  const rows = await db()
    .select()
    .from(memory)
    .where(scopeWhere(resolveWorkspace(opts.workspace), opts.scope, opts.appId))
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

// ---- 이벤트 인입 내구성(CONTRACT §5) ----
// webhook 수신 즉시 inbound_event 에 status='received' 로 기록하고, 처리 결과를 markInboundEvent 로
// 갱신한다. 동기 CR 생성(위임)이 실패해도 원본 이벤트가 남아 재처리 가능하다.

export interface InboundEventInput {
  app?: string;
  source?: string;
  severity?: string;
  fingerprint?: string;
  title?: string;
  payload?: unknown;
}

/** 인입 이벤트를 status='received' 로 영속하고 row id 를 반환한다(이후 markInboundEvent 로 종결). */
export async function recordInboundEvent(input: InboundEventInput): Promise<number> {
  await ensureSchema();
  let payloadStr: string | null = null;
  if (input.payload !== undefined) {
    try {
      payloadStr = JSON.stringify(input.payload).slice(0, 100_000);
    } catch {
      payloadStr = null; // 직렬화 불가(순환 등) — payload 없이 기록은 계속.
    }
  }
  const [r] = await db()
    .insert(inboundEvent)
    .values({
      app: input.app ?? null,
      source: input.source ?? null,
      severity: input.severity ?? null,
      fingerprint: input.fingerprint ?? null,
      title: input.title ?? null,
      payload: payloadStr,
      status: "received",
    })
    .returning({ id: inboundEvent.id });
  return r.id;
}

export type InboundEventStatus = "received" | "delegated" | "deduped" | "below-threshold" | "failed";

/** 인입 이벤트 처리 결과 갱신. failed 면 failReason 로 사유 기록(재처리 판단용). */
export async function markInboundEvent(
  id: number,
  patch: { status: InboundEventStatus; issueName?: string | null; failReason?: string | null },
): Promise<void> {
  await ensureSchema();
  await db()
    .update(inboundEvent)
    .set({
      status: patch.status,
      ...(patch.issueName !== undefined ? { issueName: patch.issueName } : {}),
      ...(patch.failReason !== undefined ? { failReason: patch.failReason } : {}),
      processedAt: new Date(),
    })
    .where(eq(inboundEvent.id, id));
}

export interface InboundEventRow {
  id: number;
  app: string | null;
  source: string | null;
  severity: string | null;
  title: string | null;
  fingerprint: string | null;
  status: string;
  failReason: string | null;
  issueName: string | null;
  receivedAt: string | null;
  processedAt: string | null;
}

/**
 * 인입 이벤트(알림 webhook) 목록 조회 — app/status 필터, 최근(received_at) 우선.
 * 원본 payload(JSON)는 크기 때문에 제외한다(코파일럿 컨텍스트 절약). 코파일럿이 raw 알림
 * (Grafana/Airflow/ArgoCD)을 회상·진단 근거로 볼 수 있게 한다.
 */
export async function listInboundEvents(
  opts: { app?: string; status?: string; limit?: number } = {},
): Promise<InboundEventRow[]> {
  await ensureSchema();
  const conds = [];
  if (opts.app) conds.push(eq(inboundEvent.app, opts.app));
  if (opts.status) conds.push(eq(inboundEvent.status, opts.status));
  const rows = await db()
    .select()
    .from(inboundEvent)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(inboundEvent.receivedAt))
    .limit(opts.limit ?? 30);
  return rows.map((r) => ({
    id: r.id,
    app: r.app,
    source: r.source,
    severity: r.severity,
    title: r.title,
    fingerprint: r.fingerprint,
    status: r.status,
    failReason: r.failReason,
    issueName: r.issueName,
    receivedAt: r.receivedAt ? r.receivedAt.toISOString() : null,
    processedAt: r.processedAt ? r.processedAt.toISOString() : null,
  }));
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
