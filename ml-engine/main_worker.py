import os
import sys
import time
import logging
import cv2
import requests
from dotenv import load_dotenv

from detector import PersonDetector
from face_matcher import FaceMatcher
from utils.vision_helpers import crop_bbox, draw_hud

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("MainWorker")

BACKEND_WEBHOOK_URL = os.getenv("BACKEND_WEBHOOK_URL", "http://localhost:5000/api/webhook/match")
BACKEND_ENROLLMENTS_URL = os.getenv("BACKEND_ENROLLMENTS_URL", "http://localhost:5000/api/students/embeddings")
CAMERA_SOURCE = os.getenv("CAMERA_SOURCE", "0")
FRAME_THROTTLE_SECONDS = float(os.getenv("FRAME_THROTTLE_SECONDS", "3.0"))
SHOW_DISPLAY = os.getenv("SHOW_DISPLAY_WINDOW", "true").lower() == "true"


class MainAttendanceWorker:
    """
    Modular master pipeline uniting YOLOv8 PersonDetector and DeepFace FaceMatcher.
    """

    def __init__(self):
        logger.info("Initializing Modular Attendance Worker pipeline...")
        self.detector = PersonDetector(model_weight="yolov8n.pt", conf_threshold=0.45)
        self.matcher = FaceMatcher(model_name="Facenet512", similarity_threshold=0.65)
        self.matcher.load_enrolled_students(backend_url=BACKEND_ENROLLMENTS_URL)

        cam_idx = int(CAMERA_SOURCE) if CAMERA_SOURCE.isdigit() else CAMERA_SOURCE
        self.cap = cv2.VideoCapture(cam_idx)
        self.is_synthetic = not self.cap.isOpened()

        if self.is_synthetic:
            logger.warning(f"Could not open camera {CAMERA_SOURCE}. Running in synthetic demo mode.")

    def notify_backend(self, student_id: str, confidence: float, match_type: str = "Multimodal"):
        payload = {
            "studentId": student_id,
            "matchType": match_type,
            "confidence": round(float(confidence), 3),
            "doorLocation": "Classroom Main Entrance"
        }
        try:
            res = requests.post(BACKEND_WEBHOOK_URL, json=payload, timeout=3.0)
            if res.status_code in [200, 201]:
                logger.info(f"Webhook notified for {student_id} [{match_type}]: {res.json().get('message')}")
            else:
                logger.warning(f"Webhook returned {res.status_code}: {res.text}")
        except Exception as e:
            logger.error(f"Failed to post to backend: {e}")

    def run(self):
        last_scan = 0.0
        active_detections = []

        try:
            while True:
                now = time.time()
                time_elapsed = now - last_scan

                # Frame acquisition
                if not self.is_synthetic:
                    ret, frame = self.cap.read()
                    if not ret:
                        time.sleep(0.5)
                        continue
                else:
                    # Synthetic frame
                    frame = (cv2.imread("data/sample.jpg")
                             if os.path.exists("data/sample.jpg")
                             else None)
                    if frame is None:
                        frame = cv2.merge([
                            cv2.applyColorMap((cv2.randn(np.zeros((480, 640), dtype=np.uint8), 30, 10)), cv2.COLORMAP_BONE)
                        ])
                        cv2.putText(frame, "SYNTHETIC DEMO STREAM", (160, 240),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 128), 2)

                # Frame Throttling Check
                if time_elapsed >= FRAME_THROTTLE_SECONDS:
                    last_scan = now
                    active_detections = []

                    # 1. Detect Persons
                    person_detections = self.detector.detect_people(frame)
                    logger.info(f"Found {len(person_detections)} person(s) at doorway.")

                    for p in person_detections:
                        bbox = p["bbox"]
                        crop = crop_bbox(frame, bbox, padding_pct=0.05)

                        if crop is not None:
                            # 2. Extract facial feature & match against 65 students
                            matched_id, confidence, match_type = self.matcher.match_face(crop)

                            if matched_id:
                                logger.info(f"✨ Match confirmed: {matched_id} ({confidence:.2f})")
                                self.notify_backend(matched_id, confidence, match_type)
                                active_detections.append({
                                    "bbox": bbox,
                                    "student_id": matched_id,
                                    "confidence": confidence,
                                    "label": f"Student {matched_id}"
                                })
                            else:
                                active_detections.append({
                                    "bbox": bbox,
                                    "student_id": None,
                                    "confidence": p["confidence"],
                                    "label": "Person (Scanning...)"
                                })

                # Display HUD
                if SHOW_DISPLAY:
                    hud_frame = draw_hud(
                        frame,
                        active_detections,
                        throttle_countdown=max(0.0, FRAME_THROTTLE_SECONDS - (time.time() - last_scan))
                    )
                    cv2.imshow("Classroom Entrance Monitor (Main Worker)", hud_frame)

                    key = cv2.waitKey(1) & 0xFF
                    if key in [ord('q'), 27]:
                        break
                    elif key == ord('m'):
                        self.notify_backend("STU101", 0.94, "Multimodal")

                time.sleep(0.03)

        finally:
            self.cap.release()
            if SHOW_DISPLAY:
                cv2.destroyAllWindows()
            logger.info("Main Worker finished.")


if __name__ == "__main__":
    worker = MainAttendanceWorker()
    worker.run()
