import cv2
import numpy as np
from typing import Tuple, List, Optional, Dict, Any


def crop_bbox(
    image: np.ndarray,
    bbox: Tuple[int, int, int, int],
    padding_pct: float = 0.05
) -> Optional[np.ndarray]:
    """
    Safely crop a bounding box region from an image with optional padding.
    
    :param image: Source frame (numpy array)
    :param bbox: (x1, y1, x2, y2)
    :param padding_pct: Ratio of padding around bounding box
    :return: Cropped image array or None if invalid dimensions
    """
    if image is None or len(image.shape) < 2:
        return None

    h, w = image.shape[:2]
    x1, y1, x2, y2 = bbox

    # Apply padding
    box_w = x2 - x1
    box_h = y2 - y1
    pad_x = int(box_w * padding_pct)
    pad_y = int(box_h * padding_pct)

    x1_pad = max(0, x1 - pad_x)
    y1_pad = max(0, y1 - pad_y)
    x2_pad = min(w, x2 + pad_x)
    y2_pad = min(h, y2 + pad_y)

    if x2_pad <= x1_pad or y2_pad <= y1_pad:
        return None

    return image[y1_pad:y2_pad, x1_pad:x2_pad].copy()


def cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    """
    Computes cosine similarity between two 1D embedding vectors.
    Range: -1.0 to 1.0 (Higher is closer match).
    """
    norm_a = np.linalg.norm(vec_a)
    norm_b = np.linalg.norm(vec_b)

    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0

    dot_product = np.dot(vec_a, vec_b)
    return float(dot_product / (norm_a * norm_b))


def match_embedding_against_db(
    query_vector: np.ndarray,
    enrolled_students: List[Dict[str, Any]],
    threshold: float = 0.65
) -> Tuple[Optional[str], float]:
    """
    Matches a query embedding against a list of enrolled student embeddings.
    Scales efficiently for 65+ students with multi-pose embeddings.
    
    :param query_vector: 1D numpy array of facial embedding
    :param enrolled_students: List of dicts with 'studentId' and 'faceEmbeddings'
    :param threshold: Minimum similarity threshold to declare a match
    :return: (studentId, confidence) or (None, best_score)
    """
    if query_vector is None or len(enrolled_students) == 0:
        return None, 0.0

    best_student_id = None
    best_similarity = -1.0

    for student in enrolled_students:
        s_id = student.get("studentId")
        embeddings = student.get("faceEmbeddings", [])

        if not embeddings:
            continue

        # Handle both single vector [float, ...] and multi-pose [[float, ...], [...]]
        if isinstance(embeddings[0], (int, float)):
            target_vectors = [np.array(embeddings, dtype=np.float32)]
        else:
            target_vectors = [np.array(e, dtype=np.float32) for e in embeddings if len(e) > 0]

        for target_vec in target_vectors:
            sim = cosine_similarity(query_vector, target_vec)
            if sim > best_similarity:
                best_similarity = sim
                best_student_id = s_id

    if best_similarity >= threshold:
        return best_student_id, best_similarity

    return None, max(0.0, best_similarity)


def draw_hud(
    frame: np.ndarray,
    detections: List[Dict[str, Any]],
    throttle_countdown: float
) -> np.ndarray:
    """
    Draw bounding boxes and status HUD on the video frame.
    """
    display_frame = frame.copy()
    h, w = display_frame.shape[:2]

    # Top Status Bar
    cv2.rectangle(display_frame, (0, 0), (w, 40), (20, 20, 24), -1)
    status_text = f"AUTO ATTENDANCE ENGINE | Scan Interval: {throttle_countdown:.1f}s | Active Detections: {len(detections)}"
    cv2.putText(
        display_frame,
        status_text,
        (15, 26),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (0, 230, 118),
        2
    )

    for det in detections:
        x1, y1, x2, y2 = det.get("bbox", (0, 0, 0, 0))
        label = det.get("label", "Person")
        matched_id = det.get("student_id")
        confidence = det.get("confidence", 0.0)

        # Color: Green if matched, Yellow/Orange if person detected but unmatched
        color = (0, 220, 100) if matched_id else (0, 165, 255)

        cv2.rectangle(display_frame, (x1, y1), (x2, y2), color, 2)

        tag = f"{label} ({(confidence * 100):.1f}%)" if confidence > 0 else label
        if matched_id:
            tag = f"STUDENT: {matched_id} [{(confidence * 100):.1f}%]"

        # Tag background
        cv2.rectangle(display_frame, (x1, max(0, y1 - 25)), (x1 + len(tag) * 11, y1), color, -1)
        cv2.putText(
            display_frame,
            tag,
            (x1 + 4, max(15, y1 - 6)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 0, 0),
            2
        )

    return display_frame
