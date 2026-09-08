import logging
import numpy as np
import requests
from typing import List, Dict, Any, Optional, Tuple
from deepface import DeepFace
from utils.vision_helpers import match_embedding_against_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FaceMatcher")


class FaceMatcher:
    """
    Facial feature extraction and cosine vector matching using DeepFace.
    """

    def __init__(
        self,
        model_name: str = "Facenet512",
        detector_backend: str = "opencv",
        similarity_threshold: float = 0.65
    ):
        """
        :param model_name: 'Facenet512', 'VGG-Face', 'ArcFace', etc.
        :param detector_backend: 'opencv', 'retinaface', 'mtcnn', or 'ssd'
        :param similarity_threshold: Minimum cosine similarity to accept a match
        """
        self.model_name = model_name
        self.detector_backend = detector_backend
        self.similarity_threshold = similarity_threshold
        self.enrolled_cache: List[Dict[str, Any]] = []

    def load_enrolled_students(self, backend_url: Optional[str] = None):
        """
        Fetch enrolled student embeddings from backend or fallback to local sample.
        """
        if backend_url:
            try:
                resp = requests.get(backend_url, timeout=5)
                if resp.status_code == 200:
                    data = resp.json().get("data", [])
                    self.enrolled_cache = data
                    logger.info(f"Loaded {len(data)} enrolled student embeddings from backend.")
                    return
            except Exception as e:
                logger.warning(f"Could not reach backend at {backend_url} ({e}). Using local mock.")

        # Default fallback mock student for immediate zero-config testing
        if not self.enrolled_cache:
            # Generate a 512-d normalized mock vector
            mock_vec = np.random.uniform(-0.1, 0.1, 512).astype(np.float32)
            mock_vec /= np.linalg.norm(mock_vec)
            self.enrolled_cache = [
                {
                    "studentId": "STU101",
                    "name": "Alex Johnson",
                    "faceEmbeddings": [mock_vec.tolist()]
                }
            ]
            logger.info("Initialized local fallback enrollment cache with demo student STU101.")

    def extract_embedding(self, face_image: np.ndarray) -> Optional[np.ndarray]:
        """
        Extract normalized facial embedding vector from cropped face/person image.
        Uses try/except block to handle cases where face is obscured or not detected.
        
        :param face_image: BGR numpy image array
        :return: 1D numpy array of embeddings or None
        """
        if face_image is None or face_image.size == 0:
            return None

        try:
            # enforce_detection=False allows graceful extraction without throwing fatal exceptions
            reps = DeepFace.represent(
                img_path=face_image,
                model_name=self.model_name,
                detector_backend=self.detector_backend,
                enforce_detection=False,
                align=True
            )

            if reps and len(reps) > 0:
                raw_emb = reps[0].get("embedding")
                if raw_emb:
                    vec = np.array(raw_emb, dtype=np.float32)
                    norm = np.linalg.norm(vec)
                    if norm > 0:
                        vec /= norm
                    return vec

        except ValueError as ve:
            # DeepFace threw error because face wasn't visible or image invalid
            logger.debug(f"Face not visible in cropped region: {ve}")
        except Exception as e:
            logger.debug(f"DeepFace representation extraction error: {e}")

        return None

    def match_face(self, face_image: np.ndarray) -> Tuple[Optional[str], float, str]:
        """
        Extract embedding and match against the enrolled database.
        
        :param face_image: Cropped bounding box region
        :return: (studentId, confidence, matchType)
        """
        embedding = self.extract_embedding(face_image)

        if embedding is None:
            # Face not visible or obscured; multimodal fallback to body context
            return None, 0.0, "Body"

        matched_id, confidence = match_embedding_against_db(
            embedding,
            self.enrolled_cache,
            threshold=self.similarity_threshold
        )

        if matched_id:
            # High confidence face match in entrance zone
            match_type = "Multimodal" if confidence >= 0.75 else "Face"
            return matched_id, confidence, match_type

        return None, confidence, "Face"
