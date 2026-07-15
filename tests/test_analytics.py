import pandas as pd
from src.analytics import base_assortment_summary, generate_proposal
from src.config import AnalysisParameters

def test_base_assortment_summary_counts_presence():
    assortment = pd.DataFrame({
        "GAlto": [12, 6], "GMedio": [6, 0], "GBasso": [0, 0], "space_unit": [1.0, 2.0]
    })
    summary = base_assortment_summary(assortment)
    basso = summary.loc[summary["Cluster"] == "Basso"].iloc[0]
    assert basso["Referenze presenti"] == 0
    assert basso["Referenze escluse"] == 2

def test_high_score_absent_item_is_proposed_for_basso():
    metrics = pd.DataFrame({
        "article_id": ["1"], "sku": ["SKU1"], "description": ["Prodotto"], "brand": ["Marca"],
        "GAlto": [12.0], "GMedio": [6.0], "GBasso": [0.0], "pack_size": [1.0], "space_unit": [1.0],
        "monthly_per_store_Alto": [5.0], "monthly_per_store_Medio": [4.0],
        "monthly_per_store_Basso": [0.0], "score_generale": [90.0],
    })
    proposal = generate_proposal(metrics, AnalysisParameters(insertion_score=70))
    assert proposal.loc[0, "azione_Basso"] == "Inserire"
    assert proposal.loc[0, "GBasso_proposto"] > 0
