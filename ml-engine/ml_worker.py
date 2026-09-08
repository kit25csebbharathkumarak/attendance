import os
import sys
import time
import logging
import cv2
import requests
import numpy as np
from dotenv import load_dotenv

# Try importing ultralytics & DeepFace; if not yet installed, provide helpful hints
try:
    from ultralytics import YOLO
except ImportError:
    print("[ERROR] 'ultralytics' is not installed. Run: pip install ultralytics")
    YOLO = None

try:
    from deepface import DeepFace
except ImportError:
    print("[WARNING] 'deepface' is not installed. Run: pip install deepface")
    DeepFace = None

# Load environment configuration
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("MLWorker")

# Configuration
BACKEND_WEBHOOK_URL = os.getenv("BACKEND_WEBHOOK_URL", "http://localhost:5000/api/webhook/match")
CAMERA_SOURCE = os.getenv("CAMERA_SOURCE", "0")
FRAME_THROTTLE_SECONDS = float(os.getenv("FRAME_THROTTLE_SECONDS", "3.0"))
YOLO_MODEL_WEIGHT = "yolov8n.pt"
CONFIDENCE_THRESHOLD = float(os.getenv("MATCH_CONFIDENCE_THRESHOLD", "0.65"))
SHOW_DISPLAY = os.getenv("SHOW_DISPLAY_WINDOW", "true").lower() == "true"


def send_to_backend(student_id: str, confidence: float, match_type: str = "Multimodal") -> bool:
    """
    Sends detected student match to Node.js backend webhook endpoint.
    
    :param student_id: Identified student identifier
    :param confidence: Similarity / detection confidence score (0.0 - 1.0)
    :param match_type: 'Face', 'Body', or 'Multimodal'
    :return: True if successfully received, False otherwise
    """
    payload = {
        "studentId": student_id,
        "matchType": match_type,
        "confidence": round(float(confidence), 3),
        "doorLocation": "Classroom Main Entrance"
    }

    try:
        logger.info(f"Dispatching match to backend: {payload}")
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
                logger.info(f"✅ Attendance logged for {student_id}: {res_data.get('message')}")
            return True
        else:
            logger.warning(f"Backend returned status {response.status_code}: {response.text}")
            return False

    except requests.exceptions.ConnectionError:
        logger.error(f"Cannot connect to backend server at {BACKEND_WEBHOOK_URL}. Is Express running?")
        return False
    except requests.exceptions.Timeout:
        logger.error("Request to backend webhook timed out.")
        return False
    except Exception as e:
        logger.error(f"Unexpected error sending match to backend: {e}")
        return False


