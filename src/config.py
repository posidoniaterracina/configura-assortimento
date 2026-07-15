from __future__ import annotations
from dataclasses import dataclass

CLUSTERS = ("Alto", "Medio", "Basso")
ASSIGNED_COLUMNS = {"Alto": "GAlto", "Medio": "GMedio", "Basso": "GBasso"}

@dataclass(frozen=True)
class AssortmentScope:
    reparto: str = "Ferramenta"
    gruppo: str = "Auto E Ciclo"
    famiglia: str = "Olio Lubrificante"
    tipo: str = "F"
    breve_value: str = "N"

@dataclass(frozen=True)
class AnalysisParameters:
    target_months: float = 2.0
    safety_stock: float = 1.0
    insertion_score: float = 70.0
    max_increase_pct: float = 100.0
    max_reduction_pct: float = 50.0
    minimum_display: int = 1
    round_to_pack: bool = False
