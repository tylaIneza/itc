#!/bin/bash
set -e

APP_DIR="/var/www/tylaShop"
APP_NAME="tylaShop"

echo ""
echo "========================================"
echo "  Tyla Shop MIS — Deployment Script"
echo "========================================"
echo ""

cd "$APP_DIR"

echo "▶ Pulling latest code from GitHub..."
git pull origin main

echo ""
echo "▶ Installing dependencies..."
npm install --omit=dev

echo ""
echo "▶ Generating Prisma client..."
npx prisma generate

echo ""
echo "▶ Running database migrations..."
npx prisma migrate deploy

echo ""
echo "▶ Building Next.js..."
npm run build

echo ""
echo "▶ Restarting app with PM2..."
pm2 restart "$APP_NAME" || pm2 start server.js --name "$APP_NAME" --env production

pm2 save

echo ""
echo "▶ Reloading Nginx..."
sudo systemctl reload nginx

echo ""
echo "========================================"
echo "  Deployment complete!"
echo "  App running on port 3310"
echo "  PM2 status:"
echo "========================================"
pm2 status "$APP_NAME"
echo ""
