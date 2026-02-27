/* PKR Webapp – UI-Logik */
var P = null, PID = null, SEL = null, chartVerlauf = null;

function showToast(msg, type) {
    var t = document.createElement('div');
    t.className = 'toast' + (type === 'error' ? ' toast-error' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function(){t.classList.add('show');}, 10);
    setTimeout(function(){t.classList.remove('show');setTimeout(function(){t.remove();},300);}, 2500);
}

// ─── Startseite ────────────────────────────────────────────────────
function ladeStartseite() {
    dbProjektListe().then(function(liste) {
        var el = document.getElementById('projekte-liste');
        if (!el) return;
        if (!liste.length) { el.innerHTML = '<div class="empty-state"><p>Noch keine Projekte.</p></div>'; return; }
        el.innerHTML = liste.map(function(p) {
            return '<a href="projekt.html?id=' + p.id + '" class="project-card">' +
                '<div class="project-card-header"><h3>' + p.name + '</h3><span class="badge">' + p.jahr + '</span></div>' +
                '<div class="project-card-footer"><span class="text-muted">' + new Date(p.updated_at).toLocaleDateString('de-DE') + '</span>' +
                '<button class="btn btn-icon btn-danger-ghost" onclick="event.preventDefault();projektLoeschen(\'' + p.id + '\',\'' + p.name + '\')" title="Löschen">✕</button></div></a>';
        }).join('');
    });
}
function dlgNeuesProjekt() { document.getElementById('dlg-neu').showModal(); }
function projektErstellen() {
    var name = document.getElementById('inp-name').value || 'Neues Projekt';
    var jahr = parseInt(document.getElementById('inp-jahr').value) || new Date().getFullYear();
    dbProjektErstellen(name, jahr).then(function(p) {
        document.getElementById('dlg-neu').close();
        if (p) window.location.href = 'projekt.html?id=' + p.id;
    });
}
function projektLoeschen(id, name) {
    if (!confirm('Projekt "' + name + '" wirklich löschen?')) return;
    dbProjektLoeschen(id).then(function() { ladeStartseite(); });
}

// ─── Projekt ───────────────────────────────────────────────────────
function initProjekt(pid) { PID = pid; ladeProjekt(); }
function ladeProjekt() {
    dbProjektLaden(PID).then(function(p) {
        if (!p) { showToast('Projekt nicht gefunden', 'error'); return; }
        P = p;
        P.mitarbeiter.forEach(function(ma) {
            ma._berechnung = berechne(ma, P);
            ma._jahresgesamt = ma._berechnung.reduce(function(s,r){return s+r.g;}, 0);
        });
        P._gesamtkosten = P.mitarbeiter.reduce(function(s,m){return s+(m._jahresgesamt||0);}, 0);
        document.getElementById('nav-title').textContent = P.name + ' (' + P.jahr + ')';
        document.getElementById('gesamtkosten').textContent = 'Gesamtkosten: ' + fmtEur(P._gesamtkosten);
        buildMaListe(); fillFilters(); fillEinstellungen();
        if (SEL !== null && P.mitarbeiter[SEL]) selectMa(SEL);
    });
}
function projektSpeichern() {
    document.getElementById('save-indicator').textContent = 'Speichere...';
    einstellungenSpeichern(true).then(function() {
        document.getElementById('save-indicator').textContent = '✔ Gespeichert';
        setTimeout(function(){document.getElementById('save-indicator').textContent='';}, 2000);
    });
}

// ─── Tabs ──────────────────────────────────────────────────────────
function switchTab(name) {
    document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('active',t.dataset.tab===name);});
    document.querySelectorAll('.tab-content').forEach(function(t){t.classList.toggle('active',t.id==='tab-'+name);});
    if (name === 'analyse') ladeAnalyse();
}

