from __future__ import annotations
from io import BytesIO
from pathlib import Path
from typing import BinaryIO
import pandas as pd
from .utils import find_column

ExcelSource = str | Path | bytes | BinaryIO

def _as_excel_input(source: ExcelSource):
    return BytesIO(source) if isinstance(source, bytes) else source

def list_excel_sheets(source: ExcelSource) -> list[str]:
    return pd.ExcelFile(_as_excel_input(source)).sheet_names

def read_excel(source: ExcelSource, sheet_name: str | int = 0) -> pd.DataFrame:
    return pd.read_excel(_as_excel_input(source), sheet_name=sheet_name, dtype=object)

def detect_assortment_columns(df: pd.DataFrame) -> dict[str, str | None]:
    return {
        "sku": find_column(df.columns, ["SkuCodice", "SKU", "EAN", "Codice EAN"]),
        "id": find_column(df.columns, ["Id", "Fk_Prd", "Codice articolo", "Articolo"]),
        "description": find_column(df.columns, ["Prodotto", "Descrizione", "Descrizione articolo"]),
        "reparto": find_column(df.columns, ["Reparto"]),
        "gruppo": find_column(df.columns, ["Famiglia", "Gruppo"]),
        "famiglia": find_column(df.columns, ["SttFamiglia", "Sottofamiglia", "Famiglia"]),
        "breve": find_column(df.columns, ["Breve"]),
        "galto": find_column(df.columns, ["GAlto"]),
        "gmedio": find_column(df.columns, ["GMedio"]),
        "gbasso": find_column(df.columns, ["GBasso"]),
        "pack": find_column(df.columns, ["Art_Pz", "Pezzi collo", "Pz collo", "Imballo"]),
        "volume": find_column(df.columns, ["Volume", "Ingombro", "Cm lineari"]),
        "brand": find_column(df.columns, ["Brand", "Marca"]),
    }

def detect_cluster_columns(df: pd.DataFrame) -> dict[str, str | None]:
    return {
        "store": find_column(df.columns, ["Punto vendita", "PuntoVendita", "PDV", "Negozio", "Store", "Descrizione PDV", "Descrizione", "Codice PDV"]),
        "priority": find_column(df.columns, ["Priorita", "Priorità", "Cluster"]),
        "type": find_column(df.columns, ["Tipo", "Livello"]),
        "reparto": find_column(df.columns, ["Reparto"]),
        "gruppo": find_column(df.columns, ["Gruppo", "Famiglia"]),
        "famiglia": find_column(df.columns, ["Famiglia", "Sottofamiglia", "SttFamiglia"]),
    }

def detect_sales_columns(df: pd.DataFrame) -> dict[str, str | None]:
    return {
        "article": find_column(df.columns, ["Id", "Fk_Prd", "Codice articolo", "Articolo", "SKU", "SkuCodice", "EAN"]),
        "store": find_column(df.columns, ["Punto vendita", "PuntoVendita", "PDV", "Negozio", "Store", "Codice PDV"]),
        "quantity": find_column(df.columns, ["Quantita", "Quantità", "Pezzi", "Qta", "Vendite pezzi", "Qta venduta"]),
        "date": find_column(df.columns, ["Data", "Giorno", "Mese", "Data vendita"]),
        "sales_value": find_column(df.columns, ["Venduto", "Fatturato", "Valore vendite", "Importo"]),
        "margin": find_column(df.columns, ["Margine", "Margine euro", "Margine €"]),
    }
