# Tyla Shop MIS — Setup Guide

## Prerequisites
- Node.js 18+
- XAMPP (MySQL running)
- npm

## Step 1: Start XAMPP MySQL
Open XAMPP and start **MySQL** (Apache optional).

## Step 2: Create Database
Open phpMyAdmin (http://localhost/phpmyadmin) and create database:
```sql
CREATE DATABASE tyla_shop_mis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## Step 3: Environment Setup
Edit `.env` if needed (default uses root with no password):
```
DATABASE_URL="mysql://root:@localhost:3306/tyla_shop_mis"
```

## Step 4: Run Database Migration
```bash
npx prisma migrate dev --name init
```

## Step 5: Seed Database
```bash
npm run prisma:seed
```

## Step 6: Start Application
```bash
npm run dev
```

App runs at: http://localhost:3000

## Default Admin Credentials
- **Email:** admin@tylaShop.com
- **Password:** Admin@123
- ⚠️ Change password after first login!

## Quick Commands
| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npx prisma studio` | Open database GUI |
| `npm run prisma:seed` | Seed initial data |
| `npm run prisma:migrate` | Run migrations |

## Architecture
```
server.js           → Main entry point (Express + Next.js + Socket.IO)
server/routes/      → API route handlers
server/middleware/  → Auth + permission middleware
server/utils/       → Helpers + Prisma client
server/socket/      → Real-time event handlers
app/                → Next.js frontend pages
prisma/             → Database schema + migrations
components/         → React components
lib/                → Frontend utilities + state
hooks/              → Custom React hooks
```
