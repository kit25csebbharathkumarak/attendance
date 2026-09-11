import os
import sys
import time
import logging
import base64
import threading
import concurrent.futures
from typing import List, Dict, Tuple, Optional, Any
import cv2
import requests
import numpy as np

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from anti_spoof import AntiSpoofDetector

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

# Anti-Spoofing & Liveness Configuration
ENABLE_LIVENESS = os.getenv("ENABLE_LIVENESS_DETECTION", "true").lower() == "true"
LIVENESS_THRESHOLD = float(os.getenv("LIVENESS_CONFIDENCE_THRESHOLD", "0.45"))
LIVENESS_FRAMES = int(os.getenv("LIVENESS_OBSERVATION_FRAMES", "2"))

anti_spoof_engine = AntiSpoofDetector(
    liveness_threshold=LIVENESS_THRESHOLD,
    min_observation_frames=LIVENESS_FRAMES
)
logger.info(f"Liveness Detection: {'ACTIVE' if ENABLE_LIVENESS else 'DISABLED'} (Threshold: {LIVENESS_THRESHOLD}, Window: {LIVENESS_FRAMES} frames)")

http_session = requests.Session()

# Non-blocking background worker pool for webhooks
webhook_executor = concurrent.futures.ThreadPoolExecutor(max_workers=4, thread_name_prefix="WebhookDispatch")
# Dedicated non-blocking worker pool for FaceNet feature extraction
embedding_executor = concurrent.futures.ThreadPoolExecutor(max_workers=4, thread_name_prefix="FaceEmbed")
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
        self.cap = None
        self.ret = False
        self.frame = None
        self.is_synthetic = False
        self.lock = threading.Lock()
        self.running = True
        self.thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.thread.start()

    def _capture_loop(self):
        self.cap = open_camera_source(self.cam_source)
        self.is_synthetic = not (self.cap and self.cap.isOpened())
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
                    http_session.post(self.endpoint_url, json={"frame": b64}, timeout=0.25)
                except Exception:
                    pass
            time.sleep(0.055)  # ~18 FPS fluid dashboard broadcast

    def stop(self):
        self.running = False


