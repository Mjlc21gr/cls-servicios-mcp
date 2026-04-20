# -*- coding: utf-8 -*-
"""
ML Classifier - Random Forest that maps error_code + message -> mcp_layer.

Reads training data from PostgreSQL, trains a model, and predicts
which MCP source file needs to be patched for a given error.
"""

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer

from . import db

# Error code -> (category, mcp_layer) deterministic rules
RULES = {
    "TS2663": ("this_scope", "class-context-layer"),
    "TS2551": ("this_scope", "class-context-layer"),
    "TS2300": ("deduplication", "class-context-layer"),
    "NG8002": ("binding", "template-generator"),
    "NG8001": ("primeng_import", "primeng-mapper"),
    "NG5002": ("template_parse", "template-integrity-layer"),
    "NG9":    ("missing_property", "code-emitter"),
    "NG1":    ("missing_property", "code-emitter"),
    "NG8":    ("signal_type", "code-emitter"),
    "NG5":    ("type_safety", "code-emitter"),
    "TS2307": ("import_path", "code-emitter"),
    "TS2304": ("missing_name", "code-emitter"),
    "TS2306": ("import_path", "code-emitter"),
    "TS2571": ("signal_type", "code-emitter"),
    "TS18047":("type_safety", "code-emitter"),
    "TS2339": ("type_safety", "code-emitter"),
    "TS2345": ("type_safety", "code-emitter"),
    "TS2355": ("type_safety", "code-emitter"),
    "TS7006": ("type_safety", "code-emitter"),
    "TS7030": ("type_safety", "code-emitter"),
    "TS1005": ("syntax", "code-emitter"),
    "TS-991002": ("inline_template", "code-emitter"),
    "TS-992012": ("standalone_import", "code-emitter"),
}


class ErrorClassifier:
    def __init__(self):
        self.clf = None
        self.tfidf = None
        self.label_map = {}

    def train(self):
        """Train from PostgreSQL data. Returns True if model was trained."""
        rows = db.get_all_errors()
        if len(rows) < 5:
            print(f"  [ML] Only {len(rows)} samples - using rules only")
            return False

        texts = [f"{r['code']} {r['message'][:200]} {r['category']}" for r in rows]
        labels = [r['mcp_layer'] for r in rows]

        unique = sorted(set(labels))
        to_int = {l: i for i, l in enumerate(unique)}
        self.label_map = {i: l for l, i in to_int.items()}
        y = np.array([to_int[l] for l in labels])

        self.tfidf = TfidfVectorizer(max_features=200, ngram_range=(1, 2))
        X = self.tfidf.fit_transform(texts)

        self.clf = RandomForestClassifier(
            n_estimators=80, max_depth=8,
            random_state=42, class_weight="balanced",
        )
        self.clf.fit(X, y)
        acc = self.clf.score(X, y)
        print(f"  [ML] Trained on {len(rows)} samples, accuracy: {acc:.0%}")
        return True

    def classify(self, code, message=""):
        """Classify an error -> (category, mcp_layer, confidence)."""
        # Rule-based first
        if code in RULES:
            cat, layer = RULES[code]
            return cat, layer, 1.0

        # ML fallback
        if self.clf and self.tfidf:
            text = f"{code} {message[:200]}"
            proba = self.clf.predict_proba(self.tfidf.transform([text]))[0]
            idx = int(np.argmax(proba))
            return "unknown", self.label_map.get(idx, "unknown"), float(proba[idx])

        return "unknown", "unknown", 0.0
