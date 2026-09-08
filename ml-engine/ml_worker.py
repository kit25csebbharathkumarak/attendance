import os
import sys
import time
import logging
import base64
import cv2
import requests
import numpy as np

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from detector import PersonDetector
from face_matcher import FaceMatcher

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("MLWorker")

# Configuration
BACKEND_WEBHOOK_URL = os.getenv("BACKEND_WEBHOOK_URL", "http://localhost:5000/api/webhook/match")
BACKEND_FRAME_URL = os.getenv("BACKEND_FRAME_URL", "http://localhost:5000/api/webhook/frame")
BACKEND_EMBEDDINGS_URL = os.getenv("BACKEND_ENROLLMENTS_URL", "http://localhost:5000/api/students/embeddings")
CAMERA_SOURCE = os.getenv("CAMERA_SOURCE", "0")
FRAME_THROTTLE_SECONDS = float(os.getenv("FRAME_THROTTLE_SECONDS", "2.0"))
SIMILARITY_THRESHOLD = float(os.getenv("MATCH_CONFIDENCE_THRESHOLD", "0.48"))
SHOW_DISPLAY = os.getenv("SHOW_DISPLAY_WINDOW", "true").lower() == "true"


def send_to_backend(student_id: str, confidence: float, match_type: str = "Multimodal", photo: str = None) -> bool:
    payload = {
        "studentId": student_id,
        "matchType": match_type,
        "confidence": round(float(confidence), 3),
        "doorLocation": "Classroom Main Entrance",
        "photo": photo
    }

    try:
        logger.info(f"Dispatching match: Student {student_id} (Score: {confidence:.2f})")
        response = requests.post(
            BACKEND_WEBHOOK_URL,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=3.0
        )

        if response.status_code in [200, 201]:
            res_data = response.json()
            if res_data.get("debounced"):
                logger.info(f"Student {student_id} recognized (Attendance already marked in recent window).")
            else:
                logger.info(f"✅ Attendance recorded for {student_id}: {res_data.get('message')}")
            return True
        else:
            logger.warning(f"Backend returned status {response.status_code}")
            return False

    except requests.exceptions.ConnectionError:
        logger.error(f"Cannot connect to backend server at {BACKEND_WEBHOOK_URL}.")
        return False
    except Exception as e:
        logger.error(f"Unexpected error sending match: {e}")
        return False


def broadcast_frame_to_dashboard(display_frame: np.ndarray):
    """
    Broadcasts the live annotated camera frame to the React dashboard via backend Socket.IO.
    Eliminates browser webcam conflicts.
    """
    try:
        small = cv2.resize(display_frame, (480, 270))
        _, buf = cv2.imencode('.jpg', small, [int(cv2.IMWRITE_JPEG_QUALITY), 60])
        b64 = "data:image/jpeg;base64," + base64.b64encode(buf).decode('utf-8')
        requests.post(BACKEND_FRAME_URL, json={"frame": b64}, timeout=0.3)
    except Exception:
        pass


