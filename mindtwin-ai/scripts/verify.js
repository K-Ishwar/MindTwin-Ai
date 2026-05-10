const http = require('http');

const services = [
  { name: 'auth-service', port: 3001 },
  { name: 'profile-service', port: 3002 },
  { name: 'scheduler-service', port: 3003 },
  { name: 'quiz-service', port: 3004 },
  { name: 'stress-service', port: 3005 },
  { name: 'reward-service', port: 3006 },
  { name: 'notification-service', port: 3007 },
  { name: 'ai-engine', port: 8000 },
  { name: 'nginx', port: 80 }
];

console.log("Verifying MindTwin AI Services...\n");

let allPass = true;
let completed = 0;

services.forEach((svc) => {
  const req = http.get(`http://localhost:${svc.port}/health`, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log(`\x1b[32m${svc.name} (${svc.port}):\t PASS\x1b[0m`);
    } else {
      console.log(`\x1b[31m${svc.name} (${svc.port}):\t FAIL (Status: ${res.statusCode})\x1b[0m`);
      allPass = false;
    }
    checkDone();
  });

  req.on('error', (e) => {
    console.log(`\x1b[31m${svc.name} (${svc.port}):\t FAIL (${e.message})\x1b[0m`);
    allPass = false;
    checkDone();
  });
});

function checkDone() {
  completed++;
  if (completed === services.length) {
    console.log("\n=====================================");
    if (allPass) {
      console.log("\x1b[32mSUMMARY: ALL PASS!\x1b[0m");
      process.exit(0);
    } else {
      console.log("\x1b[31mSUMMARY: SOME SERVICES FAILED.\x1b[0m");
      process.exit(1);
    }
  }
}
