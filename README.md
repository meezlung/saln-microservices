# SALN Filing System — Microservices

**SALN Team 1** | CS 173

Statement of Assets, Liabilities, and Net Worth (SALN) filing web application built as a microservices architecture. Runs on a Digital Ocean Ubuntu droplet and is also deployed on AWS Lambda.

- **Digital Ocean:** [saln1.upcsweb.dev](https://saln1.upcsweb.dev)
- **AWS Lambda:** [saln1a.upcsweb.dev](https://saln1a.upcsweb.dev)

---

## Architecture Overview

```
Browser
  └── CloudFront (saln1a.upcsweb.dev)
        ├── /api/auth/*      → Auth Lambda (PHP, Bref)
        ├── /api/forms/*     → Form Lambda (PHP, Bref)
        ├── /api/documents/* → Document Lambda (JS, collaborator)
        └── /*               → S3 (React SPA)
```

All three services share an Aurora PostgreSQL Serverless v2 cluster (three separate databases). See [`docs/architecture.md`](docs/architecture.md) for the full diagram and routing details.

---

## Repository Structure

```
saln-microservices/
├── services/
│   ├── auth-service/       Laravel — OTP email login, Sanctum tokens
│   ├── form-service/       Laravel — SALN form CRUD, import/export
│   └── document-service/   Laravel — PDF generation via pdftk, S3 storage
├── frontend/
│   └── web/                React + Vite SPA
├── infra/
│   └── frontend-static/
│       └── terraform/      CloudFront + S3 infrastructure (Terraform)
├── docs/                   Architecture diagrams, setup guide, dependency inventory
├── environment-files/      Production .env files (see readme.txt inside)
├── run-backend.sh          Start all four services locally in one command
└── shared/                 Shared design system assets
```

---

## Running Locally (Digital Ocean / Ubuntu)

**Prerequisites:** PHP 8.4, Composer 2, Node.js 18, PostgreSQL client, pdftk, nginx

```bash
# 1. Clone and enter repo
git clone https://github.com/meezlung/saln-microservices.git
cd saln-microservices
git checkout oop

# 2. Copy environment files
cp environment-files/auth-service/.env      services/auth-service/.env
cp environment-files/form-service/.env      services/form-service/.env
cp environment-files/document-service/.env  services/document-service/.env

# 3. Install dependencies and run migrations (once per service)
(cd services/auth-service     && composer install && php artisan migrate)
(cd services/form-service     && composer install && php artisan migrate)
(cd services/document-service && composer install && php artisan migrate)
(cd frontend/web              && npm install)

# 4. Start all services
./run-backend.sh
```

Services start at:
- Auth: `http://127.0.0.1:8001`
- Form: `http://127.0.0.1:8002`
- Document: `http://127.0.0.1:8003`
- Frontend: `http://127.0.0.1:5173`

> `run-backend.sh` does **not** start `php artisan queue:work` for the document service. Run it separately in a second terminal if PDF generation is needed locally.

---

## Deploying to AWS Lambda

**Prerequisites:** AWS CLI, Serverless Framework v4 (`npm i -g serverless`), Terraform, Composer

```bash
git checkout aws-try

# Deploy auth service first (note the Function URL in the output)
cd services/auth-service && composer install --no-dev --optimize-autoloader --ignore-platform-reqs
sudo serverless deploy
serverless bref:cli --args="migrate --force"

# Deploy form service (set AUTH_SERVICE_URL in serverless.yml to auth Lambda URL)
cd ../form-service && composer install --no-dev --optimize-autoloader --ignore-platform-reqs
sudo serverless deploy
serverless bref:cli --args="migrate --force"

# Build and deploy frontend
cd ../../frontend/web && npm ci && npm run build
aws s3 sync dist/ s3://saln-frontend-79bf7afb --delete
aws cloudfront create-invalidation --distribution-id EQEE7KAFB0063 --paths "/*"

# Provision CloudFront + S3 via Terraform
cp environment-files/terraform.tfvars infra/frontend-static/terraform/terraform.tfvars
cd infra/frontend-static/terraform && terraform init && terraform apply
```

Full step-by-step guide: [`docs/setup-guide.typ`](docs/setup-guide.typ)

---

## Services

| Service | Port (local) | Database | Key routes |
|---|---|---|---|
| Auth | 8001 | `saln_auth_db` | `POST /api/send-code`, `POST /api/verify-login`, `GET /api/me` |
| Form | 8002 | `saln_form_db` | `GET /api/forms/latest`, `POST /api/forms/save`, `GET /api/forms/export` |
| Document | 8003 | `saln_document_db` | `POST /api/documents/generate`, `GET /api/documents/{id}/download` |

Authentication: the Form service validates every request by calling `GET /api/me` on the Auth service (token introspection). The Document service accepts `X-User-Id` and `Authorization` headers directly from the frontend.

---

## Docs

The [`docs/`](docs/) folder contains detailed documentation for the full system — see it for architecture diagrams, setup instructions, and a full dependency inventory.

| File | Contents |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Diagrams, CloudFront routing table, path-prefix stripping, auth flow, DB schema |
| [`docs/architecture.typ`](docs/architecture.typ) | Architecture diagrams with descriptions + full JSON schema |
| [`docs/setup-guide.typ`](docs/setup-guide.typ) | Local Ubuntu setup and AWS Lambda deployment walkthrough |
| [`docs/dependencies.typ`](docs/dependencies.typ) | All Composer, npm, system, and infrastructure dependencies |

---

## Team

- Batistil, Mansur
- Camacho, Reuter Jan
- Filio, Ethan
- Mislang, Gabriel
- Rodrigo, Dom
