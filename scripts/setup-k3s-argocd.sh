#!/bin/bash
# ================================================================
# Setup k3s + ArgoCD on EC2 t2.micro (free tier)
# Gives you a full Kubernetes cluster + GitOps for ₹0/month
# Run on Ubuntu 22.04 t2.micro
# ================================================================
set -e

echo "🚀 Setting up k3s + ArgoCD..."

# ── Install k3s (lightweight Kubernetes) ──────────────────────
echo "📦 Installing k3s..."
curl -sfL https://get.k3s.io | sh -s - \
  --write-kubeconfig-mode 644 \
  --disable traefik \          # We'll use nginx ingress instead
  --node-name master

# Wait for k3s to be ready
sleep 20
kubectl wait --for=condition=Ready node/master --timeout=120s

echo "✅ k3s running: $(kubectl get nodes)"

# ── Install Nginx Ingress Controller ──────────────────────────
echo "📦 Installing Nginx Ingress..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

# ── Install Metrics Server (needed for HPA) ───────────────────
echo "📦 Installing Metrics Server..."
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# ── Install ArgoCD ─────────────────────────────────────────────
echo "📦 Installing ArgoCD..."
kubectl create namespace argocd 2>/dev/null || true
kubectl apply -n argocd -f \
  https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for ArgoCD to be ready
echo "Waiting for ArgoCD pods..."
kubectl wait --for=condition=available deployment/argocd-server \
  -n argocd --timeout=300s

# ── Get ArgoCD admin password ──────────────────────────────────
echo ""
echo "✅ ArgoCD installed!"
echo ""
ARGOCD_PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d)
echo "ArgoCD admin password: ${ARGOCD_PASSWORD}"
echo "(save this — you'll need it to log into the ArgoCD UI)"

# ── Port-forward ArgoCD UI (run in background for demo) ───────
echo ""
echo "To access ArgoCD UI, run:"
echo "  kubectl port-forward svc/argocd-server -n argocd 8080:443"
echo "  Then open: https://localhost:8080"
echo "  Username: admin"
echo "  Password: ${ARGOCD_PASSWORD}"

# ── Apply ArgoCD Applications ──────────────────────────────────
echo ""
echo "📦 Applying ArgoCD Application manifests..."
kubectl apply -f argocd/applications.yaml

echo ""
echo "✅ ════════════════════════════════════════════"
echo "   Setup complete! ArgoCD is watching your"
echo "   GitHub repo and will auto-deploy on push."
echo ""
echo "   Push to 'develop' → deploys to taskflow-dev"
echo "   Push to 'main'    → deploys to taskflow-prod"
echo "════════════════════════════════════════════"
