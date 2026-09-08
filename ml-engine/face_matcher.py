import os
import logging
import cv2
import torch
import numpy as np
import requests
from typing import List, Dict, Any, Optional, Tuple
from PIL import Image

from facenet_pytorch import MTCNN, InceptionResnetV1

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FaceMatcher")


class FaceMatcher:
    """
    Production Face Recognition Engine:
    - Face Detection & Alignment: MTCNN (Multi-task Cascaded Convolutional Networks)
    - Feature Extraction: PyTorch InceptionResnetV1 (FaceNet 512-d) pretrained on VGGFace2
    - Matching: High-dimensional Cosine Vector Distance against Enrolled Cohort
    """

    def __init__(self, similarity_threshold: float = 0.60):
        self.similarity_threshold = similarity_threshold
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Initializing FaceNet & MTCNN on device: {self.device}")

        # Deep Learning Face Detector & Aligner
        self.mtcnn = MTCNN(
            image_size=160,
            margin=14,
            keep_all=False,
            device=self.device,
            post_process=True
        )

        # Pretrained 512-d FaceNet Feature Extractor
        self.model = InceptionResnetV1(pretrained="vggface2").eval().to(self.device)
        logger.info("FaceNet (InceptionResnetV1, 512-d) and MTCNN ready.")

        self.enrolled_students: List[Dict[str, Any]] = []

    def load_enrolled_students(self, backend_url: str = "http://localhost:5000/api/students/embeddings") -> int:
        """
        Loads enrolled students with their 512-d embeddings from the backend API.
        """
        try:
            resp = requests.get(backend_url, timeout=5)
            if resp.status_code == 200:
                data = resp.json().get("data", [])
                self.enrolled_students = data
                logger.info(f"Loaded {len(data)} enrolled student profiles from backend.")
                return len(data)
            else:
                logger.warning(f"Backend returned status {resp.status_code}")
        except Exception as e:
            logger.warning(f"Could not reach backend at {backend_url} ({e}).")

        return len(self.enrolled_students)

    def extract_embedding(self, image: Any) -> Optional[np.ndarray]:
        """
        Detects face, aligns it, and computes a normalized 512-d embedding.
        Accepts OpenCV BGR numpy array or PIL Image.
        """
        if image is None:
            return None

        try:
            if isinstance(image, np.ndarray):
                if image.size == 0:
                    return None
                rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                pil_img = Image.fromarray(rgb)
            else:
                pil_img = image

            # Run MTCNN face detector and crop
            face_tensor = self.mtcnn(pil_img)
            if face_tensor is None:
                return None

            # Add batch dimension and pass through FaceNet
            face_tensor = face_tensor.unsqueeze(0).to(self.device)
            with torch.no_grad():
                emb = self.model(face_tensor).cpu().numpy().flatten()

            # L2 Normalize
            norm = np.linalg.norm(emb)
            if norm > 0:
                emb = emb / norm

            return emb.astype(np.float32)
        except Exception as e:
            logger.debug(f"Error during MTCNN/FaceNet feature extraction: {e}")
            return None

    def match_face(self, person_crop: np.ndarray) -> Tuple[Optional[str], Optional[str], float, str, Optional[np.ndarray]]:
        """
        Given a person crop from YOLOv8, detects face with MTCNN, extracts 512-d embedding,
        and computes cosine similarity against enrolled students.
        
        :return: (studentId, studentName, confidence, matchType, face_crop)
        """
        query_emb = self.extract_embedding(person_crop)
        if query_emb is None:
            return None, None, 0.0, "Body", None

        if not self.enrolled_students:
            return None, None, 0.0, "Unenrolled", None

        best_student_id = None
        best_student_name = None
        best_similarity = -1.0

        for student in self.enrolled_students:
            s_id = student.get("studentId")
            s_name = student.get("name", s_id)
            embeddings = student.get("faceEmbeddings", [])

            if not embeddings:
                continue

            if isinstance(embeddings[0], (int, float)):
                candidates = [np.array(embeddings, dtype=np.float32)]
            else:
                candidates = [np.array(e, dtype=np.float32) for e in embeddings if len(e) > 0]

            for cand in candidates:
                if cand.shape != query_emb.shape:
                    continue

                cand_norm = np.linalg.norm(cand)
                if cand_norm > 0:
                    cand = cand / cand_norm
                sim = float(np.dot(query_emb, cand))

                if sim > best_similarity:
                    best_similarity = sim
                    best_student_id = s_id
                    best_student_name = s_name

        if best_similarity >= self.similarity_threshold:
            match_type = "Multimodal" if best_similarity >= 0.65 else "Face"
            return best_student_id, best_student_name, best_similarity, match_type, person_crop

        return None, None, max(0.0, best_similarity), "Face", person_crop

