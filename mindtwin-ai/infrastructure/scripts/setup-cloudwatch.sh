#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# MindTwin AI — CloudWatch Alarms Setup
# Run once from your local machine (AWS CLI must be configured).
# Usage: bash setup-cloudwatch.sh <EC2_INSTANCE_ID> <SNS_EMAIL>
# Example: bash setup-cloudwatch.sh i-0abc123def456789 team@mindtwin.ai
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

INSTANCE_ID="${1:-}"
ALERT_EMAIL="${2:-}"
REGION="ap-south-1"
ALARM_PREFIX="mindtwin-prod"

if [ -z "$INSTANCE_ID" ] || [ -z "$ALERT_EMAIL" ]; then
  echo "Usage: bash setup-cloudwatch.sh <EC2_INSTANCE_ID> <ALERT_EMAIL>"
  echo "Example: bash setup-cloudwatch.sh i-0abc123def456789 team@mindtwin.ai"
  exit 1
fi

echo "Setting up CloudWatch alarms for instance: $INSTANCE_ID"
echo "Alerts will be sent to: $ALERT_EMAIL"
echo ""

# ── Create SNS topic for alerts ───────────────────────────────────────────────
echo "── Creating SNS topic ──"
SNS_ARN=$(aws sns create-topic \
  --name "${ALARM_PREFIX}-alerts" \
  --region "$REGION" \
  --query 'TopicArn' \
  --output text)

echo "SNS Topic ARN: $SNS_ARN"

# Subscribe email to the topic
aws sns subscribe \
  --topic-arn "$SNS_ARN" \
  --protocol email \
  --notification-endpoint "$ALERT_EMAIL" \
  --region "$REGION"

echo "Subscription confirmation email sent to $ALERT_EMAIL — confirm it before alarms fire."
echo ""

# ── EC2 CPU alarm ─────────────────────────────────────────────────────────────
echo "── Creating CPU alarm (>80% for 5 min) ──"
aws cloudwatch put-metric-alarm \
  --alarm-name "${ALARM_PREFIX}-cpu-high" \
  --alarm-description "EC2 CPU utilization above 80% for 5 minutes" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --dimensions Name=InstanceId,Value="$INSTANCE_ID" \
  --alarm-actions "$SNS_ARN" \
  --ok-actions "$SNS_ARN" \
  --region "$REGION"

# ── EC2 disk alarm (requires CloudWatch agent) ────────────────────────────────
echo "── Creating disk alarm (>80% used) ──"
aws cloudwatch put-metric-alarm \
  --alarm-name "${ALARM_PREFIX}-disk-high" \
  --alarm-description "EC2 disk usage above 80%" \
  --metric-name disk_used_percent \
  --namespace CWAgent \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --dimensions Name=InstanceId,Value="$INSTANCE_ID" Name=path,Value="/" Name=fstype,Value=ext4 \
  --alarm-actions "$SNS_ARN" \
  --region "$REGION"

# ── EC2 memory alarm (requires CloudWatch agent) ──────────────────────────────
echo "── Creating memory alarm (>85% used) ──"
aws cloudwatch put-metric-alarm \
  --alarm-name "${ALARM_PREFIX}-memory-high" \
  --alarm-description "EC2 memory usage above 85%" \
  --metric-name mem_used_percent \
  --namespace CWAgent \
  --statistic Average \
  --period 300 \
  --threshold 85 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --dimensions Name=InstanceId,Value="$INSTANCE_ID" \
  --alarm-actions "$SNS_ARN" \
  --region "$REGION"

# ── EC2 status check alarm ────────────────────────────────────────────────────
echo "── Creating instance status check alarm ──"
aws cloudwatch put-metric-alarm \
  --alarm-name "${ALARM_PREFIX}-status-check" \
  --alarm-description "EC2 instance status check failed" \
  --metric-name StatusCheckFailed \
  --namespace AWS/EC2 \
  --statistic Maximum \
  --period 60 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 2 \
  --dimensions Name=InstanceId,Value="$INSTANCE_ID" \
  --alarm-actions "$SNS_ARN" \
  --region "$REGION"

# ── RDS CPU alarm ─────────────────────────────────────────────────────────────
echo "── Creating RDS CPU alarm (>80%) ──"
aws cloudwatch put-metric-alarm \
  --alarm-name "${ALARM_PREFIX}-rds-cpu-high" \
  --alarm-description "RDS CPU utilization above 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --dimensions Name=DBInstanceIdentifier,Value="mindtwin-prod-pg" \
  --alarm-actions "$SNS_ARN" \
  --region "$REGION"

# ── RDS free storage alarm ────────────────────────────────────────────────────
echo "── Creating RDS free storage alarm (<2 GB) ──"
aws cloudwatch put-metric-alarm \
  --alarm-name "${ALARM_PREFIX}-rds-storage-low" \
  --alarm-description "RDS free storage below 2 GB" \
  --metric-name FreeStorageSpace \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --threshold 2147483648 \
  --comparison-operator LessThanThreshold \
  --evaluation-periods 1 \
  --dimensions Name=DBInstanceIdentifier,Value="mindtwin-prod-pg" \
  --alarm-actions "$SNS_ARN" \
  --region "$REGION"

# ── Billing alarm (us-east-1 only — billing metrics are global) ───────────────
echo "── Creating billing alarm (>$80/month) ──"
aws cloudwatch put-metric-alarm \
  --alarm-name "${ALARM_PREFIX}-billing-high" \
  --alarm-description "AWS monthly bill exceeds \$80" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 86400 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --dimensions Name=Currency,Value=USD \
  --alarm-actions "$SNS_ARN" \
  --region us-east-1   # billing metrics are only in us-east-1

echo ""
echo "════════════════════════════════════════════════════════"
echo "  CloudWatch alarms created successfully!"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Alarms created:"
echo "  - ${ALARM_PREFIX}-cpu-high         (EC2 CPU > 80%)"
echo "  - ${ALARM_PREFIX}-disk-high        (Disk > 80%)"
echo "  - ${ALARM_PREFIX}-memory-high      (Memory > 85%)"
echo "  - ${ALARM_PREFIX}-status-check     (EC2 status check failed)"
echo "  - ${ALARM_PREFIX}-rds-cpu-high     (RDS CPU > 80%)"
echo "  - ${ALARM_PREFIX}-rds-storage-low  (RDS free storage < 2 GB)"
echo "  - ${ALARM_PREFIX}-billing-high     (Monthly bill > \$80)"
echo ""
echo "NOTE: Disk and memory alarms require the CloudWatch agent."
echo "Install it on EC2 with:"
echo "  sudo apt-get install -y amazon-cloudwatch-agent"
echo "  sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard"
