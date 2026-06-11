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

// Package v1beta1 contains API Schema definitions for the muninn.io v1beta1 API group.
//
// 버저닝/Deprecation 정책(CONTRACT §4, 상세: docs/crd-versioning.md):
//
//   - v1beta1 은 현재 유일한 served+storage 버전이다. group=muninn.io 는 영구 불변.
//   - 향후 v1 을 도입할 때 스키마는 v1beta1 와 필드 1:1 동일(rename 없음)로 해 conversion 을
//     trivial 하게 유지한다. 동일 스키마이므로 conversion.strategy=None 또는 trivial Hub/Spoke
//     중 하나로 갈 수 있으나, controller-gen 이 multi-version 에서 기본으로 Webhook 전략 CRD 를
//     생성하고 그 CRD 는 envtest(suite_test)에서 served 되는 conversion webhook 을 요구한다.
//     현재 컨트롤러/웹훅 envtest 스위트는 conversion webhook 을 띄우지 않으므로, v1 의 실제 추가는
//     envtest 하니스(suite_test)에 conversion webhook 서버 + cert 배선과 helm 측 CRD/conversion
//     service 배선이 함께 들어가야 green 을 유지할 수 있다. 그 전까지 v1 추가는 보류한다.
//   - v1 도입 시점에 v1beta1 은 served=true 를 유지하되 deprecated=true 로 표시(아래 마커는 v1
//     추가 PR 에서 활성화). storage 는 v1 로 전환하고, storage 마이그레이션(기존 객체 re-write)을
//     수행한 뒤에만 v1beta1 served 를 내린다.
//
// 위 정책을 코드로 강제할 준비: v1 추가 시 이 파일 위의 타입 패키지 주석에 다음 마커를 부착한다(현재는
// 단일 버전이라 비활성):
//
//	+kubebuilder:deprecatedversion:warning="muninn.io/v1beta1 is deprecated; migrate to muninn.io/v1"
//
// +kubebuilder:object:generate=true
// +groupName=muninn.io
package v1beta1

import (
	"k8s.io/apimachinery/pkg/runtime/schema"
	"sigs.k8s.io/controller-runtime/pkg/scheme"
)

var (
	// SchemeGroupVersion is group version used to register these objects.
	// This name is used by applyconfiguration generators (e.g. controller-gen).
	SchemeGroupVersion = schema.GroupVersion{Group: "muninn.io", Version: "v1beta1"}

	// GroupVersion is an alias for SchemeGroupVersion, for backward compatibility.
	GroupVersion = SchemeGroupVersion

	// SchemeBuilder is used to add go types to the GroupVersionKind scheme.
	// kubebuilder 표준 스캐폴드 패턴 유지(scheme.Builder). 신 API 마이그레이션은 별도 후속.
	//nolint:staticcheck // SA1019: controller-runtime scheme.Builder deprecation — 스캐폴드 관용구 유지.
	SchemeBuilder = &scheme.Builder{GroupVersion: SchemeGroupVersion}

	// AddToScheme adds the types in this group-version to the given scheme.
	AddToScheme = SchemeBuilder.AddToScheme
)
