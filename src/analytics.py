from __future__ import annotations
import math
from dataclasses import asdict
import numpy as np
import pandas as pd
from .config import AnalysisParameters, AssortmentScope, CLUSTERS
from .utils import clean_string_series, normalize_identifier_series, normalize_text, numeric_series, safe_divide


def prepare_assortment(df: pd.DataFrame, columns: dict[str, str | None], scope: AssortmentScope) -> pd.DataFrame:
    data = df.copy()
    data = data[
        clean_string_series(data[columns["breve"]])
        .str.upper()
        .eq(scope.breve_value.upper())
    ]
    for key, expected in (
        ("reparto", scope.reparto),
        ("gruppo", scope.gruppo),
        ("famiglia", scope.famiglia),
    ):
        col = columns.get(key)
        if col and expected:
            data = data[
                clean_string_series(data[col])
                .map(normalize_text)
                .eq(normalize_text(expected))
            ]

    selected = pd.DataFrame(
        {
            "article_id": normalize_identifier_series(data[columns["id"]]),
            "sku": normalize_identifier_series(data[columns["sku"]])
            if columns.get("sku")
            else "",
            "description": clean_string_series(data[columns["description"]]),
            "brand": clean_string_series(data[columns["brand"]])
            if columns.get("brand")
            else "",
            "GAlto": numeric_series(data[columns["galto"]]),
            "GMedio": numeric_series(data[columns["gmedio"]]),
            "GBasso": numeric_series(data[columns["gbasso"]]),
            "pack_size": numeric_series(data[columns["pack"]], 1.0)
            if columns.get("pack")
            else 1.0,
            "space_unit": numeric_series(data[columns["volume"]], 1.0)
            if columns.get("volume")
            else 1.0,
        }
    )
    selected["pack_size"] = selected["pack_size"].where(
        selected["pack_size"] > 0, 1.0
    )
    selected["space_unit"] = selected["space_unit"].where(
        selected["space_unit"] > 0, 1.0
    )
    return selected.drop_duplicates(subset=["article_id"], keep="first").reset_index(
        drop=True
    )


def _cluster_subset(
    df: pd.DataFrame,
    columns: dict[str, str | None],
    level: str,
    filters: tuple[tuple[str, str], ...],
) -> pd.DataFrame:
    data = df.copy()
    if columns.get("type"):
        data = data[
            clean_string_series(data[columns["type"]]).str.upper().eq(level.upper())
        ]
    for key, expected in filters:
        col = columns.get(key)
        if col and expected:
            data = data[
                clean_string_series(data[col])
                .map(normalize_text)
                .eq(normalize_text(expected))
            ]
    return data


def prepare_cluster_mapping(
    df: pd.DataFrame,
    columns: dict[str, str | None],
    scope: AssortmentScope,
) -> pd.DataFrame:
    """Usa prima la famiglia, poi il gruppo e infine il reparto come fallback."""
    attempts = [
        (
            "Famiglia (F)",
            "F",
            (
                ("reparto", scope.reparto),
                ("gruppo", scope.gruppo),
                ("famiglia", scope.famiglia),
            ),
        ),
        (
            "Gruppo (G)",
            "G",
            (("reparto", scope.reparto), ("gruppo", scope.gruppo)),
        ),
        ("Reparto (R)", "R", (("reparto", scope.reparto),)),
    ]

    for label, level, filters in attempts:
        data = _cluster_subset(df, columns, level, filters)
        mapping = pd.DataFrame(
            {
                "store": clean_string_series(data[columns["store"]]),
                "cluster": clean_string_series(data[columns["priority"]]).str.title(),
            }
        )
        mapping["store_key"] = mapping["store"].map(normalize_text)
        mapping = mapping[
            mapping["cluster"].isin(CLUSTERS) & mapping["store_key"].ne("")
        ]
        mapping = mapping.drop_duplicates(subset=["store_key"], keep="last").reset_index(
            drop=True
        )
        if not mapping.empty:
            mapping.attrs["level_used"] = label
            return mapping

    empty = pd.DataFrame(columns=["store", "cluster", "store_key"])
    empty.attrs["level_used"] = "Nessuno"
    return empty


