import sys
import json
import cv2
from face_matcher import FaceMatcher


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No image path provided"}))
        sys.exit(1)

    image_path = sys.argv[1]
    img = cv2.imread(image_path)

    if img is None:
        print(json.dumps({"success": False, "error": f"Cannot read image at {image_path}"}))
        sys.exit(1)

    matcher = FaceMatcher()
    embedding = matcher.extract_embedding(img)

    if embedding is None:
        print(json.dumps({"success": False, "error": "No face detected by MTCNN neural network in image"}))
        sys.exit(0)


    print(json.dumps({
        "success": True,
        "dimensions": len(embedding),
        "embedding": embedding.tolist()
    }))


if __name__ == "__main__":
    main()
