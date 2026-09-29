#!/usr/bin/env python3
"""Small, dependency-light browser for the LASO pickle dataset."""

from __future__ import annotations

import argparse
import csv
import json
import pickle
import threading
import webbrowser
from collections import defaultdict
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import numpy as np


SPLITS = ("train", "val", "test")


class DatasetStore:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self._loaded_split = None
        self._objects = None
        self._annotations = None
        self._catalog = None
        self.questions = self._load_questions()

    def _load_questions(self):
        result = {}
        with (self.root / "Affordance-Question.csv").open(newline="", encoding="utf-8-sig") as handle:
            for row in csv.DictReader(handle):
                result[(row["Object"].lower(), row["Affordance"])] = row
        return result

    def load(self, split: str):
        if split not in SPLITS:
            raise ValueError(f"Unknown split: {split}")
        if split == self._loaded_split:
            return
        # Pickle is intentionally only read from the configured local dataset directory.
        with (self.root / f"objects_{split}.pkl").open("rb") as handle:
            objects = pickle.load(handle)
        with (self.root / f"anno_{split}.pkl").open("rb") as handle:
            annotations = pickle.load(handle)

        grouped = {}
        for annotation in annotations:
            shape_id = str(annotation["shape_id"])
            item = grouped.setdefault(shape_id, {
                "shape_id": shape_id,
                "class": str(annotation["class"]),
                "affordances": [],
            })
            affordance = str(annotation["affordance"])
            if affordance not in item["affordances"]:
                item["affordances"].append(affordance)

        self._loaded_split = split
        self._objects = objects
        self._annotations = annotations
        self._catalog = sorted(grouped.values(), key=lambda x: (x["class"], x["shape_id"]))

    def catalog(self, split: str):
        self.load(split)
        classes = sorted({item["class"] for item in self._catalog})
        return {"split": split, "count": len(self._catalog), "classes": classes, "objects": self._catalog}

    def object(self, split: str, shape_id: str):
        self.load(split)
        if shape_id not in self._objects:
            raise KeyError(shape_id)
        matches = [a for a in self._annotations if str(a["shape_id"]) == shape_id]
        if not matches:
            raise KeyError(shape_id)

        points = np.asarray(self._objects[shape_id], dtype=np.float32)
        if points.ndim != 2 or points.shape[1] < 3:
            raise ValueError(f"Unexpected point array shape: {points.shape}")
        xyz = points[:, :3]
        center = xyz.mean(axis=0)
        xyz = xyz - center
        scale = np.linalg.norm(xyz, axis=1).max()
        if scale > 0:
            xyz = xyz / scale

        annotations = []
        object_class = str(matches[0]["class"])
        for item in matches:
            affordance = str(item["affordance"])
            mask = np.asarray(item["mask"], dtype=np.float32).reshape(-1)
            question_row = self.questions.get((object_class.lower(), affordance), {})
            annotations.append({
                "affordance": affordance,
                "mask": mask.tolist(),
                "active_points": int(np.count_nonzero(mask > 0.5)),
                "questions": [question_row.get(f"Question{i}", "") for i in range(15) if question_row.get(f"Question{i}")],
                "explanations": [question_row.get(f"ExplanatoryQuestion{i}", "") for i in range(1, 4) if question_row.get(f"ExplanatoryQuestion{i}")],
                "answers": [question_row.get(f"Answer{i}", "") for i in range(2) if question_row.get(f"Answer{i}")],
            })
        return {
            "split": split,
            "shape_id": shape_id,
            "class": object_class,
            "point_count": len(xyz),
            "center": center.tolist(),
            "scale": float(scale),
            "points": xyz.tolist(),
            "annotations": annotations,
        }


class Handler(SimpleHTTPRequestHandler):
    store: DatasetStore
    static_dir: Path

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(self.static_dir), **kwargs)

    def do_GET(self):
        url = urlparse(self.path)
        if not url.path.startswith("/api/"):
            return super().do_GET()
        params = parse_qs(url.query)
        try:
            split = params.get("split", ["val"])[0]
            if url.path == "/api/catalog":
                payload = self.store.catalog(split)
            elif url.path == "/api/object":
                shape_id = params.get("shape_id", [""])[0]
                payload = self.store.object(split, shape_id)
            else:
                return self._json({"error": "Not found"}, 404)
            return self._json(payload)
        except (KeyError, ValueError, FileNotFoundError) as exc:
            return self._json({"error": str(exc)}, 400)
        except Exception as exc:
            self.log_error("API error: %r", exc)
            return self._json({"error": "Could not read the dataset. See the server terminal."}, 500)

    def _json(self, payload, status=200):
        body = json.dumps(payload, separators=(",", ":"), allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def main():
    project = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Review the LASO point-cloud dataset in a browser")
    parser.add_argument("--dataset", type=Path, default=project.parent.parent / "data" / "LASO_dataset")
    parser.add_argument("--host", default="0.0.0.0", help="Listen address (0.0.0.0 is required for Docker port forwarding)")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--open", action="store_true", help="Open the page in the default browser")
    args = parser.parse_args()

    missing = [name for name in ("Affordance-Question.csv", "objects_val.pkl", "anno_val.pkl") if not (args.dataset / name).is_file()]
    if missing:
        parser.error(f"Dataset directory is missing: {', '.join(missing)}")

    Handler.store = DatasetStore(args.dataset)
    Handler.static_dir = project / "static"
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    display_host = "127.0.0.1" if args.host == "0.0.0.0" else args.host
    url = f"http://{display_host}:{args.port}"
    print(f"LASO reviewer: {url}")
    print(f"Dataset: {args.dataset.resolve()}")
    if args.open:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
