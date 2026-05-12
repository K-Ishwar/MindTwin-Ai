# GitHub Repository Setup Guide

This document covers the one-time GitHub configuration required before the CI/CD pipelines work correctly.

---

## 1. Branch Protection Rules

Configure these in **Settings → Branches → Add branch protection rule**.

### `main` branch (production)

| Setting | Value |
|---|---|
| Require a pull request before merging | ✅ Enabled |
| Required approving reviews | 1 (minimum) |
| Dismiss stale reviews when new commits are pushed | ✅ Enabled |
| Require status checks to pass before merging | ✅ Enabled |
| Required status checks | `Test Backend Services`, `Test AI Engine`, `Test & Build Web Frontend`, `Lint All Code`, `Security Audit` |
| Require branches to be up to date before merging | ✅ Enabled |
| Do not allow bypassing the above settings | ✅ Enabled |
| Allow force pushes | ❌ Disabled |
| Allow deletions | ❌ Disabled |

### `develop` branch (staging / integration)

| Setting | Value |
|---|---|
| Require a pull request before merging | ✅ Enabled |
| Required approving reviews | 1 |
| Require status checks to pass before merging | ✅ Enabled |
| Required status checks | `Test Backend Services`, `Test AI Engine`, `Lint All Code` |
| Allow force pushes | ❌ Disabled |

---

## 2. GitHub Secrets

Add these in **Settings → Secrets and variables → Actions → New repository secret**.

### AWS / ECR

| Secret | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM user access key (deploy-only permissions) |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key |
| `ECR_REGISTRY` | ECR registry URL, e.g. `123456789.dkr.ecr.ap-south-1.amazonaws.com` |

### EC2 SSH

| Secret | Description |
|---|---|
| `EC2_HOST` | Public IP or domain of the production EC2 instance |
| `EC2_SSH_KEY` | Full contents of the private key (`.pem` file) used to SSH into EC2 |

### Notifications (optional)

| Secret | Description |
|---|---|
| `SLACK_WEBHOOK_URL` | Incoming webhook URL for deploy success/failure notifications |

---

## 3. GitHub Environment: `production`

Create a **production** environment in **Settings → Environments → New environment**.

Recommended settings:
- **Required reviewers**: add at least one team lead who must approve before deploy runs
- **Wait timer**: 0 minutes (or set a delay if you want a manual window to cancel)
- **Deployment branches**: restrict to `main` only

This means every push to `main` will pause at the deploy job and wait for a reviewer to approve before the EC2 deploy actually runs.

---

## 4. IAM Policy for the Deploy User

Create a dedicated IAM user (`mindtwin-deploy`) with the following minimum permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": "*"
    }
  ]
}
```

The EC2 SSH deploy step handles the actual container orchestration — no EC2 API permissions are needed for the IAM user.

---

## 5. EC2 Pre-requisites

The production EC2 instance must have the following set up before the first deploy:

```bash
# Install Docker
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin
sudo usermod -aG docker ubuntu

# Install AWS CLI (for ECR login on the instance)
sudo apt-get install -y awscli

# Clone the repo
git clone https://github.com/YOUR_ORG/MindTwin-Ai.git /home/ubuntu/mindtwin-ai
cd /home/ubuntu/mindtwin-ai/mindtwin-ai

# Create .env.prod from the example and fill in all values
cp .env.prod.example .env.prod
nano .env.prod   # fill in all CHANGE_ME values
```

The deploy workflow SSHs in, runs `git pull`, pulls new images from ECR, and restarts containers. The `.env.prod` file stays on the instance and is never transmitted through CI.

---

## 6. Workflow Summary

```
Developer pushes to feature branch
        │
        ▼
Opens PR → target: develop
        │
        ▼
CI runs automatically (ci.yml)
  ├── Test Backend Services
  ├── Test AI Engine
  ├── Test & Build Web Frontend
  ├── Lint All Code
  └── Security Audit
        │
        ▼ (all checks green + 1 approval)
Merge to develop
        │
        ▼
Opens PR → target: main
        │
        ▼
CI runs again on main PR
        │
        ▼ (all checks green + 1 approval)
Merge to main
        │
        ▼
deploy.yml triggers automatically
  ├── Build & push all Docker images to ECR
  ├── SSH into EC2 → git pull → docker pull → migrate → restart
  └── Post-deploy smoke test → notify team
```
