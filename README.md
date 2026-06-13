# ⚡ TaskFlow — Kubernetes + ArgoCD GitOps

![Kubernetes](https://img.shields.io/badge/Orchestration-Kubernetes-326CE5?style=flat&logo=kubernetes&logoColor=white)
![ArgoCD](https://img.shields.io/badge/GitOps-ArgoCD-EF7B4D?style=flat&logo=argo&logoColor=white)
![Docker](https://img.shields.io/badge/Container-Docker-2496ED?style=flat&logo=docker&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?style=flat&logo=githubactions&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/DB-PostgreSQL_15-4169E1?style=flat&logo=postgresql&logoColor=white)

3-service microservices app (Frontend + API + PostgreSQL) deployed on Kubernetes using **GitOps with ArgoCD** — push to Git, ArgoCD handles the rest. Includes HPA autoscaling, liveness/readiness probes, Kustomize overlays per environment, and zero-downtime rolling deploys.

> 🎯 **Portfolio demo** — this is exactly what I deliver to clients for Docker/K8s deployment projects.

---

## 📐 Architecture

```
Developer pushes code
        │
        ▼
┌───────────────────────┐
│    GitHub Actions     │
│  1. Build Docker img  │
│  2. Push to ECR       │
│  3. Update image tag  │
│     in Git manifest   │
└──────────┬────────────┘
           │ git push (image tag update)
           ▼
┌───────────────────────┐
│       ArgoCD          │ ← watches Git repo every 3 min
│  Detects change       │
│  Syncs to cluster     │
│  selfHeal = true      │ ← reverts manual kubectl changes
└──────────┬────────────┘
           │
    ┌──────┴──────┐
    │             │
taskflow-dev   taskflow-prod   ← Kubernetes namespaces
    │             │
    │   ┌─────────┴─────────────────────────────────┐
    │   │          Kubernetes Cluster (k3s/EKS)     │
    │   │                                           │
    │   │  ┌──────────────┐  ┌──────────────┐      │
    │   │  │   Frontend   │  │     API      │      │
    │   │  │  Nginx:80    │  │  Node.js:3001│      │
    │   │  │  replicas: 2 │  │  replicas: 2 │      │
    │   │  │  HPA: 2-5    │  │  HPA: 2-8    │      │
    │   │  └──────┬───────┘  └──────┬───────┘      │
    │   │         │                 │               │
    │   │         └────────┬────────┘               │
    │   │                  │                        │
    │   │         ┌────────▼────────┐               │
    │   │         │   PostgreSQL    │               │
    │   │         │   StatefulSet  │               │
    │   │         │   PVC: 1Gi     │               │
    │   │         └─────────────────┘               │
    │   │                                           │
    │   │  Ingress → /api → api-service:3001        │
    │   │         → /    → frontend-service:80      │
    │   └───────────────────────────────────────────┘
    │
    └── Kustomize overlays:
        dev/   → replicas: 1, NODE_ENV: development
        prod/  → replicas: 2, NODE_ENV: production
```

---

## 📁 Project Structure

```
k8s-argocd-gitops/
├── apps/
│   ├── frontend/         # Nginx + HTML app
│   │   ├── index.html
│   │   ├── nginx.conf
│   │   └── Dockerfile
│   └── api/              # Node.js + Express + PostgreSQL
│       ├── app.js
│       ├── package.json
│       └── Dockerfile
│
├── k8s/
│   ├── base/             # Base K8s manifests (environment-agnostic)
│   │   ├── frontend/     # Deployment, Service, HPA
│   │   ├── api/          # Deployment, Service, HPA, ConfigMap
│   │   ├── database/     # StatefulSet, Secret, Service
│   │   └── ingress.yaml
│   └── overlays/         # Kustomize per-environment patches
│       ├── dev/
│       ├── staging/
│       └── prod/
│
├── argocd/
│   └── applications.yaml  # ArgoCD Application CRDs
│
├── .github/workflows/
│   └── build-deploy.yml   # CI: build → push → update manifests
│
├── scripts/
│   └── setup-k3s-argocd.sh  # One-command cluster setup
│
└── docker-compose.yml     # Local dev (mirrors K8s setup)
```

---

## 🚀 How to Run

### Option A — Local (Docker Compose)
```bash
docker compose up
# Frontend: http://localhost:80
# API:      http://localhost:3001/api/tasks
# Health:   http://localhost:3001/health
```

### Option B — Kubernetes on EC2 (live demo)

**1. Launch EC2 t2.micro (Ubuntu 22.04)**

**2. Run setup script**
```bash
git clone https://github.com/BhavikaChauhan/k8s-argocd-gitops
cd k8s-argocd-gitops
chmod +x scripts/setup-k3s-argocd.sh
sudo ./scripts/setup-k3s-argocd.sh
```

**3. Verify everything is running**
```bash
# All pods should be Running
kubectl get pods -n taskflow-dev

# Check HPA is active
kubectl get hpa -n taskflow-dev

# Check ArgoCD synced
kubectl get applications -n argocd
```

**4. Test the GitOps loop**
```bash
# Change something in k8s/overlays/dev/kustomization.yaml
git add . && git commit -m "test: scale frontend to 2 replicas"
git push

# ArgoCD detects the change within 3 minutes and applies it
# Watch it happen:
kubectl get pods -n taskflow-dev -w
```

---

## 🔁 GitOps Flow

```
You push code → GitHub Actions builds & pushes image → 
updates image tag in Git → ArgoCD detects change → 
applies to cluster → new pods roll out → old pods terminate
```

The key insight: **Git is the source of truth**. If someone runs `kubectl scale deployment api --replicas=10`, ArgoCD reverts it back to whatever's in Git within minutes. No more "who changed what."

---

## 📊 Kubernetes Features Demonstrated

| Feature | Where |
|---|---|
| **Rolling updates** | `strategy.rollingUpdate` — zero downtime deploys |
| **Liveness probes** | All 3 services — auto-restart hung containers |
| **Readiness probes** | All 3 services — no traffic until ready |
| **HPA autoscaling** | Frontend (2-5) and API (2-8) based on CPU/memory |
| **StatefulSet** | PostgreSQL — stable identity + persistent storage |
| **PersistentVolumeClaim** | 1Gi for PostgreSQL — data survives pod restarts |
| **Secrets** | DB credentials — never in plaintext |
| **ConfigMaps** | Non-sensitive config per service |
| **Kustomize overlays** | Same base manifests, different configs per env |
| **Namespace isolation** | `taskflow-dev` and `taskflow-prod` fully isolated |
| **Ingress** | Single entry point routing to frontend + API |

---

## 👩‍💻 About

Built by **Bhavika Chauhan** — DevOps & Cloud Engineer.

📅 [Book a free 20-min DevOps audit call](https://calendly.com/bhavikachauhan)
💼 [LinkedIn](https://linkedin.com/in/bhavika-chauhan-276b41332)
✍️ [Medium](https://medium.com/@bhavika.engineered)
