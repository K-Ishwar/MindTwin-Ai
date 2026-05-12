# MindTwin AI — AWS Infrastructure Setup

> **Region:** `ap-south-1` (Mumbai) — lowest latency for Indian students.
> **Estimated cost:** ~$65/month for MVP. See cost breakdown at the bottom.

---

## Architecture Overview

```
                        ┌─────────────────────────────────────────┐
                        │              Route 53 (DNS)              │
                        │  mindtwin.ai  →  CloudFront (web)        │
                        │  api.mindtwin.ai  →  EC2 Elastic IP      │
                        └──────────────┬──────────────────────────┘
                                       │
              ┌────────────────────────▼────────────────────────┐
              │           EC2 t3.medium (Ubuntu 22.04)           │
              │                                                   │
              │  ┌─────────────────────────────────────────────┐ │
              │  │  Host NGINX (port 80/443, Let's Encrypt SSL) │ │
              │  └──────────────────┬──────────────────────────┘ │
              │                     │ proxy_pass localhost:8080   │
              │  ┌──────────────────▼──────────────────────────┐ │
              │  │  Docker NGINX (port 8080, internal routing)  │ │
              │  └──┬──────┬──────┬──────┬──────┬──────┬───────┘ │
              │     │      │      │      │      │      │          │
              │  auth  profile  quiz  stress  reward  ai-engine   │
              │  :3001  :3002  :3004  :3005  :3006   :8000        │
              │                                                   │
              └──────┬──────────────┬──────────────┬─────────────┘
                     │              │              │
              ┌──────▼──────┐ ┌────▼────┐  ┌──────▼──────┐
              │  RDS Postgres│ │ElastiCch│  │MongoDB Atlas│
              │  db.t3.micro │ │t3.micro │  │  M0 (free)  │
              └─────────────┘ └─────────┘  └─────────────┘

              ┌─────────────┐  ┌──────────────┐  ┌──────────┐
              │  S3 Bucket  │  │  CloudFront  │  │   ECR    │
              │  (files)    │◄─│  (CDN/web)   │  │ (images) │
              └─────────────┘  └──────────────┘  └──────────┘
```

**Component responsibilities:**

| Component | Purpose |
|---|---|
| EC2 t3.medium | Runs all Docker containers via `docker-compose.prod.yml` |
| RDS PostgreSQL 16 | User accounts, sessions, quiz results, schedules |
| ElastiCache Redis 7 | JWT refresh token store, rate limiting, session cache |
| MongoDB Atlas M0 | Behavioral event logs, stress check-ins (free tier) |
| S3 | Study material uploads, profile photos |
| CloudFront | CDN for S3 assets + web frontend static files |
| Route 53 | DNS for `mindtwin.ai` and subdomains |
| ACM | SSL certificate (auto-renewed, attached to CloudFront) |
| ECR | Private Docker image registry (CI/CD pushes here) |
| CloudWatch | Container logs, billing alerts, uptime alarms |

---

## Step 1 — EC2 Instance

### 1.1 Launch the instance

1. Go to **EC2 → Launch Instance**
2. Settings:
   - **Name:** `mindtwin-prod`
   - **AMI:** Ubuntu Server 22.04 LTS (64-bit x86)
   - **Instance type:** `t3.medium` (2 vCPU, 4 GB RAM)
   - **Key pair:** Create new → `mindtwin-prod-key` → download `.pem`
   - **Storage:** 30 GB gp3 (increase to 50 GB if you expect heavy log volume)

### 1.2 Security Group — `mindtwin-prod-sg`

| Type | Protocol | Port | Source | Reason |
|---|---|---|---|---|
| SSH | TCP | 22 | Your IP only | Admin access |
| HTTP | TCP | 80 | 0.0.0.0/0 | Let's Encrypt challenge + redirect |
| HTTPS | TCP | 443 | 0.0.0.0/0 | Production traffic |
| Custom TCP | TCP | 9090 | Your IP only | Prometheus UI |
| Custom TCP | TCP | 3100 | Your IP only | Grafana UI |

> Never open 9090/3100 to 0.0.0.0/0 — these have no auth by default.

### 1.3 Elastic IP

1. **EC2 → Elastic IPs → Allocate Elastic IP address**
2. **Actions → Associate** → select `mindtwin-prod` instance
3. Note the IP — this goes into Route 53 and `EC2_HOST` GitHub secret

### 1.4 Run the bootstrap script

```bash
# From your local machine
chmod 400 mindtwin-prod-key.pem
scp -i mindtwin-prod-key.pem infrastructure/scripts/setup-ec2.sh ubuntu@<ELASTIC_IP>:~
ssh -i mindtwin-prod-key.pem ubuntu@<ELASTIC_IP>
bash ~/setup-ec2.sh
```

---

## Step 2 — RDS PostgreSQL

