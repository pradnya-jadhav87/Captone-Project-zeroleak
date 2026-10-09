"""
ZeroLeak Real-Time Security Surveillance & Proctoring Engine
=============================================================
High-performance video stream analytics using FastAPI, OpenCV, and Ultralytics YOLOv8.

Technical Capabilities:
1. Deep learning object inference via YOLOv8 Nano (`yolov8n.pt`) optimized for COCO classes:
   - Class 0: 'person' (Confidence >= 0.50)
   - Class 67: 'cell phone' (Confidence >= 0.45)
2. Temporal debouncing (3 consecutive frame persistence) to eliminate false triggers.
3. Multi-modal input handling:
   - Live Webcam (`cv2.VideoCapture`)
   - RTSP network stream
   - High-throughput FastAPI WebSocket frame ingestion (`/ws/security-feed`)
4. Real-time visual bounding box annotation and ISO-8601 JSON event broadcast.

Author: Senior Computer Vision & Security Engineer (ZeroLeak Core Team)
"""

import argparse
import base64
import json
import logging
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np

# Configure production structured logger
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [ZeroLeak-CV-Proctor] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("ZeroLeakProctor")

try:
    from ultralytics import YOLO
except ImportError:
    logger.error("Ultralytics YOLO is not installed. Please run: pip install ultralytics")
    sys.exit(1)

try:
    import uvicorn
    from fastapi import FastAPI, WebSocket, WebSocketDisconnect
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
    from pydantic import BaseModel
except ImportError:
    logger.error("FastAPI or Uvicorn is not installed. Please run: pip install fastapi uvicorn websockets")
    sys.exit(1)


# ============================================================================
# Core Computer Vision & Security Proctoring Engine
# ============================================================================