// ─── Mitarbeiterliste ──────────────────────────────────────────────
function buildMaListe() {
    var el = document.getElementById('ma-liste');
    if (!P||!P.mitarbeiter.length) { el.innerHTML='<div class="empty-state" style="padding:20px"><small>Keine Mitarbeiter</small></div>'; return; }
    el.innerHTML = P.mitarbeiter.map(function(ma, i) {
        var name = maName(ma);
        var parts = [];
        if (ma.pnr) parts.push(ma.pnr);
        if (ma.da) parts.push(ma.da + (daBezeichnung(P,ma.da)?' '+daBezeichnung(P,ma.da):''));
        if (ma.kst) parts.push(ma.kst + (kstBezeichnung(P,ma.kst)?' '+kstBezeichnung(P,ma.kst):''));
        parts.push(fmtEur(ma._jahresgesamt));
        return '<div class="ma-item'+(i===SEL?' active':'')+'" onclick="selectMa('+i+')" data-da="'+(ma.da||'')+'" data-kst="'+(ma.kst||'')+'">' +
            '<div class="ma-item-name">'+name+'</div><div class="ma-item-sub">'+parts.join(' · ')+'</div></div>';
    }).join('');
}
function filterListe() {
    var q=document.getElementById('ma-suche').value.toLowerCase();
    var fda=document.getElementById('filter-da').value, fkst=document.getElementById('filter-kst').value;
    document.querySelectorAll('.ma-item').forEach(function(el){
        el.style.display=(!q||el.textContent.toLowerCase().indexOf(q)>=0)&&(!fda||el.dataset.da===fda)&&(!fkst||el.dataset.kst===fkst)?'':'none';
    });
}
function fillFilters() {
    var das={},ksts={};P.mitarbeiter.forEach(function(m){if(m.da)das[m.da]=1;if(m.kst)ksts[m.kst]=1;});
    document.getElementById('filter-da').innerHTML='<option value="">Alle DA</option>'+Object.keys(das).sort().map(function(d){return '<option value="'+d+'">'+d+(daBezeichnung(P,d)?' - '+daBezeichnung(P,d):'')+'</option>';}).join('');
    document.getElementById('filter-kst').innerHTML='<option value="">Alle KSt</option>'+Object.keys(ksts).sort().map(function(k){return '<option value="'+k+'">'+k+(kstBezeichnung(P,k)?' - '+kstBezeichnung(P,k):'')+'</option>';}).join('');
}

// ─── MA CRUD ───────────────────────────────────────────────────────
function maHinzufuegen() {
    var ma=neuerMa();ma.nachname='Neu';
    dbMaSpeichern(PID,ma).then(function(){ladeProjekt();}).then(function(){
        SEL=P?P.mitarbeiter.length-1:0; if(P&&P.mitarbeiter[SEL])selectMa(SEL); showToast('Hinzugefügt');
    });
}
function maLoeschen() {
    if(SEL===null)return;var ma=P.mitarbeiter[SEL];
    if(!confirm('"'+maName(ma)+'" entfernen?'))return;
    dbMaLoeschen(ma._id).then(function(){SEL=null;document.getElementById('stamm-form').style.display='none';document.getElementById('stamm-empty').style.display='';ladeProjekt();showToast('Entfernt');});
}

