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
	"strings"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	muninniov1beta1 "github.com/KimSoungRyoul/muninn/huginnOperator/api/v1beta1"
)

// 순수 검증 로직 단위 테스트(envtest 불필요) — 멀티테넌시 강제(CONTRACT §2)와 불변/이름 규칙 커버.

// 테스트 픽스처 상수(goconst 회피; 여러 케이스에서 반복되는 이름/네임스페이스).
const (
	tnAgent = "app-a"
	tnWsX   = "team-x"
	tnWsY   = "team-y"
	tnWsZ   = "team-z"
)

func newAgent(name, namespace, workspaceID string) *muninniov1beta1.HuginnAgent {
	return &muninniov1beta1.HuginnAgent{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
		Spec:       muninniov1beta1.HuginnAgentSpec{WorkspaceID: workspaceID},
	}
}

func TestValidateAgentWorkspaceTenancy(t *testing.T) {
	v := &HuginnAgentCustomValidator{}
	ctx := context.Background()

	tests := []struct {
		name        string
		agent       *muninniov1beta1.HuginnAgent
		wantErr     bool
		errContains string
	}{
		{
			name:    "valid: workspaceId == namespace",
			agent:   newAgent(tnAgent, tnWsX, tnWsX),
			wantErr: false,
		},
		{
			name:        "reject: workspaceId != namespace",
			agent:       newAgent(tnAgent, tnWsX, tnWsY),
			wantErr:     true,
			errContains: "must equal metadata.namespace",
		},
		{
			name:        "reject: empty workspaceId",
			agent:       newAgent(tnAgent, tnWsX, ""),
			wantErr:     true,
			errContains: "workspaceId is required",
		},
		{
			name:        "reject: invalid name",
			agent:       newAgent("App_A", tnWsX, tnWsX),
			wantErr:     true,
			errContains: `^[a-z0-9-]+$`,
		},
		{
			// namespace 가 비어 있으면(단위/생성-전 컨텍스트) 일치 검사를 건너뛴다.
			name:    "skip namespace match when namespace empty",
			agent:   newAgent(tnAgent, "", tnWsX),
			wantErr: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := v.ValidateCreate(ctx, tc.agent)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				if tc.errContains != "" && !strings.Contains(err.Error(), tc.errContains) {
					t.Fatalf("error %q does not contain %q", err.Error(), tc.errContains)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestValidateUpdateWorkspaceImmutableAndTenancy(t *testing.T) {
	v := &HuginnAgentCustomValidator{}
	ctx := context.Background()

	t.Run("reject workspaceId mutation", func(t *testing.T) {
		oldObj := newAgent(tnAgent, tnWsX, tnWsX)
		newObj := newAgent(tnAgent, tnWsX, tnWsZ)
		_, err := v.ValidateUpdate(ctx, oldObj, newObj)
		if err == nil {
			t.Fatalf("expected immutability error, got nil")
		}
		if !strings.Contains(err.Error(), "immutable") {
			t.Fatalf("error %q does not mention immutability", err.Error())
		}
	})

	t.Run("accept no-op update", func(t *testing.T) {
		oldObj := newAgent(tnAgent, tnWsX, tnWsX)
		newObj := newAgent(tnAgent, tnWsX, tnWsX)
		if _, err := v.ValidateUpdate(ctx, oldObj, newObj); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("reject namespace-mismatched update even if workspaceId unchanged", func(t *testing.T) {
		// workspaceId 는 그대로지만 namespace 와 어긋난 경우(이론상 불변 위반 외 경로): tenancy 규칙으로도 거부.
		oldObj := newAgent(tnAgent, tnWsY, tnWsY)
		newObj := newAgent(tnAgent, tnWsY, tnWsY)
		newObj.Namespace = tnWsX // namespace 는 실제로는 변경 불가하지만 검증 함수 단독 동작 확인
		_, err := v.ValidateUpdate(ctx, oldObj, newObj)
		if err == nil {
			t.Fatalf("expected tenancy error, got nil")
		}
		if !strings.Contains(err.Error(), "must equal metadata.namespace") {
			t.Fatalf("error %q does not contain tenancy message", err.Error())
		}
	})
}

func TestDefaulterSyncsWorkspaceLabel(t *testing.T) {
	d := &HuginnAgentCustomDefaulter{}
	ctx := context.Background()

	agent := newAgent(tnAgent, tnWsX, tnWsX)
	if err := d.Default(ctx, agent); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := agent.Labels[labelWorkspace]; got != tnWsX {
		t.Fatalf("expected label %s=%s, got %q", labelWorkspace, tnWsX, got)
	}
}