class VideoSecurityProctor:
    """
    Real-time vision security and candidate proctoring controller.
    Evaluates video frames for unauthorized mobile devices, secondary persons,
    and candidate absence with temporal frame debouncing.
    """

    # COCO Dataset Target Class IDs
    CLASS_PERSON: int = 0
    CLASS_CELL_PHONE: int = 67

    # Detection Confidence Thresholds
    CONF_PERSON: float = 0.50
    CONF_CELL_PHONE: float = 0.45

    # Debounce Threshold: number of consecutive frames to confirm a violation
    DEBOUNCE_FRAMES: int = 3

    def __init__(
        self,
        model_path: str = "yolov8n.pt",
        device: Optional[str] = None,
        conf_person: float = CONF_PERSON,
        conf_cell_phone: float = CONF_CELL_PHONE,
        debounce_frames: int = DEBOUNCE_FRAMES,
    ):
        """
        Initializes the YOLOv8 Nano inference pipeline and tracking buffers.
        """
        logger.info(f"Initializing YOLOv8 Nano inference engine from {model_path}...")
        self.model = YOLO(model_path)
        
        # Determine optimal compute device (CUDA GPU if available, else CPU)
        if device is None:
            import torch
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = device
            
        logger.info(f"Execution device allocated: {self.device.upper()}")

        self.conf_person = conf_person
        self.conf_cell_phone = conf_cell_phone
        self.debounce_frames = debounce_frames

        # Temporal Debounce Counters (Streaks of consecutive frames meeting condition)
        self.phone_streak: int = 0
        self.multi_person_streak: int = 0
        self.absence_streak: int = 0
        self.frame_counter: int = 0

        # Colors (BGR)
        self.COLOR_SECURE = (46, 204, 113)     # Emerald Green
        self.COLOR_CRITICAL = (41, 41, 230)    # Crimson Red
        self.COLOR_WARNING = (0, 165, 255)     # Amber Orange
        self.COLOR_INFO = (240, 240, 240)      # Clean Off-White

    def reset_state(self) -> None:
        """Resets all temporal debounce tracking buffers."""
        self.phone_streak = 0
        self.multi_person_streak = 0
        self.absence_streak = 0
        self.frame_counter = 0

    def process_frame(
        self,
        frame: np.ndarray,
        annotate: bool = True
    ) -> Tuple[Dict[str, Any], np.ndarray]:
        """
        Executes single-frame inference, computes security violation logic with
        temporal debouncing, and generates visual annotations and telemetry.

        Args:
            frame: OpenCV BGR image (np.ndarray).
            annotate: Whether to render bounding boxes and banners on the frame.

        Returns:
            Tuple of (telemetry_dict, annotated_frame).
        """
        self.frame_counter += 1
        height, width = frame.shape[:2]

        # 1. Run Ultralytics YOLO inference specifically filtered for Person & Cell Phone
        results = self.model.predict(
            source=frame,
            classes=[self.CLASS_PERSON, self.CLASS_CELL_PHONE],
            conf=min(self.conf_person, self.conf_cell_phone) - 0.05,
            device=self.device,
            verbose=False,
        )

        detected_persons: List[Dict[str, Any]] = []
        detected_phones: List[Dict[str, Any]] = []

        if len(results) > 0 and results[0].boxes is not None:
            boxes = results[0].boxes
            for i in range(len(boxes)):
                cls_id = int(boxes.cls[i].item())
                confidence = float(boxes.conf[i].item())
                xyxy = boxes.xyxy[i].cpu().numpy().astype(int).tolist()

                if cls_id == self.CLASS_PERSON and confidence >= self.conf_person:
                    detected_persons.append({
                        "box": xyxy,
                        "confidence": round(confidence, 3),
                        "label": "person",
                    })
                elif cls_id == self.CLASS_CELL_PHONE and confidence >= self.conf_cell_phone:
                    detected_phones.append({
                        "box": xyxy,
                        "confidence": round(confidence, 3),
                        "label": "cell phone",
                    })

        person_count = len(detected_persons)
        phone_count = len(detected_phones)

        # 2. Raw Instantaneous Frame Condition Evaluation
        raw_phone_detected = phone_count >= 1
        raw_multi_person = person_count > 1
        raw_user_absent = person_count == 0

        # 3. Temporal Debounce Logic across Consecutive Frames
        # Prevents flickering false positives caused by motion blur or transient artifacts
        if raw_phone_detected:
            self.phone_streak += 1
        else:
            self.phone_streak = 0

        if raw_multi_person:
            self.multi_person_streak += 1
        else:
            self.multi_person_streak = 0

        if raw_user_absent:
            self.absence_streak += 1
        else:
            self.absence_streak = 0

        # 4. Formulate Confirmed Security Violations
        violations: List[str] = []

        if self.phone_streak >= self.debounce_frames:
            violations.append("UNAUTHORIZED_DEVICE")

        if self.multi_person_streak >= self.debounce_frames:
            violations.append("MULTIPLE_PERSONS")

        if self.absence_streak >= self.debounce_frames:
            violations.append("USER_ABSENT")

        # Determine Alert Status & Threat Level
        is_alert = len(violations) > 0
        status = "ALERT" if is_alert else "SECURE"

        if "UNAUTHORIZED_DEVICE" in violations or "MULTIPLE_PERSONS" in violations:
            alert_level = "CRITICAL"
        elif "USER_ABSENT" in violations:
            alert_level = "WARNING"
        else:
            alert_level = "INFO"

        # 5. Build Telemetry Payload
        telemetry: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": status,
            "threat_level": alert_level,
            "alert_level": alert_level,
            "person_count": person_count,
            "phone_detected": phone_count > 0,
            "violations": violations,
            "details": {
                "cell_phone_count": phone_count,
                "phone_consecutive_frames": self.phone_streak,
                "multi_person_consecutive_frames": self.multi_person_streak,
                "absence_consecutive_frames": self.absence_streak,
                "frame_id": self.frame_counter,
                "debounce_threshold": self.debounce_frames,
            },
        }

        # 6. Render Visual Annotations on Output Frame
        annotated_frame = frame.copy() if annotate else frame
        if annotate:
            self._render_annotations(
                annotated_frame,
                detected_persons,
                detected_phones,
                status,
                alert_level,
                violations,
                width,
                height,
            )

        return telemetry, annotated_frame

    def _render_annotations(
        self,
        frame: np.ndarray,
        persons: List[Dict[str, Any]],
        phones: List[Dict[str, Any]],
        status: str,
        alert_level: str,
        violations: List[str],
        width: int,
        height: int,
    ) -> None:
        """Draws bounding boxes, badges, and top status banner on the frame."""
        # 1. Annotate Persons
        # If exactly 1 person is present, mark as verified green box.
        # If multiple persons are present, mark all secondary persons with red alert boxes.
        for idx, p in enumerate(persons):
            x1, y1, x2, y2 = p["box"]
            conf = p["confidence"]

            if len(persons) == 1:
                color = self.COLOR_SECURE
                label = f"Authorized Candidate ({conf:.2f})"
            else:
                color = self.COLOR_CRITICAL
                label = f"Unauthorized Person #{idx + 1} ({conf:.2f})"

            # Bounding rectangle with rounded corner aesthetic
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

            # Label banner
            (w_label, h_label), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
            cv2.rectangle(frame, (x1, max(0, y1 - 22)), (x1 + w_label + 8, y1), color, -1)
            cv2.putText(
                frame, label, (x1 + 4, max(15, y1 - 6)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA
            )

        # 2. Annotate Cell Phones (Critical Security Threat: Heavy Red Box)
        for ph in phones:
            x1, y1, x2, y2 = ph["box"]
            conf = ph["confidence"]
            color = self.COLOR_CRITICAL
            label = f"! UNAUTHORIZED DEVICE: CELL PHONE ({conf:.2f}) !"

            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 3)
            (w_label, h_label), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
            cv2.rectangle(frame, (x1, max(0, y1 - 24)), (x1 + w_label + 8, y1), color, -1)
            cv2.putText(
                frame, label, (x1 + 4, max(17, y1 - 7)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA
            )

        # 3. Top Security Banner
        banner_height = 42
        overlay = frame.copy()
        banner_color = self.COLOR_CRITICAL if status == "ALERT" else self.COLOR_SECURE
        cv2.rectangle(overlay, (0, 0), (width, banner_height), banner_color, -1)
        # Apply alpha blending for clean HUD display
        cv2.addWeighted(overlay, 0.85, frame, 0.15, 0, frame)

        if status == "ALERT":
            banner_text = f"[!] ZEROLEAK SECURITY VIOLATION: {' | '.join(violations)} ({alert_level})"
        else:
            banner_text = "[OK] ZEROLEAK SECURE PROCTOR: 1 VERIFIED CANDIDATE • NO UNAUTHORIZED DEVICES"

        cv2.putText(
            frame, banner_text, (14, 28),
            cv2.FONT_HERSHEY_SIMPLEX, 0.60, (255, 255, 255), 2, cv2.LINE_AA
        )

    def process_base64_frame(
        self,
        b64_string: str,
        annotate: bool = True
    ) -> Tuple[Dict[str, Any], Optional[str]]:
        """
        Decodes base64 string image, runs detection, and encodes annotated output.
        """
        if "," in b64_string:
            b64_string = b64_string.split(",", 1)[1]

        image_bytes = base64.b64decode(b64_string)
        np_arr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if frame is None:
            raise ValueError("Failed to decode image from provided base64 payload.")

        telemetry, annotated_frame = self.process_frame(frame, annotate=annotate)

        annotated_b64: Optional[str] = None
        if annotate:
            _, buffer = cv2.imencode(".jpg", annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            annotated_b64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode("utf-8")

        return telemetry, annotated_b64


# ============================================================================
# FastAPI Web & WebSocket Server
# ============================================================================

app = FastAPI(
    title="ZeroLeak Real-Time Video Proctoring & Security API",
    description="Low-latency vision surveillance microservice powered by YOLOv8 Nano.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global proctor instance
proctor_engine = VideoSecurityProctor()


class Base64FrameRequest(BaseModel):
    frame: str
    annotate: bool = True


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "ZeroLeak Video Security Proctor",
        "model": "YOLOv8 Nano (yolov8n.pt)",
        "device": proctor_engine.device,
        "classes": {
            "person": VideoSecurityProctor.CLASS_PERSON,
            "cell_phone": VideoSecurityProctor.CLASS_CELL_PHONE,
        },
        "thresholds": {
            "conf_person": proctor_engine.conf_person,
            "conf_cell_phone": proctor_engine.conf_cell_phone,
            "debounce_frames": proctor_engine.debounce_frames,
        },
    }


@app.post("/api/proctor/detect-frame")
async def detect_frame_endpoint(payload: Base64FrameRequest):
    """
    HTTP REST endpoint to analyze a single base64 video frame.
    """
    try:
        telemetry, annotated_b64 = proctor_engine.process_base64_frame(
            payload.frame, annotate=payload.annotate
        )
        return {
            "success": True,
            "telemetry": telemetry,
            "annotated_frame": annotated_b64,
        }
    except Exception as e:
        logger.error(f"Error processing frame: {e}")
        return JSONResponse(status_code=400, content={"success": False, "error": str(e)})


@app.websocket("/ws/security-feed")
async def security_feed_websocket(websocket: WebSocket):
    """
    Real-time bidirectional WebSocket stream:
    Receives base64/binary frames from browser webcam, analyzes in real-time,
    and streams security alerts and annotated frames back to the client.
    """
    await websocket.accept()
    logger.info("New WebSocket client connected to /ws/security-feed")

    try:
        while True:
            # Handle incoming message: either text JSON or binary frame
            message = await websocket.receive()
            if "text" in message and message["text"]:
                try:
                    data = json.loads(message["text"])
                    frame_b64 = data.get("frame", "")
                    want_annotated = data.get("annotate", True)

                    if not frame_b64:
                        await websocket.send_json({"error": "Missing 'frame' field."})
                        continue

                    telemetry, annotated_b64 = proctor_engine.process_base64_frame(
                        frame_b64, annotate=want_annotated
                    )

                    response_payload = {
                        "telemetry": telemetry,
                        "annotated_frame": annotated_b64,
                    }
                    await websocket.send_json(response_payload)

                except json.JSONDecodeError:
                    await websocket.send_json({"error": "Malformed JSON payload."})

            elif "bytes" in message and message["bytes"]:
                # Raw binary frame buffer (e.g. direct JPEG bytes)
                raw_bytes = message["bytes"]
                np_arr = np.frombuffer(raw_bytes, np.uint8)
                frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

                if frame is not None:
                    telemetry, annotated_frame = proctor_engine.process_frame(frame, annotate=True)
                    _, buffer = cv2.imencode(".jpg", annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                    b64_out = "data:image/jpeg;base64," + base64.b64encode(buffer).decode("utf-8")

                    await websocket.send_json({
                        "telemetry": telemetry,
                        "annotated_frame": b64_out,
                    })

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected from /ws/security-feed")
    except Exception as e:
        logger.error(f"WebSocket runtime exception: {e}")


# ============================================================================
# Live Local Stream Processing (Webcam / RTSP)
# ============================================================================

def run_local_stream(
    source: Union[int, str] = 0,
    display: bool = True,
    debounce_frames: int = 3,
) -> None:
    """
    Runs live monitoring on a local webcam or remote RTSP video feed using OpenCV.
    """
    logger.info(f"Opening video capture source: {source}...")
    # Convert digit string to int if numeric (webcam index)
    if isinstance(source, str) and source.isdigit():
        source = int(source)

    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        logger.error(f"Failed to open video source: {source}")
        return

    proctor = VideoSecurityProctor(debounce_frames=debounce_frames)
    logger.info("Stream opened successfully. Processing frames... Press 'q' to exit.")

    fps_timer = time.time()
    frame_count = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                logger.warning("Stream ended or unable to read frame.")
                break

            telemetry, annotated_frame = proctor.process_frame(frame, annotate=True)

            frame_count += 1
            if time.time() - fps_timer >= 1.0:
                fps = frame_count / (time.time() - fps_timer)
                logger.info(
                    f"FPS: {fps:.1f} | Status: {telemetry['status']} | "
                    f"Persons: {telemetry['person_count']} | "
                    f"Phones: {telemetry['details']['cell_phone_count']} | "
                    f"Violations: {telemetry['violations']}"
                )
                frame_count = 0
                fps_timer = time.time()

            if display:
                cv2.imshow("ZeroLeak Real-Time Security Proctor", annotated_frame)
                key = cv2.waitKey(1) & 0xFF
                if key == ord("q"):
                    logger.info("Exit requested by user keypress 'q'.")
                    break
            else:
                # In headless mode, log any confirmed alert events
                if telemetry["status"] == "ALERT":
                    logger.warning(f"SECURITY ALERT TRIGGERED: {json.dumps(telemetry)}")

    finally:
        cap.release()
        if display:
            cv2.destroyAllWindows()
        logger.info("Video stream stopped.")


# ============================================================================
# CLI Entry Point
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="ZeroLeak Real-Time Video Security Surveillance & Proctoring Engine"
    )
    parser.add_argument(
        "--server",
        action="store_true",
        help="Run as FastAPI WebSocket & REST API server",
    )
    parser.add_argument(
        "--host",
        type=str,
        default="0.0.0.0",
        help="Host address for FastAPI server (default: 0.0.0.0)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port for FastAPI server (default: 8000)",
    )
    parser.add_argument(
        "--source",
        type=str,
        default="0",
        help="Video capture source: webcam index (0, 1) or RTSP stream URL (default: 0)",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run local video stream without GUI cv2.imshow window",
    )
    parser.add_argument(
        "--debounce",
        type=int,
        default=3,
        help="Number of consecutive frames required to confirm alert (default: 3)",
    )

    args = parser.parse_args()

    if args.server:
        logger.info(f"Starting ZeroLeak Proctor FastAPI Server on {args.host}:{args.port}...")
        uvicorn.run(app, host=args.host, port=args.port)
    else:
        run_local_stream(
            source=args.source,
            display=not args.headless,
            debounce_frames=args.debounce,
        )


if __name__ == "__main__":
    main()
