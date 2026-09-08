# Multimodal Automatic Attendance System - Architecture & Design

## 1. Executive Summary
This project implements an automated, walk-through attendance tracking system for educational classrooms. Instead of requiring manual roll calls or interactive kiosks that interrupt student flow, an entrance-mounted camera monitors the doorway. The system leverages:
1. **Computer Vision & Deep Learning (Python)**: YOLOv8 for person bounding box localization and DeepFace (FaceNet512 / VGG-Face) for facial embedding extraction and verification.
2. **Real-time Event Engine (Node.js & Socket.IO)**: High-throughput ingestion webhook with debouncing and instant WebSocket broadcasts.
3. **Admin Monitoring Dashboard (React & Tailwind CSS)**: Real-time visual dashboard showcasing arrival logs, live match types (Face, Body, Multimodal), and verification confidence.

---

## 2. System Architecture Diagram

```mermaid
flowchart TD
    subgraph Entrance ["Classroom Entrance (Walk-Through)"]
        Cam["Entrance Camera (Webcam / RTSP IP Cam)"]
    end

    subgraph MLEngine ["ML Engine (Python Worker)"]
        Cap["cv2.VideoCapture Loop"]
        Throttler["3s Rate Limiter & Frame Sampler"]
        YOLO["YOLOv8 Person Detection (Class 0)"]
        Crop["Person / Head Region Cropper"]
        DeepFace["DeepFace Feature Extractor (512-d Embedding)"]
        Matcher["Cosine Vector Distance Matcher (NumPy)"]
        DebounceML["Edge Debounce Cache (30s)"]
        Dispatcher["Webhook Client (requests.post)"]
        
        Cam --> Cap
        Cap --> Throttler
        Throttler --> YOLO
        YOLO --> Crop
        Crop --> DeepFace
        DeepFace --> Matcher
        Matcher --> DebounceML
        DebounceML --> Dispatcher
    end

    subgraph Backend ["Backend Server (Node.js / Express)"]
        Webhook["POST /api/webhook/match"]
        EnrollAPI["POST /api/enroll"]
        LogsAPI["GET /api/attendance/today"]
        CooldownMgr["Attendance Debounce Manager (30-min window)"]
        DB[(MongoDB Database)]
        SocketServer["Socket.IO Server"]

        Dispatcher -->|HTTP POST| Webhook
        Webhook --> CooldownMgr
        CooldownMgr -->|New Record| DB
        CooldownMgr -->|Emit Event| SocketServer
        EnrollAPI --> DB
        LogsAPI --> DB
    end

    subgraph Frontend ["React Admin Dashboard"]
        SocketClient["Socket.IO Client"]
        DashboardUI["Dashboard.jsx (Real-time Live Table)"]
        EnrollUI["Enrollment.jsx (Student Management)"]

        SocketServer -->|'new_attendance' event| SocketClient
        SocketClient --> DashboardUI
        DashboardUI -->|Fetch Initial Logs| LogsAPI
        EnrollUI -->|Submit New Student| EnrollAPI
    end
```

---

## 3. High-Accuracy Strategy for 65 Students

1. **Entrance "Walk-Through" Mounting Angle**:
   - The camera is mounted above the classroom door frame (height: 2.1m - 2.4m) angled downward at ~15°–20° toward incoming students.
   - As students enter in natural single/double file, their faces occupy 200×200+ pixels.
2. **Multi-Vector Enrollment**:
   - Each student stores up to 3–5 embeddings (frontal, slightly angled left, slightly angled right) in the `Student` schema.
   - Distance computation computes $\min(\text{distance}(E_{\text{query}}, E_{\text{enrolled\_i}}))$.
3. **Session Cooldown / Debouncing**:
   - Both in-memory and database level debouncing prevent a student standing in the doorway from being logged dozens of times. A standard 30-minute cooldown window ensures clean single records per lecture.
4. **Multimodal Confidence Score**:
   - **Face Match**: Cosine similarity $\ge 0.70$.
   - **Multimodal (Face + Body context)**: Face similarity $\ge 0.65$ combined with persistent bounding box tracking.
   - **Body/Occluded Fallback**: Triggers an administrative attention flag on the live dashboard.