// ─── Stammdaten ────────────────────────────────────────────────────
function selectMa(idx) {
    SEL=idx; var ma=P.mitarbeiter[idx]; if(!ma)return;
    document.querySelectorAll('.ma-item').forEach(function(el,i){el.classList.toggle('active',i===idx);});
    document.getElementById('stamm-empty').style.display='none';
    document.getElementById('stamm-form').style.display='';
    ['pnr','titel','nachname','vorname','bemerkung'].forEach(function(k){var el=document.getElementById('s-'+k);if(el)el.value=ma[k]||'';});
    document.getElementById('s-brutto').value=(ma.brutto||0).toFixed(2).replace('.',',');
    document.getElementById('s-vk').value=String(ma.vk||1.0).replace('.',',');
    document.getElementById('s-eintritt').value=ma.eintritt||'';
    document.getElementById('s-austritt').value=ma.austritt||'';
    fillStammDropdowns(ma); fillPlanung(ma); fillHochrechnung(ma);
    document.getElementById('plan-empty').style.display='none';document.getElementById('plan-content').style.display='';
    document.getElementById('hr-empty').style.display='none';document.getElementById('hr-content').style.display='';
}
function fillStammDropdowns(ma) {
    document.getElementById('s-tarif').innerHTML='<option value="">–</option>'+Object.keys(P.tarife||{}).map(function(t){return '<option value="'+t+'"'+(t===ma.tarif?' selected':'')+'>'+t+'</option>';}).join('');
    document.getElementById('s-da').innerHTML='<option value="">–</option>'+Object.entries(P.dienstarten||{}).sort(function(a,b){return a[0].localeCompare(b[0]);}).map(function(e){return '<option value="'+e[0]+'"'+(e[0]===ma.da?' selected':'')+'>'+e[0]+' - '+(e[1].bezeichnung||'')+'</option>';}).join('');
    document.getElementById('s-kst').innerHTML='<option value="">–</option>'+Object.entries(P.kostenstellen||{}).sort(function(a,b){return a[0].localeCompare(b[0]);}).map(function(e){return '<option value="'+e[0]+'"'+(e[0]===ma.kst?' selected':'')+'>'+e[0]+' - '+(e[1].bezeichnung||'')+'</option>';}).join('');
    var egs=entgeltEgForTarif(P,ma.tarif);
    document.getElementById('s-eg').innerHTML='<option value="">–</option>'+egs.map(function(e){return '<option value="'+e+'"'+(e===ma.eg?' selected':'')+'>'+e+'</option>';}).join('');
    var stufen=entgeltStufenForEg(P,ma.eg,ma.tarif);
    document.getElementById('s-stufe').innerHTML='<option value="">–</option>'+stufen.map(function(s){return '<option value="'+s+'"'+(s===ma.stufe?' selected':'')+'>'+s+'</option>';}).join('');
    updateWstd();
}
function onTarifChanged(){var t=document.getElementById('s-tarif').value;document.getElementById('s-eg').innerHTML='<option value="">–</option>'+entgeltEgForTarif(P,t).map(function(e){return '<option value="'+e+'">'+e+'</option>';}).join('');document.getElementById('s-stufe').innerHTML='<option value="">–</option>';updateWstd();}
function onEgChanged(){var t=document.getElementById('s-tarif').value,eg=document.getElementById('s-eg').value;document.getElementById('s-stufe').innerHTML='<option value="">–</option>'+entgeltStufenForEg(P,eg,t).map(function(s){return '<option value="'+s+'">'+s+'</option>';}).join('');}
function onStufeChanged(){var t=document.getElementById('s-tarif').value,eg=document.getElementById('s-eg').value,st=document.getElementById('s-stufe').value;if(eg&&st){var b=entgelt(P,eg,st,t);if(b!==null)document.getElementById('s-brutto').value=b.toFixed(2).replace('.',',');}}
function updateWstd(){var t=document.getElementById('s-tarif').value,vk=parseNum(document.getElementById('s-vk').value),ts=(P.tarife||{})[t]?((P.tarife||{})[t].stunden||0):0;document.getElementById('s-wstd').textContent=ts>0?(ts*vk).toFixed(1)+'h (Tarif: '+ts+'h)':'–';}
function stammSpeichern() {
    if(SEL===null)return;var ma=P.mitarbeiter[SEL];
    ma.pnr=document.getElementById('s-pnr').value;ma.titel=document.getElementById('s-titel').value;
    ma.nachname=document.getElementById('s-nachname').value;ma.vorname=document.getElementById('s-vorname').value;
    ma.tarif=document.getElementById('s-tarif').value;ma.eg=document.getElementById('s-eg').value;ma.stufe=document.getElementById('s-stufe').value;
    ma.brutto=parseNum(document.getElementById('s-brutto').value);ma.vk=parseNum(document.getElementById('s-vk').value);
    ma.da=document.getElementById('s-da').value;ma.kst=document.getElementById('s-kst').value;
    ma.eintritt=document.getElementById('s-eintritt').value||null;ma.austritt=document.getElementById('s-austritt').value||null;
    ma.bemerkung=document.getElementById('s-bemerkung').value;
    dbMaSpeichern(PID,ma).then(function(){
        ma._berechnung=berechne(ma,P);ma._jahresgesamt=ma._berechnung.reduce(function(s,r){return s+r.g;},0);
        P._gesamtkosten=P.mitarbeiter.reduce(function(s,m){return s+(m._jahresgesamt||0);},0);
        document.getElementById('gesamtkosten').textContent='Gesamtkosten: '+fmtEur(P._gesamtkosten);
        buildMaListe();fillHochrechnung(ma);showToast('Gespeichert');
    });
}

