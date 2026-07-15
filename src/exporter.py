from __future__ import annotations
from io import BytesIO
import pandas as pd

EXPORT_COLUMNS = [
    "article_id", "sku", "description", "brand", "GAlto", "GMedio", "GBasso",
    "GBasso_proposto", "delta_GBasso", "azione_Basso", "motivazione", "score_generale",
    "pieces_Alto", "pieces_Medio", "pieces_Basso", "monthly_per_store_Alto",
    "monthly_per_store_Medio", "monthly_per_store_Basso", "estimated_monthly_Basso",
    "coverage_months_Basso", "space_unit", "spazio_Basso_attuale",
    "spazio_Basso_proposto", "delta_spazio_Basso",
]

def build_excel_export(base_summary: pd.DataFrame, proposal_summary: pd.DataFrame, proposal: pd.DataFrame, anomalies: pd.DataFrame | None = None) -> bytes:
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="xlsxwriter") as writer:
        base_summary.to_excel(writer, sheet_name="Assortimento_attuale", index=False)
        proposal_summary.to_excel(writer, sheet_name="Sintesi_proposta", index=False)
        available = [col for col in EXPORT_COLUMNS if col in proposal.columns]
        proposal[available].to_excel(writer, sheet_name="Dettaglio", index=False)
        for action, sheet in (("Inserire", "Da_inserire"), ("Aumentare", "Da_aumentare"), ("Ridurre", "Da_ridurre"), ("Confermare esclusione", "Esclusioni_confermate")):
            proposal.loc[proposal["azione_Basso"].eq(action), available].to_excel(writer, sheet_name=sheet, index=False)
        if anomalies is not None and not anomalies.empty:
            anomalies.to_excel(writer, sheet_name="Anomalie", index=False)
        workbook = writer.book
        header_format = workbook.add_format({"bold": True, "font_color": "white", "bg_color": "#008C39"})
        decimal_format = workbook.add_format({"num_format": "0.00"})
        for sheet_name, worksheet in writer.sheets.items():
            worksheet.freeze_panes(1, 0)
            worksheet.autofilter(0, 0, worksheet.dim_rowmax, worksheet.dim_colmax)
            worksheet.set_row(0, 22, header_format)
            worksheet.set_column(0, min(3, worksheet.dim_colmax), 20)
            worksheet.set_column(2, 2, 48)
            worksheet.set_column(3, worksheet.dim_colmax, 16, decimal_format)
    return buffer.getvalue()