def main():
    print("\n" + "=" * 65)
    print("🚀 AUTOMATIC ATTENDANCE ENGINE (REAL AI MODELS)")
    print("   • Person Detection: YOLOv8 (yolov8n.pt)")
    print("   • Face Recognition: FaceNet (InceptionResnetV1, 512-d)")
    print(f"   • Matching Threshold: {SIMILARITY_THRESHOLD}")
    print(f"   • Dashboard Live Stream: Active (via WebSockets)")
    print("=" * 65 + "\n")

    logger.info("Loading YOLOv8 person detector...")
    detector = PersonDetector(model_weight="yolov8n.pt", conf_threshold=0.40)

    logger.info("Loading FaceNet InceptionResnetV1 & MTCNN...")
    matcher = FaceMatcher(similarity_threshold=SIMILARITY_THRESHOLD)

    # Fetch enrolled student embeddings
    enrolled_count = matcher.load_enrolled_students(backend_url=BACKEND_EMBEDDINGS_URL)
    print(f"\n📋 Loaded {enrolled_count} enrolled students from backend.")
    if matcher.enrolled_students:
        last_enrolled = matcher.enrolled_students[-1]
        print(f"   Latest enrolled: {last_enrolled.get('name')} ({last_enrolled.get('studentId')})\n")

    cam_index = int(CAMERA_SOURCE) if CAMERA_SOURCE.isdigit() else CAMERA_SOURCE
    logger.info(f"Connecting to camera source: '{CAMERA_SOURCE}'...")

    if isinstance(cam_index, int):
        # On Windows, try DirectShow (CAP_DSHOW) first for Phone Link and external cameras
        cap = cv2.VideoCapture(cam_index, cv2.CAP_DSHOW)
        if not cap.isOpened():
            logger.info(f"DirectShow open failed for camera {cam_index}, trying default backend...")
            cap = cv2.VideoCapture(cam_index)
    else:
        # RTSP / HTTP video stream URL
        cap = cv2.VideoCapture(cam_index)

    is_mock_feed = False
    if not cap.isOpened():
        logger.warning(f"Camera source '{CAMERA_SOURCE}' could not be opened. Using test feed.")
        is_mock_feed = True
    else:
        logger.info(f"✅ Successfully opened camera source: '{CAMERA_SOURCE}'")

    last_processed_time = 0.0
    last_frame_broadcast = 0.0
    last_sync_time = 0.0
    recent_detections = []
    frame_count = 0

    try:
        while True:
            current_time = time.time()
            time_since_last = current_time - last_processed_time

            # Synchronize newly enrolled students every 5 seconds
            if current_time - last_sync_time >= 5.0:
                matcher.load_enrolled_students(backend_url=BACKEND_EMBEDDINGS_URL)
                last_sync_time = current_time

            # 1. Grab Frame
            if not is_mock_feed:
                ret, frame = cap.read()
                if not ret:
                    time.sleep(0.1)
                    continue
            else:
                frame = np.zeros((480, 640, 3), dtype=np.uint8)
                frame[:] = (30, 30, 35)
                cv2.rectangle(frame, (200, 100), (440, 400), (60, 60, 75), 2)
                cv2.circle(frame, (320, 180), 55, (100, 100, 120), 2)
                cv2.putText(frame, "ENTRANCE CAMERA FEED", (180, 50),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 230, 118), 2)

            frame_count += 1

            # 2. Frame Processing (Every 2 seconds)
            if time_since_last >= FRAME_THROTTLE_SECONDS:
                last_processed_time = current_time
                recent_detections = []

                # A. Detect people
                persons = detector.detect_people(frame)

                for p in persons:
                    x1, y1, x2, y2 = p["bbox"]
                    person_crop = frame[y1:y2, x1:x2].copy()

                    if person_crop.size == 0:
                        continue

                    # B. FaceNet Feature Extraction & Match
                    matched_id, student_name, confidence, match_type, face_crop = matcher.match_face(person_crop)

                    # Encode thumbnail photo
                    photo_b64 = None
                    if face_crop is not None and face_crop.size > 0:
                        try:
                            thumb = cv2.resize(face_crop, (160, 160))
                            _, buf = cv2.imencode('.jpg', thumb, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                            photo_b64 = "data:image/jpeg;base64," + base64.b64encode(buf).decode('utf-8')
                        except Exception:
                            pass

                    if matched_id:
                        logger.info(f"🎯 Recognized Student: {student_name} ({matched_id}) [Score: {confidence:.3f}]")
                        send_to_backend(matched_id, confidence, match_type, photo=photo_b64)
                        recent_detections.append({
                            "bbox": (x1, y1, x2, y2),
                            "matched": True,
                            "label": f"{student_name} ({matched_id})",
                            "confidence": confidence,
                            "type": match_type
                        })
                    else:
                        recent_detections.append({
                            "bbox": (x1, y1, x2, y2),
                            "matched": False,
                            "label": f"Face scanning... ({confidence:.2f})",
                            "confidence": confidence,
                            "type": "Body"
                        })

            # 3. Create Display & Overlay
            display_frame = frame.copy()
            h, w = display_frame.shape[:2]
            countdown = max(0.0, FRAME_THROTTLE_SECONDS - (time.time() - last_processed_time))

            # Top Header Bar
            cv2.rectangle(display_frame, (0, 0), (w, 36), (15, 17, 23), -1)
            status_line = f"ENTRANCE AI | Cam {CAMERA_SOURCE} | Scan: {countdown:.1f}s | Enrolled: {len(matcher.enrolled_students)}"
            cv2.putText(display_frame, status_line, (15, 24),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 240, 120), 2)

            for det in recent_detections:
                bx1, by1, bx2, by2 = det["bbox"]
                is_match = det["matched"]
                tag = f"{det['label']} [{(det['confidence']*100):.0f}%]"
                color = (0, 230, 110) if is_match else (0, 165, 255)

                cv2.rectangle(display_frame, (bx1, by1), (bx2, by2), color, 2)
                tw = len(tag) * 9 + 10
                cv2.rectangle(display_frame, (bx1, max(0, by1 - 24)), (bx1 + tw, by1), color, -1)
                cv2.putText(display_frame, tag, (bx1 + 5, max(16, by1 - 6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 2)

            # 4. Broadcast live frame to React dashboard (~5 FPS for smooth angle adjustment)
            if current_time - last_frame_broadcast >= 0.20:
                broadcast_frame_to_dashboard(display_frame)
                last_frame_broadcast = current_time


            # 5. Local OpenCV Window Display
            if SHOW_DISPLAY:
                cv2.imshow("Classroom Entrance Monitor (YOLOv8 + FaceNet)", display_frame)
                key = cv2.waitKey(1) & 0xFF
                if key in [27, ord('q')]:
                    break
                elif key == ord('r'):
                    matcher.load_enrolled_students(backend_url=BACKEND_EMBEDDINGS_URL)

            time.sleep(0.03)

    except KeyboardInterrupt:
        logger.info("Stopping ML Worker...")
    finally:
        cap.release()
        if SHOW_DISPLAY:
            cv2.destroyAllWindows()
        logger.info("ML Worker gracefully shut down.")


if __name__ == "__main__":
    main()
