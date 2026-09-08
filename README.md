# Multimodal (Face + Body) Automatic Attendance System

An end-to-end, edge-ready automatic attendance tracking system designed for classroom walk-through monitoring. Detects and verifies up to 65+ students passing through the classroom doorway with zero manual roll-call or kiosk interaction.

---

## 🏗 System Components

```
automatic-attendance-system/
│
├── ml-engine/                 # Python: Computer Vision & ML Pipeline (YOLOv8 + DeepFace)
│   ├── models/                # Downloaded weights (e.g., yolov8n.pt)
│   ├── data/                  # Sample test videos and photos
│   ├── utils/                 # Helper scripts for cropping, calculations
│   ├── detector.py            # YOLOv8 person detection
│   ├── face_matcher.py        # DeepFace feature extraction & cosine similarity
│   ├── ml_worker.py           # Standalone camera capture & webhook loop
│   ├── main_worker.py         # Modular worker tying detector & matcher together
│   ├── requirements.txt       # Python dependencies
│   └── .env                   # ML environment configs
│
├── backend/                   # Node.js: Express API & Socket.IO
│   ├── src/
│   │   ├── controllers/       # Enrollment & Attendance controllers with debouncing
│   │   ├── models/            # Mongoose schemas (Student, AttendanceLog)
│   │   ├── routes/            # Express route definitions
│   │   ├── config/            # MongoDB connection setup
│   │   └── server.js          # Entry point and Socket.IO initialization
│   ├── package.json
│   └── .env                   # MongoDB URI, Port configs
│
├── frontend/                  # React + Tailwind CSS: Admin Real-time Dashboard
│   ├── src/
│   │   ├── components/        # Reusable UI (Navbar, StatsCards)
│   │   ├── pages/             # Dashboard.jsx, Enrollment.jsx
│   │   ├── context/           # Socket.IO global state management
│   │   ├── App.jsx            # Routing & view setup
│   │   └── main.jsx
│   ├── package.json
│   ├── tailwind.config.js     
│   └── vite.config.js
│
├── docs/                      # Documentation
│   ├── architecture.md        # System flow diagrams & deployment specs
│   └── api-specs.md           # API endpoints & Socket.IO events
│
├── .gitignore
└── README.md
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: v18+ and npm
- **Python**: 3.9 - 3.11 with pip
- **MongoDB**: Local MongoDB community service (`mongodb://localhost:27017`) or free MongoDB Atlas URI.
- **Camera**: Built-in laptop webcam, USB webcam, or RTSP stream.

---

### Step 1: Start the Backend Server

```bash
cd backend
npm install
npm run dev
```
*Backend runs on `http://localhost:5000` with WebSocket support.*

---

### Step 2: Start the React Frontend Dashboard

```bash
cd frontend
npm install
npm run dev
```
*Open `http://localhost:5173` in your browser. The live status indicator will turn green ("Live Stream Connected").*

---

### Step 3: Run the ML Worker (Python)

```bash
cd ml-engine
python -m venv venv
# On Windows PowerShell:
.\venv\Scripts\Activate.ps1
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
python ml_worker.py
```
*The worker starts reading the camera feed at 1 frame every 3 seconds, runs YOLOv8 person detection, extracts face embeddings via DeepFace, and posts matches to the backend webhook.*

---

## 🎯 Testing Without Camera
You can test the entire pipeline without running the Python ML worker:
1. Open the React Dashboard (`http://localhost:5173`).
2. Click the **"Simulate Match Event"** button on the dashboard.
3. Observe the immediate real-time attendee entry, confidence bar, and metric counter updates via Socket.IO.
