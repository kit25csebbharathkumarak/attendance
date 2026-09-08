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
BACKEND_EMBEDDINGS_URL = os.getenv("BACKEND_ENROLLMENTS_URL", "http://localhost:5000/api/students/embeddings")
CAMERA_SOURCE = os.getenv("CAMERA_SOURCE", "0")
FRAME_THROTTLE_SECONDS = float(os.getenv("FRAME_THROTTLE_SECONDS", "3.0"))
SIMILARITY_THRESHOLD = float(os.getenv("MATCH_CONFIDENCE_THRESHOLD", "0.52"))
SHOW_DISPLAY = os.getenv("SHOW_DISPLAY_WINDOW", "true").lower() == "true"


def send_to_backend(student_id: str, confidence: float, match_type: str = "Multimodal", photo: str = None) -> bool:
    """
    Sends detected student match with face photo thumbnail to Node.js backend webhook endpoint.
    """
    payload = {
        "studentId": student_id,
        "matchType": match_type,
        "confidence": round(float(confidence), 3),
        "doorLocation": "Classroom Main Entrance",
        "photo": photo
    }

    try:
        logger.info(f"Dispatching real match to backend: Student {student_id} (Confidence: {confidence:.2f})")
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
            logger.warning(f"Backend returned status {response.status_code}: {response.text}")
            return False

    except requests.exceptions.ConnectionError:
        logger.error(f"Cannot connect to backend server at {BACKEND_WEBHOOK_URL}. Is Express running?")
        return False
    except Exception as e:
        logger.error(f"Unexpected error sending match to backend: {e}")
        return False


def main():
    print("\n" + "=" * 65)
    print("🚀 AUTOMATIC ATTENDANCE ENGINE (REAL AI MODELS)")
    print("   • Person Localization: YOLOv8 (yolov8n.pt)")
    print("   • Face Localization: MTCNN Deep Neural Network")
    print("   • Feature Extraction: FaceNet (InceptionResnetV1, 512-d)")
    print(f"   • Similarity Metric: Cosine Similarity (Threshold: {SIMILARITY_THRESHOLD})")
    print(f"   • Backend Webhook: {BACKEND_WEBHOOK_URL}")
    print("=" * 65 + "\n")

    logger.info("Loading YOLOv8 person detector...")
    detector = PersonDetector(model_weight="yolov8n.pt", conf_threshold=0.45)

    logger.info("Loading FaceNet InceptionResnetV1 & MTCNN...")
    matcher = FaceMatcher(similarity_threshold=SIMILARITY_THRESHOLD)

    # Fetch enrolled student embeddings from Backend
    enrolled_count = matcher.load_enrolled_students(backend_url=BACKEND_EMBEDDINGS_URL)
    logger.info(f"System ready with {enrolled_count} enrolled student profiles.")

    # Initialize Video Capture
    cam_index = int(CAMERA_SOURCE) if CAMERA_SOURCE.isdigit() else CAMERA_SOURCE
    cap = cv2.VideoCapture(cam_index)

    is_mock_feed = False
    if not cap.isOpened():
        logger.warning(f"Camera source '{CAMERA_SOURCE}' not found. Running in demo canvas mode.")
        is_mock_feed = True

    last_processed_time = 0.0
    recent_detections = []
    frame_count = 0

    try:
        while True:
            current_time = time.time()
            time_since_last = current_time - last_processed_time

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
                cv2.putText(frame, "Stand in front of webcam to be recognized", (140, 440),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (160, 160, 160), 1)

            frame_count += 1

            # 2. Check Frame Throttling (Every 3 seconds)
            if time_since_last >= FRAME_THROTTLE_SECONDS:
                last_processed_time = current_time
                recent_detections = []

                # Refresh enrollments periodically
                if frame_count % 10 == 0:
                    matcher.load_enrolled_students(backend_url=BACKEND_EMBEDDINGS_URL)

                # A. Run YOLOv8 Person Detection (Class 0)
                persons = detector.detect_people(frame)

                for p in persons:
                    x1, y1, x2, y2 = p["bbox"]
                    person_crop = frame[y1:y2, x1:x2].copy()

                    if person_crop.size == 0:
                        continue

                    # B. Extract FaceNet 512-d Embedding & Match
                    matched_id, student_name, confidence, match_type, face_crop = matcher.match_face(person_crop)

                    # Encode thumbnail photo
                    photo_b64 = None
                    if face_crop is not None and face_crop.size > 0:
                        try:
                            thumb = cv2.resize(face_crop, (160, 160))
                            _, buf = cv2.imencode('.jpg', thumb, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                            photo_b64 = "data:image/jpeg;base64," + base64.b64encode(buf).decode('utf-8')
                        except Exception as e:
                            logger.debug(f"Thumbnail encoding error: {e}")

                    if matched_id:
                        logger.info(f"🎯 Verified Student: {student_name} ({matched_id}) [Cosine Score: {confidence:.3f}]")
                        send_to_backend(matched_id, confidence, match_type, photo=photo_b64)
                        recent_detections.append({
                            "bbox": (x1, y1, x2, y2),
                            "matched": True,
                            "label": f"{student_name} ({matched_id})",
                            "confidence": confidence,
                            "type": match_type
                        })
                    else:
                        logger.info(f"Person detected (Confidence: {p['confidence']:.2f}). Face similarity below threshold: {confidence:.3f}")
                        recent_detections.append({
                            "bbox": (x1, y1, x2, y2),
                            "matched": False,
                            "label": f"Scanning... ({confidence:.2f})",
                            "confidence": confidence,
                            "type": "Body"
                        })

            # 3. Render Visual HUD Overlay
            if SHOW_DISPLAY:
                display_frame = frame.copy()
                h, w = display_frame.shape[:2]
                countdown = max(0.0, FRAME_THROTTLE_SECONDS - (time.time() - last_processed_time))

                # Top Bar
                cv2.rectangle(display_frame, (0, 0), (w, 36), (15, 17, 23), -1)
                status_line = f"ENTRANCE AI | FaceNet 512-d Active | Next Scan: {countdown:.1f}s | Enrolled: {len(matcher.enrolled_students)}"
                cv2.putText(display_frame, status_line, (15, 24),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 240, 120), 2)

                # Draw Bounding Boxes
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

                cv2.imshow("Classroom Entrance Monitor (YOLOv8 + FaceNet)", display_frame)

                key = cv2.waitKey(1) & 0xFF
                if key in [27, ord('q')]:
                    break
                elif key == ord('r'):
                    logger.info("Manual reload of student embeddings...")
                    matcher.load_enrolled_students(backend_url=BACKEND_EMBEDDINGS_URL)

            time.sleep(0.03)

    except KeyboardInterrupt:
        logger.info("Shutting down ML Worker...")
    finally:
        cap.release()
        if SHOW_DISPLAY:
            cv2.destroyAllWindows()
        logger.info("ML Worker terminated.")


if __name__ == "__main__":
    main()