// ─── Planung ───────────────────────────────────────────────────────
function fillPlanung(ma) {
    var tbody=document.querySelector('#tbl-anpassungen tbody'),rows=[];
    (ma.stufenaufstiege||[]).forEach(function(x,i){rows.push({typ:'Stufenaufstieg',detail:'EG '+x.eg+' Stufe '+x.stufe+' → '+fmtEur(x.brutto),ab:x.ab,bem:x.bem||'',key:'stufenaufstiege',idx:i});});
    (ma.ind_erhoehungen||[]).forEach(function(x,i){rows.push({typ:'Erhöhung',detail:x.pz?x.pz+'%':fmtEur(x.bt),ab:x.ab,bem:x.bem||'',key:'ind_erhoehungen',idx:i});});
    (ma.std_anpassungen||[]).forEach(function(x,i){rows.push({typ:'Stundenanpassung',detail:'VK: '+x.vk,ab:x.ab,bem:x.bem||'',key:'std_anpassungen',idx:i});});
    (ma.abwesenheiten||[]).forEach(function(x,i){rows.push({typ:'Abwesenheit',detail:x.grund+' ('+datumAnzeige(x.von)+' – '+datumAnzeige(x.bis)+')',ab:'',bem:x.bem||'',key:'abwesenheiten',idx:i});});
    tbody.innerHTML=rows.length?rows.map(function(r){return '<tr><td>'+r.typ+'</td><td>'+r.detail+'</td><td>'+(r.ab?MONATE[r.ab-1]:'–')+'</td><td>'+r.bem+'</td><td><button class="btn-del-row" onclick="anpDel(\''+r.key+'\','+r.idx+')">×</button></td></tr>';}).join(''):'<tr><td colspan="5" class="text-muted" style="text-align:center">Keine Anpassungen</td></tr>';
}
function anpDel(key,idx){var ma=P.mitarbeiter[SEL];ma[key].splice(idx,1);anpSave(ma);}
function anpSave(ma){
    dbMaSpeichern(PID,ma).then(function(){
        ma._berechnung=berechne(ma,P);ma._jahresgesamt=ma._berechnung.reduce(function(s,r){return s+r.g;},0);
        P._gesamtkosten=P.mitarbeiter.reduce(function(s,m){return s+(m._jahresgesamt||0);},0);
        document.getElementById('gesamtkosten').textContent='Gesamtkosten: '+fmtEur(P._gesamtkosten);
        fillPlanung(ma);fillHochrechnung(ma);buildMaListe();showToast('Gespeichert');
    });
}
function fillMonatSel(id){document.getElementById(id).innerHTML=MONATE.map(function(m,i){return '<option value="'+(i+1)+'">'+m+'</option>';}).join('');}

function dlgStufenaufstieg(){if(SEL===null)return;var ma=P.mitarbeiter[SEL];
    document.getElementById('d-st-tarif').innerHTML='<option value="">–</option>'+Object.keys(P.tarife||{}).map(function(t){return '<option value="'+t+'"'+(t===ma.tarif?' selected':'')+'>'+t+'</option>';}).join('');
    fillMonatSel('d-st-monat');document.getElementById('d-st-brutto').value='';document.getElementById('d-st-bem').value='';dlgStufeUpd();document.getElementById('dlg-stufe').showModal();}
function dlgStufeUpd(){var t=document.getElementById('d-st-tarif').value,eg=document.getElementById('d-st-eg')?document.getElementById('d-st-eg').value:'';
    document.getElementById('d-st-eg').innerHTML='<option value="">–</option>'+entgeltEgForTarif(P,t).map(function(e){return '<option value="'+e+'"'+(e===eg?' selected':'')+'>'+e+'</option>';}).join('');
    document.getElementById('d-st-stufe').innerHTML='<option value="">–</option>'+entgeltStufenForEg(P,eg,t).map(function(s){return '<option value="'+s+'">'+s+'</option>';}).join('');}
function dlgStufeAutoB(){var t=document.getElementById('d-st-tarif').value,eg=document.getElementById('d-st-eg').value,st=document.getElementById('d-st-stufe').value;if(eg&&st){var b=entgelt(P,eg,st,t);if(b!==null)document.getElementById('d-st-brutto').value=b.toFixed(2).replace('.',',');}}
function stufenaufstiegOk(){if(SEL===null)return;var ma=P.mitarbeiter[SEL];var b=parseNum(document.getElementById('d-st-brutto').value);if(!b){showToast('Brutto eingeben','error');return;}
    ma.stufenaufstiege=ma.stufenaufstiege||[];ma.stufenaufstiege.push({eg:document.getElementById('d-st-eg').value,stufe:document.getElementById('d-st-stufe').value,brutto:b,ab:parseInt(document.getElementById('d-st-monat').value),bem:document.getElementById('d-st-bem').value});
    document.getElementById('dlg-stufe').close();anpSave(ma);}

