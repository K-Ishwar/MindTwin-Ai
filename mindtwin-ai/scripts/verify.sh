#!/bin/bash

echo "Verifying MindTwin AI Services..."

SERVICES=(
  "auth-service:3001"
  "profile-service:3002"
  "scheduler-service:3003"
  "quiz-service:3004"
  "stress-service:3005"
  "reward-service:3006"
  "notification-service:3007"
  "ai-engine:8000"
)

ALL_PASS=true

for service in "${SERVICES[@]}"; do
  IFS=":" read -r NAME PORT <<< "$service"
  URL="http://localhost:$PORT/health"
  
  if curl -s -f "$URL" > /dev/null; then
    echo -e "$NAME ($PORT):\t PASS"
  else
    echo -e "$NAME ($PORT):\t FAIL"
    ALL_PASS=false
  fi
done

if curl -s -f "http://localhost:80/health" > /dev/null; then
  echo -e "nginx (80):\t\t PASS"
else
  echo -e "nginx (80):\t\t FAIL"
  ALL_PASS=false
fi

echo "====================================="
if [ "$ALL_PASS" = true ]; then
  echo "SUMMARY: ALL PASS!"
  exit 0
else
  echo "SUMMARY: SOME SERVICES FAILED."
  exit 1
fi
