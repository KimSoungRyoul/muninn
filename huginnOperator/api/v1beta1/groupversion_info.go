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
//   - group=muninn.io 는 영구 불변. v1 이 storage 버전(hub), v1beta1 은 served=true·deprecated=true.
//   - 스키마는 v1 와 필드 1:1 동일(rename 없음)이라 conversion 이 trivial 하다 — controller-gen 이
//     Hub/Convertible 마커 없이는 conversion.strategy 를 emit 하지 않으므로(=None) conversion webhook
//     이 불필요하고 envtest/helm 에 cert 배선이 필요 없다. 동일 스키마인 한 v1beta1 served 를 유지한다.
//   - deprecated 마커는 각 Kind 타입의 root 마커 블록(huginn*_types.go 의 +kubebuilder:object:root=true
//     아래)에 `+kubebuilder:deprecatedversion:warning=...` 로 부착돼 있다 — 클라이언트에 마이그레이션 경고.
//   - storage 마이그레이션(기존 v1beta1 객체를 v1 로 re-write)을 수행한 뒤에만 v1beta1 served 를 내린다.
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
