from __future__ import annotations
from dataclasses import dataclass
import pandas as pd
from .utils import clean_string_series, numeric_series

@dataclass
class ValidationResult:
    errors: list[str]
    warnings: list[str]
    @property
    def ok(self) -> bool:
        return not self.errors

def validate_assortment(df: pd.DataFrame, columns: dict[str, str | None]) -> ValidationResult:
    errors, warnings = [], []
    required = [
        "id",
        "description",
        "reparto",
        "gruppo",
        "famiglia",
        "breve",
        "galto",
        "gmedio",
        "gbasso",
    ]
    missing = [key for key in required if not columns.get(key)]
    if missing:
        errors.append("Colonne assortimento non riconosciute: " + ", ".join(missing))
        return ValidationResult(errors, warnings)
    id_col = columns["id"]
    duplicate_count = df[id_col].astype(str).duplicated(keep=False).sum()
    if duplicate_count:
        warnings.append(f"Sono presenti {duplicate_count} righe con ID duplicato.")
    for key in ("galto", "gmedio", "gbasso"):
        col = columns[key]
        negative = (numeric_series(df[col]) < 0).sum()
        if negative:
            errors.append(f"La colonna {col} contiene {negative} quantità negative.")
    values = set(clean_string_series(df[columns["breve"]]).str.upper().unique())
    if "N" not in values:
        warnings.append("Nella colonna Breve non è stato trovato il valore N.")
    return ValidationResult(errors, warnings)

def validate_cluster(df: pd.DataFrame, columns: dict[str, str | None]) -> ValidationResult:
    errors, warnings = [], []
    missing = [key for key in ["store", "priority"] if not columns.get(key)]
    if missing:
        errors.append("Colonne cluster non riconosciute: " + ", ".join(missing))
        return ValidationResult(errors, warnings)
    priority = clean_string_series(df[columns["priority"]]).str.title()
    invalid = sorted(set(priority) - {"", "Alto", "Medio", "Basso"})
    if invalid:
        warnings.append("Valori cluster non standard: " + ", ".join(invalid[:10]))
    return ValidationResult(errors, warnings)

def validate_sales(df: pd.DataFrame, columns: dict[str, str | None]) -> ValidationResult:
    errors, warnings = [], []
    missing = [key for key in ["article", "store", "quantity", "date"] if not columns.get(key)]
    if missing:
        errors.append("Colonne vendite non riconosciute: " + ", ".join(missing))
        return ValidationResult(errors, warnings)
    invalid_qty = pd.to_numeric(df[columns["quantity"]], errors="coerce").isna().sum()
    if invalid_qty:
        warnings.append(f"Sono presenti {invalid_qty} quantità vendita non numeriche.")
    invalid_dates = pd.to_datetime(df[columns["date"]], errors="coerce", dayfirst=True).isna().sum()
    if invalid_dates:
        warnings.append(f"Sono presenti {invalid_dates} date non riconosciute.")
    return ValidationResult(errors, warnings)
