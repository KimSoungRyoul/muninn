#!/usr/bin/env bash
# Huginn agent-runtime 엔트리포인트 — 컨테이너 부팅 시퀀스(설계서 §5.1).
#
# 모드(첫 인자, 기본 run):
#   run       기본. 컨텍스트/인증 준비 후 Claude Agent SDK 런너 실행.
#   selftest  kind/CI QA용. API 호출 없이 툴·SDK 배선만 검증하고 종료(exit 0).
#   그 외      인자를 그대로 exec(디버깅/임시 명령).
#
# 인증: ANTHROPIC_API_KEY 또는 CLAUDE_CODE_OAUTH_TOKEN 중 하나(§5.1, §6.2). env(Secret)로만 주입.
#   - 오프라인 selftest 는 MUNINN_SELFTEST=1 이거나 ANTHROPIC_API_KEY=SELFTEST 센티넬일 때.
set -euo pipefail

log() { printf '[claude_skill] %s\n' "$*" >&2; }

MODE="${1:-run}"

# selftest 여부(런너와 동일 규칙). 센티넬/플래그로 API 호출 없이 배선만 검증.
is_selftest() {
  [[ "$MODE" == "selftest" ]] && return 0
  case "${MUNINN_SELFTEST:-}" in 1 | true | yes | TRUE | YES) return 0 ;; esac
  [[ "${ANTHROPIC_API_KEY:-}" == "SELFTEST" ]] && return 0
  return 1
}

preflight() {
  log "agent-runtime preflight (tools)"
  local missing=0 t
  for t in claude kubectl helm argocd gh git jq yq python3; do
    if command -v "$t" >/dev/null 2>&1; then
      log "  ok: $t"
    else
      log "  MISSING: $t"
      missing=1
    fi
  done
  return "$missing"
}

# 도구 자격을 env 에서 best-effort 구성(필수 아님).
configure_auth() {
  if [[ -n "${GITHUB_PAT:-}" ]]; then
    git config --global credential.helper store
    printf 'https://x-access-token:%s@github.com\n' "${GITHUB_PAT}" >"${HOME}/.git-credentials"
    chmod 600 "${HOME}/.git-credentials"
    export GH_TOKEN="${GITHUB_PAT}"
    log "configured github credentials (git + gh)"
  fi
  if [[ -n "${ARGOCD_SERVER:-}" && -n "${ARGOCD_AUTH_TOKEN:-}" ]]; then
    log "argocd server configured via env (ARGOCD_SERVER/ARGOCD_AUTH_TOKEN)"
  fi
}

case "${MODE}" in
selftest)
  preflight
  exec python3 /opt/agent/runner.py --selftest
  ;;
run)
  : "${MUNINN_GOAL:?MUNINN_GOAL is required}"
  if ! is_selftest; then
    if [[ -z "${ANTHROPIC_API_KEY:-}" && -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]]; then
      log "ERROR: ANTHROPIC_API_KEY 또는 CLAUDE_CODE_OAUTH_TOKEN 중 하나가 필요합니다"
      exit 1
    fi
  fi
  preflight
  configure_auth
  exec python3 /opt/agent/runner.py
  ;;
*)
  exec "$@"
  ;;
esac
