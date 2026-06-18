/*
Copyright 2026.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package v1beta1

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/util/validation/field"
	ctrl "sigs.k8s.io/controller-runtime"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	muninniov1beta1 "github.com/KimSoungRyoul/muninn/huginnOperator/api/v1beta1"
)

// 순수 검증만 수행한다(외부 DB 의존 없음). 멤버십(owner|member)은 CR 생성자인 Muninn API 가
// 인증 후 검증한다(operator-design §4) — webhook 가용성을 DB 에 묶지 않기 위함.

const (
	labelWorkspace = "muninn.io/workspace"

	// runtime/authStyle 값(controller 패키지 상수의 미러 — 패키지 경계상 별도 선언). goconst 회피 겸 단일 출처.
	runtimeClaudeCode  = "claude-code"
	runtimeHuginnSelf  = "huginn-self"
	authStyleAnthropic = "anthropic"
	authStyleBearer    = "bearer"
)

var agentNameRe = regexp.MustCompile(`^[a-z0-9-]+$`)

var huginnagentlog = logf.Log.WithName("huginnagent-resource")

// SetupHuginnAgentWebhookWithManager registers the webhook for HuginnAgent in the manager.
func SetupHuginnAgentWebhookWithManager(mgr ctrl.Manager) error {
	return ctrl.NewWebhookManagedBy(mgr, &muninniov1beta1.HuginnAgent{}).
		WithValidator(&HuginnAgentCustomValidator{}).
		WithDefaulter(&HuginnAgentCustomDefaulter{}).
		Complete()
}

// versions=v1;v1beta1(리뷰 LOW): CRD 는 v1(storage)+v1beta1(served·deprecated) 둘 다 served 이고
// conversion=None(스키마 1:1 동일)이라, v1 으로 직접 CREATE/UPDATE 하는 요청도 동일 defaulter/validator 를
// 거쳐야 한다. 한 버전만 등록하면 다른 버전 직행 요청이 admission 을 우회해 workspaceId==namespace 강제가 뚫린다.
// +kubebuilder:webhook:path=/mutate-muninn-io-v1beta1-huginnagent,mutating=true,failurePolicy=fail,sideEffects=None,groups=muninn.io,resources=huginnagents,verbs=create;update,versions=v1;v1beta1,name=mhuginnagent-v1beta1.kb.io,admissionReviewVersions=v1

// HuginnAgentCustomDefaulter 는 생성/수정 시 기본값을 채운다.
type HuginnAgentCustomDefaulter struct{}

var _ admission.Defaulter[*muninniov1beta1.HuginnAgent] = &HuginnAgentCustomDefaulter{}

// Default 는 selector 보조 라벨 muninn.io/workspace 를 spec.workspaceId 로 동기화한다(§3.1).
func (d *HuginnAgentCustomDefaulter) Default(_ context.Context, obj *muninniov1beta1.HuginnAgent) error {
	huginnagentlog.Info("Defaulting for HuginnAgent", "name", obj.GetName())
	if obj.Spec.WorkspaceID != "" {
		if obj.Labels == nil {
			obj.Labels = map[string]string{}
		}
		obj.Labels[labelWorkspace] = obj.Spec.WorkspaceID
	}
	return nil
}

// versions=v1;v1beta1: v1(storage) 직행 CREATE/UPDATE 도 검증을 거치게 한다(위 mutating 마커와 동일 이유).
// +kubebuilder:webhook:path=/validate-muninn-io-v1beta1-huginnagent,mutating=false,failurePolicy=fail,sideEffects=None,groups=muninn.io,resources=huginnagents,verbs=create;update,versions=v1;v1beta1,name=vhuginnagent-v1beta1.kb.io,admissionReviewVersions=v1

// HuginnAgentCustomValidator 는 HuginnAgent 의 불변/필수 규칙을 검증한다.
type HuginnAgentCustomValidator struct{}

var _ admission.Validator[*muninniov1beta1.HuginnAgent] = &HuginnAgentCustomValidator{}

func (v *HuginnAgentCustomValidator) ValidateCreate(_ context.Context, obj *muninniov1beta1.HuginnAgent) (admission.Warnings, error) {
	return nil, validateAgent(obj)
}

func (v *HuginnAgentCustomValidator) ValidateUpdate(_ context.Context, oldObj, newObj *muninniov1beta1.HuginnAgent) (admission.Warnings, error) {
	var errs field.ErrorList
	if oldObj.Spec.WorkspaceID != newObj.Spec.WorkspaceID {
		errs = append(errs, field.Invalid(
			field.NewPath("spec", "workspaceId"), newObj.Spec.WorkspaceID, "workspaceId is immutable"))
	}
	if err := validateAgent(newObj); err != nil {
		if statusErr, ok := err.(*apierrors.StatusError); ok && statusErr.ErrStatus.Details != nil {
			for i := range statusErr.ErrStatus.Details.Causes {
				c := statusErr.ErrStatus.Details.Causes[i]
				errs = append(errs, &field.Error{Type: field.ErrorTypeInvalid, Field: c.Field, Detail: c.Message})
			}
		} else {
			return nil, err
		}
	}
	if len(errs) == 0 {
		return nil, nil
	}
	return nil, apierrors.NewInvalid(agentGK(), newObj.Name, errs)
}

func (v *HuginnAgentCustomValidator) ValidateDelete(_ context.Context, _ *muninniov1beta1.HuginnAgent) (admission.Warnings, error) {
	return nil, nil
}

// validateAgent 는 생성/수정 공통 순수 검증.
func validateAgent(obj *muninniov1beta1.HuginnAgent) error {
	var errs field.ErrorList
	if obj.Spec.WorkspaceID == "" {
		errs = append(errs, field.Required(field.NewPath("spec", "workspaceId"), "workspaceId is required"))
	}
	// 멀티테넌시 강제(CONTRACT §2, operator-design §3.1): "워크스페이스 = K8s 네임스페이스".
	// workspaceId 와 CR 이 사는 metadata.namespace 가 일치해야 한다 — 한 namespace 안에서 다른
	// workspace 라벨을 단 CR 로 격리 selector(muninn.io/workspace)를 우회하는 것을 막는다.
	// obj.Namespace 가 비어 있을 수 있는 경로(예: 단위 테스트의 빈 객체)에서는 검사하지 않고,
	// namespace 가 채워진 실제 admission(API server 가 항상 채움)에서만 일치를 강제한다.
	if obj.Spec.WorkspaceID != "" && obj.Namespace != "" && obj.Spec.WorkspaceID != obj.Namespace {
		errs = append(errs, field.Invalid(
			field.NewPath("spec", "workspaceId"), obj.Spec.WorkspaceID,
			fmt.Sprintf("workspaceId must equal metadata.namespace %q (workspace = namespace)", obj.Namespace)))
	}
	if !agentNameRe.MatchString(obj.Name) {
		errs = append(errs, field.Invalid(
			field.NewPath("metadata", "name"), obj.Name, "must match ^[a-z0-9-]+$"))
	}
	// §3 게이트웨이 필드 순수 형식 검증(CRD enum/pattern 과 이중 방어, DB 조회 없음).
	errs = append(errs, validateGateway(&obj.Spec.Agent)...)
	// §4.2 runtime↔image 정합(느슨) — 명백한 cross-runtime 이미지 모순만 거부. buildJobTemplate 이 최종 백스톱.
	errs = append(errs, validateRuntimeImage(&obj.Spec.Agent)...)
	if len(errs) == 0 {
		return nil
	}
	return apierrors.NewInvalid(agentGK(), obj.Name, errs)
}

// validateRuntimeImage 는 runtime 과 명시된 image 의 명백한 모순만 거부한다(§4.2·§10-11, 느슨한 검증).
// image 가 비면(operator 기본 이미지 사용) 검증 대상이 아니다. 레포 이미지 네이밍 컨벤션(claude-code=
// agent-runtime, huginn-self=huginn-self) 기반의 best-effort 휴리스틱이며, 최종 정합은 buildJobTemplate
// 의 runtime 분기가 보장한다(여기선 운영자의 명백한 오설정만 일찍 잡는다).
func validateRuntimeImage(a *muninniov1beta1.AgentSpec) field.ErrorList {
	var errs field.ErrorList
	if a.Image == "" {
		return errs
	}
	runtime := a.Runtime
	if runtime == "" {
		runtime = runtimeClaudeCode
	}
	p := field.NewPath("spec", "agent", "image")
	switch runtime {
	case runtimeHuginnSelf:
		if strings.Contains(a.Image, "agent-runtime") {
			errs = append(errs, field.Invalid(p, a.Image,
				"runtime=huginn-self 인데 claude-code 이미지(agent-runtime)로 보입니다 — runtime/image 정합 확인"))
		}
	case runtimeClaudeCode:
		if strings.Contains(a.Image, runtimeHuginnSelf) {
			errs = append(errs, field.Invalid(p, a.Image,
				"runtime=claude-code 인데 huginn-self 이미지로 보입니다 — runtime/image 정합 확인"))
		}
	}
	return errs
}

var baseURLRe = regexp.MustCompile(`^https?://.+`)

// validateGateway 는 baseUrl/authStyle 의 순수 형식을 runtime 별로 검증한다(§3·§4).
//   - claude-code: authStyle∈{anthropic,bearer}. openai 는 claude CLI 가 honor 못 하므로 거부.
//   - huginn-self: authStyle∈{openai}(또는 미설정). 현재 huginn-self 런타임은 OpenAI 와이어(Bearer)만
//     구현하므로 anthropic/bearer 를 받으면 *조용히 무시*되는 dead config 가 된다 → 명시 거부(리뷰 round-3).
//
// baseUrl 은 양 백엔드 공통으로 http(s) 스킴이어야 한다.
func validateGateway(a *muninniov1beta1.AgentSpec) field.ErrorList {
	var errs field.ErrorList
	p := field.NewPath("spec", "agent")
	if a.BaseURL != "" && !baseURLRe.MatchString(a.BaseURL) {
		errs = append(errs, field.Invalid(p.Child("baseUrl"), a.BaseURL, "must be an http(s) URL"))
	}
	if a.AuthStyle == "" {
		return errs // 미설정 → 백엔드 기본(claude-code=기존 인증, huginn-self=openai).
	}
	if a.Runtime == runtimeHuginnSelf {
		if a.AuthStyle != authStyleOpenAI {
			errs = append(errs, field.Invalid(p.Child("authStyle"), a.AuthStyle,
				"runtime=huginn-self 는 authStyle=openai 만 지원합니다(현재 OpenAI 호환 와이어만 구현)"))
		}
		return errs
	}
	// claude-code(기본): anthropic|bearer 만.
	if a.AuthStyle != authStyleAnthropic && a.AuthStyle != authStyleBearer {
		errs = append(errs, field.Invalid(p.Child("authStyle"), a.AuthStyle,
			"runtime=claude-code 는 authStyle 이 anthropic 또는 bearer 여야 합니다(openai 는 claude CLI 미지원)"))
	}
	return errs
}

const authStyleOpenAI = "openai"

func agentGK() schema.GroupKind {
	return schema.GroupKind{Group: muninniov1beta1.GroupVersion.Group, Kind: "HuginnAgent"}
}
