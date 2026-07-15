from __future__ import annotations

from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st

from src.analytics import (
    base_assortment_summary,
    calculate_metrics,
    generate_proposal,
    prepare_assortment,
    prepare_cluster_mapping,
    prepare_sales,
    proposal_summary,
)
from src.config import AnalysisParameters, AssortmentScope
from src.data_loader import (
    detect_assortment_columns,
    detect_cluster_columns,
    detect_sales_columns,
    list_excel_sheets,
    read_excel,
)
from src.exporter import build_excel_export
from src.utils import clean_string_series
from src.validation import validate_assortment, validate_cluster, validate_sales

ROOT = Path(__file__).resolve().parent
FIXED_CLUSTER = ROOT / "data" / "config" / "Cluster.xlsx"
ASSORTMENT_TEMPLATE = ROOT / "data" / "templates" / "Anagrafica_Template.xlsx"
SALES_TEMPLATE = ROOT / "data" / "templates" / "Vendite_Template.xlsx"

st.set_page_config(
    page_title="Dimensionamento Assortimento",
    page_icon="📦",
    layout="wide",
    initial_sidebar_state="expanded",
)


@st.cache_data(show_spinner=False)
def load_excel_cached(content: bytes, sheet_name: str) -> pd.DataFrame:
    return read_excel(content, sheet_name=sheet_name)


@st.cache_data(show_spinner=False)
def load_path_cached(path: str, sheet_name: str) -> pd.DataFrame:
    return read_excel(path, sheet_name=sheet_name)


def pick_sheet(label: str, source, key: str, preferred: str | None = None) -> str:
    sheets = list_excel_sheets(source)
    index = sheets.index(preferred) if preferred in sheets else 0
    return st.selectbox(label, sheets, index=index, key=key)


def show_validation(title: str, validation) -> None:
    for item in validation.errors:
        st.error(f"{title}: {item}")
    for item in validation.warnings:
        st.warning(f"{title}: {item}")


def complete_mapping(
    title: str,
    mapping: dict[str, str | None],
    columns: list[str],
    labels: dict[str, str],
    required_keys: list[str],
) -> dict[str, str | None]:
    """Consente la mappatura manuale quando il riconoscimento automatico non basta."""
    result = mapping.copy()
    missing = [key for key in required_keys if not result.get(key)]
    if not missing:
        return result

    st.warning(f"{title}: alcune colonne non sono state riconosciute automaticamente.")
    with st.expander(f"Mappatura manuale colonne — {title}", expanded=True):
        options = ["— Non utilizzare —"] + columns
        for key in mapping:
            current = result.get(key)
            default_index = options.index(current) if current in options else 0
            selected = st.selectbox(
                labels.get(key, key),
                options,
                index=default_index,
                key=f"map_{title}_{key}",
            )
            result[key] = None if selected == options[0] else selected
    return result


def _unique_values(df: pd.DataFrame, column: str) -> list[str]:
    values = clean_string_series(df[column])
    return sorted(value for value in values.unique().tolist() if value)


def scope_controls(
    assortment_raw: pd.DataFrame,
    assortment_cols: dict[str, str | None],
) -> AssortmentScope:
    """Ricava il perimetro dal file caricato, senza fissare una sottofamiglia nel codice."""
    breve_col = assortment_cols["breve"]
    data = assortment_raw[
        clean_string_series(assortment_raw[breve_col]).str.upper().eq("N")
    ].copy()

    st.sidebar.subheader("Sottofamiglia da analizzare")

    reparto_col = assortment_cols["reparto"]
    gruppo_col = assortment_cols["gruppo"]
    famiglia_col = assortment_cols["famiglia"]

    reparti = _unique_values(data, reparto_col)
    if not reparti:
        st.error("Nessun reparto disponibile dopo il filtro Breve = N.")
        st.stop()
    reparto = st.sidebar.selectbox("Reparto", reparti, key="scope_reparto")
    data = data[clean_string_series(data[reparto_col]).eq(reparto)]

    gruppi = _unique_values(data, gruppo_col)
    if not gruppi:
        st.error("Nessun gruppo disponibile per il reparto selezionato.")
        st.stop()
    gruppo = st.sidebar.selectbox("Gruppo", gruppi, key="scope_gruppo")
    data = data[clean_string_series(data[gruppo_col]).eq(gruppo)]

    famiglie = _unique_values(data, famiglia_col)
    if not famiglie:
        st.error("Nessuna sottofamiglia disponibile per il gruppo selezionato.")
        st.stop()
    famiglia = st.sidebar.selectbox(
        "Famiglia / sottofamiglia", famiglie, key="scope_famiglia"
    )

    st.sidebar.caption(
        "Filtro assortimento fisso: Breve = N. La clusterizzazione viene letta "
        "dalla mappatura fissa inclusa nell'app."
    )
    return AssortmentScope(
        reparto=reparto,
        gruppo=gruppo,
        famiglia=famiglia,
        tipo="F",
    )