def base_assortment_summary(assortment: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for cluster in CLUSTERS:
        col = f"G{cluster}"
        rows.append({
            "Cluster": cluster,
            "Referenze presenti": int((assortment[col] > 0).sum()),
            "Referenze escluse": int((assortment[col] <= 0).sum()),
            "Pezzi teorici": float(assortment[col].sum()),
            "Indice spazio teorico": float((assortment[col] * assortment["space_unit"]).sum()),
        })
    return pd.DataFrame(rows)


def prepare_sales(df: pd.DataFrame, columns: dict[str, str | None], cluster_mapping: pd.DataFrame, months: int = 6):
    sales = pd.DataFrame({
        "article_key": normalize_identifier_series(df[columns["article"]]),
        "store": clean_string_series(df[columns["store"]]),
        "quantity": numeric_series(df[columns["quantity"]]),
        "date": pd.to_datetime(df[columns["date"]], errors="coerce", dayfirst=True),
    })
    if columns.get("sales_value"):
        sales["sales_value"] = numeric_series(df[columns["sales_value"]])
    if columns.get("margin"):
        sales["margin"] = numeric_series(df[columns["margin"]])
    sales["store_key"] = sales["store"].map(normalize_text)
    sales = sales.dropna(subset=["date"])
    if sales.empty:
        return sales, {"start": None, "end": None, "unmapped_stores": 0}
    end_date = sales["date"].max().normalize()
    start_date = (end_date - pd.DateOffset(months=months)) + pd.Timedelta(days=1)
    sales = sales[sales["date"].between(start_date, end_date)]
    sales["month"] = sales["date"].dt.to_period("M").astype(str)
    sales = sales.merge(cluster_mapping[["store_key", "cluster"]], on="store_key", how="left")
    unmapped_stores = int(sales.loc[sales["cluster"].isna(), "store"].nunique())
    sales = sales[sales["cluster"].isin(CLUSTERS)]
    return sales, {"start": start_date.date(), "end": end_date.date(), "unmapped_stores": unmapped_stores}


def _score_metrics(metrics: pd.DataFrame) -> pd.DataFrame:
    scored = metrics.copy()
    for cluster in CLUSTERS:
        velocity = f"monthly_per_store_{cluster}"
        scored[f"velocity_pct_{cluster}"] = scored[velocity].rank(pct=True).fillna(0) * 100
        scored[f"score_{cluster}"] = (
            scored[f"velocity_pct_{cluster}"] * 0.50
            + scored[f"penetration_{cluster}"] * 100 * 0.25
            + scored[f"continuity_{cluster}"] * 100 * 0.25
        )
    scored["score_generale"] = scored[[f"score_{c}" for c in CLUSTERS]].max(axis=1)
    return scored


def calculate_metrics(assortment: pd.DataFrame, sales: pd.DataFrame, cluster_mapping: pd.DataFrame, months: int = 6) -> pd.DataFrame:
    result = assortment.copy()
    store_counts = cluster_mapping.groupby("cluster")["store"].nunique().to_dict()
    for cluster in CLUSTERS:
        cluster_sales = sales[sales["cluster"].eq(cluster)]
        positive = cluster_sales[cluster_sales["quantity"] > 0]
        totals = cluster_sales.groupby("article_key", dropna=False)["quantity"].sum().rename("pieces")
        stores = positive.groupby("article_key")["store"].nunique().rename("active_stores")
        active_months = positive.groupby("article_key")["month"].nunique().rename("active_months")
        grouped = pd.concat([totals, stores, active_months], axis=1).fillna(0)
        result = result.merge(grouped, how="left", left_on="article_id", right_index=True)
        result.rename(columns={
            "pieces": f"pieces_{cluster}",
            "active_stores": f"active_stores_{cluster}",
            "active_months": f"active_months_{cluster}",
        }, inplace=True)
        n_stores = max(int(store_counts.get(cluster, 0)), 1)
        for stem in ("pieces", "active_stores", "active_months"):
            result[f"{stem}_{cluster}"] = result[f"{stem}_{cluster}"].fillna(0.0)
        result[f"monthly_per_store_{cluster}"] = result[f"pieces_{cluster}"] / (months * n_stores)
        result[f"penetration_{cluster}"] = result[f"active_stores_{cluster}"] / n_stores
        result[f"continuity_{cluster}"] = result[f"active_months_{cluster}"] / months
        result[f"coverage_months_{cluster}"] = safe_divide(result[f"G{cluster}"], result[f"monthly_per_store_{cluster}"])
    return _score_metrics(result)


def _round_quantity(raw: float, pack_size: float, parameters: AnalysisParameters) -> int:
    quantity = max(parameters.minimum_display, int(math.ceil(max(raw, 0.0))))
    if parameters.round_to_pack and pack_size > 1:
        quantity = int(math.ceil(quantity / pack_size) * pack_size)
    return quantity


def generate_proposal(metrics: pd.DataFrame, parameters: AnalysisParameters) -> pd.DataFrame:
    data = metrics.copy()
    mask = (data["GBasso"] > 0) & (data["monthly_per_store_Medio"] > 0)
    ratios = data.loc[mask, "monthly_per_store_Basso"].div(data.loc[mask, "monthly_per_store_Medio"])
    ratio = float(ratios.replace([np.inf, -np.inf], np.nan).dropna().median()) if not ratios.empty else 0.5
    if not np.isfinite(ratio) or ratio <= 0:
        ratio = 0.5
    ratio = min(max(ratio, 0.20), 1.00)

    data["estimated_monthly_Basso"] = data["monthly_per_store_Basso"]
    absent = data["GBasso"].le(0)
    data.loc[absent, "estimated_monthly_Basso"] = data.loc[absent, "monthly_per_store_Medio"] * ratio
    fallback = data["estimated_monthly_Basso"].le(0) & absent
    data.loc[fallback, "estimated_monthly_Basso"] = (
        data.loc[fallback, ["monthly_per_store_Alto", "monthly_per_store_Medio"]].mean(axis=1) * 0.35
    )

    raw_target = data["estimated_monthly_Basso"] * parameters.target_months + parameters.safety_stock
    proposed, actions, reasons = [], [], []
    for row, target in zip(data.to_dict("records"), raw_target, strict=False):
        current = float(row["GBasso"])
        score = float(row["score_generale"])
        pack = float(row["pack_size"])
        demand = float(row["estimated_monthly_Basso"])
        if current <= 0:
            if score >= parameters.insertion_score and demand > 0:
                proposal = _round_quantity(target, pack, parameters)
                action = "Inserire"
                reason = "Alta rotazione negli altri cluster; test nel cluster Basso."
            else:
                proposal = 0
                action = "Confermare esclusione"
                reason = "Punteggio o domanda stimata insufficienti per l'inserimento."
        else:
            ideal = _round_quantity(target, pack, parameters)
            max_up = max(current, math.ceil(current * (1 + parameters.max_increase_pct / 100)))
            min_down = max(parameters.minimum_display, math.floor(current * (1 - parameters.max_reduction_pct / 100)))
            proposal = int(min(max(ideal, min_down), max_up))
            if proposal > current:
                action, reason = "Aumentare", "Copertura inferiore all'obiettivo sulla base delle vendite."
            elif proposal < current:
                action, reason = "Ridurre", "Copertura superiore all'obiettivo sulla base delle vendite."
            else:
                action, reason = "Confermare", "Assegnato coerente con la copertura obiettivo."
        proposed.append(int(proposal))
        actions.append(action)
        reasons.append(reason)

    data["GBasso_proposto"] = proposed
    data["delta_GBasso"] = data["GBasso_proposto"] - data["GBasso"]
    data["azione_Basso"] = actions
    data["motivazione"] = reasons
    data["spazio_Basso_attuale"] = data["GBasso"] * data["space_unit"]
    data["spazio_Basso_proposto"] = data["GBasso_proposto"] * data["space_unit"]
    data["delta_spazio_Basso"] = data["spazio_Basso_proposto"] - data["spazio_Basso_attuale"]
    data.attrs["parameters"] = asdict(parameters)
    data.attrs["basso_medio_ratio"] = ratio
    return data


def proposal_summary(proposal: pd.DataFrame) -> pd.DataFrame:
    counts = proposal["azione_Basso"].value_counts().to_dict()
    return pd.DataFrame([
        {"Indicatore": "Referenze analizzate", "Valore": len(proposal)},
        {"Indicatore": "Da inserire nel Basso", "Valore": counts.get("Inserire", 0)},
        {"Indicatore": "Da aumentare", "Valore": counts.get("Aumentare", 0)},
        {"Indicatore": "Da ridurre", "Valore": counts.get("Ridurre", 0)},
        {"Indicatore": "Assegnato Basso attuale", "Valore": proposal["GBasso"].sum()},
        {"Indicatore": "Assegnato Basso proposto", "Valore": proposal["GBasso_proposto"].sum()},
        {"Indicatore": "Delta spazio teorico", "Valore": proposal["delta_spazio_Basso"].sum()},
    ])
