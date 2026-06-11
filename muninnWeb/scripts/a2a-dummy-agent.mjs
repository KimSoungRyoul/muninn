#!/usr/bin/env node
// 더미 A2A 에이전트 — V1(코파일럿=A2A 클라이언트) 데모용. 클러스터 없이 send_task_to_a2a_agent 를 시험한다.
// 설계: docs/design/muninn-a2a-integration.md §4(V1)/§9.
//
// 실행:  node scripts/a2a-dummy-agent.mjs           # 포트 4010
//        A2A_DUMMY_PORT=4011 node scripts/a2a-dummy-agent.mjs
//
// 제공:  GET  /card                        → Agent Card
//        POST /            (JSON-RPC)       → message/send(즉시 completed) · message/stream(SSE)
import { createServer } from "node:http";

const PORT = Number(process.env.A2A_DUMMY_PORT || 4010);
const BASE = `http://localhost:${PORT}`;

const CARD = {
  protocolVersion: "0.3.0",
  name: "dummy-a2a-agent",
  description: "PoC 더미 A2A 에이전트(에코). muninn 통합 V1 클라이언트 검증용.",
  url: BASE,
  preferredTransport: "JSONRPC",
  version: "0.0.1",
  capabilities: { streaming: true, pushNotifications: false, stateTransitionHistory: false },
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [{ id: "echo", name: "echo", description: "받은 goal 을 그대로 완료 처리", tags: ["demo"] }],
};

const readBody = (req) =>
  new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => resolve(b));
  });

const textOf = (msg) =>
  (Array.isArray(msg?.parts) ? msg.parts : [])
    .filter((p) => p?.kind === "text")
    .map((p) => p.text)
    .join("\n");

const mkTask = (goal, state) => ({
  kind: "task",
  id: `dummy-${Date.now().toString(36)}`,
  contextId: `ctx-${Date.now().toString(36)}`,
  status: { state },
  artifacts: state === "completed" ? [{ artifactId: "a1", name: "echo", parts: [{ kind: "text", text: `echo: ${goal}` }] }] : [],
});

const server = createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/card" || req.url === "/.well-known/agent-card.json")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(CARD));
    return;
  }
  if (req.method === "POST") {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400).end('{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"parse"}}');
      return;
    }
    const { id, method, params } = body || {};
    const goal = textOf(params?.message) || "(empty)";

    if (method === "message/send") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result: mkTask(goal, "completed") }));
      return;
    }
    if (method === "message/stream") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      const send = (r) => res.write(`data: ${JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result: r })}\n\n`);
      send(mkTask(goal, "submitted"));
      setTimeout(() => send({ kind: "status-update", taskId: "dummy", contextId: "ctx", status: { state: "working" }, final: false }), 300);
      setTimeout(() => {
        send({ kind: "status-update", taskId: "dummy", contextId: "ctx", status: { state: "completed" }, final: true });
        res.end();
      }, 800);
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message: `method not found: ${method}` } }));
    return;
  }
  res.writeHead(404).end("not found");
});

server.listen(PORT, () => {
  console.log(`[dummy-a2a-agent] listening on ${BASE}`);
  console.log(`  GET  ${BASE}/card`);
  console.log(`  POST ${BASE}  (message/send · message/stream)`);
});
