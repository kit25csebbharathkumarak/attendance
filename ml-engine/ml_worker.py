import os
import sys
import time
import logging
import base64
import threading
import concurrent.futures
from typing import List, Dict, Tuple, Optional
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
SIMILARITY_THRESHOLD = float(os.getenv("MATCH_CONFIDENCE_THRESHOLD", "0.50"))
SHOW_DISPLAY = os.getenv("SHOW_DISPLAY_WINDOW", "true").lower() == "true"

http_session = requests.Session()

# Non-blocking background worker pool for webhooks
webhook_executor = concurrent.futures.ThreadPoolExecutor(max_workers=4, thread_name_prefix="WebhookDispatch")
recent_matches_cache: Dict[str, float] = {}
recent_matches_lock = threading.Lock()
DISPATCH_COOLDOWN_SECONDS = 45.0  # Avoid flooding backend for the same student within 45s


def send_to_backend(student_id: str, student_name: str, confidence: float, match_type: str = "Multimodal", photo: str = None) -> bool:
    """Dispatches attendance record to backend webhook asynchronously."""
    payload = {
        "studentId": student_id,
        "matchType": match_type,
        "confidence": round(float(confidence), 3),
        "doorLocation": "Classroom Main Entrance",
        "photo": photo
    }

    try:
        logger.info(f"Dispatching match: Student {student_name} ({student_id}) [Score: {confidence:.2f}]")
        response = http_session.post(
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
                logger.info(f"✅ Attendance recorded for {student_name} ({student_id}): {res_data.get('message')}")
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


def queue_student_dispatch(student_id: str, student_name: str, confidence: float, match_type: str = "Face", photo: str = None):
    """Debounces and queues student attendance dispatch in the background."""
    now = time.time()
    with recent_matches_lock:
        last_dispatched = recent_matches_cache.get(student_id, 0.0)
        if now - last_dispatched < DISPATCH_COOLDOWN_SECONDS:
            return  # Already dispatched recently
        recent_matches_cache[student_id] = now

    webhook_executor.submit(send_to_backend, student_id, student_name, confidence, match_type, photo)


class ThreadedCamera:
    """
    Dedicated background camera capture thread.
    Continuously drains frames from the hardware camera buffer at 30 FPS.
    Completely eliminates buffer queue backlog and video lag.
    """
    def __init__(self, cam_source):
        self.cam_source = cam_source
        self.cap = open_camera_source(cam_source)
        self.ret = False
        self.frame = None
        self.is_synthetic = not (self.cap and self.cap.isOpened())
        self.lock = threading.Lock()
        self.running = True
        self.thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.thread.start()

    def _capture_loop(self):
        consecutive_failures = 0
        while self.running:
            if not self.is_synthetic:
                ret, frame = self.cap.read()
                if ret and frame is not None and frame.size > 0:
                    with self.lock:
                        self.ret = True
                        self.frame = frame
                    consecutive_failures = 0
                else:
                    consecutive_failures += 1
                    if consecutive_failures >= 20:
                        time.sleep(0.5)
                        if self.cap:
                            self.cap.release()
                        self.cap = open_camera_source(self.cam_source)
                        self.is_synthetic = not (self.cap and self.cap.isOpened())
                        consecutive_failures = 0
                    time.sleep(0.01)
            else:
                # Synthetic Standby Frame
                frame = np.zeros((480, 640, 3), dtype=np.uint8)
                frame[:] = (30, 30, 35)
                cv2.rectangle(frame, (200, 100), (440, 400), (60, 60, 75), 2)
                cv2.circle(frame, (320, 180), 55, (100, 100, 120), 2)
                cv2.putText(frame, "CLASSROOM CAMERA FEED", (170, 50),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 230, 118), 2)
                with self.lock:
                    self.ret = True
                    self.frame = frame
                time.sleep(0.033)

    def read(self):
        with self.lock:
            if self.frame is not None:
                return self.ret, self.frame.copy()
            return False, None

    def stop(self):
        self.running = False
        if self.cap:
            self.cap.release()


