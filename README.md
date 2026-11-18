# Microshop: a microservice e-commerce shop

A small online shop built as microservices, used to learn the DevOps toolchain
step by step: Docker, Kubernetes, GitHub Actions, and later AWS.

## Architecture

```
Browser
   │
   ▼
frontend (nginx)  ── serves the web page and forwards /api/* to the services
   │
   ├── /api/products ──> product-service ──> PostgreSQL
   ├── /api/cart ──────> cart-service ─────> Redis
   └── /api/orders ────> order-service ────> PostgreSQL
                              │
                              ├──> cart-service     (read and clear the cart)
                              └──> product-service  (read current prices)
```

| Service | What it does | Tech |
|---|---|---|
| `frontend` | Web page, and the single entry point for the browser | nginx, plain HTML/JS |
| `product-service` | Product catalog | Node.js, Express, PostgreSQL |
| `cart-service` | One shopping cart per user | Node.js, Express, Redis |
| `order-service` | Checkout and order history | Node.js, Express, PostgreSQL |

Every service listens on port 3000 inside its container and exposes
`/healthz` (the process is alive) and `/readyz` (it can reach its database).

Simplification: product-service and order-service share one PostgreSQL
instance, each with its own table. They never read each other's table.

## Repository layout

```
services/<name>/        source code, tests and Dockerfile of each service
docker-compose.yml      runs everything on one machine
k8s/                    Kubernetes manifests (applied with kustomize)
.github/workflows/      CI pipeline
```

## 1. Run with Docker Compose

Requires Docker Desktop.

```powershell
docker compose up --build -d     # build the images and start everything
docker compose ps                # see the containers
docker compose logs -f order-service
docker compose down              # stop (add -v to also delete the database)
```

Open http://localhost:8080

## 2. Run on Kubernetes (Docker Desktop)

Requires Kubernetes to be enabled in Docker Desktop (Settings → Kubernetes).
The manifests use the images built by Compose, so build them first.

```powershell
docker compose build             # builds ecommerce-shop/<service>:local
kubectl apply -k k8s             # create everything in the "shop" namespace
kubectl -n shop get pods         # wait until all pods are Running and 1/1
```

Open http://localhost:8081

If that address does not respond on your machine, forward a port instead:
`kubectl -n shop port-forward svc/frontend 8081:8081`

Things to try, to see what Kubernetes does for you:

```powershell
# Self-healing: delete a pod and watch a replacement appear
kubectl -n shop delete pod -l app=cart-service
kubectl -n shop get pods -w

# Scaling
kubectl -n shop scale deploy/product-service --replicas=4

# Rolling update after a code change
docker compose build product-service
kubectl -n shop rollout restart deploy/product-service
kubectl -n shop rollout status deploy/product-service

# Logs of all replicas of a service
kubectl -n shop logs -l app=order-service --tail=50

# Remove everything
kubectl delete -k k8s
```

## 3. Run the tests

Node.js is not needed on your machine; run the tests in a container:

```powershell
docker run --rm -v "${PWD}\services\order-service:/src:ro" node:24-alpine sh -c "cp -r /src /tmp/app && cd /tmp/app && npm ci && npm test"
```

## 4. CI with GitHub Actions

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

1. **Test**: `npm ci` and `npm test` for each Node.js service, in parallel.
2. **Validate**: checks that the Kubernetes manifests render.
3. **Build**: builds one Docker image per service. On `main` it also pushes
   them to the GitHub Container Registry as
   `ghcr.io/<owner>/<repo>/<service>:sha-<commit>` and `:latest`.

To turn it on, push this folder to a GitHub repository:

```powershell
git init -b main
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

Then open the **Actions** tab of the repository to watch the pipeline.

## Roadmap

- [x] Services, Dockerfiles, Docker Compose
- [x] Kubernetes manifests, running locally
- [x] CI: test, build and push images
- [ ] Kubernetes cluster on AWS (k3s on EC2, or EKS)
- [ ] CD: deploy to the cluster from GitHub Actions
- [ ] Later: Helm, monitoring (Prometheus/Grafana), Ansible, Jenkins
