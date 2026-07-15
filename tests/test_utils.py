from src.utils import find_column, normalize_text

def test_normalize_text_handles_accents_and_spaces():
    assert normalize_text("Priorità ") == "priorita"

def test_find_column_uses_aliases():
    columns = ["Codice", "Priorità", "Punto Vendita"]
    assert find_column(columns, ["Priorita"]) == "Priorità"
