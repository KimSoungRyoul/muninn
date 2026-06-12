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
	"fmt"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	apimeta "k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	muninniov1beta1 "github.com/KimSoungRyoul/muninn/huginnOperator/api/v1beta1"
)

// agentRefIndexKey 는 HuginnIssue 을 spec.agentRef 로 인덱싱하는 키(activeIssues 집계용; operator-design §1).
const agentRefIndexKey = "spec.agentRef"

// HuginnAgentReconciler reconciles a HuginnAgent object.
// 책임(operator-design §1, §2.4): 앱별 PVC/SA 보장, webhookUrl 발급(§4.5), activeIssues 집계(§8.4).
type HuginnAgentReconciler struct {
	client.Client
	Scheme *runtime.Scheme
	// APIBaseURL: webhookUrl 의 base FQDN(§4.5). 비면 기본값 사용.
	APIBaseURL string
	// PVCSize: 앱별 ~/.claude PVC 용량(기본 1Gi).
	PVCSize string
	// StorageClassName: PVC StorageClass(비면 클러스터 기본).
	StorageClassName string
}

// +kubebuilder:rbac:groups=muninn.io,resources=huginnagents,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=muninn.io,resources=huginnagents/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=muninn.io,resources=huginnagents/finalizers,verbs=update
// +kubebuilder:rbac:groups=muninn.io,resources=huginnissues,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=persistentvolumeclaims,verbs=get;list;watch;create;patch
// +kubebuilder:rbac:groups="",resources=serviceaccounts,verbs=get;list;watch;create
// 주의: operator 는 Secret/ConfigMap '객체'를 직접 Get/List 하지 않는다(인증은 Pod env 의 secretKeyRef 로만
// 참조 — 내용 read 아님). 따라서 cluster-wide secrets/configmaps read 마커를 두지 않아 권한 탈취 시 피해 반경을 줄인다(리뷰 MEDIUM).
// 에이전트 SA 도 자격을 env(secretKeyRef)로만 받고 K8s API 를 직접 호출하지 않으므로 namespace Role 을 부여하지 않는다:
// agent SA Role 의 secrets/configmaps read 는 과잉 권한이었고(리뷰 MEDIUM — 워크스페이스 내 자격 탈취 표면),
// operator 가 그 권한을 Role 로 grant 하려면 자신도 보유해야 하는데 보유하지 않아 RBAC privilege-escalation 으로
// 거부됐다(kind e2e 에서 발견된 회귀). agent 가 자기 namespace 리소스를 K8s API 로 직접 다뤄야 하는 기능이 생기면
// 그때 최소 권한 Role 을 ensureServiceAccount 옆에서 부여하고 여기에 roles;rolebindings create 마커를 다시 추가한다.

func (r *HuginnAgentReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	var agent muninniov1beta1.HuginnAgent
	if err := r.Get(ctx, req.NamespacedName, &agent); err != nil {
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}
	if !agent.DeletionTimestamp.IsZero() {
		return ctrl.Result{}, nil
	}

	base := agent.DeepCopy()

	// 1) 앱별 PVC 보장(owned → agent 삭제 시 cascade GC).
	if err := r.ensurePVC(ctx, &agent); err != nil {
		return ctrl.Result{}, err
	}
	// 2) namespace 공용 ServiceAccount 보장(owned 아님 — 다른 agent 와 공유).
	// agent 는 자격을 env(secretKeyRef)로만 받고 K8s API 를 직접 호출하지 않으므로 별도 Role 을 부여하지 않는다.
	if err := r.ensureServiceAccount(ctx, agent.Namespace); err != nil {
		return ctrl.Result{}, err
	}

	// 3) webhookUrl 발급(§4.5).
	agent.Status.WebhookURL = fmt.Sprintf("%s/hooks/%s", orDefault(r.APIBaseURL, defaultAPIBaseURL), agent.Name)

	// 4) activeIssues 집계(§8.4).
	active, err := r.countActiveIssues(ctx, &agent)
	if err != nil {
		return ctrl.Result{}, err
	}
	agent.Status.ActiveIssues = active

	// 5) Ready.
	agent.Status.Phase = muninniov1beta1.AppReady
	apimeta.SetStatusCondition(&agent.Status.Conditions, metav1.Condition{
		Type:               "Ready",
		Status:             metav1.ConditionTrue,
		Reason:             "WebhookRegistered",
		Message:            "webhook URL 발급 및 PVC/SA 보장 완료",
		ObservedGeneration: agent.Generation,
	})

	if err := r.Status().Patch(ctx, &agent, client.MergeFrom(base)); err != nil {
		return ctrl.Result{}, err
	}
	log.V(1).Info("HuginnAgent reconciled", "activeIssues", active)
	return ctrl.Result{}, nil
}

