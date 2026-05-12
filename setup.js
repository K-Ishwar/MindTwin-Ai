const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'mindtwin-ai');

const dirs = [
  'frontend',
  'frontend/mobile',
  'frontend/web',
  'backend',
  'ai-engine',
  'ai-engine/routers',
  'ai-engine/models',
  'ai-engine/services',
  'data',
  'data/raw',
  'data/processed',
  'docs',
];

const services = [
  { name: 'auth-service', port: 3001 },
  { name: 'profile-service', port: 3002 },
  { name: 'scheduler-service', port: 3003 },
  { name: 'quiz-service', port: 3004 },
  { name: 'stress-service', port: 3005 },
  { name: 'reward-service', port: 3006 },
  { name: 'notification-service', port: 3007 }
];

services.forEach(s => {
  dirs.push('backend/' + s.name);
  dirs.push('backend/' + s.name + '/src');
  dirs.push('backend/' + s.name + '/src/routes');
  dirs.push('backend/' + s.name + '/src/controllers');
  dirs.push('backend/' + s.name + '/src/models');
});

dirs.forEach(d => fs.mkdirSync(path.join(root, d), { recursive: true }));

const envExample = `DATABASE_URL=postgres://user:password@postgres:5432/mindtwin_db
MONGODB_URI=mongodb://mongo:27017/mindtwin_db
REDIS_URL=redis://redis:6379

JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_jwt_refresh_secret

AUTH_SERVICE_PORT=3001
PROFILE_SERVICE_PORT=3002
SCHEDULER_SERVICE_PORT=3003
QUIZ_SERVICE_PORT=3004
STRESS_SERVICE_PORT=3005
REWARD_SERVICE_PORT=3006
NOTIFICATION_SERVICE_PORT=3007

AI_ENGINE_URL=http://ai-engine:8000
`;
fs.writeFileSync(path.join(root, '.env.example'), envExample);

let composeFull = `version: '3.8'

services:
  postgres:
    image: postgres:16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: mindtwin_db
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password

  mongodb:
    image: mongo:7
    ports:
      - "27017:27017"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro

  ai-engine:
    build: ./ai-engine
    ports:
      - "8000:8000"
    env_file:
      - .env.example

`;
services.forEach(s => {
  composeFull += `  ${s.name}:
    build: ./backend/${s.name}
    ports:
      - "${s.port}:${s.port}"
    env_file:
      - .env.example
    environment:
      - PORT=${s.port}

`;
});
fs.writeFileSync(path.join(root, 'docker-compose.yml'), composeFull);

const nginxConf = `events {}
http {
    server {
        listen 80;
        location /api/auth/ { proxy_pass http://auth-service:3001/; }
        location /api/profile/ { proxy_pass http://profile-service:3002/; }
        location /api/scheduler/ { proxy_pass http://scheduler-service:3003/; }
        location /api/quiz/ { proxy_pass http://quiz-service:3004/; }
        location /api/stress/ { proxy_pass http://stress-service:3005/; }
        location /api/reward/ { proxy_pass http://reward-service:3006/; }
        location /api/notification/ { proxy_pass http://notification-service:3007/; }
        location /api/ai/ { proxy_pass http://ai-engine:8000/; }
    }
}
`;
fs.writeFileSync(path.join(root, 'nginx.conf'), nginxConf);

const readme = `# MindTwin AI

A full-stack monorepo for MindTwin AI.

## Project Structure
- \`frontend/mobile\`: React Native Expo app.
- \`frontend/web\`: Vite React web app.
- \`backend/*\`: Node.js Express microservices.
- \`ai-engine\`: Python FastAPI microservice.

## Getting Started
1. Copy \`.env.example\` to \`.env\`.
2. Run \`docker-compose up --build\` to start all services.
`;
fs.writeFileSync(path.join(root, 'README.md'), readme);

services.forEach(s => {
  const pkg = {
    name: s.name,
    version: "1.0.0",
    main: "src/index.js",
    scripts: {
      start: "node src/index.js",
      dev: "nodemon src/index.js"
    },
    dependencies: {
      "express": "^4.18.2",
      "cors": "^2.8.5",
      "dotenv": "^16.3.1",
      "pg": "^8.11.3",
      "mongoose": "^7.5.0",
      "redis": "^4.6.8",
      "jsonwebtoken": "^9.0.2",
      "bcrypt": "^5.1.1"
    }
  };
  fs.writeFileSync(path.join(root, 'backend/' + s.name + '/package.json'), JSON.stringify(pkg, null, 2));

  const indexJs = `const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World from ${s.name}');
});

const PORT = process.env.PORT || ${s.port};
app.listen(PORT, () => {
  console.log('${s.name} listening on port ' + PORT);
});
`;
  fs.writeFileSync(path.join(root, 'backend/' + s.name + '/src/index.js'), indexJs);
  fs.writeFileSync(path.join(root, 'backend/' + s.name + '/src/routes/.gitkeep'), '');
  fs.writeFileSync(path.join(root, 'backend/' + s.name + '/src/controllers/.gitkeep'), '');
  fs.writeFileSync(path.join(root, 'backend/' + s.name + '/src/models/.gitkeep'), '');

  const dockerfile = `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE ${s.port}
CMD ["npm", "start"]
`;
  fs.writeFileSync(path.join(root, 'backend/' + s.name + '/Dockerfile'), dockerfile);
});

const reqs = `fastapi
uvicorn
numpy
scipy
pandas
torch
scikit-learn
networkx
python-dotenv
psycopg2-binary
pymongo
redis
`;
fs.writeFileSync(path.join(root, 'ai-engine/requirements.txt'), reqs);

const mainPy = `from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello World from ai-engine"}
`;
fs.writeFileSync(path.join(root, 'ai-engine/main.py'), mainPy);
fs.writeFileSync(path.join(root, 'ai-engine/routers/.gitkeep'), '');
fs.writeFileSync(path.join(root, 'ai-engine/models/.gitkeep'), '');
fs.writeFileSync(path.join(root, 'ai-engine/services/.gitkeep'), '');

const pyDockerfile = `FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`;
fs.writeFileSync(path.join(root, 'ai-engine/Dockerfile'), pyDockerfile);

console.log("Structure created successfully.");
