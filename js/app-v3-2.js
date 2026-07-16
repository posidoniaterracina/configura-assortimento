(function () {
  "use strict";

  var APP_VERSION = "3.2";
  var REQUIRED_ASSORTMENT = ["Id", "Prodotto", "Reparto", "Famiglia", "SttFamiglia", "GAlto", "GMedio", "GBasso", "Fornitore", "Art_Pz", "Breve"];
  var REQUIRED_SALES = ["Fk_Prd", "Negozio", "Vnd"];
  var REQUIRED_CLUSTER = ["Descrizione", "Tipo", "Reparto", "Gruppo", "Famiglia", "Priorita"];
  var E, P;

  var SUPPLIER_COLUMNS = [
    { label: "Fornitore", help: "Nome del fornitore associato alle referenze raggruppate.", numeric: false },
    { label: "Vendite", help: "Totale dei pezzi venduti dalle referenze del fornitore nei cluster selezionati.", numeric: true },
    { label: "Ref. Alto", help: "Numero di referenze presenti nell'assortimento Alto, cioè con GAlto maggiore di zero.", numeric: true },
    { label: "Ref. Medio att.", help: "Numero di referenze attualmente presenti nel Medio, cioè con GMedio maggiore di zero.", numeric: true },
    { label: "Ref. Medio prop.", help: "Numero di referenze consigliate per il Medio dopo il ridimensionamento per metri e performance.", numeric: true },
    { label: "Ref. Basso att.", help: "Numero di referenze attualmente presenti nel Basso, cioè con GBasso maggiore di zero.", numeric: true },
    { label: "Ref. Basso prop.", help: "Numero di referenze consigliate per il Basso dopo il ridimensionamento per metri e performance.", numeric: true },
    { label: "Q.tà Alto", help: "Somma della giacenza teorica GAlto delle referenze del fornitore.", numeric: true },
    { label: "Q.tà Medio prop.", help: "Somma delle quantità teoriche consigliate per il cluster Medio.", numeric: true },
    { label: "Q.tà Basso prop.", help: "Somma delle quantità teoriche consigliate per il cluster Basso.", numeric: true },
    { label: "Scorta Medio", help: "Giorni di scorta stimati nel Medio in base alle quantità proposte e alla vendita media giornaliera.", numeric: true },
    { label: "Scorta Basso", help: "Giorni di scorta stimati nel Basso in base alle quantità proposte e alla vendita media giornaliera.", numeric: true }
  ];

  var DETAIL_COLUMNS = [
    { label: "Rank", help: "Posizione della referenza nella graduatoria di performance: 1 indica la migliore.", numeric: true },
    { label: "Fornitore", help: "Fornitore associato alla singola referenza.", numeric: false },
    { label: "ID", help: "Codice univoco della referenza, letto dalla colonna Id del file assortimento.", numeric: false },
    { label: "Prodotto", help: "Descrizione della referenza presente nel file assortimento.", numeric: false },
    { label: "Art_Pz", help: "Pezzi per imballo. Le quantità proposte rispettano multipli o sottomultipli di questo valore.", numeric: true },
    { label: "Vendite", help: "Totale dei pezzi venduti dalla referenza nei punti vendita dei cluster selezionati.", numeric: true },
    { label: "Vend./store/giorno", help: "Vendita media giornaliera per singolo punto vendita, calcolata sui cluster selezionati.", numeric: true },
    { label: "GAlto", help: "Giacenza teorica assegnata alla referenza nel cluster Alto; rappresenta il riferimento massimo.", numeric: true },
    { label: "GMedio att.", help: "Giacenza teorica attualmente assegnata alla referenza nel cluster Medio.", numeric: true },
    { label: "GMedio prop.", help: "Nuova giacenza teorica consigliata per il Medio dopo il dimensionamento.", numeric: true },
    { label: "Azione Medio", help: "Confronto tra GMedio attuale e proposto: confermare, inserire, aumentare, ridurre o eliminare.", numeric: false },
    { label: "GBasso att.", help: "Giacenza teorica attualmente assegnata alla referenza nel cluster Basso.", numeric: true },
    { label: "GBasso prop.", help: "Nuova giacenza teorica consigliata per il Basso dopo il dimensionamento.", numeric: true },
    { label: "Azione Basso", help: "Confronto tra GBasso attuale e proposto: confermare, inserire, aumentare, ridurre o eliminare.", numeric: false }
  ];
  var state = { clusterRows: [], assortmentRows: [], salesRows: [], assortment: [], scope: null, storeMapping: [], results: null, suppliers: [], quality: null, planogram: null, selectedClusters: ["Alto", "Medio", "Basso"], autoReferenceWeight: 50 };

  function $(id) { return document.getElementById(id); }
  function escapeHtml(value) { return String(value === null || value === undefined ? "" : value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }
  function fmt(value, digits) { var number=Number(value), decimals=Number.isInteger(digits)?digits:0; if(!Number.isFinite(number))return "–"; return number.toLocaleString("it-IT",{minimumFractionDigits:decimals,maximumFractionDigits:decimals}); }
  function pct(value) { return fmt(Number(value)*100,1)+"%"; }
  function days(value) { return Number.isFinite(Number(value))?fmt(value,1)+" gg":"–"; }
  function clearMessages(){ $("messages").innerHTML=""; }
  function message(text,type){ var div=document.createElement("div"); div.className="message "+(type||"info"); div.textContent=text; $("messages").appendChild(div); }
  function setStatus(text,type){ var node=$("clusterStatus"); node.textContent=text; node.className="status-pill"+(type?" "+type:""); }
  function ensureSpreadsheetLibrary(){ if(!window.XLSX)throw new Error("Libreria Excel non caricata. Aggiorna la pagina con Ctrl+F5 e verifica la connessione Internet."); }
  function readWorkbook(buffer){ ensureSpreadsheetLibrary(); return window.XLSX.read(buffer,{type:"array",cellDates:true}); }
  function rowsFrom(workbook,preferredSheet){ if(!workbook)return[]; var sheetName=workbook.SheetNames.indexOf(preferredSheet)>=0?preferredSheet:workbook.SheetNames[0]; if(!sheetName)return[]; return window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{defval:"",raw:true,blankrows:false}); }
  function missingColumns(rows,required){ var columns=rows.length?Object.keys(rows[0]):[]; return required.filter(function(name){return columns.indexOf(name)<0;}); }
  function loadFile(file,sheetName,required){ ensureSpreadsheetLibrary(); return file.arrayBuffer().then(function(buffer){ var rows=rowsFrom(readWorkbook(buffer),sheetName); if(!rows.length)throw new Error("Il file non contiene righe leggibili."); var missing=missingColumns(rows,required); if(missing.length)throw new Error("Colonne mancanti: "+missing.join(", ")); return rows; }); }

  function readMeters(showErrors){ var alto=Number($("metersAlto").value),medio=Number($("metersMedio").value),basso=Number($("metersBasso").value); var valid=Number.isFinite(alto)&&alto>0&&Number.isFinite(medio)&&medio>=0&&Number.isFinite(basso)&&basso>=0&&medio<=alto&&basso<=medio; if(!valid&&showErrors)message("Inserisci metri validi rispettando Basso ≤ Medio ≤ Alto e Alto maggiore di zero.","error"); return valid?{alto:alto,medio:medio,basso:basso}:null; }
  function readStockDays(showErrors){ var medio=Number($("stockDaysMedio").value),basso=Number($("stockDaysBasso").value); var valid=Number.isFinite(medio)&&medio>0&&Number.isFinite(basso)&&basso>0; if(!valid&&showErrors)message("Inserisci giorni di scorta maggiori di zero per Medio e Basso.","error"); return valid?{medio:medio,basso:basso}:null; }
  function currentCutMode(){ return $("cutModeManual").checked?"manual":"auto"; }
  function currentReferenceWeight(){ return currentCutMode()==="manual"?Number($("referenceWeight").value):state.autoReferenceWeight; }

  function updateWeightLabels(weight){ var safe=Math.max(0,Math.min(100,Math.round(Number(weight)||0))); $("referenceWeightLabel").textContent=safe+"%"; $("quantityWeightLabel").textContent=(100-safe)+"%"; }
  function updateWeightMode(){ var manual=currentCutMode()==="manual"; $("referenceWeight").disabled=!manual; $("weightPanel").classList.toggle("is-auto",!manual); if(manual){ updateWeightLabels($("referenceWeight").value); $("autoWeightInfo").textContent="Modalità manuale: sposta il cursore per scegliere come distribuire il taglio."; } else { $("referenceWeight").value=String(state.autoReferenceWeight); updateWeightLabels(state.autoReferenceWeight); updateAutomaticPreview(); } updateReady(); }

  function selectedClusterValues(){ return Array.prototype.slice.call(document.querySelectorAll(".cluster-option:checked")).map(function(input){return input.value;}); }
  function updateClusterSelection(changed){ var all=$("clusterAll"),options=Array.prototype.slice.call(document.querySelectorAll(".cluster-option")); if(changed===all)options.forEach(function(option){option.checked=all.checked;}); else all.checked=options.every(function(option){return option.checked;}); var selected=selectedClusterValues(); if(!selected.length){ var fallback=(changed&&changed.classList.contains("cluster-option"))?changed:options[0]; fallback.checked=true; selected=selectedClusterValues(); all.checked=selected.length===options.length; }
    state.selectedClusters=E.normalizeClusterSelection(selected); $("clusterSelectLabel").textContent=state.selectedClusters.length===3?"Tutti i cluster":state.selectedClusters.join(", "); $("clusterChips").innerHTML=state.selectedClusters.map(function(cluster){return '<span class="chip">'+escapeHtml(cluster)+"</span>";}).join(""); updateAutomaticPreview(); updateReady(); }
  function toggleClusterMenu(force){ var menu=$("clusterMenu"),button=$("clusterMenuButton"); var open=typeof force==="boolean"?force:menu.classList.contains("hidden"); menu.classList.toggle("hidden",!open); button.setAttribute("aria-expanded",open?"true":"false"); }

  function canPreview(){ return state.clusterRows.length&&state.assortmentRows.length&&state.salesRows.length&&state.selectedClusters.length; }
  function buildPerformancePreview(){ state.assortment=E.prepareAssortment(state.assortmentRows); if(!state.assortment.length)throw new Error("Nessuna referenza valida con Breve = N e GAlto maggiore di zero."); state.scope=E.detectScope(state.assortment); if(state.scope.multiple)throw new Error("Il file assortimento deve contenere una sola sottofamiglia per volta."); state.storeMapping=E.prepareClusterMapping(state.clusterRows,state.scope); if(!state.storeMapping.length)throw new Error("La sottofamiglia non è stata trovata nel file fisso dei cluster."); return E.calculatePerformance(state.assortment,state.salesRows,state.storeMapping,state.selectedClusters); }
  function updateAutomaticPreview(){ if(currentCutMode()!=="auto")return; if(!canPreview()){ state.autoReferenceWeight=50; $("referenceWeight").value="50"; updateWeightLabels(50); $("autoWeightInfo").textContent="Carica i file per calcolare il suggerimento automatico."; return; }
    try{ var performance=buildPerformancePreview(); var weights=E.determineWeights("auto",50,performance.metrics.gini); state.autoReferenceWeight=Math.round(weights.referenceWeight*100); $("referenceWeight").value=String(state.autoReferenceWeight); updateWeightLabels(state.autoReferenceWeight); $("autoWeightInfo").innerHTML="Gini <b>"+fmt(performance.metrics.gini,3)+"</b> ("+escapeHtml(E.classifyConcentration(performance.metrics.gini))+ "): taglio referenze <b>"+state.autoReferenceWeight+"%</b>, quantità <b>"+(100-state.autoReferenceWeight)+"%</b>."; }
    catch(error){ $("autoWeightInfo").textContent="Il suggerimento verrà calcolato quando i dati saranno validi."; }
  }

  function updateRatios(){ var meters=readMeters(false); if(!meters)$("ratioPreview").textContent="Inserisci i metri rispettando Basso ≤ Medio ≤ Alto."; else $("ratioPreview").innerHTML="Alto <b>100%</b> · Medio <b>"+pct(meters.medio/meters.alto)+"</b> · Basso <b>"+pct(meters.basso/meters.alto)+"</b>"; updateReady(); }
  function updateReady(){ var ready=Boolean(window.XLSX&&state.clusterRows.length&&state.assortmentRows.length&&state.salesRows.length&&readMeters(false)&&readStockDays(false)&&state.selectedClusters.length); $("analyzeButton").disabled=!ready; }


  function renderColumnHeader(column) {
    var numericClass = column.numeric ? "num" : "";
    return '<th class="' + numericClass + '"><span class="column-header-label">' + escapeHtml(column.label) + '</span>' +
      '<button type="button" class="column-help" data-help="' + escapeHtml(column.help) + '" aria-label="Spiegazione colonna ' + escapeHtml(column.label) + '">i</button></th>';
  }

  var activeTooltipTarget = null;
  function showColumnTooltip(target) {
    var tooltip = $("columnTooltip");
    if (!tooltip || !target) return;
    activeTooltipTarget = target;
    tooltip.textContent = target.getAttribute("data-help") || "";
    tooltip.classList.remove("hidden");
    tooltip.style.left = "0px";
    tooltip.style.top = "0px";
    var targetRect = target.getBoundingClientRect();
    var tooltipRect = tooltip.getBoundingClientRect();
    var left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipRect.width - 8));
    var top = targetRect.bottom + 9;
    if (top + tooltipRect.height > window.innerHeight - 8) top = Math.max(8, targetRect.top - tooltipRect.height - 9);
    tooltip.style.left = Math.round(left) + "px";
    tooltip.style.top = Math.round(top) + "px";
    target.setAttribute("aria-describedby", "columnTooltip");
  }

  function hideColumnTooltip() {
    var tooltip = $("columnTooltip");
    if (activeTooltipTarget) activeTooltipTarget.removeAttribute("aria-describedby");
    activeTooltipTarget = null;
    if (tooltip) tooltip.classList.add("hidden");
  }

  function bindColumnTooltips() {
    document.addEventListener("mouseover", function (event) {
      var target = event.target.closest ? event.target.closest(".column-help") : null;
      if (target) showColumnTooltip(target);
    });
    document.addEventListener("mouseout", function (event) {
      var target = event.target.closest ? event.target.closest(".column-help") : null;
      if (target && document.activeElement !== target) hideColumnTooltip();
    });
    document.addEventListener("focusin", function (event) {
      if (event.target.classList && event.target.classList.contains("column-help")) showColumnTooltip(event.target);
    });
    document.addEventListener("focusout", function (event) {
      if (event.target.classList && event.target.classList.contains("column-help")) hideColumnTooltip();
    });
    document.addEventListener("click", function (event) {
      var target = event.target.closest ? event.target.closest(".column-help") : null;
      if (target) {
        event.stopPropagation();
        showColumnTooltip(target);
      } else hideColumnTooltip();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        hideColumnTooltip();
        if (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains("column-help")) document.activeElement.blur();
      }
    });
    window.addEventListener("resize", hideColumnTooltip);
    window.addEventListener("scroll", hideColumnTooltip, true);
  }

  function badge(actionText){ var cssClass=actionText==="Eliminare"?"remove":actionText==="Ridurre"?"reduce":(actionText==="Aumentare"||actionText==="Inserire")?"increase":"keep"; return '<span class="badge '+cssClass+'">'+escapeHtml(actionText)+"</span>"; }
  function renderKpis(results){ var rows=results.rows,highReferences=rows.filter(function(row){return row.GAlto>0;}).length,highQuantity=rows.reduce(function(sum,row){return sum+row.GAlto;},0); var items=[["Alto",highReferences+" ref.",fmt(highQuantity)+" pezzi · 100%"],["Medio proposto",results.medium.proposedReferences+" ref.",fmt(results.medium.proposedUnits)+" / "+fmt(results.medium.quantityCapacity)+" pezzi"],["Basso proposto",results.low.proposedReferences+" ref.",fmt(results.low.proposedUnits)+" / "+fmt(results.low.quantityCapacity)+" pezzi"],["Gini vendite",fmt(results.metrics.gini,3),results.concentration],["Peso referenze",pct(results.weights.referenceWeight),"quantità "+pct(results.weights.quantityWeight)],["Scorta stimata",days(results.medium.achievedDays),"Medio · Basso "+days(results.low.achievedDays)]]; $("kpis").innerHTML=items.map(function(item){return '<div class="kpi"><span class="kpi-label">'+escapeHtml(item[0])+'</span><span class="kpi-value">'+escapeHtml(item[1])+'</span><span class="kpi-help">'+escapeHtml(item[2])+"</span></div>";}).join(""); }
  function renderSupplierTable(){ var html="<thead><tr>"+SUPPLIER_COLUMNS.map(renderColumnHeader).join("")+"</tr></thead><tbody>"; state.suppliers.forEach(function(row){ html+="<tr><td>"+escapeHtml(row.Fornitore)+"</td>"+'<td class="num">'+fmt(row.Vendite)+"</td>"+'<td class="num">'+fmt(row.Ref_Alto)+"</td>"+'<td class="num">'+fmt(row.Ref_Medio_Attuali)+"</td>"+'<td class="num">'+fmt(row.Ref_Medio_Proposte)+"</td>"+'<td class="num">'+fmt(row.Ref_Basso_Attuali)+"</td>"+'<td class="num">'+fmt(row.Ref_Basso_Proposte)+"</td>"+'<td class="num">'+fmt(row.Qta_Alto)+"</td>"+'<td class="num">'+fmt(row.Qta_Medio_Proposta)+"</td>"+'<td class="num">'+fmt(row.Qta_Basso_Proposta)+"</td>"+'<td class="num">'+days(row.Giorni_Scorta_Medio)+"</td>"+'<td class="num">'+days(row.Giorni_Scorta_Basso)+"</td></tr>"; }); $("supplierTable").innerHTML=html+"</tbody>"; }
  function renderDetailTable(){ if(!state.results)return; var query=String($("searchInput").value||"").trim().toLowerCase(); var rows=state.results.rows.filter(function(row){return !query||[row.article_id,row.sku,row.description,row.supplier].join(" ").toLowerCase().indexOf(query)>=0;}); var html="<thead><tr>"+DETAIL_COLUMNS.map(renderColumnHeader).join("")+"</tr></thead><tbody>"; rows.forEach(function(row){html+="<tr>"+'<td class="num">'+fmt(row.performance_rank)+"</td><td>"+escapeHtml(row.supplier)+"</td><td>"+escapeHtml(row.article_id)+"</td><td>"+escapeHtml(row.description)+"</td>"+'<td class="num">'+fmt(row.pack_size)+"</td>"+'<td class="num">'+fmt(row.sales_selected)+"</td>"+'<td class="num">'+fmt(row.sales_per_store_day,4)+"</td>"+'<td class="num">'+fmt(row.GAlto)+"</td>"+'<td class="num">'+fmt(row.GMedio)+"</td>"+'<td class="num">'+fmt(row.GMedio_proposto)+"</td><td>"+badge(row.azione_Medio)+"</td>"+'<td class="num">'+fmt(row.GBasso)+"</td>"+'<td class="num">'+fmt(row.GBasso_proposto)+"</td><td>"+badge(row.azione_Basso)+"</td></tr>";}); $("detailTable").innerHTML=html+"</tbody>"; }
  function renderQuality(){ var q=state.quality,r=state.results; var items=[["Versione",APP_VERSION],["Righe vendite lette",fmt(q.inputRows)],["Righe usate",fmt(q.usedRows)],["Punti vendita considerati",fmt(q.selectedStoreCount)],["Righe online/totali ignorate",fmt(q.ignoredOnlineOrTotals)],["Articoli non trovati",fmt(q.articlesNotMatched)],["Vendite non numeriche",fmt(q.invalidSales)],["Punti vendita non mappati",q.storesNotMappedNames.length?q.storesNotMappedNames.join(", "):"Nessuno"],["Livello cluster",state.storeMapping.level_used],["Periodo vendite assunto",fmt(E.SALES_PERIOD_DAYS,1)+" giorni"],["Gini",fmt(r.metrics.gini,4)+" · "+r.concentration],["Coefficiente di variazione",fmt(r.metrics.cv,4)],["Modalità taglio",r.weights.mode==="auto"?"Automatica":"Manuale"],["Peso taglio referenze",pct(r.weights.referenceWeight)],["Peso taglio quantità",pct(r.weights.quantityWeight)],["Medio: quota referenze",pct(r.medium.referenceShare)],["Medio: quota quantità",pct(r.medium.quantityShare)],["Basso: quota referenze",pct(r.low.referenceShare)],["Basso: quota quantità",pct(r.low.quantityShare)]]; $("qualityContent").innerHTML='<div class="quality-grid">'+items.map(function(item){return '<div class="quality-item"><b>'+escapeHtml(item[0])+"</b><span>"+escapeHtml(item[1])+"</span></div>";}).join("")+"</div>"; }

  function planogramLevelLabel(level){ if(level==="medio")return "Medio proposto"; if(level==="basso")return "Basso proposto"; return "Alto"; }
  function planogramModeLabel(mode){ return mode==="characteristic"?"una gradazione per ripiano":"un fornitore per ripiano"; }

  function bindPlanogramDrag(){
    var dragged=null;
    document.querySelectorAll(".planogram-card").forEach(function(card){
      card.addEventListener("dragstart",function(event){dragged=card;card.classList.add("dragging");if(event.dataTransfer){event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",card.getAttribute("data-article")||"");}});
      card.addEventListener("dragend",function(){card.classList.remove("dragging");dragged=null;});
    });
    document.querySelectorAll(".planogram-track").forEach(function(track){
      track.addEventListener("dragover",function(event){
        if(!dragged||dragged.parentElement!==track)return;
        event.preventDefault();
        var target=event.target.closest?event.target.closest(".planogram-card"):null;
        if(!target||target===dragged||target.parentElement!==track)return;
        var rect=target.getBoundingClientRect();
        var before=event.clientX<rect.left+(rect.width/2);
        track.insertBefore(dragged,before?target:target.nextSibling);
      });
      track.addEventListener("drop",function(event){if(dragged&&dragged.parentElement===track)event.preventDefault();});
    });
  }

  function renderPlanogram(){
    if(!state.results||!P)return;
    var level=$("planogramLevel").value;
    var mode=$("planogramMode").value;
    var layout=P.buildPlanogram(state.results.rows,{level:level,mode:mode});
    state.planogram=layout;
    var title=String($("planogramTitle").value||"Layout scaffale olio motore").trim()||"Layout scaffale olio motore";
    var store=String($("planogramStore").value||"").trim();
    var now=new Date().toLocaleString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
    $("planogramPrintTitle").textContent=title;
    $("planogramPrintMeta").textContent=(store?"Punto vendita: "+store+" · ":"")+"Assortimento: "+planogramLevelLabel(level)+" · Criterio: "+planogramModeLabel(mode)+" · Generato il "+now;
    $("planogramSummary").innerHTML="<b>"+fmt(layout.groups.length)+" ripiani</b> · "+fmt(layout.totalReferences)+" referenze · "+fmt(layout.totalQuantity)+" pezzi complessivi";
    $("planogramWarnings").innerHTML=layout.unrecognizedCount?'<div class="message warning">'+fmt(layout.unrecognizedCount)+' referenze non hanno una gradazione riconoscibile nella descrizione e sono state posizionate in coda.</div>':'<div class="message info">Tutte le referenze hanno una gradazione riconosciuta.</div>';
    if(!layout.groups.length){$("planogramShelves").innerHTML='<div class="planogram-empty">Nessuna referenza presente nell’assortimento selezionato.</div>';return;}
    $("planogramShelves").innerHTML=layout.groups.map(function(group,index){
      var cards=group.rows.map(function(row){
        var grade=row.layout_grade.recognized?row.layout_grade.label:"Non riconosciuta";
        var topLabel=mode==="supplier"?grade:(row.supplier||"Senza fornitore");
        var secondary=mode==="supplier"?(row.supplier||"Senza fornitore"):grade;
        return '<article class="planogram-card" draggable="true" data-article="'+escapeHtml(row.article_id)+'">'+
          '<div class="planogram-card-top"><span class="planogram-tag">'+escapeHtml(topLabel)+'</span><span class="planogram-rank">#'+fmt(row.performance_rank)+'</span></div>'+
          '<h3>'+escapeHtml(row.description)+'</h3>'+
          '<p class="planogram-card-secondary">'+escapeHtml(secondary)+'</p>'+
          '<div class="planogram-card-bottom"><span>ID '+escapeHtml(row.article_id)+'</span><b>Q.tà '+fmt(row.layout_quantity)+'</b></div>'+
        '</article>';
      }).join("");
      return '<section class="planogram-shelf">'+
        '<header class="planogram-shelf-head"><div><span>Ripiano '+(index+1)+'</span><h3>'+escapeHtml(group.title)+'</h3></div><div>'+fmt(group.rows.length)+' ref. · '+fmt(group.totalQuantity)+' pz</div></header>'+
        '<div class="planogram-track" aria-label="Ripiano '+(index+1)+' '+escapeHtml(group.title)+'">'+cards+'</div>'+
      '</section>';
    }).join("");
    bindPlanogramDrag();
  }

  function printPlanogram(){ if(!state.results)return;renderPlanogram();window.print(); }

  function analyze(){ clearMessages(); try{ var meters=readMeters(true),stock=readStockDays(true); if(!meters||!stock)return; var performance=buildPerformancePreview(); if(!performance.metrics.selectedStoreCount){message("Nessun punto vendita appartiene ai cluster selezionati.","error");return;} state.quality=performance.quality; state.results=E.buildProposals(performance.rows,meters,{cutMode:currentCutMode(),manualReferenceWeight:currentReferenceWeight(),stockDaysMedio:stock.medio,stockDaysBasso:stock.basso},performance.metrics); state.suppliers=E.supplierSummary(state.results.rows); if(state.results.weights.mode==="auto"){state.autoReferenceWeight=Math.round(state.results.weights.referenceWeight*100);$("referenceWeight").value=String(state.autoReferenceWeight);updateWeightLabels(state.autoReferenceWeight);updateAutomaticPreview();}
      $("scopeBanner").innerHTML="<b>"+escapeHtml(state.scope.reparto)+"</b> → "+escapeHtml(state.scope.gruppo)+" → <b>"+escapeHtml(state.scope.famiglia)+"</b> · vendite: "+escapeHtml(state.selectedClusters.join(", "));
      $("methodBanner").innerHTML="Metri fissi: Alto <b>"+fmt(meters.alto,2)+" m</b>, Medio <b>"+fmt(meters.medio,2)+" m</b>, Basso <b>"+fmt(meters.basso,2)+" m</b>. Capacità equivalente Medio <b>"+fmt(state.results.medium.quantityCapacity)+" pezzi</b>, Basso <b>"+fmt(state.results.low.quantityCapacity)+" pezzi</b>.";
      renderKpis(state.results);renderSupplierTable();renderDetailTable();renderQuality();renderPlanogram();$("welcome").classList.add("hidden");$("results").classList.remove("hidden"); if(performance.metrics.totalSales<=0)message("Non risultano vendite positive nei cluster selezionati: la graduatoria usa GAlto come criterio secondario.","warning"); }
    catch(error){console.error(error);message("Analisi non riuscita: "+error.message,"error");} }

  function exportExcel(){ if(!state.results)return; try{ensureSpreadsheetLibrary(); var detail=state.results.rows.map(function(row){return{Rank:row.performance_rank,Fornitore:row.supplier,Id:row.article_id,SkuCodice:row.sku,Prodotto:row.description,Art_Pz:row.pack_size,Vendite_Cluster_Selezionati:row.sales_selected,Vendita_Media_Giornaliera_Per_Store:row.sales_per_store_day,GAlto:row.GAlto,GMedio_Attuale:row.GMedio,GMedio_Proposto:row.GMedio_proposto,Giorni_Scorta_Medio_Stimati:row.giorni_Medio_raggiunti,Azione_Medio:row.azione_Medio,GBasso_Attuale:row.GBasso,GBasso_Proposto:row.GBasso_proposto,Giorni_Scorta_Basso_Stimati:row.giorni_Basso_raggiunti,Azione_Basso:row.azione_Basso};}); var meters=readMeters(false),stock=readStockDays(false),r=state.results; var parameters=[{Parametro:"Versione",Valore:APP_VERSION},{Parametro:"Metri Alto",Valore:meters.alto},{Parametro:"Metri Medio",Valore:meters.medio},{Parametro:"Metri Basso",Valore:meters.basso},{Parametro:"% Medio su Alto",Valore:meters.medio/meters.alto},{Parametro:"% Basso su Alto",Valore:meters.basso/meters.alto},{Parametro:"Cluster vendite",Valore:state.selectedClusters.join(", ")},{Parametro:"Modalità taglio",Valore:r.weights.mode==="auto"?"Automatica su Gini":"Manuale"},{Parametro:"Gini",Valore:r.metrics.gini},{Parametro:"Coefficiente di variazione",Valore:r.metrics.cv},{Parametro:"Peso taglio referenze",Valore:r.weights.referenceWeight},{Parametro:"Peso taglio quantità",Valore:r.weights.quantityWeight},{Parametro:"Giorni scorta Medio",Valore:stock.medio},{Parametro:"Giorni scorta Basso",Valore:stock.basso},{Parametro:"Periodo vendite giorni",Valore:E.SALES_PERIOD_DAYS},{Parametro:"Filtro",Valore:"Breve = N"},{Parametro:"Livello cluster",Valore:state.storeMapping.level_used}]; var workbook=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(workbook,window.XLSX.utils.json_to_sheet(state.suppliers),"Riepilogo Fornitori");window.XLSX.utils.book_append_sheet(workbook,window.XLSX.utils.json_to_sheet(detail),"Dettaglio");window.XLSX.utils.book_append_sheet(workbook,window.XLSX.utils.json_to_sheet(parameters),"Parametri");window.XLSX.writeFile(workbook,"Dimensionamento_Assortimento.xlsx");}catch(error){message("Esportazione non riuscita: "+error.message,"error");} }

  function setupTabs(){ document.querySelectorAll(".tab").forEach(function(button){button.addEventListener("click",function(){document.querySelectorAll(".tab").forEach(function(tab){tab.classList.remove("active");});document.querySelectorAll(".tab-panel").forEach(function(panel){panel.classList.remove("active");});button.classList.add("active");$(button.dataset.tab).classList.add("active");});}); }
  function bindFileInputs(){ $("assortmentFile").addEventListener("change",function(){clearMessages();var file=this.files[0];$("assortmentName").textContent=file?file.name:"Nessun file selezionato";state.assortmentRows=[];if(!file){updateAutomaticPreview();return updateReady();}try{loadFile(file,"Q_Temp",REQUIRED_ASSORTMENT).then(function(rows){state.assortmentRows=rows;message("File assortimento caricato: "+rows.length+" righe.","info");updateAutomaticPreview();updateReady();}).catch(function(error){message("Assortimento non valido. "+error.message,"error");updateReady();});}catch(error){message(error.message,"error");updateReady();}});
    $("salesFile").addEventListener("change",function(){clearMessages();var file=this.files[0];$("salesName").textContent=file?file.name:"Nessun file selezionato";state.salesRows=[];if(!file){updateAutomaticPreview();return updateReady();}try{loadFile(file,"Q_TempPV",REQUIRED_SALES).then(function(rows){state.salesRows=rows;message("File vendite caricato: "+rows.length+" righe.","info");updateAutomaticPreview();updateReady();}).catch(function(error){message("Vendite non valide. "+error.message,"error");updateReady();});}catch(error){message(error.message,"error");updateReady();}}); }
  function loadClusters(){ if(!window.XLSX){setStatus("Libreria Excel non disponibile","error");message("La libreria Excel non è stata caricata. Aggiorna la pagina con Ctrl+F5.","error");return;} var url=new URL("data/config/Cluster.xlsx?v=3.2.0",document.baseURI).toString();fetch(url,{cache:"no-store"}).then(function(response){if(!response.ok)throw new Error("HTTP "+response.status);return response.arrayBuffer();}).then(function(buffer){state.clusterRows=rowsFrom(readWorkbook(buffer),"Q_Temp");var missing=missingColumns(state.clusterRows,REQUIRED_CLUSTER);if(missing.length)throw new Error("colonne mancanti: "+missing.join(", "));setStatus("Cluster disponibili","ok");updateAutomaticPreview();updateReady();}).catch(function(error){setStatus("Errore cluster","error");message("Impossibile leggere data/config/Cluster.xlsx: "+error.message,"error");}); }
  function bindControls(){ ["metersAlto","metersMedio","metersBasso"].forEach(function(id){$(id).addEventListener("input",updateRatios);});["stockDaysMedio","stockDaysBasso"].forEach(function(id){$(id).addEventListener("input",updateReady);});$("cutModeAuto").addEventListener("change",updateWeightMode);$("cutModeManual").addEventListener("change",updateWeightMode);$("referenceWeight").addEventListener("input",function(){updateWeightLabels(this.value);updateReady();});$("clusterMenuButton").addEventListener("click",function(event){event.stopPropagation();toggleClusterMenu();});$("clusterMenu").addEventListener("click",function(event){event.stopPropagation();});document.addEventListener("click",function(){toggleClusterMenu(false);});$("clusterAll").addEventListener("change",function(){updateClusterSelection(this);});document.querySelectorAll(".cluster-option").forEach(function(input){input.addEventListener("change",function(){updateClusterSelection(this);});});$("analyzeButton").addEventListener("click",analyze);$("exportButton").addEventListener("click",exportExcel);$("searchInput").addEventListener("input",renderDetailTable);$("generatePlanogramButton").addEventListener("click",renderPlanogram);$("printPlanogramButton").addEventListener("click",printPlanogram);$("planogramLevel").addEventListener("change",renderPlanogram);$("planogramMode").addEventListener("change",renderPlanogram);$("planogramTitle").addEventListener("change",renderPlanogram);$("planogramStore").addEventListener("change",renderPlanogram); }

  function init(){ E=window.AssortmentEngineV3;P=window.PlanogramEngineV1;if(!E||!P){setStatus("Errore motore","error");message("Il motore di calcolo o il modulo layout non è stato caricato. Aggiorna la pagina con Ctrl+F5.","error");return;}bindControls();bindColumnTooltips();setupTabs();bindFileInputs();updateClusterSelection($("clusterAll"));updateRatios();updateWeightMode();loadClusters(); }
  window.addEventListener("error",function(event){if($("messages"))message("Errore applicazione: "+(event.message||"errore sconosciuto"),"error");});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
