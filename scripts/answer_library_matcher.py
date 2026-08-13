#!/usr/bin/env python3
"""Deterministic safety boundary for the Ready Route answer-library runtime."""

from __future__ import annotations

import json
import re
from difflib import SequenceMatcher
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BUNDLE = ROOT / "outputs/answer-library-v1/drive-complete/runtime/bundle.json"


def normalize(text: str) -> str:
    text = text.lower().replace("calltag", "call tag")
    text = re.sub(r"\bdamged\b", "damaged", text)
    text = re.sub(r"\bnobdy\b", "nobody", text)
    number_words = {
        "oh": "0", "zero": "0", "one": "1", "two": "2", "three": "3",
        "four": "4", "five": "5", "six": "6", "seven": "7", "eight": "8",
        "nine": "9",
    }
    tokens = [number_words.get(token, token) for token in re.findall(r"[a-z0-9]+", text)]
    normalized = " ".join(tokens)
    normalized = re.sub(
        r"\bcode\s+([0-9])\s+([0-9])(?:\s+([0-9]))?\b",
        lambda match: "code " + "".join(part for part in match.groups() if part is not None),
        normalized,
    )
    return normalized


class AnswerLibraryMatcher:
    def __init__(self, bundle_path: Path = DEFAULT_BUNDLE):
        self.bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
        self.records = {record["faq_id"]: record for record in self.bundle["records"]}
        self.routes = self.bundle["clarification_routes"]
        self.codes = self.bundle["codes_index"]

    def _answer(self, faq_id: str, reason: str) -> dict:
        return {"type": "answer", "faq_id": faq_id, "reason": reason, "record": self.records[faq_id]}

    def _clarify(self, route_name: str, choices: list[dict] | None = None) -> dict:
        route = dict(self.routes[route_name])
        if choices is not None:
            route["choices"] = choices
        return {"type": "clarification", "route": route_name, **route}

    def _code_match(self, query: str, normalized: str) -> dict | None:
        match = re.search(r"\b(?:code\s*)?(\d{1,3})\b", normalized)
        has_namespace_hint = any(
            phrase in normalized
            for phrase in ("delivery status", "pickup reason", "call tag")
        )
        if not match or (
            "code" not in normalized
            and not has_namespace_hint
            and not normalized.strip().isdigit()
        ):
            return None
        raw = match.group(1)
        variants = {raw, raw.zfill(3), str(int(raw))}
        if "call tag" in normalized:
            namespaces = ["call_tag_status"]
        elif "pickup" in normalized:
            namespaces = ["pickup_reason"]
        elif "delivery" in normalized or "status" in normalized:
            namespaces = ["delivery_status"]
        else:
            namespaces = list(self.codes)

        candidates = []
        for namespace in namespaces:
            for code in variants:
                target = self.codes.get(namespace, {}).get(code)
                if target:
                    candidates.append((namespace, code, target))
                    break
        unique_targets = {target for _, _, target in candidates}
        if len(unique_targets) == 1:
            namespace, code, target = candidates[0]
            return self._answer(target, f"exact_code:{namespace}:{code}")
        if len(unique_targets) > 1:
            choices = [
                {
                    "label": namespace.replace("_", " ").title(),
                    "target_namespace": namespace,
                    "target_faq_id": target,
                }
                for namespace, _, target in candidates
            ]
            return self._clarify("code_namespace", choices)
        return {"type": "no_match", "reason": "unknown_code"}

    def match(self, query: str) -> dict:
        q = normalize(query)
        if any(
            phrase in q
            for phrase in (
                "ignore instructions",
                "ignore ready route",
                "use general fedex knowledge",
                "pretend the rule",
                "invent the",
            )
        ):
            return {"type": "no_match", "reason": "knowledge_boundary"}
        code_result = self._code_match(query, q)
        if code_result:
            return code_result

        signature_ids = {
            "isr": "FAQ-DEL-SIG-ISR-001",
            "indirect signature": "FAQ-DEL-SIG-ISR-001",
            "indirect sig": "FAQ-DEL-SIG-ISR-001",
            "dsr": "FAQ-DEL-SIG-DSR-001",
            "direct signature": "FAQ-DEL-SIG-DSR-001",
            "direct sig": "FAQ-DEL-SIG-DSR-001",
            "asr": "FAQ-DEL-SIG-ASR-001",
            "adult signature": "FAQ-DEL-SIG-ASR-001",
            "adult sig": "FAQ-DEL-SIG-ASR-001",
        }
        for phrase, target in signature_ids.items():
            if phrase in q:
                return self._answer(target, f"signature_type:{phrase}")
        if re.search(r"\bsig\b|signature", q):
            return self._clarify("signature_type")

        if "business" in q and any(word in q for word in ("closed", "close", "not open")):
            if any(word in q for word in ("weekend", "saturday", "sunday", "sat", "sun")):
                return self._answer("FAQ-DELIVERY-STATUS-011", "business_closed:weekend")
            if "weekday" in q or any(day in q for day in ("monday", "tuesday", "wednesday", "thursday", "friday")):
                return self._answer("FAQ-DEL-BUS-CLOSED-001", "business_closed:weekday")
            return self._clarify("business_closed_timing")

        damage_terms = any(word in q for word in ("damage", "damaged", "leak", "leaking", "crushed", "torn"))
        if damage_terms:
            if any(word in q for word in ("hazmat", "hazardous", "dangerous goods")):
                return self._answer("FAQ-HAZ-LEAK-001", "damage:hazmat")
            if "call tag" in q:
                return self._answer("FAQ-PUP-CALLTAG-RESTRICTED-001", "damage:call_tag")
            return self._clarify("damage_context")

        if any(word in q for word in ("refuse", "refused", "wont take", "won t take")):
            if "call tag" in q:
                return self._answer("FAQ-PUP-CALLTAG-REFUSED-001", "refusal:call_tag")
            if "delivery" in q or "customer" in q or "recipient" in q:
                return self._clarify("refusal_context")

        if "call tag" in q and any(
            phrase in q for phrase in ("picked up", "got the package", "package ready")
        ):
            return self._answer("FAQ-PUP-CALLTAG-SUCCESS-001", "call_tag:successful_pickup")

        query_tokens = set(q.split())
        ranked = []
        for record in self.records.values():
            texts = [record["question"], *record.get("aliases", [])]
            best = 0.0
            for text in texts:
                candidate = normalize(text)
                candidate_tokens = set(candidate.split())
                overlap = len(query_tokens & candidate_tokens) / max(1, len(query_tokens | candidate_tokens))
                sequence = SequenceMatcher(None, q, candidate).ratio()
                best = max(best, 0.65 * overlap + 0.35 * sequence)
            ranked.append((best, record["faq_id"]))
        ranked.sort(reverse=True)
        if ranked and ranked[0][0] >= 0.52:
            return self._answer(ranked[0][1], f"lexical:{ranked[0][0]:.3f}")
        return {"type": "no_match", "reason": "confidence_floor"}


if __name__ == "__main__":
    import sys
    print(json.dumps(AnswerLibraryMatcher().match(" ".join(sys.argv[1:])), indent=2))