function dlgErhoehung(){if(SEL===null)return;fillMonatSel('d-erh-monat');document.getElementById('d-erh-wert').value='';document.getElementById('d-erh-bem').value='';document.getElementById('dlg-erh').showModal();}
function erhoehungOk(){if(SEL===null)return;var ma=P.mitarbeiter[SEL];var typ=document.querySelector('input[name="erh-typ"]:checked').value,w=parseNum(document.getElementById('d-erh-wert').value);if(!w){showToast('Wert eingeben','error');return;}
    ma.ind_erhoehungen=ma.ind_erhoehungen||[];var e={ab:parseInt(document.getElementById('d-erh-monat').value),bem:document.getElementById('d-erh-bem').value};if(typ==='pz')e.pz=w;else e.bt=w;ma.ind_erhoehungen.push(e);document.getElementById('dlg-erh').close();anpSave(ma);}

function dlgStundenanpassung(){if(SEL===null)return;document.getElementById('d-std-vk').value='';fillMonatSel('d-std-monat');document.getElementById('d-std-bem').value='';document.getElementById('dlg-std').showModal();}
function stundenanpassungOk(){if(SEL===null)return;var ma=P.mitarbeiter[SEL];var vk=parseNum(document.getElementById('d-std-vk').value);
    ma.std_anpassungen=ma.std_anpassungen||[];ma.std_anpassungen.push({vk:vk,ab:parseInt(document.getElementById('d-std-monat').value),bem:document.getElementById('d-std-bem').value});document.getElementById('dlg-std').close();anpSave(ma);}

function dlgAbwesenheit(){if(SEL===null)return;document.getElementById('d-abw-von').value='';document.getElementById('d-abw-bis').value='';document.getElementById('d-abw-bem').value='';document.getElementById('dlg-abw').showModal();}
function abwesenheitOk(){if(SEL===null)return;var ma=P.mitarbeiter[SEL];var von=document.getElementById('d-abw-von').value,bis=document.getElementById('d-abw-bis').value;if(!von||!bis){showToast('Von/Bis eingeben','error');return;}
    ma.abwesenheiten=ma.abwesenheiten||[];ma.abwesenheiten.push({grund:document.getElementById('d-abw-grund').value,von:von,bis:bis,bem:document.getElementById('d-abw-bem').value});document.getElementById('dlg-abw').close();anpSave(ma);}

// ─── Hochrechnung ──────────────────────────────────────────────────
function fillHochrechnung(ma) {
    var e=ma._berechnung;if(!e)return;var tbody=document.querySelector('#tbl-hochrechnung tbody');var sB=0,sSZ=0,sAG=0,sG=0;
    tbody.innerHTML=e.map(function(r){sB+=r.b;sSZ+=r.sz;sAG+=r.ag;sG+=r.g;
        return '<tr'+(r.ist?' class="ist-row"':'')+'><td>'+r.mn+(r.ist?' (IST)':'')+'</td><td>'+(r.vk||0).toFixed(2)+'</td><td>'+(r.a*100).toFixed(0)+'%</td><td>'+fmtEur(r.b)+'</td><td>'+fmtEur(r.sz)+'</td><td>'+fmtEur(r.ag)+'</td><td>'+fmtEur(r.g)+'</td></tr>';}).join('');
    document.getElementById('hr-sum-b').textContent=fmtEur(sB);document.getElementById('hr-sum-sz').textContent=fmtEur(sSZ);
    document.getElementById('hr-sum-ag').textContent=fmtEur(sAG);document.getElementById('hr-sum-g').textContent=fmtEur(sG);
}

