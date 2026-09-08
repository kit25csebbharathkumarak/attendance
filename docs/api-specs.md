# API Specifications & Socket.IO Contracts

## 1. REST Endpoints

### Base URL: `http://localhost:5000`

---

### `POST /api/enroll`
Enrolls or updates a student profile and their facial feature embeddings in the system.

- **Request Headers**: `Content-Type: application/json`
- **Request Body**:
```json
{
  "studentId": "STU101",
  "name": "Alex Johnson",
  "faceEmbeddings": [0.0421, -0.0125, 0.1842, ...], // 128-d or 512-d float array (or array of arrays for multiple poses)
  "email": "alex.j@university.edu" // Optional
}
```
- **Response `200 OK`**:
```json
{
  "success": true,
  "message": "Student enrolled successfully.",
  "data": {
    "studentId": "STU101",
    "name": "Alex Johnson",
    "createdAt": "2026-09-08T05:30:00.000Z"
  }
}
```

---

### `GET /api/attendance/today`
Retrieves all attendance logs captured today (between `00:00:00` and `23:59:59` local time), sorted descending by arrival timestamp.

- **Query Parameters (Optional)**:
  - `limit`: (default `100`) Max records to return.
  - `matchType`: Filter by `'Face'`, `'Body'`, or `'Multimodal'`.
- **Response `200 OK`**:
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "65fc8e1...",
      "studentId": "STU101",
      "studentName": "Alex Johnson",
      "timestamp": "2026-09-08T09:02:14.281Z",
      "matchType": "Multimodal",
      "confidence": 0.942,
      "status": "Present"
    }
  ]
}
```

---

### `POST /api/webhook/match`
Ingestion endpoint invoked by the Python ML Worker (`ml_worker.py`) upon identifying a student at the doorway.

- **Request Headers**: `Content-Type: application/json`
- **Request Body**:
```json
{
  "studentId": "STU101",
  "matchType": "Multimodal", // 'Face' | 'Body' | 'Multimodal'
  "confidence": 0.942
}
```
- **Behavior**:
  - Checks recent attendance cooldown window (default: 30 minutes).
  - Persists new record to `AttendanceLog` collection.
  - Queries `Student` collection to attach student full name and metadata.
  - Emits `new_attendance` event across Socket.IO room.
- **Response `201 Created`**:
```json
{
  "success": true,
  "message": "Attendance recorded & broadcasted",
  "data": {
    "studentId": "STU101",
    "studentName": "Alex Johnson",
    "timestamp": "2026-09-08T09:02:14.281Z",
    "matchType": "Multimodal",
    "confidence": 0.942
  }
}
```
- **Response `200 OK` (Duplicate / Cooldown hit)**:
```json
{
  "success": true,
  "debounced": true,
  "message": "Student was already logged recently. Ignored."
}
```

---

## 2. Real-Time Socket.IO Events

### Event: `new_attendance`
- **Direction**: Server $\rightarrow$ React Clients
- **Trigger**: Every time a valid match is confirmed at the entrance.
- **Payload**:
```json
{
  "_id": "65fc8e1...",
  "studentId": "STU101",
  "studentName": "Alex Johnson",
  "timestamp": "2026-09-08T09:02:14.281Z",
  "matchType": "Multimodal",
  "confidence": 0.942
}
```
