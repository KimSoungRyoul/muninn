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
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	muninniov1beta1 "github.com/KimSoungRyoul/muninn/huginnOperator/api/v1beta1"
	// TODO (user): Add any additional imports if needed
)

var _ = Describe("HuginnAgent Webhook", func() {
	var (
		obj       *muninniov1beta1.HuginnAgent
		oldObj    *muninniov1beta1.HuginnAgent
		validator HuginnAgentCustomValidator
		defaulter HuginnAgentCustomDefaulter
	)

	BeforeEach(func() {
		obj = &muninniov1beta1.HuginnAgent{}
		oldObj = &muninniov1beta1.HuginnAgent{}
		validator = HuginnAgentCustomValidator{}
		Expect(validator).NotTo(BeNil(), "Expected validator to be initialized")
		defaulter = HuginnAgentCustomDefaulter{}
		Expect(defaulter).NotTo(BeNil(), "Expected defaulter to be initialized")
		Expect(oldObj).NotTo(BeNil(), "Expected oldObj to be initialized")
		Expect(obj).NotTo(BeNil(), "Expected obj to be initialized")
	})

	AfterEach(func() {
		// TODO (user): Add any teardown logic common to all tests
	})

	Context("When creating HuginnAgent under Defaulting Webhook", func() {
		It("Should sync muninn.io/workspace label from spec.workspaceId", func() {
			obj.Name = tnAgent
			obj.Namespace = tnWsX
			obj.Spec.WorkspaceID = tnWsX
			Expect(defaulter.Default(ctx, obj)).To(Succeed())
			Expect(obj.Labels).To(HaveKeyWithValue(labelWorkspace, tnWsX))
		})
	})

	Context("When creating or updating HuginnAgent under Validating Webhook", func() {
		It("Should deny creation when workspaceId is empty", func() {
			obj.Name = tnAgent
			obj.Namespace = tnWsX
			obj.Spec.WorkspaceID = ""
			Expect(validator.ValidateCreate(ctx, obj)).Error().To(HaveOccurred())
		})

		It("Should deny creation when workspaceId != namespace (multi-tenancy)", func() {
			obj.Name = tnAgent
			obj.Namespace = tnWsX
			obj.Spec.WorkspaceID = tnWsY
			Expect(validator.ValidateCreate(ctx, obj)).Error().To(HaveOccurred())
		})

		It("Should admit creation when workspaceId == namespace and name is valid", func() {
			obj.Name = tnAgent
			obj.Namespace = tnWsX
			obj.Spec.WorkspaceID = tnWsX
			Expect(validator.ValidateCreate(ctx, obj)).Error().NotTo(HaveOccurred())
		})

		It("Should reject mutation of immutable workspaceId", func() {
			oldObj.Name, oldObj.Namespace, oldObj.Spec.WorkspaceID = tnAgent, tnWsX, tnWsX
			obj.Name, obj.Namespace, obj.Spec.WorkspaceID = tnAgent, tnWsX, tnWsZ
			Expect(validator.ValidateUpdate(ctx, oldObj, obj)).Error().To(HaveOccurred())
		})

		It("Should admit a no-op update", func() {
			oldObj.Name, oldObj.Namespace, oldObj.Spec.WorkspaceID = tnAgent, tnWsX, tnWsX
			obj.Name, obj.Namespace, obj.Spec.WorkspaceID = tnAgent, tnWsX, tnWsX
			Expect(validator.ValidateUpdate(ctx, oldObj, obj)).Error().NotTo(HaveOccurred())
		})
	})

})