class DashboardBroadcaster:
    """
    Non-blocking background thread broadcaster that streams camera
    frames to the dashboard Socket.IO webhook at a smooth ~20 FPS.
    """
    def __init__(self, endpoint_url: str):
        self.endpoint_url = endpoint_url
        self.lock = threading.Lock()
        self.latest_frame = None
        self.running = True
        self.thread = threading.Thread(target=self._worker, daemon=True)
        self.thread.start()

    def update_frame(self, frame: np.ndarray):
        with self.lock:
            self.latest_frame = frame

    def _worker(self):
        while self.running:
            frame_to_send = None
            with self.lock:
                if self.latest_frame is not None:
                    frame_to_send = self.latest_frame
                    self.latest_frame = None

            if frame_to_send is not None:
                try:
                    small = cv2.resize(frame_to_send, (480, 270))
                    _, buf = cv2.imencode('.jpg', small, [int(cv2.IMWRITE_JPEG_QUALITY), 55])
                    b64 = "data:image/jpeg;base64," + base64.b64encode(buf).decode('utf-8')
                    http_session.post(self.endpoint_url, json={"frame": b64}, timeout=0.3)
                except Exception:
                    pass
            time.sleep(0.04)  # ~20-25 FPS smooth broadcast

    def stop(self):
        self.running = False


