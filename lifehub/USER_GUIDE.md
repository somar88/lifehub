# LifeHub — User Guide

## Table of Contents

1. [Overview](#1-overview)
2. [Registration & Account Activation](#2-registration--account-activation)
3. [Authentication](#3-authentication)
4. [Your Profile](#4-your-profile)
5. [Tasks](#5-tasks)
6. [Calendar](#6-calendar)
7. [Contacts](#7-contacts)
8. [Budget](#8-budget)
9. [Shopping Lists](#9-shopping-lists)
10. [Telegram Bot](#10-telegram-bot)

---

## 1. Overview

LifeHub is a personal productivity platform. Every user has their own isolated data — your tasks, contacts, calendar events, budget records, and shopping lists are never visible to other users.

**Registration is invite-only.** You cannot create your own account — you must apply and wait for an administrator to approve your application and send an invitation link. See [Section 2](#2-registration--account-activation) for the full flow.

### Base URL

```
http://your-server:3000
```

### Interactive API Docs

A full interactive API reference (Swagger UI) is available at:

```
http://your-server:3000/api/docs
```

### Authentication

All endpoints (except apply, verify-invite, accept-invite, login, and password reset) require a JWT token in the request header:

```
Authorization: Bearer <your-token>
```

You receive the token after completing account activation or logging in. Store it and include it with every request.

### Conventions used in examples

Examples use `curl` with a shell variable `$TOKEN` for the bearer token. Set it once and reuse it:

```bash
TOKEN="eyJhbGci..."
```

All request and response bodies are JSON. Always include the header:

```
Content-Type: application/json
```

---

## 2. Registration & Account Activation

LifeHub uses an invite-only model. The full flow:

```
1. You submit an application (no password yet)
2. Admin reviews and approves → invitation email sent to you
3. You click the link in the email and set a password
4. Your account is active — log in normally from now on
```

### Step 1 — Submit an application

```bash
curl -s -X POST http://your-server:3000/api/auth/apply \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Ada",
    "lastName":  "Lovelace",
    "email":     "ada@example.com"
  }'
```

**Response:**

```json
{ "message": "Application submitted. You will be notified by email when your account is approved." }
```

> **Rate limit:** 5 applications per hour per IP.

Your account is now in `pending` status. You cannot log in until an admin approves it.

---

### Step 2 — Admin approves your application

The admin will see your application in the admin dashboard under the **Pending** tab and click **Approve**. This sends you an invitation email with a link valid for 7 days.

---

### Step 3 — Validate the invite link (optional, done by the client)

```bash
curl -s "http://your-server:3000/api/auth/verify-invite?token=<token-from-email>"
```

**Response:**

```json
{ "valid": true, "email": "ada@example.com", "name": "Ada Lovelace" }
```

If the token is invalid or expired: `400 Bad Request`.

---

### Step 4 — Set your password and activate your account

```bash
curl -s -X POST http://your-server:3000/api/auth/accept-invite \
  -H "Content-Type: application/json" \
  -d '{
    "token":    "<token-from-email>",
    "password": "securepassword123"
  }' | jq .
```

**Response:**

```json
{
  "user": {
    "_id": "64a1b2c3d4e5f6a7b8c9d0e1",
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "role": "user"
  },
  "token": "eyJhbGci..."
}
```

Your account is now `active`. Save the token:

```bash
TOKEN="eyJhbGci..."
```

---

## 3. Authentication

### Log in

```bash
curl -s -X POST http://your-server:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "ada@example.com", "password": "securepassword123"}' | jq .
```

Returns `{ user, token }`. Save the token for subsequent requests.

**Login errors by account status:**

| Status | Error message |
|---|---|
| `pending` | `Your application is pending admin approval` |
| `invited` | `Please complete signup using the link sent to your email` |
| `inactive` | `Account has been deactivated` |

> **Rate limit:** 10 login attempts per 15 minutes per IP.

---

### Log out

Revokes the current JWT so it cannot be reused even before it expires naturally. Call this when the user signs out.

```bash
curl -s -X POST http://your-server:3000/api/auth/logout \
  -H "Authorization: Bearer $TOKEN"
```

**Response:** `{ "message": "Logged out" }`

After logout, any request using the same token will receive `401 Token has been revoked`.

---

Sends a password reset link to the email address. The link expires after 1 hour.

```bash
curl -s -X POST http://your-server:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "ada@example.com"}'
```

> **Rate limit:** 5 requests per hour per IP.

---

### Reset password

Use the token from the email link to set a new password.

```bash
curl -s -X POST http://your-server:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "<token-from-email>",
    "password": "newpassword456"
  }'
```

---

## 4. Your Profile

### Get your profile

```bash
curl -s http://your-server:3000/api/users/me \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Response:**

```json
{
  "_id": "64a1b2c3d4e5f6a7b8c9d0e1",
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "role": "user",
  "isActive": true,
  "createdAt": "2026-04-22T10:00:00.000Z"
}
```

---

### Update your name or digest hour

`PATCH /api/users/me` accepts `name` and/or `dailyDigestHour` (both optional).

```bash
curl -s -X PATCH http://your-server:3000/api/users/me \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Ada K. Lovelace"}'
```

---

### Change your password

Requires your current password for verification.

```bash
curl -s -X POST http://your-server:3000/api/users/me/password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "securepassword123",
    "newPassword": "evenmoresecure789"
  }'
```

---

### Change your email address

Requires your current password for verification.

```bash
curl -s -X PATCH http://your-server:3000/api/users/me/email \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "ada.new@example.com",
    "currentPassword": "securepassword123"
  }'
```

---

### Delete your account

Permanently deletes your account and all your data. Requires your password.

```bash
curl -s -X DELETE http://your-server:3000/api/users/me \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password": "securepassword123"}'
```

---

### Set your daily digest hour

Controls when the Telegram bot sends your daily summary (open task count + today's events). Uses 24-hour format in the server's timezone.

```bash
curl -s -X PATCH http://your-server:3000/api/users/me \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dailyDigestHour": 7}'
```

Valid values: `0`–`23`. Default is `8` (8am). You can also set this from the Telegram bot with `/digest 7`.

---

## 5. Tasks

Tasks have a **status** (`todo`, `in-progress`, `done`), a **priority** (`low`, `medium`, `high`), an optional due date, and optional tags.

### Create a task

```bash
curl -s -X POST http://your-server:3000/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Write quarterly report",
    "description": "Cover Q2 results and Q3 targets",
    "priority": "high",
    "dueDate": "2026-06-30",
    "tags": ["work", "reporting"]
  }' | jq .
```

Only `title` is required. Defaults: `status: todo`, `priority: medium`.

---

### List tasks

```bash
# All tasks (paginated, newest first)
curl -s "http://your-server:3000/api/tasks" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Response shape:**

```json
{
  "tasks": [...],
  "total": 12,
  "page": 1,
  "limit": 20
}
```

**Filter examples:**

```bash
# Only high-priority todo tasks
curl -s "http://your-server:3000/api/tasks?status=todo&priority=high" \
  -H "Authorization: Bearer $TOKEN"

# Tasks tagged "work"
curl -s "http://your-server:3000/api/tasks?tag=work" \
  -H "Authorization: Bearer $TOKEN"

# Tasks due between two dates
curl -s "http://your-server:3000/api/tasks?dueAfter=2026-06-01&dueBefore=2026-06-30" \
  -H "Authorization: Bearer $TOKEN"

# Sort by due date, earliest first
curl -s "http://your-server:3000/api/tasks?sortBy=dueDate&order=asc" \
  -H "Authorization: Bearer $TOKEN"

# Page 2, 10 per page
curl -s "http://your-server:3000/api/tasks?page=2&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

---

### Get task stats

Returns counts by status plus overdue tasks (non-done tasks whose due date has passed).

```bash
curl -s http://your-server:3000/api/tasks/stats \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Response:**

```json
{ "todo": 5, "in-progress": 2, "done": 14, "overdue": 1 }
```

---

### Update a task

```bash
curl -s -X PATCH http://your-server:3000/api/tasks/<id> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "in-progress"}'
```

---

### Duplicate a task

Creates a copy of the task with status reset to `todo` and `(copy)` appended to the title. Useful for recurring tasks.

```bash
curl -s -X POST http://your-server:3000/api/tasks/<id>/duplicate \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

### Delete a task

```bash
curl -s -X DELETE http://your-server:3000/api/tasks/<id> \
  -H "Authorization: Bearer $TOKEN"
```

---

### Export tasks

Download all your tasks as a CSV file or JSON array.

```bash
# CSV (default)
curl -s "http://your-server:3000/api/tasks/export" \
  -H "Authorization: Bearer $TOKEN" -o tasks.csv

# JSON
curl -s "http://your-server:3000/api/tasks/export?format=json" \
  -H "Authorization: Bearer $TOKEN" -o tasks.json
```

Fields exported: `title`, `status`, `priority`, `dueDate`, `notes`, `createdAt`.

---

Events have a required **title** and **start** date/time. The **end** is optional (omit for point-in-time events or set `allDay: true` for full-day events).

### Create an event

```bash
curl -s -X POST http://your-server:3000/api/calendar \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Team standup",
    "start": "2026-06-15T09:00:00.000Z",
    "end": "2026-06-15T09:30:00.000Z",
    "location": "Conference Room B",
    "reminderMinutes": 10,
    "color": "blue"
  }' | jq .
```

`reminderMinutes` sets how many minutes before the event start a reminder is sent — via Telegram if your account is linked, via email otherwise (default: 15). Set to `0` to disable reminders for a specific event.

**All-day event:**

```bash
curl -s -X POST http://your-server:3000/api/calendar \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Company holiday",
    "start": "2026-12-25T00:00:00.000Z",
    "allDay": true
  }'
```

---

### List events

```bash
# All events, sorted by start date ascending
curl -s "http://your-server:3000/api/calendar" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Response shape:**

```json
{
  "events": [...],
  "total": 8,
  "page": 1,
  "limit": 50
}
```

**Filter examples:**

```bash
# Events in June 2026
curl -s "http://your-server:3000/api/calendar?from=2026-06-01&to=2026-06-30" \
  -H "Authorization: Bearer $TOKEN"

# Only all-day events
curl -s "http://your-server:3000/api/calendar?allDay=true" \
  -H "Authorization: Bearer $TOKEN"

# Search by title or description
curl -s "http://your-server:3000/api/calendar?search=standup" \
  -H "Authorization: Bearer $TOKEN"
```

---

### Upcoming events

Returns the next N future events sorted by start date. Useful for a dashboard widget.

```bash
# Next 5 events (default)
curl -s "http://your-server:3000/api/calendar/upcoming" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Next 10 events
curl -s "http://your-server:3000/api/calendar/upcoming?limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

Returns a plain array of events (not paginated).

---

### Update an event

```bash
curl -s -X PATCH http://your-server:3000/api/calendar/<id> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"location": "Room A", "color": "green"}'
```

---

### Delete an event

```bash
curl -s -X DELETE http://your-server:3000/api/calendar/<id> \
  -H "Authorization: Bearer $TOKEN"
```

---

### Recurring events

Create events that repeat daily, weekly, or monthly. All instances are created up front as separate documents sharing a `recurrenceGroupId`.

```bash
# Weekly standup for 4 weeks
curl -s -X POST http://your-server:3000/api/calendar \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Weekly standup",
    "start": "2026-06-01T09:00:00.000Z",
    "end":   "2026-06-01T09:30:00.000Z",
    "recurrence": "weekly",
    "recurrenceEnd": "2026-06-28"
  }' | jq .
```

`recurrence` options: `none` (default), `daily`, `weekly`, `monthly`.  
`recurrenceEnd` is optional — omit it to generate instances for the next 6 months.

The response is the **first instance**. All instances share the same `recurrenceGroupId`.

**Delete one instance:**
```bash
curl -s -X DELETE http://your-server:3000/api/calendar/<id> \
  -H "Authorization: Bearer $TOKEN"
```

**Delete the entire series:**
```bash
curl -s -X DELETE "http://your-server:3000/api/calendar/<id>?all=true" \
  -H "Authorization: Bearer $TOKEN"
```

---

### Export events

```bash
# CSV (default)
curl -s "http://your-server:3000/api/calendar/export" \
  -H "Authorization: Bearer $TOKEN" -o events.csv

# JSON
curl -s "http://your-server:3000/api/calendar/export?format=json" \
  -H "Authorization: Bearer $TOKEN" -o events.json
```

Fields exported: `title`, `start`, `end`, `location`, `description`, `reminderMinutes`, `createdAt`.

---

Only `firstName` is required. All other fields are optional.

### Create a contact

```bash
curl -s -X POST http://your-server:3000/api/contacts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Grace",
    "lastName": "Hopper",
    "email": "grace@example.com",
    "phone": "+1-555-0199",
    "company": "U.S. Navy",
    "address": "Washington, D.C.",
    "notes": "Pioneer of machine-independent programming languages",
    "tags": ["colleague", "vip"]
  }' | jq .
```

---

### List contacts

```bash
# All contacts, sorted alphabetically by first name
curl -s "http://your-server:3000/api/contacts" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Response shape:**

```json
{
  "contacts": [...],
  "total": 24,
  "page": 1,
  "limit": 50
}
```

**Filter and sort examples:**

```bash
# Search across name, email, phone, company, and address
curl -s "http://your-server:3000/api/contacts?search=hopper" \
  -H "Authorization: Bearer $TOKEN"

# Filter by tag
curl -s "http://your-server:3000/api/contacts?tag=vip" \
  -H "Authorization: Bearer $TOKEN"

# Sort by company name, A–Z
curl -s "http://your-server:3000/api/contacts?sortBy=company&order=asc" \
  -H "Authorization: Bearer $TOKEN"

# Sort by last name, Z–A
curl -s "http://your-server:3000/api/contacts?sortBy=lastName&order=desc" \
  -H "Authorization: Bearer $TOKEN"
```

---

### Toggle favorite

Marks a contact as a favorite (or unmarks it). Each call flips the current state.

```bash
curl -s -X PATCH http://your-server:3000/api/contacts/<id>/favorite \
  -H "Authorization: Bearer $TOKEN" | jq .favorite
```

---

### Update a contact

```bash
curl -s -X PATCH http://your-server:3000/api/contacts/<id> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phone": "+1-555-0200", "tags": ["colleague", "vip", "mentor"]}'
```

---

### Delete a contact

```bash
curl -s -X DELETE http://your-server:3000/api/contacts/<id> \
  -H "Authorization: Bearer $TOKEN"
```

---

### Export contacts

```bash
# CSV (default)
curl -s "http://your-server:3000/api/contacts/export" \
  -H "Authorization: Bearer $TOKEN" -o contacts.csv

# JSON
curl -s "http://your-server:3000/api/contacts/export?format=json" \
  -H "Authorization: Bearer $TOKEN" -o contacts.json
```

Fields exported: `firstName`, `lastName`, `email`, `phone`, `company`, `notes`, `favorite`, `createdAt`.

---

## 8. Budget

The budget module has two layers: **categories** (income or expense buckets) and **transactions** (individual money movements). A summary endpoint aggregates both.

### Categories

#### Create a category

```bash
curl -s -X POST http://your-server:3000/api/budget/categories \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Groceries",
    "type": "expense",
    "color": "#f59e0b",
    "icon": "🛒"
  }' | jq .
```

`type` must be `income` or `expense`. `color` and `icon` are optional display hints for a frontend.

#### List categories

```bash
curl -s http://your-server:3000/api/budget/categories \
  -H "Authorization: Bearer $TOKEN" | jq .
```

#### Update / delete a category

```bash
# Rename
curl -s -X PATCH http://your-server:3000/api/budget/categories/<id> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Food & Groceries"}'

# Delete — transactions in this category are kept but their categoryId is set to null
curl -s -X DELETE http://your-server:3000/api/budget/categories/<id> \
  -H "Authorization: Bearer $TOKEN"
```

---

### Transactions

#### Create a transaction

```bash
curl -s -X POST http://your-server:3000/api/budget/transactions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 47.50,
    "type": "expense",
    "categoryId": "<groceries-category-id>",
    "description": "Weekly shop at Lidl",
    "date": "2026-06-10",
    "tags": ["food"]
  }' | jq .
```

`amount` and `type` are required. `categoryId` is optional — you can record uncategorised transactions.

#### List transactions

```bash
# All transactions (newest first)
curl -s "http://your-server:3000/api/budget/transactions" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Each transaction in the response includes the full category object (name, type, color, icon) populated inline.

**Filter examples:**

```bash
# Only expenses in June
curl -s "http://your-server:3000/api/budget/transactions?type=expense&from=2026-06-01&to=2026-06-30" \
  -H "Authorization: Bearer $TOKEN"

# Filter by category
curl -s "http://your-server:3000/api/budget/transactions?categoryId=<id>" \
  -H "Authorization: Bearer $TOKEN"
```

---

### Budget summary

Returns income total, expense total, balance, and a per-category breakdown for any date range.

```bash
# Full June 2026 summary
curl -s "http://your-server:3000/api/budget/summary?from=2026-06-01&to=2026-06-30" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Response:**

```json
{
  "income":  { "total": 3200.00, "count": 1 },
  "expense": { "total": 1847.30, "count": 5 },
  "balance": 1352.70,
  "byCategory": [
    { "categoryId": "...", "categoryName": "Groceries", "type": "expense", "total": 320.50,  "count": 3 },
    { "categoryId": "...", "categoryName": "Salary",    "type": "income",  "total": 3200.00, "count": 1 }
  ]
}
```

Transactions with no category appear under a `byCategory` entry with `categoryId: null` and `categoryName: "Uncategorized"`.

---

### Export transactions

```bash
# CSV (default)
curl -s "http://your-server:3000/api/budget/transactions/export" \
  -H "Authorization: Bearer $TOKEN" -o transactions.csv

# JSON
curl -s "http://your-server:3000/api/budget/transactions/export?format=json" \
  -H "Authorization: Bearer $TOKEN" -o transactions.json
```

Fields exported: `description`, `amount`, `type`, `date`, `categoryId`, `createdAt`.

---

## 9. Shopping Lists

A shopping list is a named list of items. Each item has a name, an optional quantity and unit, and a `checked` flag.

### Create a list

```bash
curl -s -X POST http://your-server:3000/api/shopping \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Weekly Groceries"}' | jq .
```

**Response:**

```json
{
  "_id": "64a1b2c3d4e5f6a7b8c9d0e1",
  "name": "Weekly Groceries",
  "items": [],
  "createdAt": "2026-06-10T08:00:00.000Z"
}
```

---

### Add items

```bash
# Item with all fields
curl -s -X POST http://your-server:3000/api/shopping/<list-id>/items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Whole milk", "quantity": 2, "unit": "L"}'

# Item with just a name (quantity defaults to 1)
curl -s -X POST http://your-server:3000/api/shopping/<list-id>/items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Sourdough bread"}'
```

Both calls return the full list including all items.

---

### Get a list

```bash
curl -s http://your-server:3000/api/shopping/<list-id> \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Response:**

```json
{
  "_id": "64a1b2c3d4e5f6a7b8c9d0e1",
  "name": "Weekly Groceries",
  "items": [
    { "_id": "64a2...", "name": "Whole milk", "quantity": 2, "unit": "L", "checked": false },
    { "_id": "64a3...", "name": "Sourdough bread", "quantity": 1, "unit": "", "checked": false }
  ]
}
```

---

### Check off an item

Each call toggles the `checked` field on or off.

```bash
curl -s -X PATCH http://your-server:3000/api/shopping/<list-id>/items/<item-id>/toggle \
  -H "Authorization: Bearer $TOKEN" | jq '.items[] | {name, checked}'
```

---

### Update an item

```bash
curl -s -X PATCH http://your-server:3000/api/shopping/<list-id>/items/<item-id> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"quantity": 3, "unit": "kg"}'
```

---

### Remove an item

```bash
curl -s -X DELETE http://your-server:3000/api/shopping/<list-id>/items/<item-id> \
  -H "Authorization: Bearer $TOKEN"
```

Returns the updated list with the item removed.

---

### List all your shopping lists

```bash
curl -s "http://your-server:3000/api/shopping" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Response shape:**

```json
{
  "lists": [...],
  "total": 3,
  "page": 1,
  "limit": 20
}
```

---

### Rename or delete a list

```bash
# Rename
curl -s -X PATCH http://your-server:3000/api/shopping/<list-id> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Party supplies"}'

# Delete
curl -s -X DELETE http://your-server:3000/api/shopping/<list-id> \
  -H "Authorization: Bearer $TOKEN"
```

---

### Export shopping lists

Exports all lists and their items flattened to one row per item.

```bash
# CSV (default)
curl -s "http://your-server:3000/api/shopping/export" \
  -H "Authorization: Bearer $TOKEN" -o shopping.csv

# JSON
curl -s "http://your-server:3000/api/shopping/export?format=json" \
  -H "Authorization: Bearer $TOKEN" -o shopping.json
```

Fields exported: `listName`, `itemName`, `checked`, `addedAt`.

---

Once your Telegram account is linked to LifeHub, you can manage all your data directly from the Telegram app.

### Linking your Telegram account

**Via the web client:**
1. Open the web client → **Profile → Telegram** tab
2. Click **Link Telegram** — a 6-character code appears (valid 15 minutes)
3. Open the bot in Telegram and send `/link XXXXXX`
4. The bot replies "Account linked!" and the web client shows your linked status

**Via the API:**
```bash
# Generate an OTP code
curl -s -X POST http://your-server:3000/api/telegram/link-code \
  -H "Authorization: Bearer $TOKEN"
# → { "code": "A3F7D2", "expiresIn": 900 }

# Then in Telegram: /link A3F7D2
```

**Unlink:**
```bash
curl -s -X DELETE http://your-server:3000/api/telegram/link \
  -H "Authorization: Bearer $TOKEN"
```

---

### Bot commands

#### Account & Setup

| Command | Description |
|---|---|
| `/start` | Welcome message; if already linked, shows your account name |
| `/link <code>` | Link your LifeHub account using the 6-char OTP from the web client |
| `/unlink` | Remove the Telegram link (re-link anytime via the web client) |
| `/profile` | Show your name, email, Telegram link status, and digest time |
| `/settings` | Show current notification settings |
| `/help` | List all available commands |

#### Tasks

| Command | Description |
|---|---|
| `/tasks` | List up to 10 open tasks (todo + in-progress) with short IDs |
| `/tasks done` | List up to 10 recently completed tasks |
| `/addtask <title>` | Create a task with medium priority |
| `/done <id>` | Mark a task as done by its short ID |
| `/deletetask <id>` | Delete a task by its short ID |

Short IDs are the last 6 characters of the MongoDB `_id` shown in `/tasks` output.

#### Calendar

| Command | Description |
|---|---|
| `/today` | All events today, sorted by start time |
| `/upcoming` | Next 5 future events; `/upcoming 10` for up to 10 |
| `/addevent <title> on <date> [remind <N>m]` | Create an event; e.g. `/addevent Meeting on 2026-05-10 remind 30m` |
| `/cancelevent <id>` | Delete an event by its short ID |

#### Shopping

| Command | Description |
|---|---|
| `/shopping` | List all shopping lists with item counts |
| `/shopping <list name>` | Show all items in a named list |
| `/additem <list> <item>` | Add an item; e.g. `/additem Groceries Milk` |
| `/check <list> <item>` | Toggle the first matching item checked/unchecked |
| `/deletelist <list>` | Delete an entire list by name |

#### Budget

| Command | Description |
|---|---|
| `/balance` | Current month: total income, total expenses, net balance |
| `/addexpense <amount> [description]` | Record an expense; e.g. `/addexpense 12.50 Coffee` |
| `/addincome <amount> [description]` | Record income; e.g. `/addincome 3200 Salary` |

#### Notifications

| Command | Description |
|---|---|
| `/digest <hour>` | Set your daily digest time (0–23, server timezone); e.g. `/digest 7` |

---

### Automatic notifications

The scheduler sends proactive notifications without any command. If your Telegram account is linked, notifications arrive via Telegram. If it is not linked, they fall back to email (requires email to be configured on the server).

| Notification | Trigger |
|---|---|
| **Event reminder** | Sent N minutes before an event starts, where N is the event's `reminderMinutes` field (default: 15) |
| **Task due today** | Sent once on the day a task's due date arrives (only for non-done tasks) |
| **Daily digest** | Sent at your configured `dailyDigestHour` — shows open task count and today's events |

Set the reminder time per event when creating or editing it (API field: `reminderMinutes`, bot syntax: `remind <N>m`). Set your daily digest hour with `/digest <hour>` or via the profile API.
