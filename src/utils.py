from __future__ import annotations
import re
import unicodedata
from collections.abc import Iterable
import pandas as pd

def normalize_text(value: object) -> str:
    if value is None or pd.isna(value):
        return ""
    text = unicodedata.normalize("NFKD", str(value).strip())
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).lower()
    return re.sub(r"[^a-z0-9]+", "", text)

def clean_string_series(series: pd.Series) -> pd.Series:
    return series.astype("string").fillna("").str.strip().astype(str)

def normalize_identifier(value: object) -> str:
    if value is None or pd.isna(value):
        return ""
    if isinstance(value, (int,)):
        return str(value)
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    text = str(value).strip()
    if re.fullmatch(r"\d+\.0", text):
        return text[:-2]
    return text

def normalize_identifier_series(series: pd.Series) -> pd.Series:
    return series.map(normalize_identifier)

def find_column(columns: Iterable[object], aliases: Iterable[str]) -> str | None:
    normalized = {normalize_text(col): str(col) for col in columns}
    for alias in aliases:
        hit = normalized.get(normalize_text(alias))
        if hit is not None:
            return hit
    return None

def numeric_series(series: pd.Series, default: float = 0.0) -> pd.Series:
    return pd.to_numeric(series, errors="coerce").fillna(default)

def safe_divide(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    num = pd.to_numeric(numerator, errors="coerce").astype(float)
    den = pd.to_numeric(denominator, errors="coerce").astype(float)
    return num.div(den.where(den.ne(0))).fillna(0.0)
