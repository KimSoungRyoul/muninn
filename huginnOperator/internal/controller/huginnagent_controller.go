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

	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
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
//
// agent SA 최소권한 Role(§6.2-5·§10-10): kubectl_ro 도구(read-only 진단)를 위한 *최소* 권한만 부여한다 —
// pods/pods.log·deployments/replicasets read 뿐, **secrets/configmaps 는 제외**(워크스페이스 내 자격 탈취 표면 차단).
// operator 가 이 권한을 Role 로 grant 하려면 자신도 보유해야 RBAC privilege-escalation 거부를 피하므로(과거 kind e2e
// 회귀), 아래 rbac 마커로 operator ClusterRole 에 동일 권한 + roles;rolebindings 관리 권한을 부여한다.
// 단 현재 runtime 은 Pod 의 automountServiceAccountToken=false(격리 baseline, expandPodSpec)라 토큰이 마운트되지
// 않아 이 Role 은 *아직 소비되지 않는다* — 토큰 마운트(또는 KUBECONFIG Secret)는 도구 루프 도입 시 runtime 별로 게이트한다.
// Role/RoleBinding 인프라를 미리 멱등 보장해 그때 즉시 활성화되게 한다(privilege-escalation 가드는 지금 검증 가능).
//
// +kubebuilder:rbac:groups=rbac.authorization.k8s.io,resources=roles;rolebindings,verbs=get;list;watch;create;update;patch
// +kubebuilder:rbac:groups="",resources=pods,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=pods/log,verbs=get
// +kubebuilder:rbac:groups=apps,resources=deployments;replicasets,verbs=get;list;watch

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
	// 2) namespace 공용 ServiceAccount + 최소권한 Role/RoleBinding 보장(owned 아님 — 다른 agent 와 공유).
	if err := r.ensureServiceAccount(ctx, agent.Namespace); err != nil {
		return ctrl.Result{}, err
	}
	if err := r.ensureAgentRBAC(ctx, agent.Namespace); err != nil {
		return ctrl.Result{}, err
	}

	// 3) webhookUrl 발급(§4.5) — 실 수신 라우트 POST /api/hooks/{app} 와 정합(webhookURLFor).
	agent.Status.WebhookURL = webhookURLFor(r.APIBaseURL, agent.Name)

	// 4) activeIssues 집계(§8.4).
	active, err := r.countActiveIssues(ctx, &agent)
	if err != nil {
		return ctrl.Result{}, err
	}
	agent.Status.ActiveIssues = active

	// 5) Ready.
	agent.Status.Phase = muninniov1beta1.AppReady
	setCondition(&agent.Status.Conditions, agent.Generation, "Ready", metav1.ConditionTrue,
		"WebhookRegistered", "webhook URL 발급 및 PVC/SA 보장 완료")

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

// 리네임(§10-6,7) 노트: 구 PVC 이름(pvc-claude-<agent>)은 *eager 삭제하지 않는다*. 구 PVC 는 과거
// ensurePVC 가 SetControllerReference(agent)로 만든 *소유* PVC 라 orphan 이 아니며 agent 삭제 시 GC 된다
// (orphan 누적 없음). 게다가 구 PVC 엔 Issue 별 ~/.claude transcript/resume(§5.5) 가 들어 있어, 이를
// reconcile 중 삭제하면 in-place 업그레이드에서 운영 데이터가 소실된다. 따라서 cleanup 로직을 제거했다
// — kind(throwaway)는 재생성으로 해소되고, 실 클러스터는 구 PVC 가 owned 라 자연 GC 된다(데이터 보존).

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
// agentRoleRules 는 huginn-agent SA 최소권한(§6.2-5): read-only 진단(pods/log·deployments). secrets 제외.
func agentRoleRules() []rbacv1.PolicyRule {
	return []rbacv1.PolicyRule{
		{APIGroups: []string{""}, Resources: []string{"pods"}, Verbs: []string{"get", "list", "watch"}},
		{APIGroups: []string{""}, Resources: []string{"pods/log"}, Verbs: []string{"get"}},
		{APIGroups: []string{"apps"}, Resources: []string{"deployments", "replicasets"}, Verbs: []string{"get", "list", "watch"}},
	}
}

// ensureAgentRBAC 는 huginn-agent SA 의 namespace Role/RoleBinding 을 멱등 보장한다(§6.2-5·§10-10).
// Role rules 는 변하면 갱신하고, RoleBinding 은 roleRef immutable 이라 없을 때만 생성한다. operator 는
// 위 rbac 마커로 동일 권한을 보유하므로 grant 시 privilege-escalation 거부를 받지 않는다(과거 회귀 해소).
func (r *HuginnAgentReconciler) ensureAgentRBAC(ctx context.Context, namespace string) error {
	role := &rbacv1.Role{ObjectMeta: metav1.ObjectMeta{Name: serviceAccountName, Namespace: namespace}}
	if _, err := controllerutil.CreateOrUpdate(ctx, r.Client, role, func() error {
		role.Rules = agentRoleRules()
		return nil
	}); err != nil {
		return err
	}
	var rb rbacv1.RoleBinding
	err := r.Get(ctx, client.ObjectKey{Namespace: namespace, Name: serviceAccountName}, &rb)
	if apierrors.IsNotFound(err) {
		rb = rbacv1.RoleBinding{
			ObjectMeta: metav1.ObjectMeta{Name: serviceAccountName, Namespace: namespace},
			RoleRef:    rbacv1.RoleRef{APIGroup: "rbac.authorization.k8s.io", Kind: "Role", Name: serviceAccountName},
			Subjects:   []rbacv1.Subject{{Kind: "ServiceAccount", Name: serviceAccountName, Namespace: namespace}},
		}
		if err := r.Create(ctx, &rb); err != nil && !apierrors.IsAlreadyExists(err) {
			return err
		}
		return nil
	}
	return err
}

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
