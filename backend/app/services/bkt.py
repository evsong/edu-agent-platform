"""Bayesian Knowledge Tracing — ported from UC Berkeley OATutor."""

from __future__ import annotations

import random

DEFAULT_BKT_PARAMS: dict[str, float] = {
    "probMastery": 0.3,
    "probSlip": 0.1,
    "probGuess": 0.25,
    "probTransit": 0.1,
}

MASTERY_THRESHOLD = 0.95


def bkt_update(params: dict[str, float], is_correct: bool) -> None:
    """Update BKT parameters *in-place* based on a single student response.

    The posterior P(L_n | obs) is computed from the current mastery estimate,
    then the transition probability is applied to obtain P(L_{n+1}).
    """
    if is_correct:
        num = params["probMastery"] * (1 - params["probSlip"])
        den = (1 - params["probMastery"]) * params["probGuess"]
    else:
        num = params["probMastery"] * params["probSlip"]
        den = (1 - params["probMastery"]) * (1 - params["probGuess"])

    posterior = num / (num + den)
    params["probMastery"] = posterior + (1 - posterior) * params["probTransit"]


def select_problem(
    problems: list,
    bkt_states: dict[str, dict],
    completed_ids: set,
    threshold: float = MASTERY_THRESHOLD,
):
    """Select the next problem — lowest mastery priority, skip mastered topics.

    Parameters
    ----------
    problems
        List of Exercise-like objects with ``.id`` and ``.knowledge_point_id``.
    bkt_states
        Mapping of ``knowledge_point_id (str) -> BKT params dict``.
    completed_ids
        Set of exercise IDs the student has already completed.
    threshold
        Mastery threshold above which a topic is considered learned.

    Returns
    -------
    The best candidate exercise, or ``None`` if all are mastered / completed.
    """
    candidates: list[tuple] = []

    for p in problems:
        if p.id in completed_ids:
            continue

        # Support objects with either a single kp or a list
        kp_ids: list = (
            p.knowledge_point_ids
            if hasattr(p, "knowledge_point_ids")
            else [p.knowledge_point_id]
        )

        mastery = 1.0
        relevant = False
        for kp_id in kp_ids:
            kp_str = str(kp_id)
            if kp_str in bkt_states:
                relevant = True
                mastery *= bkt_states[kp_str].get("probMastery", 0.3)

        if not relevant:
            mastery = 0.3  # default for unknown KPs

        if mastery >= threshold:
            continue

        candidates.append((p, mastery))

    if not candidates:
        return None

    candidates.sort(key=lambda x: x[1])

    # Random tie-break among equal-lowest mastery
    lowest = candidates[0][1]
    ties = [c for c in candidates if c[1] == lowest]
    return random.choice(ties)[0]
