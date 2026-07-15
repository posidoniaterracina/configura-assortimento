from pathlib import Path

import pandas as pd

from src.analytics import prepare_assortment, prepare_cluster_mapping
from src.config import AssortmentScope
from src.data_loader import (
    detect_assortment_columns,
    detect_cluster_columns,
    read_excel,
)


def test_fixed_cluster_file_matches_known_family_scope():
    cluster_raw = read_excel("data/config/Cluster.xlsx", "Q_Temp")
    cluster = prepare_cluster_mapping(
        cluster_raw,
        detect_cluster_columns(cluster_raw),
        AssortmentScope(
            reparto="Ferramenta",
            gruppo="Auto E Ciclo",
            famiglia="Olio Lubrificante",
        ),
    )
    assert cluster.attrs["level_used"] == "Famiglia (F)"
    assert cluster.groupby("cluster")["store"].nunique().to_dict() == {
        "Alto": 4,
        "Basso": 5,
        "Medio": 11,
    }


def test_assortment_is_selected_from_uploaded_data_and_breve_n_only():
    raw = pd.DataFrame(
        {
            "SkuCodice": ["100", "200", "300"],
            "Id": [1, 2, 3],
            "Prodotto": ["A", "B", "C"],
            "Reparto": ["Ferramenta", "Ferramenta", "Casa"],
            "Famiglia": ["Auto E Ciclo", "Auto E Ciclo", "Arredo"],
            "SttFamiglia": ["Olio Lubrificante", "Olio Lubrificante", "Mobili"],
            "Breve": ["N", "S", "N"],
            "GAlto": [12, 6, 4],
            "GMedio": [6, 3, 2],
            "GBasso": [2, 0, 0],
        }
    )
    assortment = prepare_assortment(
        raw,
        detect_assortment_columns(raw),
        AssortmentScope(
            reparto="Ferramenta",
            gruppo="Auto E Ciclo",
            famiglia="Olio Lubrificante",
        ),
    )
    assert assortment["article_id"].tolist() == ["1"]


def test_repository_does_not_bundle_real_assortment_or_sales_inputs():
    assert not Path("data/input").exists()
    assert Path("data/config/Cluster.xlsx").exists()
    assert Path("data/templates/Anagrafica_Template.xlsx").exists()
    assert Path("data/templates/Vendite_Template.xlsx").exists()
