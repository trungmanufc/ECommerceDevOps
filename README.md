# Microshop: a microservice e-commerce shop

A small online shop built as microservices, used to learn the DevOps toolchain
step by step: Docker and GitHub Actions (CI/CD).

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
.github/workflows/      CI/CD pipeline (ci1.yml) and a practice workflow (hello.yml)
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

## 2. Run the tests

Node.js is not needed on your machine; run the tests in a container:

```powershell
docker run --rm -v "${PWD}\services\order-service:/src:ro" node:24-alpine sh -c "cp -r /src /tmp/app && cd /tmp/app && npm ci && npm test"
```

## 3. CI/CD with GitHub Actions

`.github/workflows/ci1.yml` runs on every push (any branch) and every pull request:

1. **Test**: `npm ci` and `npm test` for each Node.js service, in parallel.
2. **Build**: builds one Docker image per service.
   On a push (not on pull requests) it also pushes the images to the GitHub
   Container Registry as `ghcr.io/<owner>/<repo>/<service>:sha-<commit>`,
   plus `:latest` when the push is on `main`.

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
- [x] CI: test, build and push images to GHCR
- [ ] CD: deploy the images from GitHub Actions
- [ ] Later: Kubernetes, AWS, monitoring (Prometheus/Grafana), Ansible, Jenkins
