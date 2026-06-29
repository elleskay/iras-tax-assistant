"""Synthetic officer-interaction data generator.

Live platform usage is too sparse for a demo, so we synthesise a realistic
dataset of tax-officer queries per workspace. The generator is *deterministic*
(seeded) and deliberately bakes a story into the numbers so the downstream
analyses surface something meaningful:

  * A handful of topics are asked far more often than the rest
    -> these become ``trainingNeeds``.
  * Some topics consistently miss retrieval or score badly on eval
    -> these become ``docGaps``.
  * Some topics cost a lot of officer effort (turns / steps / time)
    -> these become ``processImprovements``.

Each topic carries a "profile" that controls those distributions, so the same
topic reliably tells the same part of the story across runs.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Callable

# ---------------------------------------------------------------------------
# Topic model
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Topic:
    """A semantic topic with a behavioural profile.

    weight        relative frequency this topic is asked (higher => more common)
    retrieval_p   probability a query in this topic gets a retrieval hit
    score_center  retrieval_score / eval centre (0..1) when knowledge is good
    eval_center   eval_score centre on a 0..100 scale
    effort        multiplier on turns / steps / time (1.0 == baseline effort)
    templates     prompt phrasings; "{x}" slots filled from ``slots``
    slots         lists of fillers per slot name
    """

    key: str
    label: str
    weight: float
    retrieval_p: float
    eval_center: float
    effort: float
    templates: tuple[str, ...]
    slots: dict[str, tuple[str, ...]] = field(default_factory=dict)


def _fill(rng: random.Random, template: str, slots: dict[str, tuple[str, ...]]) -> str:
    out = template
    for name, choices in slots.items():
        token = "{" + name + "}"
        while token in out:
            out = out.replace(token, rng.choice(choices), 1)
    return out


# ---------------------------------------------------------------------------
# Individual Income Tax workspace topics
# ---------------------------------------------------------------------------

_INDIVIDUAL_TOPICS: tuple[Topic, ...] = (
    # --- High frequency, well-documented => TRAINING NEED (officers ask a lot) ---
    Topic(
        key="reliefs",
        label="Personal relief eligibility",
        weight=6.0,
        retrieval_p=0.95,
        eval_center=0.86,
        effort=0.9,
        templates=(
            "Can a taxpayer claim {relief} relief for YA {ya}?",
            "What is the cap on {relief} relief?",
            "Is {relief} relief still available after the latest budget?",
            "How do I compute {relief} relief for a resident individual?",
        ),
        slots={
            "relief": (
                "earned income", "spouse", "qualifying child", "parent",
                "course fees", "CPF cash top-up", "life insurance", "NSman",
            ),
            "ya": ("2024", "2025", "2026"),
        },
    ),
    # --- High frequency residency => TRAINING NEED ---
    Topic(
        key="residency",
        label="Tax residency determination",
        weight=5.0,
        retrieval_p=0.92,
        eval_center=0.82,
        effort=1.0,
        templates=(
            "Is an individual who stayed {days} days in Singapore a tax resident?",
            "How does the {rule} rule affect residency for YA {ya}?",
            "Does a foreigner on a {pass} pass qualify as a tax resident?",
            "What residency status applies if employment spans two calendar years?",
        ),
        slots={
            "days": ("60", "120", "183", "200"),
            "rule": ("two-year administrative concession", "three-year", "183-day"),
            "pass": ("Employment", "S", "Work Permit", "EntrePass"),
        },
    ),
    # --- Documented but moderate => normal ---
    Topic(
        key="employment_income",
        label="Employment income & benefits-in-kind",
        weight=3.0,
        retrieval_p=0.88,
        eval_center=0.80,
        effort=1.0,
        templates=(
            "Is {benefit} taxable as a benefit-in-kind?",
            "How is a {benefit} taxed for an employee?",
            "Should {benefit} be reported in the IR8A?",
        ),
        slots={
            "benefit": (
                "company car", "housing allowance", "stock option gain",
                "relocation reimbursement", "club membership", "per diem",
            ),
        },
    ),
    # --- DOC GAP: crypto / digital assets, poorly documented, low retrieval ---
    Topic(
        key="digital_assets",
        label="Crypto & digital-asset gains",
        weight=2.0,
        retrieval_p=0.18,
        eval_center=0.34,
        effort=1.3,
        templates=(
            "How are gains from {asset} taxed for an individual?",
            "Is income from {activity} in crypto taxable?",
            "What records must a taxpayer keep for {asset} disposals?",
        ),
        slots={
            "asset": ("Bitcoin", "Ethereum", "NFTs", "stablecoins", "staked tokens"),
            "activity": ("staking", "mining", "airdrops", "play-to-earn", "yield farming"),
        },
    ),
    # --- DOC GAP: foreign / remote income, low eval scores ---
    Topic(
        key="foreign_income",
        label="Foreign-sourced & remote income",
        weight=2.0,
        retrieval_p=0.30,
        eval_center=0.40,
        effort=1.2,
        templates=(
            "Is foreign-sourced income from {country} taxable when remitted?",
            "How is income from remote work for a {country} employer treated?",
            "Does the {country} tax treaty exempt this employment income?",
        ),
        slots={
            "country": ("Malaysia", "the UK", "the US", "Australia", "India", "Indonesia"),
        },
    ),
    # --- PROCESS IMPROVEMENT: complex objections / appeals, very high effort ---
    Topic(
        key="objections",
        label="Assessment objections & appeals",
        weight=2.5,
        retrieval_p=0.70,
        eval_center=0.66,
        effort=2.3,
        templates=(
            "Walk me through handling an objection to the {component} assessment.",
            "What is the full process to revise an assessment after a {component} dispute?",
            "How do I prepare a case for the Income Tax Board of Review on {component}?",
        ),
        slots={
            "component": (
                "rental income", "self-employment", "director's fee",
                "capital vs revenue", "relief claw-back",
            ),
        },
    ),
    # --- PROCESS IMPROVEMENT: self-employed / sole-prop accounting, high effort ---
    Topic(
        key="self_employed",
        label="Self-employed income computation",
        weight=2.5,
        retrieval_p=0.72,
        eval_center=0.68,
        effort=1.9,
        templates=(
            "How do I compute adjusted profit for a sole proprietor with {item}?",
            "Which {item} expenses are deductible for a self-employed individual?",
            "How is the two-line vs four-line statement applied with {item}?",
        ),
        slots={
            "item": (
                "home-office", "vehicle", "mixed private-business", "capital allowance",
                "stock write-off",
            ),
        },
    ),
)

# ---------------------------------------------------------------------------
# Corporate Tax workspace topics
# ---------------------------------------------------------------------------

_CORPORATE_TOPICS: tuple[Topic, ...] = (
    # --- TRAINING NEED: capital allowances, asked constantly, well documented ---
    Topic(
        key="capital_allowances",
        label="Capital allowances on assets",
        weight=6.0,
        retrieval_p=0.94,
        eval_center=0.85,
        effort=1.0,
        templates=(
            "What capital allowance rate applies to {asset}?",
            "Can the company claim accelerated allowance on {asset}?",
            "How is the writing-down allowance computed for {asset}?",
            "Is {asset} eligible for the one-year write-off?",
        ),
        slots={
            "asset": (
                "computers", "machinery", "motor vehicles", "renovation works",
                "office furniture", "software", "plant",
            ),
        },
    ),
    # --- TRAINING NEED: tax exemptions / rebates, very common ---
    Topic(
        key="exemptions",
        label="Corporate exemptions & rebates",
        weight=5.0,
        retrieval_p=0.92,
        eval_center=0.83,
        effort=0.9,
        templates=(
            "Does the company qualify for the {scheme} for YA {ya}?",
            "How much {scheme} applies to a company with {profit} chargeable income?",
            "Is a {entity} eligible for the start-up tax exemption?",
        ),
        slots={
            "scheme": (
                "partial tax exemption", "start-up tax exemption", "corporate income tax rebate",
            ),
            "ya": ("2024", "2025", "2026"),
            "profit": ("$100k", "$200k", "$350k", "$1m"),
            "entity": ("newly incorporated company", "holding company", "investment holding company"),
        },
    ),
    # --- normal: GST interaction, moderate ---
    Topic(
        key="deductibility",
        label="Expense deductibility",
        weight=3.0,
        retrieval_p=0.87,
        eval_center=0.79,
        effort=1.1,
        templates=(
            "Is {expense} deductible against trade income?",
            "Can the company deduct {expense} under section 14?",
            "Are {expense} costs revenue or capital in nature?",
        ),
        slots={
            "expense": (
                "staff welfare", "entertainment", "donations", "legal fees",
                "pre-commencement", "interest", "foreign exchange loss",
            ),
        },
    ),
    # --- DOC GAP: transfer pricing, sparse docs, low retrieval ---
    Topic(
        key="transfer_pricing",
        label="Transfer pricing & related parties",
        weight=2.5,
        retrieval_p=0.22,
        eval_center=0.36,
        effort=1.4,
        templates=(
            "What transfer-pricing documentation is required for {txn}?",
            "How is the arm's-length range determined for {txn}?",
            "Does the company need a TP study for {txn} with a related party?",
        ),
        slots={
            "txn": (
                "intercompany loans", "management fees", "royalty payments",
                "cost pooling", "goods sold to a subsidiary",
            ),
        },
    ),
    # --- DOC GAP: foreign tax credit / treaties, low eval ---
    Topic(
        key="foreign_tax_credit",
        label="Foreign tax credit & treaties",
        weight=2.0,
        retrieval_p=0.28,
        eval_center=0.41,
        effort=1.3,
        templates=(
            "How is the foreign tax credit computed on income from {country}?",
            "Does the {country} treaty reduce withholding on {income}?",
            "Can unused foreign tax credit on {income} be carried forward?",
        ),
        slots={
            "country": ("China", "the US", "India", "Indonesia", "Germany"),
            "income": ("dividends", "interest", "royalties", "service fees"),
        },
    ),
    # --- PROCESS IMPROVEMENT: group relief / loss carry-back, very high effort ---
    Topic(
        key="group_relief",
        label="Group relief & loss transfers",
        weight=2.5,
        retrieval_p=0.68,
        eval_center=0.64,
        effort=2.4,
        templates=(
            "Walk through transferring {item} under group relief between two companies.",
            "How do I apply the loss carry-back relief with {item}?",
            "What conditions must be met to transfer {item} within the group?",
        ),
        slots={
            "item": (
                "current-year unutilised losses", "capital allowances",
                "donations", "trade losses across YAs",
            ),
        },
    ),
    # --- PROCESS IMPROVEMENT: restructuring / M&A, high effort ---
    Topic(
        key="restructuring",
        label="Restructuring & M&A tax",
        weight=2.0,
        retrieval_p=0.66,
        eval_center=0.62,
        effort=2.1,
        templates=(
            "What are the tax implications of a {event} for the acquiring company?",
            "How is the {event} treated for stamp duty and income tax?",
            "Does the {event} trigger a balancing charge on capital allowances?",
        ),
        slots={
            "event": (
                "amalgamation", "share acquisition", "asset sale",
                "internal reorganisation", "spin-off",
            ),
        },
    ),
)


@dataclass(frozen=True)
class Workspace:
    key: str
    name: str
    topics: tuple[Topic, ...]


WORKSPACES: tuple[Workspace, ...] = (
    Workspace("individual-income", "Individual Income Tax", _INDIVIDUAL_TOPICS),
    Workspace("corporate", "Corporate Tax", _CORPORATE_TOPICS),
)


# ---------------------------------------------------------------------------
# Interaction generation
# ---------------------------------------------------------------------------


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def generate_workspace_interactions(
    workspace: Workspace,
    *,
    n: int | None = None,
    seed: int = 42,
) -> list[dict]:
    """Return a list of synthetic interaction records for ``workspace``.

    Each record:
        topic_key, topic_label, prompt, retrieval_hit, retrieval_score,
        turn_count, step_count, time_seconds, eval_score
    """

    rng = random.Random(f"{seed}:{workspace.key}")
    if n is None:
        n = rng.randint(300, 600)

    weights = [t.weight for t in workspace.topics]
    records: list[dict] = []

    for _ in range(n):
        topic = rng.choices(workspace.topics, weights=weights, k=1)[0]
        prompt = _fill(rng, rng.choice(topic.templates), topic.slots)

        retrieval_hit = rng.random() < topic.retrieval_p
        if retrieval_hit:
            retrieval_score = _clamp(rng.gauss(topic.eval_center, 0.08), 0.0, 1.0)
        else:
            # missed retrieval -> low / near-zero similarity
            retrieval_score = _clamp(rng.gauss(0.12, 0.06), 0.0, 1.0)

        # eval score correlates with retrieval quality but adds noise
        eval_base = topic.eval_center * 100.0
        if not retrieval_hit:
            eval_base -= 22.0
        eval_score = int(round(_clamp(rng.gauss(eval_base, 9.0), 0.0, 100.0)))

        # effort metrics scale with the topic effort multiplier
        turn_count = max(1, int(round(rng.gauss(2.2 * topic.effort, 0.8))))
        step_count = max(1, int(round(rng.gauss(3.0 * topic.effort, 1.1))))
        time_seconds = int(
            round(_clamp(rng.gauss(45.0 * topic.effort, 14.0 * topic.effort), 5.0, 1200.0))
        )

        records.append(
            {
                "topic_key": topic.key,
                "topic_label": topic.label,
                "prompt": prompt,
                "retrieval_hit": retrieval_hit,
                "retrieval_score": round(retrieval_score, 3),
                "turn_count": turn_count,
                "step_count": step_count,
                "time_seconds": time_seconds,
                "eval_score": eval_score,
            }
        )

    return records