// ─── Analyse ───────────────────────────────────────────────────────
function ladeAnalyse() {
    if(!P)return;var ms=berechneMonatssummen(P);
    document.getElementById('analyse-gesamt').innerHTML='<div style="font-size:24px;font-weight:700;color:var(--accent)">'+fmtEur(P._gesamtkosten)+'</div><div class="text-muted">Jahresgesamtkosten '+P.jahr+'</div><div style="margin-top:8px">'+P.mitarbeiter.length+' Mitarbeiter</div>';
    var ctx=document.getElementById('chart-verlauf');
    if(chartVerlauf)chartVerlauf.destroy();
    chartVerlauf=new Chart(ctx,{type:'bar',data:{labels:MK,datasets:[{label:'Monatskosten',data:ms,backgroundColor:'rgba(59,89,152,0.7)',borderRadius:4}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{callback:function(v){return fmtEur(v);}}}}}});
    var daG=berechneNachGruppe(P,'da'),kstG=berechneNachGruppe(P,'kst');
    document.querySelector('#tbl-analyse-da tbody').innerHTML=Object.values(daG).sort(function(a,b){return b.total-a.total;}).map(function(r){return '<tr><td>'+r.code+'</td><td>'+r.bezeichnung+'</td><td>'+r.count+'</td><td>'+fmtEur(r.total)+'</td></tr>';}).join('')||'<tr><td colspan="4" class="text-muted">–</td></tr>';
    document.querySelector('#tbl-analyse-kst tbody').innerHTML=Object.values(kstG).sort(function(a,b){return b.total-a.total;}).map(function(r){return '<tr><td>'+r.code+'</td><td>'+r.bezeichnung+'</td><td>'+r.count+'</td><td>'+fmtEur(r.total)+'</td></tr>';}).join('')||'<tr><td colspan="4" class="text-muted">–</td></tr>';
}

// ─── Einstellungen ─────────────────────────────────────────────────
function fillEinstellungen() {
    if(!P)return;
    document.getElementById('set-name').value=P.name||'';document.getElementById('set-jahr').value=P.jahr||2026;
    var svEl=document.getElementById('set-sv');
    svEl.innerHTML=Object.entries(P.sv||{}).map(function(e){return '<div class="sv-row"><label>'+e[0]+'</label><input type="text" class="input input-sm" data-sv="'+e[0]+'" value="'+e[1]+'" style="width:80px" oninput="svUpdate()"> %</div>';}).join('');
    svUpdate();
    document.getElementById('set-sz-monat').innerHTML=MONATE.map(function(m,i){return '<option value="'+(i+1)+'"'+((i+1)===(P.sz_monat||11)?' selected':'')+'>'+m+'</option>';}).join('');
    document.getElementById('set-sz-proz').value=P.sz_prozent||90;
    fillTarifeTable();fillDATable();fillKSTTable();fillETTable();fillTETable();
    document.getElementById('add-te-monat').innerHTML=MONATE.map(function(m,i){return '<option value="'+(i+1)+'">'+m+'</option>';}).join('');
    fillETTarifSel();
}
function svUpdate(){var t=0;document.querySelectorAll('[data-sv]').forEach(function(e){t+=parseFloat(e.value)||0;});document.getElementById('sv-gesamt').textContent='AG-Gesamtsatz: '+t.toFixed(2)+' %';}
function fillTarifeTable(){document.querySelector('#tbl-tarife tbody').innerHTML=Object.entries(P.tarife||{}).map(function(e){return '<tr><td>'+e[0]+'</td><td>'+(e[1].stunden||0)+'</td><td><button class="btn-del-row" onclick="tarifDel(\''+e[0]+'\')">×</button></td></tr>';}).join('')||'<tr><td colspan="3" class="text-muted">–</td></tr>';}
function tarifAdd(){var n=document.getElementById('add-tarif-name').value.trim(),s=parseFloat(document.getElementById('add-tarif-std').value)||39;if(!n)return;P.tarife=P.tarife||{};P.tarife[n]={stunden:s};einstellungenSpeichern().then(function(){fillTarifeTable();fillETTarifSel();});document.getElementById('add-tarif-name').value='';}
function tarifDel(k){delete P.tarife[k];einstellungenSpeichern().then(function(){fillTarifeTable();fillETTarifSel();});}
function fillDATable(){document.querySelector('#tbl-da tbody').innerHTML=Object.entries(P.dienstarten||{}).sort(function(a,b){return a[0].localeCompare(b[0]);}).map(function(e){return '<tr><td>'+e[0]+'</td><td>'+(e[1].bezeichnung||'')+'</td><td><button class="btn-del-row" onclick="daDel(\''+e[0]+'\')">×</button></td></tr>';}).join('')||'<tr><td colspan="3" class="text-muted">–</td></tr>';}
function daAdd(){var c=document.getElementById('add-da-code').value.trim(),b=document.getElementById('add-da-bez').value.trim();if(!c)return;P.dienstarten=P.dienstarten||{};P.dienstarten[c]={bezeichnung:b};einstellungenSpeichern().then(function(){fillDATable();});document.getElementById('add-da-code').value='';document.getElementById('add-da-bez').value='';}
function daDel(c){delete P.dienstarten[c];einstellungenSpeichern().then(function(){fillDATable();});}
function fillKSTTable(){document.querySelector('#tbl-kst tbody').innerHTML=Object.entries(P.kostenstellen||{}).sort(function(a,b){return a[0].localeCompare(b[0]);}).map(function(e){return '<tr><td>'+e[0]+'</td><td>'+(e[1].bezeichnung||'')+'</td><td><button class="btn-del-row" onclick="kstDel(\''+e[0]+'\')">×</button></td></tr>';}).join('')||'<tr><td colspan="3" class="text-muted">–</td></tr>';}
function kstAdd(){var c=document.getElementById('add-kst-code').value.trim(),b=document.getElementById('add-kst-bez').value.trim();if(!c)return;P.kostenstellen=P.kostenstellen||{};P.kostenstellen[c]={bezeichnung:b};einstellungenSpeichern().then(function(){fillKSTTable();});document.getElementById('add-kst-code').value='';document.getElementById('add-kst-bez').value='';}
function kstDel(c){delete P.kostenstellen[c];einstellungenSpeichern().then(function(){fillKSTTable();});}
function fillETTable(){
    var et=P.entgelttabelle||{},rows=[];
    Object.keys(et).forEach(function(k1){var v1=et[k1];if(typeof v1!=='object'||v1===null)return;var fv=null;for(var fk in v1){fv=v1[fk];break;}
        if(fv&&typeof fv==='object'&&!Array.isArray(fv)){Object.keys(v1).forEach(function(eg){var sts=v1[eg];if(typeof sts!=='object')return;Object.keys(sts).forEach(function(st){rows.push([k1,eg,st,sts[st]]);});});}
        else{Object.keys(v1).forEach(function(st){rows.push(['',k1,st,v1[st]]);});}});
    rows.sort(function(a,b){return (a[0]+a[1]+a[2]).localeCompare(b[0]+b[1]+b[2]);});
    document.querySelector('#tbl-et tbody').innerHTML=rows.map(function(r){return '<tr><td>'+r[0]+'</td><td>'+r[1]+'</td><td>'+r[2]+'</td><td>'+fmtEur(r[3])+'</td><td><button class="btn-del-row" onclick="etDel(\''+r[0]+'\',\''+r[1]+'\',\''+r[2]+'\')">×</button></td></tr>';}).join('')||'<tr><td colspan="5" class="text-muted">–</td></tr>';}
