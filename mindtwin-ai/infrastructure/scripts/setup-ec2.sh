#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# MindTwin AI — EC2 Bootstrap Script
# Run once on a fresh Ubuntu 22.04 LTS instance.
# Usage: bash setup-ec2.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_URL="https://github.com/YOUR_USERNAME/MindTwin-Ai.git"
APP_DIR="/home/ubuntu/mindtwin-ai"
COMPOSE_VERSION="v2.27.0"

echo "════════════════════════════════════════════════════════"
echo "  MindTwin AI — EC2 Setup"
echo "════════════════════════════════════════════════════════"

# ── 1. System update ──────────────────────────────────────────────────────────
echo ""
echo "── [1/9] Updating system packages ──"
sudo apt-get update -y
sudo apt-get upgrade -y
sudo apt-get install -y \
  curl \
  git \
  unzip \
  jq \
  htop \
  net-tools \
  ca-certificates \
  gnupg \
  lsb-release

# ── 2. Docker ─────────────────────────────────────────────────────────────────
echo ""
echo "── [2/9] Installing Docker ──"
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sudo sh /tmp/get-docker.sh
  rm /tmp/get-docker.sh
  sudo usermod -aG docker ubuntu
  echo "Docker installed."
else
  echo "Docker already installed — skipping."
fi

# ── 3. Docker Compose (standalone binary) ────────────────────────────────────
echo ""
echo "── [3/9] Installing Docker Compose ${COMPOSE_VERSION} ──"
if ! command -v docker-compose &> /dev/null; then
  sudo curl -SL \
    "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" \
    -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
  echo "Docker Compose installed: $(docker-compose --version)"
else
  echo "Docker Compose already installed — skipping."
fi

# ── 4. AWS CLI v2 ─────────────────────────────────────────────────────────────
echo ""
echo "── [4/9] Installing AWS CLI v2 ──"
if ! command -v aws &> /dev/null; then
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
  unzip -q /tmp/awscliv2.zip -d /tmp/
  sudo /tmp/aws/install
  rm -rf /tmp/awscliv2.zip /tmp/aws
  echo "AWS CLI installed: $(aws --version)"
else
  echo "AWS CLI already installed — skipping."
fi

# ── 5. Host NGINX + Certbot ───────────────────────────────────────────────────
echo ""
echo "── [5/9] Installing NGINX and Certbot ──"
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Copy host-level NGINX config
sudo cp /home/ubuntu/mindtwin-ai/mindtwin-ai/infrastructure/nginx-host.conf \
        /etc/nginx/sites-available/mindtwin
sudo ln -sf /etc/nginx/sites-available/mindtwin /etc/nginx/sites-enabled/mindtwin
sudo rm -f /etc/nginx/sites-enabled/default

# Test config syntax before reloading
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
echo "NGINX installed and configured."

# ── 6. Clone repository ───────────────────────────────────────────────────────
echo ""
echo "── [6/9] Cloning repository ──"
if [ ! -d "$APP_DIR" ]; then
  git clone "$REPO_URL" "$APP_DIR"
  echo "Repository cloned to $APP_DIR"
else
  echo "Repository already exists at $APP_DIR — pulling latest."
  cd "$APP_DIR" && git pull origin main
fi

# ── 7. Log rotation ───────────────────────────────────────────────────────────
echo ""
echo "── [7/9] Configuring log rotation ──"
sudo tee /etc/logrotate.d/mindtwin > /dev/null << 'LOGROTATE'
/home/ubuntu/mindtwin-ai/mindtwin-ai/backend/*/logs/*.log {
  daily
  rotate 7
  compress
  missingok
  notifempty
  copytruncate
}
LOGROTATE
echo "Log rotation configured."

# ── 8. Docker daemon log rotation ────────────────────────────────────────────
echo ""
echo "── [8/9] Configuring Docker daemon log limits ──"
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json > /dev/null << 'DOCKERD'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
DOCKERD
sudo systemctl restart docker
echo "Docker daemon configured."

# ── 9. Systemd service for auto-start on reboot ───────────────────────────────
echo ""
echo "── [9/9] Creating systemd service for auto-start ──"
sudo tee /etc/systemd/system/mindtwin.service > /dev/null << SERVICE
[Unit]
Description=MindTwin AI Docker Compose
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${APP_DIR}/mindtwin-ai
ExecStart=/usr/local/bin/docker-compose -f docker-compose.prod.yml up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.prod.yml down
TimeoutStartSec=300
User=ubuntu
Group=ubuntu

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable mindtwin.service
echo "Systemd service created — MindTwin will auto-start on reboot."

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo "  EC2 setup complete!"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo ""
echo "  1. Copy your production env file:"
echo "     scp .env.prod ubuntu@<ELASTIC_IP>:${APP_DIR}/mindtwin-ai/.env.prod"
echo ""
echo "  2. Log into ECR and pull images:"
echo "     aws ecr get-login-password --region ap-south-1 | \\"
echo "       docker login --username AWS --password-stdin \$ECR_REGISTRY"
echo ""
echo "  3. Start all services:"
echo "     cd ${APP_DIR}/mindtwin-ai"
echo "     docker-compose -f docker-compose.prod.yml up -d"
echo ""
echo "  4. Obtain SSL certificate:"
echo "     sudo certbot --nginx -d mindtwin.ai -d api.mindtwin.ai -d app.mindtwin.ai"
echo ""
echo "  5. Verify everything is running:"
echo "     docker-compose -f docker-compose.prod.yml ps"
echo "     curl http://localhost/health"
echo ""