def parameter_controls() -> AnalysisParameters:
    st.sidebar.subheader("Parametri proposta")
    return AnalysisParameters(
        target_months=float(
            st.sidebar.number_input("Mesi di copertura", 0.5, 6.0, 2.0, 0.5)
        ),
        safety_stock=float(
            st.sidebar.number_input("Scorta di sicurezza", 0.0, 20.0, 1.0, 1.0)
        ),
        insertion_score=float(
            st.sidebar.slider("Punteggio minimo inserimento", 0, 100, 70)
        ),
        minimum_display=int(
            st.sidebar.number_input("Minimo espositivo", 1, 50, 1)
        ),
        round_to_pack=st.sidebar.checkbox("Arrotonda al collo", value=False),
        max_increase_pct=float(
            st.sidebar.slider("Aumento massimo %", 0, 300, 100)
        ),
        max_reduction_pct=float(
            st.sidebar.slider("Riduzione massima %", 0, 100, 50)
        ),
    )


st.title("Dimensionamento assortimento per cluster")
st.caption(
    "Carica ogni volta l'anagrafica della sottofamiglia e le vendite degli ultimi sei mesi. "
    "La mappatura Alto/Medio/Basso dei punti vendita rimane fissa nell'app."
)

if not FIXED_CLUSTER.exists():
    st.error("Mappatura cluster fissa non trovata nella configurazione dell'app.")
    st.stop()

fixed_cluster_sheets = list_excel_sheets(str(FIXED_CLUSTER))
fixed_cluster_sheet = "Q_Temp" if "Q_Temp" in fixed_cluster_sheets else fixed_cluster_sheets[0]
cluster_raw = load_path_cached(str(FIXED_CLUSTER), fixed_cluster_sheet)
cluster_cols = detect_cluster_columns(cluster_raw)
cluster_validation = validate_cluster(cluster_raw, cluster_cols)
if not cluster_validation.ok:
    show_validation("Configurazione cluster", cluster_validation)
    st.stop()

st.sidebar.subheader("File di input")
assortment_upload = st.sidebar.file_uploader(
    "1. Anagrafica assortimento (.xlsx/.xls)",
    type=["xlsx", "xls"],
    key="assortment_file",
)
sales_upload = st.sidebar.file_uploader(
    "2. Vendite ultimi 6 mesi (.xlsx/.xls)",
    type=["xlsx", "xls"],
    key="sales_file",
)
st.sidebar.success("Mappatura cluster caricata dalla configurazione fissa.")

