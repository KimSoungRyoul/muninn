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
	rbacv1 "k8s.io/api/rbac/v1"
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

// agentRefIndexKey 는 HuginnSession 을 spec.agentRef 로 인덱싱하는 키(activeSessions 집계용; operator-design §1).
const agentRefIndexKey = "spec.agentRef"

// HuginnAgentReconciler reconciles a HuginnAgent object.
// 책임(operator-design §1, §2.4): 앱별 PVC/SA 보장, webhookUrl 발급(§4.5), activeSessions 집계(§8.4).
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
// +kubebuilder:rbac:groups=muninn.io,resources=huginnsessions,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=persistentvolumeclaims,verbs=get;list;watch;create;patch
// +kubebuilder:rbac:groups="",resources=serviceaccounts,verbs=get;list;watch;create
// +kubebuilder:rbac:groups="",resources=secrets;configmaps,verbs=get;list;watch
// +kubebuilder:rbac:groups=rbac.authorization.k8s.io,resources=roles;rolebindings,verbs=get;list;watch;create;patch

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
	// 2) namespace 공용 ServiceAccount + 격리 RBAC 보장(owned 아님 — 다른 agent 와 공유).
	if err := r.ensureServiceAccount(ctx, agent.Namespace); err != nil {
		return ctrl.Result{}, err
	}
	if err := r.ensureAgentRBAC(ctx, agent.Namespace); err != nil {
		return ctrl.Result{}, err
	}

	// 3) webhookUrl 발급(§4.5).
	agent.Status.WebhookURL = fmt.Sprintf("%s/hooks/%s", orDefault(r.APIBaseURL, defaultAPIBaseURL), agent.Name)

	// 4) activeSessions 집계(§8.4).
	active, err := r.countActiveSessions(ctx, &agent)
	if err != nil {
		return ctrl.Result{}, err
	}
	agent.Status.ActiveSessions = active

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
	log.V(1).Info("HuginnAgent reconciled", "activeSessions", active)
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

// ensureAgentRBAC 는 §6.1 격리를 집행한다: 에이전트 SA 가 자기 namespace 의 Secret/ConfigMap 만 read.
// SA 와 마찬가지로 namespace 공용(특정 agent 가 owned 하지 않음 — 삭제 시 premature GC 방지).
func (r *HuginnAgentReconciler) ensureAgentRBAC(ctx context.Context, namespace string) error {
	roleName := serviceAccountName + "-role"
	var role rbacv1.Role
	if err := r.Get(ctx, client.ObjectKey{Namespace: namespace, Name: roleName}, &role); apierrors.IsNotFound(err) {
		role = rbacv1.Role{
			ObjectMeta: metav1.ObjectMeta{Name: roleName, Namespace: namespace},
			Rules: []rbacv1.PolicyRule{{
				APIGroups: []string{""},
				Resources: []string{"secrets", "configmaps"},
				Verbs:     []string{"get", "list", "watch"},
			}},
		}
		if err := r.Create(ctx, &role); err != nil && !apierrors.IsAlreadyExists(err) {
			return err
		}
	} else if err != nil {
		return err
	}

	bindingName := serviceAccountName + "-binding"
	var rb rbacv1.RoleBinding
	if err := r.Get(ctx, client.ObjectKey{Namespace: namespace, Name: bindingName}, &rb); apierrors.IsNotFound(err) {
		rb = rbacv1.RoleBinding{
			ObjectMeta: metav1.ObjectMeta{Name: bindingName, Namespace: namespace},
			RoleRef: rbacv1.RoleRef{
				APIGroup: rbacv1.GroupName,
				Kind:     "Role",
				Name:     roleName,
			},
			Subjects: []rbacv1.Subject{{
				Kind:      rbacv1.ServiceAccountKind,
				Name:      serviceAccountName,
				Namespace: namespace,
			}},
		}
		if err := r.Create(ctx, &rb); err != nil && !apierrors.IsAlreadyExists(err) {
			return err
		}
	} else if err != nil {
		return err
	}
	return nil
}

// countActiveSessions 는 phase∈{Pending,Running,AwaitingApproval} 인 세션 수를 센다(§8.4).
// spec.agentRef field indexer 로 조회한다(namespace 전체 list+필터 회피).
func (r *HuginnAgentReconciler) countActiveSessions(ctx context.Context, agent *muninniov1beta1.HuginnAgent) (int32, error) {
	var list muninniov1beta1.HuginnSessionList
	if err := r.List(ctx, &list, client.InNamespace(agent.Namespace),
		client.MatchingFields{agentRefIndexKey: agent.Name}); err != nil {
		return 0, err
	}
	var n int32
	for i := range list.Items {
		switch list.Items[i].Status.Phase {
		case muninniov1beta1.SessionPending, muninniov1beta1.SessionRunning, muninniov1beta1.SessionAwaitingApproval:
			n++
		}
	}
	return n, nil
}

// SetupWithManager sets up the controller with the Manager.
func (r *HuginnAgentReconciler) SetupWithManager(mgr ctrl.Manager) error {
	// HuginnSession 을 spec.agentRef 로 인덱싱(activeSessions 집계용).
	if err := mgr.GetFieldIndexer().IndexField(context.Background(), &muninniov1beta1.HuginnSession{},
		agentRefIndexKey, func(obj client.Object) []string {
			return []string{obj.(*muninniov1beta1.HuginnSession).Spec.AgentRef}
		}); err != nil {
		return err
	}
	return ctrl.NewControllerManagedBy(mgr).
		For(&muninniov1beta1.HuginnAgent{}).
		Owns(&corev1.PersistentVolumeClaim{}).
		Owns(&muninniov1beta1.HuginnSession{}).
		Named("huginnagent").
		Complete(r)
}
