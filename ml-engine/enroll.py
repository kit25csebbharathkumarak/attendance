import argparse
import sys
import cv2
import requests
import numpy as np
from PIL import Image
from face_matcher import FaceMatcher

BACKEND_ENROLL_URL = "http://localhost:5000/api/enroll"


def enroll_from_webcam(student_id: str, name: str, department: str = "Computer Science", email: str = ""):
    print("\n" + "=" * 60)
    print(f"📷 REAL FACENET ENROLLMENT: {name} (ID: {student_id})")
    print("=" * 60)
    print("Instructions:")
    print("1. Look at the camera.")
    print("2. The MTCNN neural network will track your face with a green box.")
    print("3. Press [SPACE] to capture and extract real 512-d FaceNet embeddings.")
    print("4. Press [ESC] or [Q] to quit.")
    print("=" * 60 + "\n")

    matcher = FaceMatcher()
    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("[ERROR] Cannot access webcam. Check camera connection/permissions.")
        return False

    captured_embedding = None

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                continue

            display = frame.copy()
            h, w = display.shape[:2]

            # Detect face using MTCNN
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_frame = Image.fromarray(rgb_frame)
            boxes, probs = matcher.mtcnn.detect(pil_frame)

            face_detected = False
            if boxes is not None and len(boxes) > 0:
                face_detected = True
                bx = boxes[0].astype(int)
                x1, y1, x2, y2 = max(0, bx[0]), max(0, bx[1]), min(w, bx[2]), min(h, bx[3])

                cv2.rectangle(display, (x1, y1), (x2, y2), (0, 255, 120), 2)
                tag = f"Face Detected ({(probs[0]*100):.0f}%) - Press SPACE"
                cv2.rectangle(display, (x1, max(0, y1 - 25)), (x1 + len(tag) * 9, y1), (0, 255, 120), -1)
                cv2.putText(display, tag, (x1 + 4, max(16, y1 - 6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 2)
            else:
                # Alignment guide
                cx, cy = w // 2, h // 2
                cv2.ellipse(display, (cx, cy), (100, 130), 0, 0, 360, (0, 165, 255), 2)
                cv2.putText(display, "Position face in center...", (cx - 120, cy + 160),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 165, 255), 2)

            # Header
            cv2.rectangle(display, (0, 0), (w, 36), (15, 17, 23), -1)
            cv2.putText(display, f"ENROLLING: {name} ({student_id}) | SPACE: Snap | ESC: Exit",
                        (15, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)

            cv2.imshow("Real Student FaceNet Enrollment", display)

            key = cv2.waitKey(1) & 0xFF
            if key == ord(' ') and face_detected:
                print("\n[AI] Running InceptionResnetV1 deep neural network...")
                captured_embedding = matcher.extract_embedding(frame)
                if captured_embedding is not None:
                    print(f"✅ Extracted real {len(captured_embedding)}-dimensional FaceNet embedding vector!")
                    break
                else:
                    print("[!] MTCNN could not crop face accurately. Please align and press SPACE again.")
            elif key in [27, ord('q')]:
                print("Enrollment cancelled.")
                return False

    finally:
        cap.release()
        cv2.destroyAllWindows()

    if captured_embedding is not None:
        return submit_enrollment(student_id, name, department, email, captured_embedding)

    return False


def enroll_from_image(student_id: str, name: str, image_path: str, department: str = "Computer Science", email: str = ""):
    print(f"Loading photo from: {image_path}")
    img = cv2.imread(image_path)
    if img is None:
        print(f"[ERROR] Could not read image at {image_path}")
        return False

    matcher = FaceMatcher()
    embedding = matcher.extract_embedding(img)
    if embedding is None:
        print("[ERROR] No clear face detected in the image.")
        return False

    print(f"✅ Extracted real {len(embedding)}-dimensional FaceNet vector from photo.")
    return submit_enrollment(student_id, name, department, email, embedding)


def submit_enrollment(student_id: str, name: str, department: str, email: str, embedding: np.ndarray):
    payload = {
        "studentId": student_id,
        "name": name,
        "department": department,
        "email": email,
        "faceEmbeddings": [embedding.tolist()]
    }

    try:
        print(f"Sending real embeddings to {BACKEND_ENROLL_URL}...")
        res = requests.post(BACKEND_ENROLL_URL, json=payload, timeout=5)
        if res.status_code in [200, 201]:
            print("\n🎉 STUDENT ENROLLMENT COMPLETE!")
            print(f"   Name: {name}")
            print(f"   Student ID: {student_id}")
            print(f"   Embeddings: {len(embedding)} dimensions")
            print(f"   Server Response: {res.json().get('message')}\n")
            return True
        else:
            print(f"[ERROR] Backend returned {res.status_code}: {res.text}")
            return False
    except Exception as e:
        print(f"[ERROR] Failed to contact backend server: {e}")
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Real FaceNet Student Enrollment Tool")
    parser.add_argument("--id", required=True, help="Student ID (e.g. STU101)")
    parser.add_argument("--name", required=True, help="Student full name")
    parser.add_argument("--dept", default="Computer Science", help="Department")
    parser.add_argument("--email", default="", help="Student email")
    parser.add_argument("--image", default=None, help="Optional image file path")

    args = parser.parse_args()

    if args.image:
        enroll_from_image(args.id, args.name, args.image, args.dept, args.email)
    else:
        enroll_from_webcam(args.id, args.name, args.dept, args.email)
