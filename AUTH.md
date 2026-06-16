# Authentication & Multi-Tenant Setup

## Overview

The donation tracking system now supports multi-tenant architecture with user authentication. Each organization maintains complete data isolation.

## Quick Start

### Without Database (Demo Mode)

Use default credentials:
- Email: `demo@example.com`
- Password: `demo`

```bash
node server.cjs
# Visit http://localhost:3100
```

### With PostgreSQL Database

Set environment variable:

```bash
export DATABASE_URL="postgresql://user:password@host:5432/donation_db"
node server.cjs
```

## API Endpoints

### Authentication

#### Register New Organization User
```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure-password",
  "name": "User Name",
  "organizationId": "org-name"  // optional, defaults to 'default'
}

Response:
{
  "ok": true,
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "userId": "user_abc123",
  "organizationId": "org-name"
}
```

#### Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure-password",
  "organizationId": "org-name"  // optional, defaults to 'default'
}

Response:
{
  "ok": true,
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "organizationId": "org-name",
  "userId": "user_abc123"
}
```

#### Get Current User
```bash
GET /api/auth/me
Authorization: Bearer <token>

Response:
{
  "userId": "user_abc123",
  "organizationId": "org-name",
  "email": "user@example.com",
  "name": "User Name"
}
```

#### Logout
```bash
POST /api/auth/logout
Authorization: Bearer <token>

Response:
{
  "ok": true
}
```

## Data Access

All donation data is automatically filtered by the authenticated user's organization.

When making API requests, include the token in the Authorization header:

```bash
Authorization: Bearer <your-token-here>
```

### Examples

```bash
# Get donors for current organization
curl -H "Authorization: Bearer <token>" \
  http://localhost:3100/api/donors?month=2026-05

# Add donation for current organization
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"boxNo": "001", "amount": 100, "month": "2026-05"}' \
  http://localhost:3100/api/donations
```

## Data Isolation

- Each organization has its own database partition
- Users only see data from their assigned organization
- No cross-organization data leakage possible
- All queries automatically filtered by organization

## Frontend Integration

Update `public/app.js` to:

1. Store token in localStorage after login
2. Send token with all API requests
3. Redirect to login page if token is missing/invalid

Example:

```javascript
// Store token after login
localStorage.setItem('authToken', response.token);
localStorage.setItem('orgId', response.organizationId);

// Send with requests
const token = localStorage.getItem('authToken');
fetch('/api/donors', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

## Future Enhancements

- [ ] Add JWT with expiration timestamps
- [ ] Add Redis for token storage (scale beyond in-memory)
- [ ] Add password reset flow
- [ ] Add user roles (admin, agent, viewer)
- [ ] Add organization management UI
- [ ] Add audit logging per organization
- [ ] Add multi-organization admin panel