### 2.1 Create the instance

1. **RDS → Create database**
2. Settings:
   - **Engine:** PostgreSQL 16
   - **Template:** Free tier (dev) → switch to Production when budget allows
   - **DB instance class:** `db.t3.micro`
   - **DB instance identifier:** `mindtwin-prod-pg`
   - **Master username:** `mindtwin_user`
   - **Master password:** generate a strong password, save it
   - **Storage:** 20 GB gp2, enable autoscaling up to 100 GB
   - **VPC:** same VPC as EC2
   - **Public access:** No
   - **VPC security group:** create new → `mindtwin-rds-sg`

### 2.2 RDS Security Group

Allow inbound **port 5432** from `mindtwin-prod-sg` (the EC2 security group) only.

### 2.3 Backups

- **Automated backups:** Enabled, 7-day retention
- **Backup window:** 02:00–03:00 UTC (low traffic for India)
- **Maintenance window:** Sunday 03:00–04:00 UTC

### 2.4 Get the endpoint

After creation, copy the **Endpoint** (e.g. `mindtwin-prod-pg.xxxx.ap-south-1.rds.amazonaws.com`).
Use it in `.env.prod`:
```
DATABASE_URL=postgresql://mindtwin_user:<password>@mindtwin-prod-pg.xxxx.ap-south-1.rds.amazonaws.com:5432/mindtwin_prod
```

---

## Step 3 — ElastiCache Redis

### 3.1 Create the cluster

1. **ElastiCache → Create cluster → Redis OSS**
2. Settings:
   - **Cluster name:** `mindtwin-prod-redis`
   - **Node type:** `cache.t3.micro`
   - **Number of replicas:** 0 (add 1 replica when budget allows)
   - **Engine version:** Redis 7.x
   - **Subnet group:** create new in same VPC as EC2
   - **Security group:** create new → `mindtwin-redis-sg`

### 3.2 Redis Security Group

Allow inbound **port 6379** from `mindtwin-prod-sg` only.

### 3.3 Encryption

- **Encryption at rest:** Enabled
- **Encryption in transit:** Enabled (set `REDIS_TLS=true` in `.env.prod`)

### 3.4 Get the endpoint

Copy the **Primary endpoint** (e.g. `mindtwin-prod-redis.xxxx.cache.amazonaws.com`).
Use it in `.env.prod`:
```
REDIS_URL=redis://mindtwin-prod-redis.xxxx.cache.amazonaws.com:6379
```

---

## Step 4 — MongoDB Atlas

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) → Create account
2. **Create a project:** `MindTwin`
3. **Build a cluster → M0 (Free)**
   - **Provider:** AWS
   - **Region:** `ap-south-1` (Mumbai)
   - **Cluster name:** `mindtwin-cluster`
4. **Database Access → Add user:** `mindtwin_user` with a strong password
5. **Network Access → Add IP:** add the EC2 Elastic IP
6. **Connect → Drivers** → copy the connection string

Use it in `.env.prod`:
```
MONGODB_URI=mongodb+srv://mindtwin_user:<password>@mindtwin-cluster.xxxx.mongodb.net/mindtwin_prod?retryWrites=true&w=majority
```

---

## Step 5 — S3 Bucket

### 5.1 Create the bucket

1. **S3 → Create bucket**
2. Settings:
   - **Bucket name:** `mindtwin-files-prod`
   - **Region:** `ap-south-1`
   - **Block all public access:** ✅ Enabled (CloudFront will be the public endpoint)
   - **Versioning:** Enabled (protects against accidental deletes)
   - **Server-side encryption:** SSE-S3 (AES-256)

### 5.2 Bucket policy (allow CloudFront OAC only)