def main():
    logger.info("Initializing Walk-Through Attendance ML Worker...")
    logger.info(f"Target Backend Webhook: {BACKEND_WEBHOOK_URL}")
    logger.info(f"Frame Throttling: 1 frame every {FRAME_THROTTLE_SECONDS} seconds")

    # Parse camera source (int for device index, string for file/RTSP)
    cam_index = int(CAMERA_SOURCE) if CAMERA_SOURCE.isdigit() else CAMERA_SOURCE
    cap = cv2.VideoCapture(cam_index)

    # Fallback to simulated feed if camera hardware is unavailable
    is_mock_feed = False
    if not cap.isOpened():
        logger.warning(f"Camera source '{CAMERA_SOURCE}' could not be opened. Using simulated video generator.")
        is_mock_feed = True

    # Load YOLOv8 person detector
    yolo_detector = None
    if YOLO:
        try:
            logger.info(f"Loading YOLOv8 weights ({YOLO_MODEL_WEIGHT})...")
            yolo_detector = YOLO(YOLO_MODEL_WEIGHT)
            logger.info("YOLOv8 successfully loaded.")
        except Exception as e:
            logger.error(f"Failed to load YOLOv8: {e}")

    # Track timing for frame throttling
    last_processed_time = 0.0
    frame_count = 0
    recent_detections = []

    try:
        while True:
            current_time = time.time()
            time_since_last = current_time - last_processed_time

            # 1. Capture Frame
            if not is_mock_feed:
                ret, frame = cap.read()
                if not ret:
                    logger.warning("Failed to grab camera frame. Re-attempting in 1s...")
                    time.sleep(1.0)
                    continue
            else:
                # Generate synthetic test frame (640x480 dark canvas)
                frame = np.zeros((480, 640, 3), dtype=np.uint8)
                frame[:] = (30, 30, 35)
                # Draw a placeholder person rectangle
                cv2.rectangle(frame, (220, 100), (420, 420), (70, 70, 85), -1)
                cv2.circle(frame, (320, 180), 50, (120, 120, 140), -1)
                cv2.putText(frame, "SIMULATED ENTRANCE CAMERA FEED", (140, 50),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 230, 118), 2)
                cv2.putText(frame, "Press 'M' to send mock match | 'Q' to quit", (160, 450),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 180, 180), 1)

            frame_count += 1

            # 2. Check Frame Throttling (1 frame every FRAME_THROTTLE_SECONDS)
            if time_since_last >= FRAME_THROTTLE_SECONDS:
                last_processed_time = current_time
                recent_detections = []
                logger.info(f"Processing frame #{frame_count} for person detection...")

                # 3. Detect People with YOLOv8 (Class 0)
                if yolo_detector:
                    try:
                        results = yolo_detector(frame, classes=[0], conf=0.45, verbose=False)
                        if results and len(results) > 0 and results[0].boxes is not None:
                            boxes = results[0].boxes
                            logger.info(f"YOLOv8 detected {len(boxes)} person(s) in entrance frame.")

                            for box in boxes:
                                coords = box.xyxy[0].cpu().numpy().astype(int)
                                conf = float(box.conf[0].cpu().numpy())
                                x1, y1, x2, y2 = coords

                                # Enforce boundary constraints
                                fh, fw = frame.shape[:2]
                                x1, y1 = max(0, x1), max(0, y1)
                                x2, y2 = min(fw, x2), min(fh, y2)

                                if (x2 - x1) < 30 or (y2 - y1) < 30:
                                    continue

                                # 4. Crop Person / Upper-body Region
                                person_crop = frame[y1:y2, x1:x2].copy()

                                # 5. Run DeepFace feature representation inside try/except block
                                face_identified = False
                                student_id_match = None
                                match_confidence = 0.0

                                if DeepFace:
                                    try:
                                        # Use DeepFace to extract representation
                                        representations = DeepFace.represent(
                                            img_path=person_crop,
                                            model_name="Facenet512",
                                            enforce_detection=False,
                                            detector_backend="opencv",
                                            align=True
                                        )

                                        if representations and len(representations) > 0:
                                            # Feature vector successfully extracted
                                            emb = representations[0].get("embedding")
                                            if emb and len(emb) > 0:
                                                face_identified = True
                                                # For demonstration/prototype: match recognized student
                                                student_id_match = "STU101"
                                                match_confidence = 0.92
                                                logger.info(f"Extracted face vector from crop ({len(emb)} dims).")

                                    except ValueError as ve:
                                        logger.debug(f"Face was not detected in crop: {ve}")
                                    except Exception as fe:
                                        logger.debug(f"DeepFace extraction exception: {fe}")

                                # If face is visible, send Multimodal match; else Body fallback
                                if face_identified and student_id_match:
                                    send_to_backend(student_id_match, match_confidence, match_type="Multimodal")
                                    recent_detections.append({
                                        "bbox": (x1, y1, x2, y2),
                                        "student_id": student_id_match,
                                        "confidence": match_confidence,
                                        "label": "Student STU101"
                                    })
                                else:
                                    # Fallback: Person detected, face turned or occluded
                                    recent_detections.append({
                                        "bbox": (x1, y1, x2, y2),
                                        "student_id": None,
                                        "confidence": conf,
                                        "label": "Person (Unidentified)"
                                    })
                    except Exception as yolo_err:
                        logger.error(f"Error during YOLO detection loop: {yolo_err}")

            # 3. Draw On-Screen Display HUD
            if SHOW_DISPLAY:
                display_frame = frame.copy()
                countdown = max(0.0, FRAME_THROTTLE_SECONDS - (time.time() - last_processed_time))
                
                # Draw top status bar
                cv2.rectangle(display_frame, (0, 0), (display_frame.shape[1], 35), (20, 20, 25), -1)
                status_str = f"ENTRANCE CAMERA | Next Scan In: {countdown:.1f}s | Detections: {len(recent_detections)}"
                cv2.putText(display_frame, status_str, (12, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 240, 120), 2)

                # Draw recent bounding boxes
                for det in recent_detections:
                    bx1, by1, bx2, by2 = det["bbox"]
                    sid = det["student_id"]
                    conf_val = det["confidence"]
                    box_color = (0, 230, 110) if sid else (0, 165, 255)

                    cv2.rectangle(display_frame, (bx1, by1), (bx2, by2), box_color, 2)
                    tag_str = f"{sid} [{(conf_val*100):.0f}%]" if sid else f"Person [{(conf_val*100):.0f}%]"
                    cv2.putText(display_frame, tag_str, (bx1, max(20, by1 - 8)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_color, 2)

                cv2.imshow("Multimodal Attendance - Entrance Monitor", display_frame)

                key = cv2.waitKey(1) & 0xFF
                if key == ord('q') or key == 27:
                    logger.info("Quit key received. Stopping worker...")
                    break
                elif key == ord('m'):
                    # Manually trigger a simulated match for fast verification
                    logger.info("Manual match trigger activated ('m' key).")
                    send_to_backend("STU102", 0.95, match_type="Multimodal")

            # Slight sleep to yield CPU
            time.sleep(0.03)

    except KeyboardInterrupt:
        logger.info("Worker stopped by user.")
    finally:
        cap.release()
        if SHOW_DISPLAY:
            cv2.destroyAllWindows()
        logger.info("ML Worker gracefully shut down.")


if __name__ == "__main__":
    main()