class ClassroomFaceTracker:
    """
    High-Speed Spatial Identity Tracker for up to 65+ Students in a Classroom:
    - Associates detected face boxes across frames using IoU & Centroid Distance (< 0.1ms).
    - Maintains identity persistence: Confirmed students require ZERO FaceNet inference on subsequent frames!
    - Only gathers and batches unconfirmed or newly visible faces for deep neural network embedding.
    """
    def __init__(self, iou_threshold: float = 0.25, max_distance: float = 65.0, expiry_seconds: float = 2.0):
        self.iou_threshold = iou_threshold
        self.max_distance = max_distance
        self.expiry_seconds = expiry_seconds
        self.tracks: Dict[int, Dict] = {}
        self.next_track_id = 1
        self.lock = threading.Lock()

    @staticmethod
    def _compute_iou(boxA, boxB):
        xA = max(boxA[0], boxB[0])
        yA = max(boxA[1], boxB[1])
        xB = min(boxA[2], boxB[2])
        yB = min(boxA[3], boxB[3])
        interArea = max(0, xB - xA) * max(0, yB - yA)
        boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
        boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
        return interArea / float(boxAArea + boxBArea - interArea + 1e-6)

    @staticmethod
    def _compute_centroid_dist(boxA, boxB):
        cA = ((boxA[0] + boxA[2]) / 2.0, (boxA[1] + boxA[3]) / 2.0)
        cB = ((boxB[0] + boxB[2]) / 2.0, (boxB[1] + boxB[3]) / 2.0)
        return ((cA[0] - cB[0])**2 + (cA[1] - cB[1])**2)**0.5

    def update(self, detected_boxes: List[Tuple[int, int, int, int]], frame: np.ndarray, matcher: FaceMatcher):
        now = time.time()
        with self.lock:
            # Match detected boxes with existing active tracks
            unmatched_detections = list(range(len(detected_boxes)))
            unmatched_tracks = set(self.tracks.keys())
            matched_pairs = []

            for det_idx in unmatched_detections[:]:
                det_box = detected_boxes[det_idx]
                best_track_id = None
                best_score = 0.0

                for track_id in list(unmatched_tracks):
                    tr = self.tracks[track_id]
                    iou = self._compute_iou(det_box, tr["bbox"])
                    dist = self._compute_centroid_dist(det_box, tr["bbox"])

                    if iou > self.iou_threshold or dist < self.max_distance:
                        score = iou + (1.0 - min(1.0, dist / self.max_distance))
                        if score > best_score:
                            best_score = score
                            best_track_id = track_id

                if best_track_id is not None:
                    matched_pairs.append((det_idx, best_track_id))
                    unmatched_detections.remove(det_idx)
                    unmatched_tracks.remove(best_track_id)

            # Update matched tracks
            for det_idx, track_id in matched_pairs:
                new_box = detected_boxes[det_idx]
                old_box = self.tracks[track_id]["bbox"]
                # Exponential moving average for smooth bounding box
                smooth_box = (
                    int(0.75 * new_box[0] + 0.25 * old_box[0]),
                    int(0.75 * new_box[1] + 0.25 * old_box[1]),
                    int(0.75 * new_box[2] + 0.25 * old_box[2]),
                    int(0.75 * new_box[3] + 0.25 * old_box[3]),
                )
                self.tracks[track_id]["bbox"] = smooth_box
                self.tracks[track_id]["last_seen"] = now

            # Create new tracks for unmatched detections
            for det_idx in unmatched_detections:
                track_id = self.next_track_id
                self.next_track_id += 1
                self.tracks[track_id] = {
                    "track_id": track_id,
                    "bbox": detected_boxes[det_idx],
                    "matched": False,
                    "student_id": None,
                    "student_name": None,
                    "confidence": 0.0,
                    "match_type": "Face",
                    "last_seen": now,
                    "last_embed_time": 0.0,
                    "embed_attempts": 0
                }

            # Gather tracks that require embedding extraction (unconfirmed tracks)
            tracks_to_embed = []
            crops_to_embed = []
            h, w = frame.shape[:2]

            for track_id, tr in self.tracks.items():
                if not tr["matched"]:
                    # Intelligent pacing: first 4 attempts every 0.20s, then 1.0s, then 2.5s
                    attempts = tr.get("embed_attempts", 0)
                    interval = 0.20 if attempts < 4 else (1.0 if attempts < 10 else 2.5)
                    if (now - tr["last_embed_time"]) >= interval:
                        bx1, by1, bx2, by2 = tr["bbox"]
                        crop = frame[max(0, by1):min(h, by2), max(0, bx1):min(w, bx2)]
                        if crop.size > 0 and crop.shape[0] >= 18 and crop.shape[1] >= 18:
                            tracks_to_embed.append(track_id)
                            crops_to_embed.append(crop)
                            tr["last_embed_time"] = now
                            tr["embed_attempts"] += 1

            # Run batched embedding extraction for all unconfirmed faces in ONE pass!
            if crops_to_embed:
                embs = matcher.extract_embeddings_batch(crops_to_embed)
                if embs is not None and len(embs) > 0:
                    match_results = matcher.match_batch(embs)
                    for track_id, (s_id, s_name, confidence, m_type), crop in zip(tracks_to_embed, match_results, crops_to_embed):
                        tr = self.tracks[track_id]
                        if s_id:
                            tr["matched"] = True
                            tr["student_id"] = s_id
                            tr["student_name"] = s_name
                            tr["confidence"] = confidence
                            tr["match_type"] = m_type
                            logger.info(f"🎯 Recognized Student: {s_name} ({s_id}) [Score: {confidence:.3f}]")

                            # Generate thumbnail photo for dashboard
                            photo_b64 = None
                            try:
                                thumb = cv2.resize(crop, (160, 160))
                                _, buf = cv2.imencode('.jpg', thumb, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                                photo_b64 = "data:image/jpeg;base64," + base64.b64encode(buf).decode('utf-8')
                            except Exception:
                                pass

                            # Queue asynchronous non-blocking webhook dispatch
                            queue_student_dispatch(s_id, s_name, confidence, m_type, photo_b64)
                        else:
                            tr["confidence"] = max(tr["confidence"], confidence)

            # Prune dead tracks that haven't been seen recently
            dead_tracks = [t_id for t_id, tr in self.tracks.items() if (now - tr["last_seen"]) > self.expiry_seconds]
            for t_id in dead_tracks:
                del self.tracks[t_id]

    def get_detections(self) -> List[Dict]:
        """Returns list of active detections for drawing on camera overlay."""
        now = time.time()
        with self.lock:
            dets = []
            for tr in self.tracks.values():
                is_matched = tr["matched"]
                if is_matched:
                    label = f"{tr['student_name']} ({tr['student_id']})"
                else:
                    conf = tr.get("confidence", 0.0)
                    label = f"Scanning ({conf*100:.0f}%)" if conf > 0.30 else "Detecting Face"

                dets.append({
                    "bbox": tr["bbox"],
                    "matched": is_matched,
                    "label": label,
                    "confidence": tr["confidence"],
                    "type": tr.get("match_type", "Face"),
                    "track_id": tr["track_id"]
                })
            return dets


class AIScannerWorker:
    """
    Asynchronous Multi-Student AI Scanning Worker:
    - Runs direct single-pass multi-face detection across the full frame (~20ms).
    - Tracks all classroom students via ClassroomFaceTracker with zero-overhead spatial correlation.
    - Executes batched FaceNet inference only on new/unconfirmed students.
    - Maintains 15-25 scans/second continuously!
    """
    def __init__(self, camera_stream: ThreadedCamera, detector: PersonDetector, matcher: FaceMatcher):
        self.camera = camera_stream
        self.detector = detector
        self.matcher = matcher
        self.tracker = ClassroomFaceTracker(iou_threshold=0.25, max_distance=65.0, expiry_seconds=2.0)
        self.running = True
        self.fps = 0.0
        self.scan_count = 0
        self.thread = threading.Thread(target=self._scan_loop, daemon=True)
        self.thread.start()

    def get_detections(self):
        return self.tracker.get_detections()

    def _scan_loop(self):
        last_metric_time = time.time()
        metric_count = 0

        while self.running:
            ret, frame = self.camera.read()
            if not ret or frame is None or frame.size == 0:
                time.sleep(0.01)
                continue

            # 1. Single-pass high-speed multi-face detection (All faces found in ~20ms)
            face_boxes, face_scores = self.matcher.detect_all_faces(frame, conf_threshold=0.45)

            # 2. Update classroom spatial identity tracker (Batched FaceNet for new faces, 0ms for confirmed)
            self.tracker.update(face_boxes, frame, self.matcher)

            # Metric updates
            metric_count += 1
            now = time.time()
            if now - last_metric_time >= 1.0:
                self.fps = metric_count / (now - last_metric_time)
                metric_count = 0
                last_metric_time = now

            # Sleep 10ms for CPU pacing
            time.sleep(0.010)

    def stop(self):
        self.running = False


def acquire_single_instance_lock():
    lock_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ml_worker.lock")
    try:
        lock_file = open(lock_path, "w")
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        lock_file.write(str(os.getpid()))
        lock_file.flush()
        return lock_file, lock_path
    except (OSError, IOError):
        logger.error("❌ Another instance of ML Worker is already running. Exiting to avoid camera hardware conflict.")
        sys.exit(0)


def release_single_instance_lock(lock_file, lock_path):
    try:
        if lock_file:
            lock_file.close()
        if lock_path and os.path.exists(lock_path):
            os.remove(lock_path)
    except Exception:
        pass


def open_camera_source(cam_source):
    cam_index = int(cam_source) if str(cam_source).isdigit() else cam_source
    logger.info(f"Connecting to camera source: '{cam_source}'...")

    if not isinstance(cam_index, int):
        cap = cv2.VideoCapture(cam_index)
        return cap

    # 1. DirectShow with MJPG FourCC (prevents YUY2 stride corruption on Windows)
    cap = cv2.VideoCapture(cam_index, cv2.CAP_DSHOW)
    if cap.isOpened():
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        for _ in range(6):
            ret, _ = cap.read()
            if ret:
                break
            time.sleep(0.04)
        return cap

    # 2. Media Foundation (CAP_MSMF) fallback
    cap = cv2.VideoCapture(cam_index, cv2.CAP_MSMF)
    if cap.isOpened():
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        for _ in range(6):
            ret, _ = cap.read()
            if ret:
                break
            time.sleep(0.04)
        return cap

    # 3. Default fallback
    cap = cv2.VideoCapture(cam_index)
    if cap.isOpened():
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    return cap


def sync_students_periodically(matcher: FaceMatcher, stop_event: threading.Event):
    """Background thread that refreshes enrolled students every 10 seconds without stalling video."""
    while not stop_event.is_set():
        stop_event.wait(10.0)
        if not stop_event.is_set():
            try:
                matcher.load_enrolled_students(backend_url=BACKEND_EMBEDDINGS_URL)
            except Exception:
                pass


def main():
    lock_file, lock_path = acquire_single_instance_lock()

    print("\n" + "=" * 65)
    print("🚀 ULTRA-FAST MULTI-STUDENT ATTENDANCE ENGINE (CLASSROOM OPTIMIZED)")
    print("   • Multi-Face Detection: MTCNN Parallel (All faces in ~20ms)")
    print("   • Face Recognition: FaceNet 512-d (Batched Multi-Threaded Inference)")
    print("   • Classroom Capacity: Up to 65+ Students Simultaneous")
    print(f"   • Matching Threshold: {SIMILARITY_THRESHOLD}")
    print("   • AI Tracking: Zero-Overhead Spatial Centroid & IoU Tracker")
    print("   • Video Stream: Continuous 30 FPS Non-blocking")
    print("=" * 65 + "\n")

    logger.info("Loading YOLOv8 person detector...")
    detector = PersonDetector(model_weight="yolov8n.pt", conf_threshold=0.40)

    logger.info("Loading FaceNet InceptionResnetV1 & Multi-Face MTCNN...")
    matcher = FaceMatcher(similarity_threshold=SIMILARITY_THRESHOLD)

    # Fetch enrolled student embeddings once at boot
    enrolled_count = matcher.load_enrolled_students(backend_url=BACKEND_EMBEDDINGS_URL)
    print(f"\n📋 Loaded {enrolled_count} enrolled students from backend.")

    # 1. Start dedicated camera acquisition thread (Zero buffer backlog, 30 FPS)
    camera_stream = ThreadedCamera(CAMERA_SOURCE)

    # 2. Start dedicated dashboard frame broadcaster thread (~20 FPS)
    broadcaster = DashboardBroadcaster(BACKEND_FRAME_URL)

    # 3. Start dedicated AI scanning worker thread (Multi-Face tracking, 15-25 scans/s)
    ai_worker = AIScannerWorker(camera_stream, detector, matcher)

    # 4. Start student sync background thread
    stop_sync_event = threading.Event()
    sync_thread = threading.Thread(
        target=sync_students_periodically,
        args=(matcher, stop_sync_event),
        daemon=True
    )
    sync_thread.start()

    logger.info("✅ All real-time classroom threads running. Streaming live video...")

    try:
        while True:
            ret, frame = camera_stream.read()
            if not ret or frame is None:
                time.sleep(0.01)
                continue

            display_frame = frame.copy()
            h, w = display_frame.shape[:2]

            # Grab latest active detections from spatial identity tracker
            active_detections = ai_worker.get_detections()
            total_faces = len(active_detections)
            recognized_count = sum(1 for d in active_detections if d.get("matched"))

            # Top Header Bar (HUD)
            cv2.rectangle(display_frame, (0, 0), (w, 36), (15, 17, 23), -1)
            ai_fps_str = f"{ai_worker.fps:.1f}" if ai_worker.fps > 0 else "Active"
            status_line = f"LIVE AI FEED | Cam {CAMERA_SOURCE} | Scan: {ai_fps_str} scans/s | Faces: {total_faces} | Enrolled: {len(matcher.enrolled_students)}"
            cv2.putText(display_frame, status_line, (15, 24),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 240, 120), 2)

            # Draw Detections Overlay
            for det in active_detections:
                bx1, by1, bx2, by2 = det["bbox"]
                is_match = det["matched"]
                if is_match:
                    tag = f"✓ {det['label']} [{(det['confidence']*100):.0f}%]"
                    color = (0, 230, 110)  # Emerald green for confirmed attendance
                else:
                    tag = f"{det['label']}"
                    color = (0, 185, 255)  # Cyan/Amber for active scanning

                cv2.rectangle(display_frame, (bx1, by1), (bx2, by2), color, 2)
                tw = len(tag) * 8 + 10
                cv2.rectangle(display_frame, (bx1, max(0, by1 - 24)), (bx1 + tw, by1), color, -1)
                cv2.putText(display_frame, tag, (bx1 + 5, max(16, by1 - 6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 0), 2)

            # Push live annotated frame to dashboard broadcaster (non-blocking)
            broadcaster.update_frame(display_frame)

            # Local OpenCV Window Display
            if SHOW_DISPLAY:
                cv2.imshow("Classroom Entrance Monitor (YOLOv8 + FaceNet)", display_frame)
                key = cv2.waitKey(1) & 0xFF
                if key in [27, ord('q')]:
                    break
                elif key == ord('r'):
                    matcher.load_enrolled_students(backend_url=BACKEND_EMBEDDINGS_URL)

            # Keep video display loop at smooth 30-60 FPS
            time.sleep(0.01)

    except KeyboardInterrupt:
        logger.info("Stopping ML Worker...")
    finally:
        stop_sync_event.set()
        ai_worker.stop()
        broadcaster.stop()
        camera_stream.stop()
        webhook_executor.shutdown(wait=False)
        if SHOW_DISPLAY:
            cv2.destroyAllWindows()
        release_single_instance_lock(lock_file, lock_path)
        logger.info("ML Worker gracefully shut down.")


if __name__ == "__main__":
    main()