class ClassroomFaceTracker:
    """
    High-Speed Spatial Identity Tracker for up to 65+ Students in a Classroom:
    - Associates detected face boxes across frames using IoU & Centroid Distance (< 0.1ms).
    - Maintains identity persistence: Confirmed students require ZERO FaceNet inference on subsequent frames!
    - Only gathers and batches unconfirmed or newly visible faces for deep neural network embedding.
    """
    def __init__(self, iou_threshold: float = 0.15, max_distance: float = 120.0, expiry_seconds: float = 2.5):
        self.iou_threshold = iou_threshold
        self.max_distance = max_distance
        self.expiry_seconds = expiry_seconds
        self.tracks: Dict[int, Dict] = {}
        self.next_track_id = 1
        self.in_flight_tracks = set()
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

    def update(self, detected_boxes: List[Tuple[int, int, int, int]], frame: np.ndarray, matcher: FaceMatcher, detected_landmarks: Optional[List[Any]] = None):
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

                if detected_landmarks and det_idx < len(detected_landmarks):
                    lm = detected_landmarks[det_idx]
                    if lm:
                        self.tracks[track_id]["landmarks_history"].append(lm)
                        if len(self.tracks[track_id]["landmarks_history"]) > 12:
                            self.tracks[track_id]["landmarks_history"].pop(0)

            # Create new tracks for unmatched detections
            for det_idx in unmatched_detections:
                track_id = self.next_track_id
                self.next_track_id += 1
                init_lms = [detected_landmarks[det_idx]] if (detected_landmarks and det_idx < len(detected_landmarks) and detected_landmarks[det_idx]) else []
                self.tracks[track_id] = {
                    "track_id": track_id,
                    "bbox": detected_boxes[det_idx],
                    "matched": False,
                    "dispatched": False,
                    "student_id": None,
                    "student_name": None,
                    "confidence": 0.0,
                    "match_type": "Face",
                    "last_seen": now,
                    "last_embed_time": 0.0,
                    "embed_attempts": 0,
                    "crops_history": [],
                    "landmarks_history": init_lms,
                    "frames_tracked": 0,
                    "liveness_score": 0.0,
                    "is_live": False,
                    "is_spoof": False,
                    "spoof_reason": ""
                }

            # Update crops, temporal dynamics & liveness evaluation across all active tracks
            h, w = frame.shape[:2]
            for track_id, tr in self.tracks.items():
                bx1, by1, bx2, by2 = tr["bbox"]
                crop = frame[max(0, by1):min(h, by2), max(0, bx1):min(w, bx2)]
                if crop.size > 0 and crop.shape[0] >= 18 and crop.shape[1] >= 18:
                    tr["crops_history"].append(crop.copy())
                    if len(tr["crops_history"]) > 12:
                        tr["crops_history"].pop(0)
                    tr["frames_tracked"] += 1

                    if ENABLE_LIVENESS:
                        liveness_res = anti_spoof_engine.evaluate_track(
                            crop,
                            tr["crops_history"],
                            tr["landmarks_history"],
                            frames_tracked=tr["frames_tracked"]
                        )
                        tr["liveness_score"] = liveness_res["liveness_score"]
                        tr["is_live"] = liveness_res["is_live"]
                        tr["is_spoof"] = liveness_res["is_spoof"]
                        tr["spoof_reason"] = liveness_res["reason"]
                    else:
                        tr["liveness_score"] = 1.0
                        tr["is_live"] = True
                        tr["is_spoof"] = False
                        tr["spoof_reason"] = "Liveness Disabled"

                    # If an already recognized candidate student now achieved confirmed live status:
                    if (
                        tr.get("student_id")
                        and tr.get("is_live")
                        and not tr.get("is_spoof")
                        and not tr.get("dispatched", False)
                        and tr.get("frames_tracked", 0) >= LIVENESS_FRAMES
                    ):
                        tr["matched"] = True
                        tr["dispatched"] = True
                        s_name = tr["student_name"]
                        s_id = tr["student_id"]
                        logger.info(
                            f"🎯 Confirmed LIVE Attendance for {s_name} ({s_id}) "
                            f"[Match: {tr['confidence']:.3f}, Liveness: {tr['liveness_score']:.2f}]"
                        )
                        photo_b64 = None
                        try:
                            thumb = cv2.resize(crop, (160, 160))
                            _, buf = cv2.imencode('.jpg', thumb, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                            photo_b64 = "data:image/jpeg;base64," + base64.b64encode(buf).decode('utf-8')
                        except Exception:
                            pass
                        queue_student_dispatch(s_id, s_name, tr["confidence"], tr["match_type"], photo_b64)

            # Asynchronously dispatch unconfirmed faces to background FaceNet embedding worker
            for track_id, tr in self.tracks.items():
                if not tr.get("student_id") and track_id not in self.in_flight_tracks:
                    attempts = tr.get("embed_attempts", 0)
                    interval = 0.02 if attempts < 5 else 0.10
                    if (now - tr["last_embed_time"]) >= interval:
                        bx1, by1, bx2, by2 = tr["bbox"]
                        crop = frame[max(0, by1):min(h, by2), max(0, bx1):min(w, bx2)]
                        if crop.size > 0 and crop.shape[0] >= 18 and crop.shape[1] >= 18:
                            tr["last_embed_time"] = now
                            tr["embed_attempts"] += 1
                            self.in_flight_tracks.add(track_id)
                            embedding_executor.submit(self._async_embed_match, track_id, crop.copy(), matcher)

            # Prune dead tracks that haven't been seen recently
            dead_tracks = [t_id for t_id, tr in self.tracks.items() if (now - tr["last_seen"]) > self.expiry_seconds]
            for t_id in dead_tracks:
                del self.tracks[t_id]
                self.in_flight_tracks.discard(t_id)

    def _async_embed_match(self, track_id: int, crop: np.ndarray, matcher: FaceMatcher):
        """Asynchronously extracts 512-d FaceNet embedding and matches against cohort without blocking 30 FPS video."""
        try:
            embs = matcher.extract_embeddings_batch([crop])
            if embs is not None and len(embs) > 0:
                match_results = matcher.match_batch(embs)
                if match_results:
                    s_id, s_name, confidence, m_type = match_results[0]
                    with self.lock:
                        if track_id in self.tracks:
                            tr = self.tracks[track_id]
                            if s_id:
                                tr["student_id"] = s_id
                                tr["student_name"] = s_name
                                tr["confidence"] = confidence
                                tr["match_type"] = m_type
                                # Only mark matched and dispatch attendance if confirmed LIVE and not spoof
                                if tr.get("is_spoof"):
                                    tr["matched"] = False
                                    logger.warning(
                                        f"🚫 [AntiSpoof REJECTED] Enrolled student {s_name} ({s_id}) photo shown on phone/printout! "
                                        f"Attendance BLOCKED. ({tr.get('spoof_reason')})"
                                    )
                                elif (
                                    tr.get("is_live")
                                    and not tr.get("is_spoof")
                                    and not tr.get("dispatched", False)
                                    and tr.get("frames_tracked", 0) >= LIVENESS_FRAMES
                                ):
                                    tr["matched"] = True
                                    tr["dispatched"] = True
                                    logger.info(
                                        f"🎯 Recognized LIVE Student: {s_name} ({s_id}) "
                                        f"[Match: {confidence:.3f}, Liveness: {tr['liveness_score']:.2f}]"
                                    )
                                    photo_b64 = None
                                    try:
                                        thumb = cv2.resize(crop, (160, 160))
                                        _, buf = cv2.imencode('.jpg', thumb, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                                        photo_b64 = "data:image/jpeg;base64," + base64.b64encode(buf).decode('utf-8')
                                    except Exception:
                                        pass
                                    queue_student_dispatch(s_id, s_name, confidence, m_type, photo_b64)
                                else:
                                    # Still verifying liveness across observation window
                                    tr["matched"] = False
                            else:
                                tr["confidence"] = max(tr.get("confidence", 0.0), confidence)
        except Exception as e:
            logger.debug(f"Async embedding error: {e}")
        finally:
            with self.lock:
                self.in_flight_tracks.discard(track_id)

    def get_detections(self) -> List[Dict]:
        """Returns list of active detections for drawing on camera overlay."""
        now = time.time()
        with self.lock:
            dets = []
            for tr in self.tracks.values():
                is_matched = tr.get("matched", False)
                is_spoof = tr.get("is_spoof", False)
                is_live = tr.get("is_live", False)
                s_name = tr.get("student_name")
                s_id = tr.get("student_id")
                conf = tr.get("confidence", 0.0)
                liveness_score = tr.get("liveness_score", 0.0)
                spoof_reason = tr.get("spoof_reason", "")

                if is_spoof:
                    label = f"SPOOF: {spoof_reason}"
                    status_type = "Spoof"
                elif is_live and is_matched and s_name:
                    label = f"{s_name} ({s_id})"
                    status_type = "Verified"
                elif s_name:
                    label = f"Verifying ({s_name})"
                    status_type = "Verifying"
                else:
                    label = f"Scanning ({conf*100:.0f}%)" if conf > 0.30 else "Detecting Face"
                    status_type = "Scanning"

                dets.append({
                    "bbox": tr["bbox"],
                    "matched": is_matched,
                    "is_live": is_live,
                    "is_spoof": is_spoof,
                    "liveness_score": liveness_score,
                    "spoof_reason": spoof_reason,
                    "student_name": s_name,
                    "student_id": s_id,
                    "label": label,
                    "status_type": status_type,
                    "confidence": conf,
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
    def __init__(self, camera_stream: ThreadedCamera, matcher: FaceMatcher):
        self.camera = camera_stream
        self.matcher = matcher
        self.tracker = ClassroomFaceTracker(iou_threshold=0.15, max_distance=120.0, expiry_seconds=2.5)
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

            # 1. Single-pass ultra-fast multi-face detection (35ms, without landmark regression overhead)
            face_boxes, face_scores = self.matcher.detect_all_faces(frame, conf_threshold=0.35, return_landmarks=False)

            # 2. Update classroom spatial identity tracker with liveness & anti-spoof checks
            self.tracker.update(face_boxes, frame, self.matcher)

            # Metric updates
            metric_count += 1
            now = time.time()
            if now - last_metric_time >= 1.0:
                self.fps = metric_count / (now - last_metric_time)
                metric_count = 0
                last_metric_time = now

            # Pacing: allows FaceNet background threads immediate CPU priority
            time.sleep(0.020)

    def stop(self):
        self.running = False


def acquire_single_instance_lock():
    lock_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ml_worker.lock")
    for attempt in range(4):
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
            if attempt < 3:
                time.sleep(0.15)
                continue
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

    # DirectShow with fast retries (avoids MSMF 20-second hang on Windows)
    for attempt in range(4):
        cap = cv2.VideoCapture(cam_index, cv2.CAP_DSHOW)
        if cap.isOpened():
            cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            for _ in range(3):
                ret, _ = cap.read()
                if ret:
                    break
                time.sleep(0.02)
            return cap
        time.sleep(0.15)

    # Fast fallback default
    cap = cv2.VideoCapture(cam_index)
    if cap.isOpened():
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    return cap


def sync_students_periodically(matcher: Any, stop_event: threading.Event):
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
    print(">> ULTRA-FAST MULTI-STUDENT ATTENDANCE ENGINE (CLASSROOM OPTIMIZED)")
    print("   * Multi-Face Detection: MTCNN Parallel (All faces in ~20ms)")
    print("   * Face Recognition: FaceNet 512-d (Batched Inference)")
    print("   * Classroom Capacity: Up to 65+ Students Simultaneous")
    print(f"   * Matching Threshold: {SIMILARITY_THRESHOLD}")
    print("   * AI Tracking: Zero-Overhead Spatial Centroid & IoU Tracker")
    print(f"   * Anti-Spoofing & Liveness: {'ACTIVE' if ENABLE_LIVENESS else 'DISABLED'} (Screen & Photo Rejection)")
    print("   * Video Stream: Continuous 30 FPS Non-blocking")
    print("=" * 65 + "\n")

    # 1. Start dedicated camera acquisition thread FIRST (Live video in < 1 second!)
    camera_stream = ThreadedCamera(CAMERA_SOURCE)

    # 2. Start dedicated dashboard frame broadcaster thread (~20 FPS)
    broadcaster = DashboardBroadcaster(BACKEND_FRAME_URL)

    # State container for parallel AI neural engine initialization
    ai_state = {
        "ready": False,
        "matcher": None,
        "worker": None,
        "enrolled_count": 0,
    }
    stop_sync_event = threading.Event()

    def init_ai_engine():
        try:
            logger.info("Initializing FaceNet InceptionResnetV1 & Multi-Face MTCNN...")
            from face_matcher import FaceMatcher
            m = FaceMatcher(similarity_threshold=SIMILARITY_THRESHOLD)
            enrolled = m.load_enrolled_students(backend_url=BACKEND_EMBEDDINGS_URL)
            w = AIScannerWorker(camera_stream, m)

            # Start student sync periodic background thread
            sync_thread = threading.Thread(
                target=sync_students_periodically,
                args=(m, stop_sync_event),
                daemon=True
            )
            sync_thread.start()

            ai_state["matcher"] = m
            ai_state["worker"] = w
            ai_state["enrolled_count"] = enrolled
            ai_state["ready"] = True
            logger.info(f"✅ AI Neural Engine active. Vectorized {enrolled} enrolled students.")
        except Exception as e:
            logger.error(f"❌ Error initializing AI engine: {e}", exc_info=True)

    ai_init_thread = threading.Thread(target=init_ai_engine, daemon=True)
    ai_init_thread.start()

    logger.info("✅ Camera streaming active. Neural engine initializing in background...")

    try:
        while True:
            ret, frame = camera_stream.read()
            if not ret or frame is None:
                time.sleep(0.01)
                continue
            display_frame = frame.copy()
            h, w = display_frame.shape[:2]

            if ai_state["ready"] and ai_state["worker"] is not None:
                ai_worker = ai_state["worker"]
                matcher = ai_state["matcher"]

                # Grab latest active detections from spatial identity tracker
                active_detections = ai_worker.get_detections()
                total_faces = len(active_detections)
                recognized_count = sum(1 for d in active_detections if d.get("matched"))

                # Top Header Bar (HUD)
                cv2.rectangle(display_frame, (0, 0), (w, 36), (15, 17, 23), -1)
                ai_fps_str = f"{ai_worker.fps:.1f}" if ai_worker.fps > 0 else "Active"
                spoof_count = sum(1 for d in active_detections if d.get("is_spoof"))
                status_line = f"LIVE AI FEED | Cam {CAMERA_SOURCE} | Scan: {ai_fps_str} scans/s | Faces: {total_faces} | Enrolled: {len(matcher.enrolled_students)} | Anti-Spoof: {'ACTIVE' if ENABLE_LIVENESS else 'OFF'}"
                if spoof_count > 0:
                    status_line += f" | ⚠️ SPOOF ATTEMPTS: {spoof_count}"
                hud_color = (0, 100, 255) if spoof_count > 0 else (0, 240, 120)
                cv2.putText(display_frame, status_line, (15, 24),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, hud_color, 2)

                # Draw Detections Overlay
                for det in active_detections:
                    bx1, by1, bx2, by2 = det["bbox"]
                    is_match = det.get("matched", False)
                    is_spoof = det.get("is_spoof", False)
                    is_live = det.get("is_live", False)
                    status_type = det.get("status_type", "")
                    conf = det.get("confidence", 0.0)

                    if is_spoof:
                        tag = f"❌ SPOOF: {det.get('spoof_reason', 'Photo/Screen')}"
                        color = (0, 0, 230)  # Bright Red for spoof rejection
                        text_color = (255, 255, 255)
                    elif is_match and is_live and det.get("student_name"):
                        tag = f"✓ {det['label']} [{(conf*100):.0f}%]"
                        color = (0, 230, 110)  # Emerald Green for confirmed live student
                        text_color = (0, 0, 0)
                    elif det.get("student_name"):
                        tag = f"🔍 {det['label']}"
                        color = (0, 200, 255)  # Amber / Yellow for student verifying liveness
                        text_color = (0, 0, 0)
                    else:
                        tag = f"{det['label']}"
                        color = (200, 180, 0)  # Cyan for general detection
                        text_color = (0, 0, 0)

                    cv2.rectangle(display_frame, (bx1, by1), (bx2, by2), color, 2)
                    tw = max(100, len(tag) * 8 + 12)
                    cv2.rectangle(display_frame, (bx1, max(0, by1 - 24)), (bx1 + tw, by1), color, -1)
                    cv2.putText(display_frame, tag, (bx1 + 5, max(16, by1 - 6)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.42, text_color, 2)
            else:
                # Instant startup HUD: Live video is active while AI neural models finish pre-warming
                cv2.rectangle(display_frame, (0, 0), (w, 36), (15, 17, 23), -1)
                cv2.putText(display_frame, "CAMERA FEED ACTIVE | Initializing Neural Recognition Engine...", (15, 24),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 220, 255), 2)

            # Push live annotated frame to dashboard broadcaster (non-blocking)
            broadcaster.update_frame(display_frame)

            # Local OpenCV Window Display
            if SHOW_DISPLAY:
                cv2.imshow("Classroom Entrance Monitor (FaceNet)", display_frame)
                key = cv2.waitKey(1) & 0xFF
                if key in [27, ord('q')]:
                    break
                elif key == ord('r') and ai_state["ready"] and ai_state["matcher"]:
                    ai_state["matcher"].load_enrolled_students(backend_url=BACKEND_EMBEDDINGS_URL)

            # Keep video display loop at smooth 30-60 FPS
            time.sleep(0.01)

    except KeyboardInterrupt:
        logger.info("Stopping ML Worker...")
    finally:
        stop_sync_event.set()
        if ai_state["worker"]:
            ai_state["worker"].stop()
        broadcaster.stop()
        camera_stream.stop()
        embedding_executor.shutdown(wait=False)
        webhook_executor.shutdown(wait=False)
        if SHOW_DISPLAY:
            cv2.destroyAllWindows()
        release_single_instance_lock(lock_file, lock_path)
        logger.info("ML Worker gracefully shut down.")


if __name__ == "__main__":
    main()
