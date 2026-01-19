# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Knowledge Sharing Schedule Management System - a lightweight web app for managing team knowledge sharing activities. Built with plain HTML/CSS/JS frontend and Node.js + json-server backend.

## Commands

```bash
# Development
cd server && npm install              # Install backend dependencies
./start-backend.sh                    # Start backend (port 3000)
npm run dev                           # Start backend with hot reload (nodemon)

# Access the app at http://localhost:8000/schedule.html

# Deployment
./pack-for-deploy.sh                  # Create deployment package

# Data management
./backup.sh                           # Create backup (db.json + uploads)
./restore.sh                          # Restore from backup (interactive)

# Viewing logs
tail -f backend.log                   # Backend runtime log
tail -f server/operation.log          # Operation activity log
```

## Architecture

```
schedule.html (frontend)
    ↓ HTTP API
Node.js server/server.js (port 3000)
    ├─ json-server (REST API for db.json)
    ├─ Express custom routes (file uploads via Multer)
    └─ operation logging
    ↓
db.json (lowdb) + server/uploads/{date}/ (filesystem)
```

**Key API Endpoints:**
- `GET/POST/PUT/PATCH /schedule` - Schedule CRUD
- `POST /schedule/:id/files` - Upload files
- `GET /schedule/:id/files/:fileIndex` - Download files

**Database Schema (db.json):**
- `schedule[]`: { id, week, date, T1, T2_1, T2_2, T3, topic, remark, location, time, T1_done, T2_1_done, T2_2_done, T3_done, isHoliday, files[], updatedAt }
- `statistics`: Member completion rates
- `messageBoard`: Team feedback and notices

## Important Notes

- Frontend is a vanilla JS/CSS/HTML single-page app (~120KB) - no build step required
- Files are stored in `server/uploads/{date}/` organized by schedule date
- Database is file-based (`server/db.json`) - no migration tools needed
- Backend requires Node.js >= 18.0.0
- Backend uses json-server for REST API plus Express custom routes for file handling
