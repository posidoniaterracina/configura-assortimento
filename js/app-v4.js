(function () {
  "use strict";

  var APP_VERSION = "4.0.2";
  var REQUIRED_ASSORTMENT = ["Id", "Prodotto", "Reparto", "Famiglia", "SttFamiglia", "GAlto", "GMedio", "GBasso", "Fornitore", "Linea", "Brand", "Caratteristica", "Art_Pz", "Breve"];
  var REQUIRED_SALES = ["Fk_Prd", "Negozio", "Vnd"];
  var REQUIRED_CLUSTER = ["Descrizione", "Tipo", "Reparto", "Gruppo", "Famiglia", "Priorita"];
  var E, P, A;

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

  var PROPOSAL_COLUMNS = [
    { label: "Rank", help: "Posizione dell'articolo dopo l'applicazione delle priorità di rappresentatività, vendite e margine.", numeric: true },
    { label: "Presenza proposta", help: "Tre indicatori: verde Alto, giallo Medio e rosso Basso. Il pallino è acceso quando l'articolo è presente nel nuovo assortimento del livello.", numeric: false },
    { label: "ID / SKU", help: "Codice articolo e SKU letti dal file assortimento.", numeric: false },
    { label: "Prodotto", help: "Descrizione del prodotto utilizzata anche per la ricerca delle parole chiave.", numeric: false },
    { label: "Fornitore", help: "Fornitore associato all'articolo.", numeric: false },
    { label: "Attributo 1", help: "Primo cluster generato dalle parole chiave configurate.", numeric: false },
    { label: "Attributo 2", help: "Secondo cluster generato dalle parole chiave configurate.", numeric: false },
    { label: "Attributo 3", help: "Terzo cluster generato dalle parole chiave configurate.", numeric: false },
    { label: "Vendite", help: "Pezzi venduti nei punti vendita appartenenti ai cluster selezionati.", numeric: true },
    { label: "Margine %", help: "Margine percentuale calcolato sul PVP netto IVA: (PVP netto - costo di acquisto) / PVP netto.", numeric: true },
    { label: "Margine totale", help: "Margine unitario moltiplicato per le quantità vendute considerate nell'analisi.", numeric: true },
    { label: "Q.tà A / M / B", help: "Quantità previste rispettivamente per Alto, Medio proposto e Basso proposto.", numeric: false }
  ];
  var state = { clusterRows: [], assortmentRows: [], salesRows: [], assortmentColumns: [], assortment: [], scope: null, storeMapping: [], results: null, suppliers: [], quality: null, planogram: null, attributeAnalyses: [], representationWarnings: [], selectedClusters: ["Alto", "Medio", "Basso"], autoReferenceWeight: 50 };

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

  function readAttributeConfigs(){
    var configs=[];
    for(var i=1;i<=3;i+=1){
      var enabled=$("attributeEnabled"+i).checked;
      var name=String($("attributeName"+i).value||("Attributo "+i)).trim()||("Attributo "+i);
      var rules=A.parseRules($("attributeRules"+i).value);
      configs.push({enabled:enabled&&rules.length>0,name:name,rules:rules,representationMode:$("attributeMode"+i).value,representationValue:Number($("attributeValue"+i).value)||100});
    }
    return configs;
  }

  function attributeLabels(){
    var configs=readAttributeConfigs(),labels={};
    configs.forEach(function(config,index){labels["attribute_"+(index+1)]=config.name;});
    return labels;
  }

  function currentDefaultVatRate(){ var raw=String($("defaultVatRate").value||"").trim(); var value=raw===""?22:Number(raw); return Number.isFinite(value)?Math.max(0,Math.min(100,value)):22; }
  function marginOptions(){ return { salePriceColumn:$("salePriceColumn").value||"", costColumn:$("costColumn").value||"", vatColumn:$("vatColumn").value||"", defaultVatRate:currentDefaultVatRate(), attributeConfigs:readAttributeConfigs() }; }

  function populateColumnSelectors(rows){
    var columns=rows.length?Object.keys(rows[0]):[];
    state.assortmentColumns=columns;
    function fill(id,candidates,emptyLabel){
      var select=$(id),current=select.value;
      select.innerHTML='<option value="">'+escapeHtml(emptyLabel||"Non calcolare")+'</option>'+columns.map(function(column){return '<option value="'+escapeHtml(column)+'">'+escapeHtml(column)+'</option>';}).join("");
      var preferred=current&&columns.indexOf(current)>=0?current:"";
      if(!preferred){ for(var i=0;i<candidates.length;i+=1){if(columns.indexOf(candidates[i])>=0){preferred=candidates[i];break;}} }
      select.value=preferred;
    }
    fill("salePriceColumn",["Pvp","PrezzoVendita","Prezzo_Vendita","Prezzo"]);
    fill("costColumn",["PrzUnipam","ListinoUno","CostoAcquisto","Costo_Acquisto","Costo"]);
    fill("vatColumn",["IVA","Iva","Aliquota IVA","Aliquota_IVA","AliquotaIva","Vat","VAT"],"Usa aliquota predefinita");
  }

  function updateAttributeControlState(){
    for(var i=1;i<=3;i+=1){
      var enabled=$("attributeEnabled"+i).checked;
      ["attributeName"+i,"attributeRules"+i,"attributeMode"+i,"attributeValue"+i].forEach(function(id){$(id).disabled=!enabled;});
      $("attributeCard"+i).classList.toggle("is-disabled",!enabled);
    }
    updatePlanogramAttributeOptions();
    updateReady();
  }

  function updateWeightLabels(weight){ var safe=Math.max(0,Math.min(100,Math.round(Number(weight)||0))); $("referenceWeightLabel").textContent=safe+"%"; $("quantityWeightLabel").textContent=(100-safe)+"%"; }
  function updateWeightMode(){ var manual=currentCutMode()==="manual"; $("referenceWeight").disabled=!manual; $("weightPanel").classList.toggle("is-auto",!manual); if(manual){ updateWeightLabels($("referenceWeight").value); $("autoWeightInfo").textContent="Modalità manuale: sposta il cursore per scegliere come distribuire il taglio."; } else { $("referenceWeight").value=String(state.autoReferenceWeight); updateWeightLabels(state.autoReferenceWeight); updateAutomaticPreview(); } updateReady(); }

  function selectedClusterValues(){ return Array.prototype.slice.call(document.querySelectorAll(".cluster-option:checked")).map(function(input){return input.value;}); }
  function updateClusterSelection(changed){ var all=$("clusterAll"),options=Array.prototype.slice.call(document.querySelectorAll(".cluster-option")); if(changed===all)options.forEach(function(option){option.checked=all.checked;}); else all.checked=options.every(function(option){return option.checked;}); var selected=selectedClusterValues(); if(!selected.length){ var fallback=(changed&&changed.classList.contains("cluster-option"))?changed:options[0]; fallback.checked=true; selected=selectedClusterValues(); all.checked=selected.length===options.length; }
    state.selectedClusters=E.normalizeClusterSelection(selected); $("clusterSelectLabel").textContent=state.selectedClusters.length===3?"Tutti i cluster":state.selectedClusters.join(", "); $("clusterChips").innerHTML=state.selectedClusters.map(function(cluster){return '<span class="chip">'+escapeHtml(cluster)+"</span>";}).join(""); updateAutomaticPreview(); updateReady(); }
  function toggleClusterMenu(force){ var menu=$("clusterMenu"),button=$("clusterMenuButton"); var open=typeof force==="boolean"?force:menu.classList.contains("hidden"); menu.classList.toggle("hidden",!open); button.setAttribute("aria-expanded",open?"true":"false"); }

  function canPreview(){ return state.clusterRows.length&&state.assortmentRows.length&&state.salesRows.length&&state.selectedClusters.length; }
  function buildPerformancePreview(){
    state.assortment=E.prepareAssortment(state.assortmentRows);
    if(!state.assortment.length)throw new Error("Nessuna referenza valida con Breve = N e GAlto maggiore di zero.");
    state.assortment=A.enrichAssortment(state.assortment,state.assortmentRows,marginOptions());
    state.scope=E.detectScope(state.assortment);
    if(state.scope.multiple)throw new Error("Il file assortimento deve contenere una sola sottofamiglia per volta.");
    state.storeMapping=E.prepareClusterMapping(state.clusterRows,state.scope);
    if(!state.storeMapping.length)throw new Error("La sottofamiglia non è stata trovata nel file fisso dei cluster.");
    var performance=E.calculatePerformance(state.assortment,state.salesRows,state.storeMapping,state.selectedClusters);
    var ranked=A.applyPriorityRanking(performance.rows,readAttributeConfigs());
    performance.rows=ranked.rows;
    performance.attributeAnalyses=ranked.analyses;
    return performance;
  }
  function updateAutomaticPreview(){ if(currentCutMode()!=="auto")return; if(!canPreview()){ state.autoReferenceWeight=50; $("referenceWeight").value="50"; updateWeightLabels(50); $("autoWeightInfo").textContent="Carica i file per calcolare il suggerimento automatico."; return; }
    try{ var performance=buildPerformancePreview(); var weights=E.determineWeights("auto",50,performance.metrics.gini); state.autoReferenceWeight=Math.round(weights.referenceWeight*100); $("referenceWeight").value=String(state.autoReferenceWeight); updateWeightLabels(state.autoReferenceWeight); $("autoWeightInfo").innerHTML="Gini <b>"+fmt(performance.metrics.gini,3)+"</b> ("+escapeHtml(E.classifyConcentration(performance.metrics.gini))+ "): taglio referenze <b>"+state.autoReferenceWeight+"%</b>, quantità <b>"+(100-state.autoReferenceWeight)+"%</b>."; }
    catch(error){ $("autoWeightInfo").textContent="Il suggerimento verrà calcolato quando i dati saranno validi."; }
  }

  function updateRatios(){ var meters=readMeters(false); if(!meters)$("ratioPreview").textContent="Inserisci i metri rispettando Basso ≤ Medio ≤ Alto."; else $("ratioPreview").innerHTML="Alto <b>100%</b> · Medio <b>"+pct(meters.medio/meters.alto)+"</b> · Basso <b>"+pct(meters.basso/meters.alto)+"</b>"; updateReady(); }
  function updateReady(){
    var button=$("analyzeButton");
    var missing=[];
    if(!window.XLSX)missing.push("libreria Excel");
    if(!state.clusterRows.length)missing.push("tabella cluster");
    if(!state.assortmentRows.length)missing.push("file assortimento");
    if(!state.salesRows.length)missing.push("file vendite");
    if(!readMeters(false))missing.push("metri validi");
    if(!readStockDays(false))missing.push("giorni di scorta validi");
    if(!state.selectedClusters.length)missing.push("cluster vendite");
    var ready=!missing.length;
    button.disabled=!ready;
    button.title=ready?"Avvia l’elaborazione":"Manca: "+missing.join(", ");
    button.setAttribute("aria-disabled",ready?"false":"true");
  }


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

  function presenceDot(level,label,isOn){ return '<span class="presence-item"><span class="presence-dot '+level+(isOn?' is-on':'')+'" aria-hidden="true"></span><span>'+escapeHtml(label)+'</span></span>'; }
  function presenceLights(row){ return '<div class="presence-lights" aria-label="Presenza assortimento">'+presenceDot('alto','Alto',Number(row.GAlto)>0)+presenceDot('medio','Medio',Number(row.GMedio_proposto)>0)+presenceDot('basso','Basso',Number(row.GBasso_proposto)>0)+'</div>'; }
  function renderProposalTable(){
    if(!state.results)return;
    var query=String($("proposalSearchInput").value||"").trim().toLowerCase();
    var rows=state.results.rows.filter(function(row){return !query||[row.article_id,row.sku,row.description,row.supplier,row.attribute_1,row.attribute_2,row.attribute_3].join(" ").toLowerCase().indexOf(query)>=0;});
    var configs=readAttributeConfigs();
    var columns=PROPOSAL_COLUMNS.map(function(column,index){
      if(index>=5&&index<=7){var config=configs[index-5];return Object.assign({},column,{label:config&&config.name?config.name:column.label});}
      return column;
    });
    var html='<thead><tr>'+columns.map(renderColumnHeader).join('')+'</tr></thead><tbody>';
    rows.forEach(function(row){
      var marginPct=Number.isFinite(Number(row.margin_pct))?fmt(row.margin_pct,1)+'%':'–';
      var marginTotal=Number.isFinite(Number(row.margin_total))?fmt(row.margin_total,2)+' €':'–';
      var reason=row.attribute_priority_reasons&&row.attribute_priority_reasons.length?'<div class="priority-reason">'+escapeHtml(row.attribute_priority_reasons.join(' · '))+'</div>':'';
      html+='<tr>'+ '<td class="num">'+fmt(row.performance_rank)+'</td>'+ '<td>'+presenceLights(row)+'</td>'+ '<td><b>'+escapeHtml(row.article_id)+'</b><br><span class="muted-cell">SKU '+escapeHtml(row.sku||'–')+'</span></td>'+ '<td>'+escapeHtml(row.description)+reason+'</td>'+ '<td>'+escapeHtml(row.supplier)+'</td>'+ '<td>'+escapeHtml(row.attribute_1||'–')+'</td>'+ '<td>'+escapeHtml(row.attribute_2||'–')+'</td>'+ '<td>'+escapeHtml(row.attribute_3||'–')+'</td>'+ '<td class="num">'+fmt(row.sales_selected)+'</td>'+ '<td class="num">'+marginPct+'</td>'+ '<td class="num">'+marginTotal+'</td>'+ '<td><div class="quantity-triplet"><span>A <b>'+fmt(row.GAlto)+'</b></span><span>M <b>'+fmt(row.GMedio_proposto)+'</b></span><span>B <b>'+fmt(row.GBasso_proposto)+'</b></span></div></td></tr>';
    });
    $("proposalTable").innerHTML=html+'</tbody>';
  }
  function renderDetailTable(){ if(!state.results)return; var query=String($("searchInput").value||"").trim().toLowerCase(); var rows=state.results.rows.filter(function(row){return !query||[row.article_id,row.sku,row.description,row.supplier].join(" ").toLowerCase().indexOf(query)>=0;}); var html="<thead><tr>"+DETAIL_COLUMNS.map(renderColumnHeader).join("")+"</tr></thead><tbody>"; rows.forEach(function(row){html+="<tr>"+'<td class="num">'+fmt(row.performance_rank)+"</td><td>"+escapeHtml(row.supplier)+"</td><td>"+escapeHtml(row.article_id)+"</td><td>"+escapeHtml(row.description)+"</td>"+'<td class="num">'+fmt(row.pack_size)+"</td>"+'<td class="num">'+fmt(row.sales_selected)+"</td>"+'<td class="num">'+fmt(row.sales_per_store_day,4)+"</td>"+'<td class="num">'+fmt(row.GAlto)+"</td>"+'<td class="num">'+fmt(row.GMedio)+"</td>"+'<td class="num">'+fmt(row.GMedio_proposto)+"</td><td>"+badge(row.azione_Medio)+"</td>"+'<td class="num">'+fmt(row.GBasso)+"</td>"+'<td class="num">'+fmt(row.GBasso_proposto)+"</td><td>"+badge(row.azione_Basso)+"</td></tr>";}); $("detailTable").innerHTML=html+"</tbody>"; }
  function renderQuality(){
    var q=state.quality,r=state.results;
    var conflictCount=r.rows.filter(function(row){return row.attribute_conflicts&&row.attribute_conflicts.length;}).length;
    var unclassified=[1,2,3].map(function(index){return r.rows.filter(function(row){return row["attribute_"+index]==="NON CLASSIFICATO";}).length;});
    var items=[["Versione",APP_VERSION],["Righe vendite lette",fmt(q.inputRows)],["Righe usate",fmt(q.usedRows)],["Punti vendita considerati",fmt(q.selectedStoreCount)],["Righe online/totali ignorate",fmt(q.ignoredOnlineOrTotals)],["Articoli non trovati",fmt(q.articlesNotMatched)],["Vendite non numeriche",fmt(q.invalidSales)],["Punti vendita non mappati",q.storesNotMappedNames.length?q.storesNotMappedNames.join(", "):"Nessuno"],["Livello cluster",state.storeMapping.level_used],["Periodo vendite assunto",fmt(E.SALES_PERIOD_DAYS,1)+" giorni"],["Gini",fmt(r.metrics.gini,4)+" · "+r.concentration],["Coefficiente di variazione",fmt(r.metrics.cv,4)],["Modalità taglio",r.weights.mode==="auto"?"Automatica":"Manuale"],["Peso taglio referenze",pct(r.weights.referenceWeight)],["Peso taglio quantità",pct(r.weights.quantityWeight)],["Conflitti parole chiave",fmt(conflictCount)],["Non classificati attributo 1",fmt(unclassified[0])],["Non classificati attributo 2",fmt(unclassified[1])],["Non classificati attributo 3",fmt(unclassified[2])],["Colonna prezzo lordo",$("salePriceColumn").value||"Non impostata"],["Colonna costo",$("costColumn").value||"Non impostata"],["Colonna IVA",$("vatColumn").value||"Aliquota predefinita"],["IVA predefinita",fmt(currentDefaultVatRate(),2)+"%"],["Avvisi rappresentatività",fmt(state.representationWarnings.length)]];
    var clusterHtml=state.attributeAnalyses.map(function(attribute){
      var rows=attribute.clusters.map(function(cluster){return '<tr><td>'+escapeHtml(cluster.value)+'</td><td>'+(attribute.selected[cluster.value]?'<span class="badge keep">Selezionato</span>':'<span class="badge remove">Escluso</span>')+'</td><td class="num">'+fmt(cluster.references)+'</td><td class="num">'+fmt(cluster.sales)+'</td><td class="num">'+fmt(cluster.marginTotal,2)+' €</td></tr>';}).join('');
      return '<div class="attribute-analysis"><h3>'+escapeHtml(attribute.name)+'</h3><div class="table-wrap compact"><table><thead><tr><th>Cluster</th><th>Priorità</th><th class="num">Referenze</th><th class="num">Vendite</th><th class="num">Margine totale</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
    }).join('');
    $("qualityContent").innerHTML='<div class="quality-grid">'+items.map(function(item){return '<div class="quality-item"><b>'+escapeHtml(item[0])+"</b><span>"+escapeHtml(item[1])+"</span></div>";}).join("")+"</div>"+(clusterHtml?'<div class="attribute-analysis-grid">'+clusterHtml+'</div>':'');
  }

  function planogramLevelLabel(level){ if(level==="medio")return "Medio proposto"; if(level==="basso")return "Basso proposto"; return "Alto"; }
  function planogramFieldLabel(field){
    if(field==="line")return "Linea";
    if(field==="brand")return "Brand";
    if(field.indexOf("attribute_")===0)return attributeLabels()[field]||("Attributo "+field.slice(-1));
    return "Fornitore";
  }
  function updatePlanogramAttributeOptions(){
    var select=$("planogramCommercialField"); if(!select)return;
    var current=select.value;
    var base=[{value:"supplier",label:"Fornitore"},{value:"line",label:"Linea"},{value:"brand",label:"Brand"}];
    readAttributeConfigs().forEach(function(config,index){if(config.enabled)base.push({value:"attribute_"+(index+1),label:config.name});});
    select.innerHTML=base.map(function(item){return '<option value="'+escapeHtml(item.value)+'">'+escapeHtml(item.label)+'</option>';}).join("");
    select.value=base.some(function(item){return item.value===current;})?current:"supplier";
    updatePlanogramOrientationOptions();
  }
  function planogramOrientationLabel(orientation,field){ var label=planogramFieldLabel(field); return orientation==="characteristic"?"Caratteristica per ripiano · "+label+" sul ripiano":label+" per ripiano · Caratteristica sul ripiano"; }
  function updatePlanogramOrientationOptions(){ var selectField=$("planogramCommercialField"),select=$("planogramOrientation");if(!selectField||!select)return;var field=selectField.value,label=planogramFieldLabel(field); select.options[0].textContent=label+" per ripiano · Caratteristica sul ripiano";select.options[1].textContent="Caratteristica per ripiano · "+label+" sul ripiano"; }

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
    updatePlanogramOrientationOptions();
    var level=$("planogramLevel").value;
    var commercialField=$("planogramCommercialField").value;
    var orientation=$("planogramOrientation").value;
    var commercialLabel=planogramFieldLabel(commercialField);
    var layout=P.buildPlanogram(state.results.rows,{level:level,commercialField:commercialField,orientation:orientation,fieldLabels:attributeLabels()});
    state.planogram=layout;
    var title=String($("planogramTitle").value||"Layout scaffale olio motore").trim()||"Layout scaffale olio motore";
    var store=String($("planogramStore").value||"").trim();
    var now=new Date().toLocaleString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
    $("planogramPrintTitle").textContent=title;
    $("planogramPrintMeta").textContent=(store?"Punto vendita: "+store+" · ":"")+"Assortimento: "+planogramLevelLabel(level)+" · Composizione: "+planogramOrientationLabel(orientation,commercialField)+" · Generato il "+now;
    $("planogramLegendCharacteristic").innerHTML="<b>Caratteristica</b> = valore letto dalla colonna Caratteristica";
    $("planogramLegendCommercial").innerHTML="<b>"+escapeHtml(commercialLabel)+"</b> = attributo commerciale selezionato";
    $("planogramSummary").innerHTML="<b>"+fmt(layout.groups.length)+" ripiani</b> · "+fmt(layout.totalReferences)+" referenze · "+fmt(layout.totalQuantity)+" pezzi · "+escapeHtml(commercialLabel)+" ↔ Caratteristica";
    var warnings=[];
    if(layout.missingCharacteristicCount)warnings.push(fmt(layout.missingCharacteristicCount)+" referenze senza Caratteristica sono state raggruppate in SENZA CARATTERISTICA.");
    if(layout.missingCommercialCount)warnings.push(fmt(layout.missingCommercialCount)+" referenze senza "+commercialLabel+" sono state raggruppate in SENZA "+commercialLabel.toUpperCase()+".");
    $("planogramWarnings").innerHTML=warnings.length?'<div class="message warning">'+escapeHtml(warnings.join(" "))+'</div>':'<div class="message info">Caratteristica e '+escapeHtml(commercialLabel)+' sono valorizzati per tutte le referenze rappresentate.</div>';
    if(!layout.groups.length){$("planogramShelves").innerHTML='<div class="planogram-empty">Nessuna referenza presente nell’assortimento selezionato.</div>';return;}
    $("planogramShelves").innerHTML=layout.groups.map(function(group,index){
      var cards=group.rows.map(function(row){
        var characteristic=row.layout_characteristic.label;
        var commercial=row.layout_commercial.value;
        var topLabel=orientation==="commercial"?characteristic:commercial;
        var secondary=orientation==="commercial"?commercialLabel+": "+commercial:"Caratteristica: "+characteristic;
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

  function analyze(){
    clearMessages();
    updateReady();
    if($("analyzeButton").disabled){message($("analyzeButton").title||"Completa i dati richiesti prima di elaborare.","error");return;}
    try{
      var meters=readMeters(true),stock=readStockDays(true); if(!meters||!stock)return;
      var performance=buildPerformancePreview();
      if(!performance.metrics.selectedStoreCount){message("Nessun punto vendita appartiene ai cluster selezionati.","error");return;}
      state.quality=performance.quality;
      state.attributeAnalyses=performance.attributeAnalyses||[];
      state.results=E.buildProposals(performance.rows,meters,{cutMode:currentCutMode(),manualReferenceWeight:currentReferenceWeight(),stockDaysMedio:stock.medio,stockDaysBasso:stock.basso},performance.metrics);
      var represented=A.enforceRepresentation(E,state.results,state.attributeAnalyses);
      state.results=represented.results;
      state.representationWarnings=represented.warnings||[];
      state.suppliers=E.supplierSummary(state.results.rows);
      if(state.results.weights.mode==="auto"){state.autoReferenceWeight=Math.round(state.results.weights.referenceWeight*100);$("referenceWeight").value=String(state.autoReferenceWeight);updateWeightLabels(state.autoReferenceWeight);updateAutomaticPreview();}
      $("scopeBanner").innerHTML="<b>"+escapeHtml(state.scope.reparto)+"</b> → "+escapeHtml(state.scope.gruppo)+" → <b>"+escapeHtml(state.scope.famiglia)+"</b> · vendite: "+escapeHtml(state.selectedClusters.join(", "));
      var activeAttributes=readAttributeConfigs().filter(function(config){return config.enabled;}).map(function(config){return config.name;});
      var vatText=$("vatColumn").value?escapeHtml($("vatColumn").value):fmt(currentDefaultVatRate(),2)+"% predefinita";
      var marginText=$("salePriceColumn").value&&$("costColumn").value?" · margine su PVP netto IVA: <b>"+escapeHtml($("salePriceColumn").value)+" / IVA "+vatText+" − "+escapeHtml($("costColumn").value)+"</b>":" · margine non calcolato";
      $("methodBanner").innerHTML="Metri fissi: Alto <b>"+fmt(meters.alto,2)+" m</b>, Medio <b>"+fmt(meters.medio,2)+" m</b>, Basso <b>"+fmt(meters.basso,2)+" m</b>. Capacità equivalente Medio <b>"+fmt(state.results.medium.quantityCapacity)+" pezzi</b>, Basso <b>"+fmt(state.results.low.quantityCapacity)+" pezzi</b>. Attributi: <b>"+escapeHtml(activeAttributes.length?activeAttributes.join(", "):"nessuno")+"</b>"+marginText+".";
      renderKpis(state.results);renderProposalTable();renderSupplierTable();renderDetailTable();renderQuality();renderPlanogram();
      $("welcome").classList.add("hidden");$("results").classList.remove("hidden");
      if(performance.metrics.totalSales<=0)message("Non risultano vendite positive nei cluster selezionati: la graduatoria usa GAlto come criterio secondario.","warning");
      state.representationWarnings.forEach(function(text){message(text,"warning");});
    }catch(error){console.error(error);message("Analisi non riuscita: "+error.message,"error");}
  }

  function exportExcel(){
    if(!state.results)return;
    try{
      ensureSpreadsheetLibrary();
      var configs=readAttributeConfigs();
      var detail=state.results.rows.map(function(row){return{
        Rank:row.performance_rank,
        Presente_Alto:row.GAlto>0?"SI":"NO",
        Presente_Medio:row.GMedio_proposto>0?"SI":"NO",
        Presente_Basso:row.GBasso_proposto>0?"SI":"NO",
        Fornitore:row.supplier,
        Id:row.article_id,
        SkuCodice:row.sku,
        Prodotto:row.description,
        Attributo_1_Nome:configs[0].name,
        Attributo_1:row.attribute_1,
        Attributo_2_Nome:configs[1].name,
        Attributo_2:row.attribute_2,
        Attributo_3_Nome:configs[2].name,
        Attributo_3:row.attribute_3,
        PVP_Lordo:row.sale_price_gross,
        Aliquota_IVA:row.vat_rate,
        PVP_Netto_IVA:row.sale_price_net,
        Costo_Acquisto:row.purchase_cost,
        Margine_Unitario:row.margin_unit,
        Margine_Percentuale:row.margin_pct,
        Margine_Totale:row.margin_total,
        Art_Pz:row.pack_size,
        Vendite_Cluster_Selezionati:row.sales_selected,
        Vendita_Media_Giornaliera_Per_Store:row.sales_per_store_day,
        GAlto:row.GAlto,
        GMedio_Attuale:row.GMedio,
        GMedio_Proposto:row.GMedio_proposto,
        Giorni_Scorta_Medio_Stimati:row.giorni_Medio_raggiunti,
        Azione_Medio:row.azione_Medio,
        GBasso_Attuale:row.GBasso,
        GBasso_Proposto:row.GBasso_proposto,
        Giorni_Scorta_Basso_Stimati:row.giorni_Basso_raggiunti,
        Azione_Basso:row.azione_Basso,
        Priorita_Applicate:(row.attribute_priority_reasons||[]).join(" | "),
        Conflitti_Parole_Chiave:(row.attribute_conflicts||[]).join(" | ")
      };});
      var meters=readMeters(false),stock=readStockDays(false),r=state.results;
      var parameters=[
        {Parametro:"Versione",Valore:APP_VERSION},{Parametro:"Metri Alto",Valore:meters.alto},{Parametro:"Metri Medio",Valore:meters.medio},{Parametro:"Metri Basso",Valore:meters.basso},
        {Parametro:"% Medio su Alto",Valore:meters.medio/meters.alto},{Parametro:"% Basso su Alto",Valore:meters.basso/meters.alto},{Parametro:"Cluster vendite",Valore:state.selectedClusters.join(", ")},
        {Parametro:"Modalità taglio",Valore:r.weights.mode==="auto"?"Automatica su Gini":"Manuale"},{Parametro:"Gini",Valore:r.metrics.gini},{Parametro:"Coefficiente di variazione",Valore:r.metrics.cv},
        {Parametro:"Peso taglio referenze",Valore:r.weights.referenceWeight},{Parametro:"Peso taglio quantità",Valore:r.weights.quantityWeight},{Parametro:"Giorni scorta Medio",Valore:stock.medio},{Parametro:"Giorni scorta Basso",Valore:stock.basso},
        {Parametro:"Colonna PVP lordo",Valore:$("salePriceColumn").value},{Parametro:"Colonna costo acquisto",Valore:$("costColumn").value},{Parametro:"Colonna aliquota IVA",Valore:$("vatColumn").value||"Aliquota predefinita"},{Parametro:"IVA predefinita %",Valore:currentDefaultVatRate()},{Parametro:"Periodo vendite giorni",Valore:E.SALES_PERIOD_DAYS},{Parametro:"Filtro",Valore:"Breve = N"},{Parametro:"Livello cluster",Valore:state.storeMapping.level_used}
      ];
      configs.forEach(function(config,index){parameters.push({Parametro:"Attributo "+(index+1),Valore:config.enabled?config.name+" · "+config.representationMode+" · "+config.representationValue:"Disattivo"});});
      var analysis=[];
      state.attributeAnalyses.forEach(function(attribute){attribute.clusters.forEach(function(cluster){analysis.push({Attributo:attribute.name,Cluster:cluster.value,Selezionato:attribute.selected[cluster.value]?"SI":"NO",Vendite:cluster.sales,Margine_Totale:cluster.marginTotal,Referenze:cluster.references});});});
      var workbook=window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook,window.XLSX.utils.json_to_sheet(state.suppliers),"Riepilogo Fornitori");
      window.XLSX.utils.book_append_sheet(workbook,window.XLSX.utils.json_to_sheet(detail),"Proposta Assortimento");
      if(analysis.length)window.XLSX.utils.book_append_sheet(workbook,window.XLSX.utils.json_to_sheet(analysis),"Analisi Attributi");
      window.XLSX.utils.book_append_sheet(workbook,window.XLSX.utils.json_to_sheet(parameters),"Parametri");
      window.XLSX.writeFile(workbook,"Proposta_Nuovo_Assortimento.xlsx");
    }catch(error){message("Esportazione non riuscita: "+error.message,"error");}
  }

  function setupTabs(){ document.querySelectorAll(".tab").forEach(function(button){button.addEventListener("click",function(){document.querySelectorAll(".tab").forEach(function(tab){tab.classList.remove("active");});document.querySelectorAll(".tab-panel").forEach(function(panel){panel.classList.remove("active");});button.classList.add("active");$(button.dataset.tab).classList.add("active");});}); }
  function bindFileInputs(){
    $("assortmentFile").addEventListener("change",function(){
      clearMessages();var file=this.files[0];$("assortmentName").textContent=file?file.name:"Nessun file selezionato";state.assortmentRows=[];
      if(!file){populateColumnSelectors([]);updateAutomaticPreview();return updateReady();}
      try{loadFile(file,"Q_Temp",REQUIRED_ASSORTMENT).then(function(rows){state.assortmentRows=rows;populateColumnSelectors(rows);message("File assortimento caricato: "+rows.length+" righe.","info");updateAutomaticPreview();updateReady();}).catch(function(error){message("Assortimento non valido. "+error.message,"error");updateReady();});}catch(error){message(error.message,"error");updateReady();}
    });
    $("salesFile").addEventListener("change",function(){
      clearMessages();var file=this.files[0];$("salesName").textContent=file?file.name:"Nessun file selezionato";state.salesRows=[];
      if(!file){updateAutomaticPreview();return updateReady();}
      try{loadFile(file,"Q_TempPV",REQUIRED_SALES).then(function(rows){state.salesRows=rows;message("File vendite caricato: "+rows.length+" righe.","info");updateAutomaticPreview();updateReady();}).catch(function(error){message("Vendite non valide. "+error.message,"error");updateReady();});}catch(error){message(error.message,"error");updateReady();}
    });
  }
  function base64ToArrayBuffer(base64){
    var binary=window.atob(base64),length=binary.length,bytes=new Uint8Array(length);
    for(var i=0;i<length;i+=1)bytes[i]=binary.charCodeAt(i);
    return bytes.buffer;
  }
  function applyClusterWorkbook(buffer,source){
    state.clusterRows=rowsFrom(readWorkbook(buffer),"Q_Temp");
    var missing=missingColumns(state.clusterRows,REQUIRED_CLUSTER);
    if(missing.length)throw new Error("colonne mancanti: "+missing.join(", "));
    setStatus("Cluster disponibili","ok");
    message("Tabella cluster caricata"+(source?" da "+source:"")+": "+state.clusterRows.length+" righe.","info");
    updateAutomaticPreview();
    updateReady();
  }
  function loadClusters(){
    if(!window.XLSX){setStatus("Libreria Excel non disponibile","error");message("La libreria Excel non è stata caricata. Verifica la connessione Internet e aggiorna con Ctrl+F5.","error");updateReady();return;}
    try{
      if(window.AssortmentClusterWorkbookBase64){
        applyClusterWorkbook(base64ToArrayBuffer(window.AssortmentClusterWorkbookBase64),"repository");
        return;
      }
    }catch(embeddedError){
      message("Il file cluster incorporato non è leggibile: "+embeddedError.message,"warning");
    }
    var url=new URL("data/config/Cluster.xlsx?v=4.0.2",document.baseURI).toString();
    fetch(url,{cache:"no-store"}).then(function(response){if(!response.ok)throw new Error("HTTP "+response.status);return response.arrayBuffer();}).then(function(buffer){applyClusterWorkbook(buffer,"file locale");}).catch(function(error){setStatus("Errore cluster","error");message("Impossibile caricare la tabella cluster. Apri il repository completo e non spostare i singoli file. Dettaglio: "+error.message,"error");updateReady();});
  }
  function bindControls(){
    ["metersAlto","metersMedio","metersBasso"].forEach(function(id){$(id).addEventListener("input",updateRatios);});
    ["stockDaysMedio","stockDaysBasso"].forEach(function(id){$(id).addEventListener("input",updateReady);});
    $("cutModeAuto").addEventListener("change",updateWeightMode);$("cutModeManual").addEventListener("change",updateWeightMode);
    $("referenceWeight").addEventListener("input",function(){updateWeightLabels(this.value);updateReady();});
    $("clusterMenuButton").addEventListener("click",function(event){event.stopPropagation();toggleClusterMenu();});
    $("clusterMenu").addEventListener("click",function(event){event.stopPropagation();});document.addEventListener("click",function(){toggleClusterMenu(false);});
    $("clusterAll").addEventListener("change",function(){updateClusterSelection(this);});document.querySelectorAll(".cluster-option").forEach(function(input){input.addEventListener("change",function(){updateClusterSelection(this);});});
    ["salePriceColumn","costColumn","vatColumn"].forEach(function(id){$(id).addEventListener("change",function(){updateAutomaticPreview();updateReady();});});
    $("defaultVatRate").addEventListener("input",function(){updateAutomaticPreview();updateReady();});
    for(var i=1;i<=3;i+=1){
      (function(index){
        $("attributeEnabled"+index).addEventListener("change",updateAttributeControlState);
        ["attributeName"+index,"attributeRules"+index,"attributeMode"+index,"attributeValue"+index].forEach(function(id){$(id).addEventListener("input",function(){updatePlanogramAttributeOptions();updateAutomaticPreview();updateReady();});$(id).addEventListener("change",function(){updatePlanogramAttributeOptions();updateAutomaticPreview();updateReady();});});
      })(i);
    }
    $("analyzeButton").addEventListener("click",analyze);$("exportButton").addEventListener("click",exportExcel);
    $("proposalSearchInput").addEventListener("input",renderProposalTable);$("searchInput").addEventListener("input",renderDetailTable);
    $("generatePlanogramButton").addEventListener("click",renderPlanogram);$("printPlanogramButton").addEventListener("click",printPlanogram);
    $("planogramLevel").addEventListener("change",renderPlanogram);$("planogramCommercialField").addEventListener("change",function(){updatePlanogramOrientationOptions();renderPlanogram();});
    $("planogramOrientation").addEventListener("change",renderPlanogram);$("planogramTitle").addEventListener("change",renderPlanogram);$("planogramStore").addEventListener("change",renderPlanogram);
  }

  function init(){
    E=window.AssortmentEngineV3;P=window.PlanogramEngineV3;A=window.AssortmentEnrichmentV1;
    if(!E||!P||!A){setStatus("Errore motore","error");message("Il motore di calcolo, arricchimento o layout non è stato caricato. Aggiorna la pagina con Ctrl+F5.","error");return;}
    bindControls();bindColumnTooltips();setupTabs();bindFileInputs();populateColumnSelectors([]);updateAttributeControlState();updateClusterSelection($("clusterAll"));updateRatios();updateWeightMode();loadClusters();
  }
  window.addEventListener("error",function(event){if($("messages"))message("Errore applicazione: "+(event.message||"errore sconosciuto"),"error");});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
