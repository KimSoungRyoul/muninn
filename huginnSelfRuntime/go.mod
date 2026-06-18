// huginn-self 런타임 — 비-Claude(자체/오픈) 모델을 자체 Go agent loop 로 실행하는 슬림 백엔드(설계 §4).
// 독립 모듈(Q5): operator/controller-runtime/k8s.io 를 import 하지 않는다 — 슬림 정적 바이너리 목표를
// 깨지 않기 위함. 보고/회상 DTO 는 손으로 미러하고(runtimeapi), conformance 골든으로 drift 를 막는다.
// 순수 stdlib(외부 의존성 0).
module github.com/KimSoungRyoul/muninn/huginnSelfRuntime

go 1.23
