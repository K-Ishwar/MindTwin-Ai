# MindTwin AI - Auth Service

This microservice handles student registration, authentication, JWT issuing, and session management using Redis for refresh tokens. It runs on port 3001.

## Endpoints

### 1. Health Check
`GET /health`
Returns service status.

### 2. Register
`POST /api/auth/register`

**Request Body:**
```json
{
  "name": "Arjun Kumar",
  "email": "arjun.new@example.com",
  "password": "securepassword123",
  "grade_level": "Class 12",
  "board": "CBSE"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Account created",
  "student": {
    "id": "uuid",
    "name": "Arjun Kumar",
    "email": "arjun.new@example.com",
    "grade_level": "Class 12",
    "board": "CBSE"
  }
}
```

### 3. Login
`POST /api/auth/login`

**Request Body:**
```json
{
  "email": "arjun.new@example.com",
  "password": "securepassword123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsIn...",
  "student": {
    "id": "uuid",
    "name": "Arjun Kumar",
    "email": "arjun.new@example.com",
    "grade_level": "Class 12",
    "board": "CBSE",
    "onboarding_completed": false
  }
}
```

### 4. Refresh Token
`POST /api/auth/refresh`

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsIn..."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIsIn..."
}
```

### 5. Get Current User Profile (Protected)
`GET /api/auth/me`

**Headers:**
`Authorization: Bearer <accessToken>`

**Response (200 OK):**
```json
{
  "success": true,
  "student": {
    "id": "uuid",
    "name": "Arjun Kumar",
    "email": "arjun.new@example.com",
    "grade_level": "Class 12",
    "board": "CBSE",
    "max_daily_study_hours": 6,
    "preferred_study_start_time": "08:00:00",
    "onboarding_completed": false,
    "created_at": "2024-05-09T...",
    "updated_at": "2024-05-09T..."
  }
}
```

### 6. Logout (Protected)
`POST /api/auth/logout`

**Headers:**
`Authorization: Bearer <accessToken>`

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out"
}
```
