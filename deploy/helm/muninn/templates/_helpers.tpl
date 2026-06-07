{{/*
공통 이름/라벨 헬퍼.
*/}}

{{- define "muninn.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
fullname: release 이름 + chart 이름 조합(중복 회피). fullnameOverride 우선.
*/}}
{{- define "muninn.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "muninn.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
공통 라벨 (모든 리소스).
*/}}
{{- define "muninn.labels" -}}
helm.sh/chart: {{ include "muninn.chart" . }}
{{ include "muninn.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: muninn
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{- define "muninn.selectorLabels" -}}
app.kubernetes.io/name: {{ include "muninn.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
─────────────── Operator ───────────────
*/}}
{{- define "muninn.operator.fullname" -}}
{{- printf "%s-operator" (include "muninn.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "muninn.operator.selectorLabels" -}}
app.kubernetes.io/name: {{ include "muninn.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: operator
control-plane: controller-manager
{{- end -}}

{{- define "muninn.operator.labels" -}}
{{ include "muninn.labels" . }}
app.kubernetes.io/component: operator
control-plane: controller-manager
{{- end -}}

{{- define "muninn.operator.serviceAccountName" -}}
{{- if .Values.operator.serviceAccount.create -}}
{{- default (printf "%s-controller-manager" (include "muninn.fullname" .)) .Values.operator.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.operator.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/*
─────────────── Web ───────────────
*/}}
{{- define "muninn.web.fullname" -}}
{{- printf "%s-web" (include "muninn.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "muninn.web.selectorLabels" -}}
app.kubernetes.io/name: {{ include "muninn.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: web
{{- end -}}

{{- define "muninn.web.labels" -}}
{{ include "muninn.labels" . }}
app.kubernetes.io/component: web
{{- end -}}

{{- define "muninn.web.serviceAccountName" -}}
{{- if .Values.web.serviceAccount.create -}}
{{- default (printf "%s-web" (include "muninn.fullname" .)) .Values.web.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.web.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/*
이미지 ref 조립: repository:tag (tag 비면 chart appVersion).
*/}}
{{- define "muninn.image" -}}
{{- $tag := default $.root.Chart.AppVersion .image.tag -}}
{{- printf "%s:%s" .image.repository $tag -}}
{{- end -}}
