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

package controller

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	muninniov1beta1 "github.com/KimSoungRyoul/muninn/huginnOperator/api/v1beta1"
)

var _ = Describe("HuginnIssue Controller", func() {
	Context("When reconciling a resource", func() {
		const resourceName = "test-resource"

		ctx := context.Background()

		typeNamespacedName := types.NamespacedName{
			Name:      resourceName,
			Namespace: "default", // TODO(user):Modify as needed
		}
		huginnissue := &muninniov1beta1.HuginnIssue{}

		BeforeEach(func() {
			By("creating the custom resource for the Kind HuginnIssue")
			err := k8sClient.Get(ctx, typeNamespacedName, huginnissue)
			if err != nil && errors.IsNotFound(err) {
				resource := &muninniov1beta1.HuginnIssue{
					ObjectMeta: metav1.ObjectMeta{
						Name:      resourceName,
						Namespace: "default",
					},
					Spec: muninniov1beta1.HuginnIssueSpec{
						AgentRef: "test-agent",
						Goal:     "test goal",
						Event: muninniov1beta1.NormalizedEvent{
							ID:          "evt-1",
							Source:      muninniov1beta1.EventSource("manual"),
							Severity:    muninniov1beta1.Severity("warning"),
							Fingerprint: "fp-1",
						},
						InheritedGuardrails: muninniov1beta1.InheritedGuardrails{
							MaxIterations: 2,
							MaxCostUsd:    1,
						},
						Identity: muninniov1beta1.Identity{
							K8sNamespace: "default",
						},
						RetryPolicy: muninniov1beta1.RetryPolicy{
							MaxRuns: 1,
						},
					},
				}
				Expect(k8sClient.Create(ctx, resource)).To(Succeed())
			}
		})

		AfterEach(func() {
			// TODO(user): Cleanup logic after each test, like removing the resource instance.
			resource := &muninniov1beta1.HuginnIssue{}
			err := k8sClient.Get(ctx, typeNamespacedName, resource)
			Expect(err).NotTo(HaveOccurred())

			By("Cleanup the specific resource instance HuginnIssue")
			Expect(k8sClient.Delete(ctx, resource)).To(Succeed())
		})
		It("should successfully reconcile the resource", func() {
			// 일치하는 HuginnAgent 를 만들지 않으므로 reconcile 는 AgentNotFound 의
			// graceful 처리 경로(phase=Failed, nil 반환)를 검증한다. Run 생성/재시도/
			// phase 집계 경로는 spec.issueRef field selector(캐시 field indexer)를 거쳐
			// HuginnAgent 와 동일하게 manager 기반 캐시 client 가 필요하다(후속 작업).
			By("Reconciling the created resource")
			controllerReconciler := &HuginnIssueReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: typeNamespacedName,
			})
			Expect(err).NotTo(HaveOccurred())
		})
	})
})