After creating the CloudFront distribution (Step 6), attach this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontOAC",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::mindtwin-files-prod/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::<ACCOUNT_ID>:distribution/<DISTRIBUTION_ID>"
        }
      }
    }
  ]
}
```

### 5.3 CORS configuration (for direct browser uploads)

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedOrigins": ["https://mindtwin.ai", "https://app.mindtwin.ai"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

---

## Step 6 — CloudFront Distributions

### 6.1 Distribution 1 — S3 files CDN

1. **CloudFront → Create distribution**
2. **Origin domain:** select `mindtwin-files-prod` S3 bucket
3. **Origin access:** Origin access control (OAC) — create new OAC
4. **Viewer protocol policy:** Redirect HTTP to HTTPS
5. **Cache policy:** CachingOptimized
6. **Alternate domain names (CNAMEs):** `files.mindtwin.ai`
7. **SSL certificate:** select ACM cert (Step 7)

### 6.2 Distribution 2 — Web frontend

1. **CloudFront → Create distribution**
2. **Origin domain:** S3 bucket where CI uploads `frontend/web/dist/`
   (or point to EC2 if serving from Docker)
3. **Default root object:** `index.html`
4. **Custom error pages:** 404 → `/index.html` (needed for React Router)
5. **Alternate domain names:** `app.mindtwin.ai`
6. **SSL certificate:** select ACM cert

---

## Step 7 — SSL Certificate (ACM)

> ACM certificates for CloudFront **must** be created in `us-east-1`, not `ap-south-1`.

1. Switch region to **us-east-1**
2. **ACM → Request certificate → Public certificate**
3. **Domain names:**
   - `mindtwin.ai`
   - `*.mindtwin.ai`
4. **Validation method:** DNS validation
5. Click **Create records in Route 53** (auto-adds CNAME records)
6. Wait ~5 minutes for validation to complete
7. Attach the certificate to both CloudFront distributions

---

## Step 8 — Route 53 DNS

1. **Route 53 → Hosted zones → Create hosted zone**
   - **Domain name:** `mindtwin.ai`
   - **Type:** Public hosted zone
2. Copy the 4 NS records to your domain registrar

### DNS Records

| Record | Type | Value |
|---|---|---|
| `mindtwin.ai` | A | EC2 Elastic IP |
| `www.mindtwin.ai` | CNAME | `mindtwin.ai` |
| `api.mindtwin.ai` | A | EC2 Elastic IP |
| `app.mindtwin.ai` | CNAME | CloudFront web distribution domain |
| `files.mindtwin.ai` | CNAME | CloudFront files distribution domain |

---

## Step 9 — ECR (Docker Image Registry)

Create one repository per service:

```bash
# Run this once from your local machine (AWS CLI must be configured)
aws ecr create-repository --repository-name mindtwin-auth-service     --region ap-south-1
aws ecr create-repository --repository-name mindtwin-profile-service   --region ap-south-1
aws ecr create-repository --repository-name mindtwin-scheduler-service --region ap-south-1
aws ecr create-repository --repository-name mindtwin-quiz-service      --region ap-south-1
aws ecr create-repository --repository-name mindtwin-stress-service    --region ap-south-1
aws ecr create-repository --repository-name mindtwin-reward-service    --region ap-south-1
aws ecr create-repository --repository-name mindtwin-notification-service --region ap-south-1
aws ecr create-repository --repository-name mindtwin-analytics-service --region ap-south-1
aws ecr create-repository --repository-name mindtwin-ai-engine         --region ap-south-1
aws ecr create-repository --repository-name mindtwin-web               --region ap-south-1
```

Set **image tag mutability:** Mutable (so `latest` tag can be overwritten by CI).
Enable **scan on push** to catch known CVEs automatically.

The ECR registry URL format is:
```
<AWS_ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com
```
Add this as the `ECR_REGISTRY` GitHub secret.

---

## Step 10 — GitHub Secrets

Add all of these in **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Where to get it |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM → Users → `mindtwin-deploy` → Security credentials |
| `AWS_SECRET_ACCESS_KEY` | Same as above |
| `ECR_REGISTRY` | `<account_id>.dkr.ecr.ap-south-1.amazonaws.com` |
| `EC2_HOST` | EC2 Elastic IP address |
| `EC2_SSH_KEY` | Full contents of `mindtwin-prod-key.pem` |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Console → Project settings → Service accounts |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | Same command, run again for a different value |
| `INTERNAL_API_KEY` | Same command |
| `SMTP_USER` | Gmail address used for sending |
| `SMTP_PASS` | Gmail App Password (not your account password) |

---

## Step 11 — CloudWatch Alarms

Run `infrastructure/scripts/setup-cloudwatch.sh` after EC2 is live to create:

- **CPU > 80%** for 5 minutes → SNS email alert
- **Memory > 85%** → alert
- **Disk > 80%** → alert
- **Billing > $80/month** → alert (catches runaway costs early)

---

## Estimated Monthly Cost (ap-south-1)

| Service | Spec | Cost |
|---|---|---|
| EC2 t3.medium | 2 vCPU, 4 GB, 30 GB gp3 | ~$30/month |
| RDS db.t3.micro | PostgreSQL 16, 20 GB | ~$15/month |
| ElastiCache cache.t3.micro | Redis 7 | ~$13/month |
| MongoDB Atlas M0 | Free tier | $0 |
| S3 + CloudFront | ~10 GB storage, ~50 GB transfer | ~$5/month |
| Route 53 | 1 hosted zone + queries | ~$0.50/month |
| ECR | ~5 GB image storage | ~$0.50/month |
| ACM | SSL certificate | $0 |
| CloudWatch | Basic metrics + 5 alarms | ~$1/month |
| **Total** | | **~$65/month** |

> Upgrade path: when you hit 1000+ DAU, move to EC2 t3.large ($60/month) and RDS db.t3.small ($30/month). Total becomes ~$110/month. At 10,000+ DAU, consider ECS Fargate for auto-scaling.