function fillETTarifSel(){document.getElementById('add-et-tarif').innerHTML='<option value="">–</option>'+Object.keys(P.tarife||{}).map(function(t){return '<option value="'+t+'">'+t+'</option>';}).join('');}
function etAdd(){var t=document.getElementById('add-et-tarif').value,eg=document.getElementById('add-et-eg').value.trim(),st=document.getElementById('add-et-stufe').value.trim(),b=parseNum(document.getElementById('add-et-brutto').value);if(!eg||!st||!b)return;P.entgelttabelle=P.entgelttabelle||{};if(t){P.entgelttabelle[t]=P.entgelttabelle[t]||{};P.entgelttabelle[t][eg]=P.entgelttabelle[t][eg]||{};P.entgelttabelle[t][eg][st]=b;}else{P.entgelttabelle[eg]=P.entgelttabelle[eg]||{};P.entgelttabelle[eg][st]=b;}einstellungenSpeichern().then(function(){fillETTable();});document.getElementById('add-et-eg').value='';document.getElementById('add-et-stufe').value='';document.getElementById('add-et-brutto').value='';}
function etDel(t,eg,st){if(t&&P.entgelttabelle[t]&&P.entgelttabelle[t][eg])delete P.entgelttabelle[t][eg][st];else if(P.entgelttabelle[eg])delete P.entgelttabelle[eg][st];einstellungenSpeichern().then(function(){fillETTable();});}
function fillTETable(){var te=P.tariferhoehungen||[];document.querySelector('#tbl-te tbody').innerHTML=te.map(function(t,i){return '<tr><td>'+MONATE[(t.ab||1)-1]+'</td><td>'+(t.pz?t.pz+'%':'–')+'</td><td>'+(t.bt?fmtEur(t.bt):'–')+'</td><td>'+(t.fda||'–')+'</td><td>'+(t.fkst||'–')+'</td><td><button class="btn-del-row" onclick="teDel('+i+')">×</button></td></tr>';}).join('')||'<tr><td colspan="6" class="text-muted">–</td></tr>';}
function teAdd(){var ab=parseInt(document.getElementById('add-te-monat').value),pz=parseNum(document.getElementById('add-te-pz').value),bt=parseNum(document.getElementById('add-te-bt').value);if(!pz&&!bt)return;P.tariferhoehungen=P.tariferhoehungen||[];var e={ab:ab};if(pz)e.pz=pz;else e.bt=bt;P.tariferhoehungen.push(e);einstellungenSpeichern().then(function(){fillTETable();});document.getElementById('add-te-pz').value='';document.getElementById('add-te-bt').value='';}
function teDel(i){P.tariferhoehungen.splice(i,1);einstellungenSpeichern().then(function(){fillTETable();});}