func (r *HuginnAgentReconciler) ensurePVC(ctx context.Context, agent *muninniov1beta1.HuginnAgent) error {
	name := pvcNameForAgent(agent.Name)
	var pvc corev1.PersistentVolumeClaim
	err := r.Get(ctx, client.ObjectKey{Namespace: agent.Namespace, Name: name}, &pvc)
	if err == nil {
		return nil
	}
	if !apierrors.IsNotFound(err) {
		return err
	}
	size := orDefault(r.PVCSize, "1Gi")
	pvc = corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: agent.Namespace,
			Labels: map[string]string{
				LabelAgent:     agent.Name,
				LabelWorkspace: agent.Spec.WorkspaceID,
			},
		},
		Spec: corev1.PersistentVolumeClaimSpec{
			AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
			Resources: corev1.VolumeResourceRequirements{
				Requests: corev1.ResourceList{corev1.ResourceStorage: resource.MustParse(size)},
			},
		},
	}
	if r.StorageClassName != "" {
		pvc.Spec.StorageClassName = &r.StorageClassName
	}
	if err := controllerutil.SetControllerReference(agent, &pvc, r.Scheme); err != nil {
		return err
	}
	return r.Create(ctx, &pvc)
}

func (r *HuginnAgentReconciler) ensureServiceAccount(ctx context.Context, namespace string) error {
	var sa corev1.ServiceAccount
	err := r.Get(ctx, client.ObjectKey{Namespace: namespace, Name: serviceAccountName}, &sa)
	if err == nil {
		return nil
	}
	if !apierrors.IsNotFound(err) {
		return err
	}
	sa = corev1.ServiceAccount{
		ObjectMeta: metav1.ObjectMeta{Name: serviceAccountName, Namespace: namespace},
	}
	if err := r.Create(ctx, &sa); err != nil && !apierrors.IsAlreadyExists(err) {
		return err
	}
	return nil
}

// countActiveIssues 는 phase∈{Pending,Running,AwaitingApproval} 인 세션 수를 센다(§8.4).
// spec.agentRef field indexer 로 조회한다(namespace 전체 list+필터 회피).
func (r *HuginnAgentReconciler) countActiveIssues(ctx context.Context, agent *muninniov1beta1.HuginnAgent) (int32, error) {
	var list muninniov1beta1.HuginnIssueList
	if err := r.List(ctx, &list, client.InNamespace(agent.Namespace),
		client.MatchingFields{agentRefIndexKey: agent.Name}); err != nil {
		return 0, err
	}
	var n int32
	for i := range list.Items {
		switch list.Items[i].Status.Phase {
		case muninniov1beta1.IssuePending, muninniov1beta1.IssueRunning, muninniov1beta1.IssueAwaitingApproval:
			n++
		}
	}
	return n, nil
}

// SetupWithManager sets up the controller with the Manager.
func (r *HuginnAgentReconciler) SetupWithManager(mgr ctrl.Manager) error {
	// HuginnIssue 을 spec.agentRef 로 인덱싱(activeIssues 집계용).
	if err := mgr.GetFieldIndexer().IndexField(context.Background(), &muninniov1beta1.HuginnIssue{},
		agentRefIndexKey, func(obj client.Object) []string {
			return []string{obj.(*muninniov1beta1.HuginnIssue).Spec.AgentRef}
		}); err != nil {
		return err
	}
	return ctrl.NewControllerManagedBy(mgr).
		For(&muninniov1beta1.HuginnAgent{}).
		Owns(&corev1.PersistentVolumeClaim{}).
		Owns(&muninniov1beta1.HuginnIssue{}).
		Named("huginnagent").
		Complete(r)
}
