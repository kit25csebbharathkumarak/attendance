import logging
import numpy as np
from typing import List, Dict, Any, Tuple
from ultralytics import YOLO

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("PersonDetector")


class PersonDetector:
    """
    YOLOv8-based person detector optimized for walk-through entrance monitoring.
    Filters specifically for COCO Class 0 ('person').
    """

    def __init__(self, model_weight: str = "yolov8n.pt", conf_threshold: float = 0.5):
        """
        :param model_weight: Path or model name (defaults to 'yolov8n.pt')
        :param conf_threshold: Detection confidence threshold (0.0 to 1.0)
        """
        self.conf_threshold = conf_threshold
        logger.info(f"Loading YOLO model: {model_weight} (Class 0: Person only)")
        self.model = YOLO(model_weight)

    def detect_people(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Run inference on frame and extract bounding boxes for all detected persons.
        
        :param frame: BGR frame from OpenCV
        :return: List of dicts with bbox coordinates (x1, y1, x2, y2), confidence, and class id
        """
        if frame is None:
            return []

        # classes=[0] filters exclusively for person instances
        results = self.model(frame, classes=[0], conf=self.conf_threshold, verbose=False)
        detections: List[Dict[str, Any]] = []

        if not results or len(results) == 0:
            return detections

        first_res = results[0]
        boxes = first_res.boxes

        if boxes is None or len(boxes) == 0:
            return detections

        for box in boxes:
            coords = box.xyxy[0].cpu().numpy().astype(int)
            conf = float(box.conf[0].cpu().numpy())
            cls_id = int(box.cls[0].cpu().numpy())

            x1, y1, x2, y2 = coords
            # Guard against invalid dimensions
            if (x2 - x1) < 20 or (y2 - y1) < 20:
                continue

            detections.append({
                "bbox": (int(x1), int(y1), int(x2), int(y2)),
                "confidence": conf,
                "class_id": cls_id,
                "label": "Person"
            })

        return detections


if __name__ == "__main__":
    import cv2
    detector = PersonDetector(conf_threshold=0.4)
    cap = cv2.VideoCapture(0)
    ret, test_frame = cap.read()
    if ret:
        dets = detector.detect_people(test_frame)
        print(f"Detected {len(dets)} people in sample frame.")
    cap.release()