function einstellungenSpeichern(silent) {
    var sv={};document.querySelectorAll('[data-sv]').forEach(function(e){sv[e.dataset.sv]=parseFloat(e.value)||0;});
    P.name=document.getElementById('set-name').value;P.jahr=parseInt(document.getElementById('set-jahr').value);P.sv=sv;
    P.sz_monat=parseInt(document.getElementById('set-sz-monat').value);P.sz_prozent=parseNum(document.getElementById('set-sz-proz').value);
    document.getElementById('nav-title').textContent=P.name+' ('+P.jahr+')';
    return dbProjektSpeichern(P).then(function(){if(!silent)showToast('Einstellungen gespeichert');});
}

// ─── CSV Import ────────────────────────────────────────────────────
function csvImport(typ) {
    var inp=document.getElementById(typ==='ist'?'csv-ist':'csv-ma');
    if(!inp.files.length){showToast('Datei wählen','error');return;}
    inp.files[0].text().then(function(text){
        var dl=text.slice(0,4096).indexOf(';')>=0?';':',';
        var lines=text.split('\n').map(function(l){return l.trim();}).filter(Boolean);
        if(lines.length<2){showToast('Datei leer','error');return;}
        var headers=lines[0].split(dl).map(function(h){return h.trim().toLowerCase().replace(/"/g,'');});
        var promises=[],count=0;
        for(var i=1;i<lines.length;i++){
            var vals=lines[i].split(dl).map(function(v){return v.trim().replace(/"/g,'');});
            var row={};headers.forEach(function(h,j){row[h]=vals[j]||'';});
            if(typ==='ist'){
                var pnr=row.pnr||row.personalnummer,monat=parseInt(row.monat||row.mon),brutto=parseNum(row.brutto||row.monatsbrutto);
                if(pnr&&monat&&brutto){var ma=P.mitarbeiter.find(function(m){return String(m.pnr)===String(pnr);});
                    if(ma){ma.ist_daten=ma.ist_daten||{};ma.ist_daten[String(monat)]={brutto:brutto,ag:parseNum(row.ag),sz:parseNum(row.sz),gesamt:brutto+parseNum(row.ag)+parseNum(row.sz)};promises.push(dbMaSpeichern(PID,ma));count++;}}
            } else {
                var ma=neuerMa();ma.pnr=row.pnr||row.personalnummer||row.nr||'';ma.nachname=row.nachname||row.name||'';ma.vorname=row.vorname||'';
                ma.tarif=row.tarif||'';ma.eg=row.eg||row.entgeltgruppe||'';ma.stufe=row.stufe||row.st||'';
                ma.da=row.da||row.dienstart||'';ma.kst=row.kst||row.kostenstelle||'';
                ma.brutto=parseNum(row.brutto||row.monatsbrutto||row.gehalt||'0');ma.vk=parseNum(row.vk||row.vollkraft||'1');
                if(row.eintritt)ma.eintritt=datumIso(row.eintritt);if(row.austritt)ma.austritt=datumIso(row.austritt);
                if(ma.nachname||ma.pnr){promises.push(dbMaSpeichern(PID,ma));count++;}
            }
        }
        Promise.all(promises).then(function(){showToast(count+' importiert');ladeProjekt();});
    });
}