with st.sidebar.expander("Modelli file", expanded=False):
    if ASSORTMENT_TEMPLATE.exists():
        st.download_button(
            "Scarica modello anagrafica",
            data=ASSORTMENT_TEMPLATE.read_bytes(),
            file_name="Anagrafica_Template.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    if SALES_TEMPLATE.exists():
        st.download_button(
            "Scarica modello vendite",
            data=SALES_TEMPLATE.read_bytes(),
            file_name="Vendite_Template.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

if not assortment_upload:
    st.info(
        "Carica l'anagrafica dell'assortimento dalla barra laterale. Il repository non contiene "
        "anagrafiche prodotto né file vendite reali."
    )
    st.stop()

with st.sidebar.expander("Fogli Excel", expanded=False):
    assortment_sheet = pick_sheet(
        "Foglio anagrafica",
        assortment_upload.getvalue(),
        "assortment_sheet",
        "Q_Temp",
    )
    sales_sheet = (
        pick_sheet(
            "Foglio vendite", sales_upload.getvalue(), "sales_sheet"
        )
        if sales_upload
        else None
    )

with st.spinner("Lettura dell'anagrafica..."):
    assortment_raw = load_excel_cached(
        assortment_upload.getvalue(), assortment_sheet
    )

assortment_labels = {
    "sku": "SKU/EAN",
    "id": "ID articolo",
    "description": "Descrizione prodotto",
    "reparto": "Reparto",
    "gruppo": "Gruppo",
    "famiglia": "Famiglia/sottofamiglia",
    "breve": "Breve",
    "galto": "GAlto",
    "gmedio": "GMedio",
    "gbasso": "GBasso",
    "pack": "Pezzi per collo",
    "volume": "Volume/ingombro",
    "brand": "Brand",
}

assortment_cols = complete_mapping(
    "Anagrafica",
    detect_assortment_columns(assortment_raw),
    list(map(str, assortment_raw.columns)),
    assortment_labels,
    [
        "id",
        "description",
        "reparto",
        "gruppo",
        "famiglia",
        "breve",
        "galto",
        "gmedio",
        "gbasso",
    ],
)

assortment_validation = validate_assortment(assortment_raw, assortment_cols)
show_validation("Anagrafica", assortment_validation)
if not assortment_validation.ok:
    st.stop()

scope = scope_controls(assortment_raw, assortment_cols)
parameters = parameter_controls()

assortment = prepare_assortment(assortment_raw, assortment_cols, scope)
cluster_mapping = prepare_cluster_mapping(cluster_raw, cluster_cols, scope)
base_summary = base_assortment_summary(assortment)

if assortment.empty:
    st.error("Nessuna referenza trovata nel perimetro selezionato con Breve = N.")
    st.stop()
if cluster_mapping.empty:
    st.error(
        "La mappatura fissa non contiene una clusterizzazione utilizzabile per il perimetro selezionato."
    )
    st.stop()

cluster_level = cluster_mapping.attrs.get("level_used", "Non determinato")
cluster_counts = cluster_mapping["cluster"].value_counts()
col1, col2, col3, col4 = st.columns(4)
col1.metric("Referenze analizzate", len(assortment))
col2.metric("Store Alto", int(cluster_counts.get("Alto", 0)))
col3.metric("Store Medio", int(cluster_counts.get("Medio", 0)))
col4.metric("Store Basso", int(cluster_counts.get("Basso", 0)))

st.caption(
    f"Perimetro: {scope.reparto} → {scope.gruppo} → {scope.famiglia}. "
    f"Livello cluster utilizzato: {cluster_level}."
)

main_tab, stores_tab, data_tab, proposal_tab = st.tabs(
    ["Assortimento attuale", "Cluster punti vendita", "Qualità dati", "Proposta"]
)

with main_tab:
    left, right = st.columns([1, 1.5])
    with left:
        st.subheader("Sintesi dell'assegnato")
        st.dataframe(base_summary, use_container_width=True, hide_index=True)
    with right:
        fig = px.bar(
            base_summary,
            x="Cluster",
            y="Referenze presenti",
            text_auto=True,
            title="Ampiezza assortimento per cluster",
        )
        fig.update_layout(showlegend=False)
        st.plotly_chart(fig, use_container_width=True)

    st.subheader("Referenze")
    search = st.text_input("Cerca descrizione, ID o SKU", key="search_assortment")
    visible = assortment.copy()
    if search:
        mask = visible[["article_id", "sku", "description"]].astype(str).apply(
            lambda col: col.str.contains(search, case=False, na=False)
        ).any(axis=1)
        visible = visible[mask]
    st.dataframe(
        visible[
            [
                "article_id",
                "sku",
                "description",
                "brand",
                "GAlto",
                "GMedio",
                "GBasso",
                "pack_size",
            ]
        ],
        use_container_width=True,
        hide_index=True,
        height=520,
    )

with stores_tab:
    st.subheader("Clusterizzazione fissa utilizzata")
    st.caption(f"Livello risolto automaticamente: {cluster_level}")
    st.dataframe(
        cluster_mapping[["store", "cluster"]].sort_values(["cluster", "store"]),
        use_container_width=True,
        hide_index=True,
    )

with data_tab:
    st.subheader("Controllo input")
    c1, c2 = st.columns(2)
    with c1:
        st.write("Colonne anagrafica")
        st.json(assortment_cols)
    with c2:
        st.write("Configurazione cluster fissa")
        st.write(f"File: `{FIXED_CLUSTER.relative_to(ROOT)}`")
        st.write(f"Foglio: `{fixed_cluster_sheet}`")
        st.write(f"Livello utilizzato: **{cluster_level}**")
    st.write("Righe anagrafica caricata:", len(assortment_raw))
    st.write("Righe dopo filtro Breve = N e perimetro:", len(assortment))
    st.write("Punti vendita mappati:", len(cluster_mapping))

with proposal_tab:
    if not sales_upload:
        st.info(
            "Carica anche il file delle vendite degli ultimi sei mesi per elaborare la proposta."
        )
    else:
        sales_raw = load_excel_cached(sales_upload.getvalue(), sales_sheet)
        sales_labels = {
            "article": "ID/SKU articolo",
            "store": "Punto vendita",
            "quantity": "Quantità venduta",
            "date": "Data vendita",
            "sales_value": "Venduto euro",
            "margin": "Margine euro",
        }
        sales_cols = complete_mapping(
            "Vendite",
            detect_sales_columns(sales_raw),
            list(map(str, sales_raw.columns)),
            sales_labels,
            ["article", "store", "quantity", "date"],
        )
        sales_validation = validate_sales(sales_raw, sales_cols)
        show_validation("Vendite", sales_validation)
        if not sales_validation.ok:
            st.stop()

        sales, sales_info = prepare_sales(
            sales_raw, sales_cols, cluster_mapping, months=6
        )
        if sales.empty:
            st.error(
                "Il file vendite non contiene righe utilizzabili nel periodo analizzato."
            )
            st.stop()

        metrics = calculate_metrics(assortment, sales, cluster_mapping, months=6)
        proposal = generate_proposal(metrics, parameters)
        p_summary = proposal_summary(proposal)

        st.caption(
            f"Periodo: {sales_info['start']} – {sales_info['end']}. "
            f"Store non mappati: {sales_info['unmapped_stores']}."
        )
        k1, k2, k3, k4 = st.columns(4)
        k1.metric(
            "Da inserire nel Basso",
            int((proposal["azione_Basso"] == "Inserire").sum()),
        )
        k2.metric(
            "Da aumentare",
            int((proposal["azione_Basso"] == "Aumentare").sum()),
        )
        k3.metric(
            "Da ridurre", int((proposal["azione_Basso"] == "Ridurre").sum())
        )
        delta = float(
            proposal["GBasso_proposto"].sum() - proposal["GBasso"].sum()
        )
        k4.metric("Delta pezzi Basso", f"{delta:+.0f}")

        actions = st.multiselect(
            "Azioni da visualizzare",
            sorted(proposal["azione_Basso"].unique()),
            default=sorted(proposal["azione_Basso"].unique()),
        )
        proposal_visible = proposal[proposal["azione_Basso"].isin(actions)]
        columns = [
            "article_id",
            "description",
            "GAlto",
            "GMedio",
            "GBasso",
            "GBasso_proposto",
            "delta_GBasso",
            "azione_Basso",
            "score_generale",
            "monthly_per_store_Alto",
            "monthly_per_store_Medio",
            "monthly_per_store_Basso",
            "estimated_monthly_Basso",
            "motivazione",
        ]
        st.dataframe(
            proposal_visible[columns].sort_values(
                ["azione_Basso", "score_generale"], ascending=[True, False]
            ),
            use_container_width=True,
            hide_index=True,
            height=600,
        )

        export = build_excel_export(base_summary, p_summary, proposal)
        st.download_button(
            "Esporta analisi Excel",
            data=export,
            file_name="Proposta_assortimento_cluster.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            type="primary",
        )
