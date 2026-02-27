/* PKR Export-Module (PDF/XLSX) – orientiert an personalkostenrechner.py */

function _downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 2500);
}

function _exportRows(p, mal) {
  mal = mal || (p.mitarbeiter||[]);
  var hdr = ["Name","PNr","EG","St","Tarif","DA","KSt","VK","Std"].concat(MK).concat(["Gesamt"]);
  var rows = [];
  var sums = new Array(12).fill(0);
  var sumTotal = 0;

  mal.forEach(function(ma){
    var e = berechne(ma,p);
    var std = getWochenstunden(p, ma);
    var total = 0;
    var r = [maName(ma), String(ma.pnr||''), String(ma.eg||''), String(ma.stufe||''), String(ma.tarif||''), String(ma.da||''), String(ma.kst||''), (ma.vk||1).toFixed(2), (std>0?std.toFixed(1):'')];
    for (var i=0;i<12;i++) {
      var g = e[i].g || 0;
      total += g;
      sums[i] += g;
      r.push(g);
    }
    sumTotal += total;
    r.push(total);
    rows.push(r);
  });

  return { header: hdr, rows: rows, sums: sums, sumTotal: sumTotal };
}

function exportPdfUebersicht() {
  if(!window.jspdf || !window.jspdf.jsPDF) { showToast('PDF-Lib fehlt (jsPDF)', 'error'); return; }
  var p = P;
  if(!p) return;

  var doc = new window.jspdf.jsPDF({orientation:'landscape', unit:'mm', format:'a4'});
  var title = 'Personalkostenhochrechnung ' + p.jahr;
  doc.setFontSize(14);
  doc.text(title, 10, 12);
  doc.setFontSize(10);
  doc.text('Projekt: ' + (p.name||'') + ' | AG-Satz: ' + (agSatz(p).toFixed(2)) + '% | ' + new Date().toLocaleDateString('de-DE'), 10, 18);

  var ex = _exportRows(p, p.mitarbeiter);

  // AutoTable
  var body = ex.rows.map(function(r){
    return r.slice(0,9).concat(r.slice(9,21).map(function(v){return fmtEur(v);})).concat([fmtEur(r[21])]);
  });
  var head = [ex.header];

  doc.autoTable({
    head: head,
    body: body,
    startY: 22,
    styles: { fontSize: 6, cellPadding: 1.2 },
    headStyles: { fillColor: [44,62,80] },
    columnStyles: {
      7: { halign: 'right' },
      8: { halign: 'right' }
    },
    didParseCell: function(data){
      // markiert manuelle Monate (IST-Daten) – ähnlich gelb wie in EXE
      if(data.section==='body'){
        var rowIdx = data.row.index;
        var ma = (p.mitarbeiter||[])[rowIdx];
        if(ma && ma.ist_daten){
          var col = data.column.index;
          // Monatsspalten starten ab index 9 (Name..Std = 9)
          if(col>=9 && col<21){
            var m = col-8; // 1..12
            if(ma.ist_daten[String(m)]) data.cell.styles.fillColor = [255, 248, 220];
          }
        }
      }
    }
  });

  // Footer Summen
  var y = doc.lastAutoTable.finalY + 6;
  doc.setFontSize(10);
  doc.text('Gesamt: ' + fmtEur(p._gesamtkosten || berechneGesamt(p)), 10, Math.min(y, 200));

  _downloadBlob(doc.output('blob'), 'PKR_' + (p.name||'Projekt') + '_' + p.jahr + '.pdf');
}

function exportXlsxUebersicht() {
  if(!window.XLSX) { showToast('XLSX-Lib fehlt (SheetJS)', 'error'); return; }
  var p = P;
  if(!p) return;

  var wb = XLSX.utils.book_new();
  var ex = _exportRows(p, p.mitarbeiter);

  var wsData = [];
  wsData.push(['Personalkostenhochrechnung ' + p.jahr]);
  wsData.push([]);
  wsData.push(ex.header);

  ex.rows.forEach(function(r){
    var row = r.slice(0,9);
    for(var i=0;i<12;i++) row.push(r[9+i]);
    row.push(r[21]);
    wsData.push(row);
  });

  // SUMME
  wsData.push(['SUMME','','','','','','','',''].concat(ex.sums).concat([ex.sumTotal]));

  var ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Übersicht');

  // Zusammenfassung DA
  var daG = berechneNachGruppe(p,'da');
  var daRows = [['Dienstart','Bezeichnung','Anzahl','Jahreskosten','Durchschnitt']];
  Object.values(daG).sort(function(a,b){return a.code.localeCompare(b.code);}).forEach(function(r){
    var avg = r.count ? (r.total / r.count) : 0;
    daRows.push([r.code, r.bezeichnung, r.count, r.total, avg]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(daRows), 'Zusammenfassung Dienstart');

  // Zusammenfassung KSt
  var kstG = berechneNachGruppe(p,'kst');
  var kstRows = [['Kostenstelle','Bezeichnung','Anzahl','Jahreskosten','Durchschnitt']];
  Object.values(kstG).sort(function(a,b){return a.code.localeCompare(b.code);}).forEach(function(r){
    var avg = r.count ? (r.total / r.count) : 0;
    kstRows.push([r.code, r.bezeichnung, r.count, r.total, avg]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kstRows), 'Zusammenfassung Kostenstelle');

  var out = XLSX.write(wb, {bookType:'xlsx', type:'array'});
  _downloadBlob(new Blob([out], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), 'PKR_' + (p.name||'Projekt') + '_' + p.jahr + '.xlsx');
}

function _defaultSzenarien(p){
  var saved = (p.szenarien && p.szenarien.length) ? JSON.parse(JSON.stringify(p.szenarien)) : null;
  if(saved) return saved;
  return [{ name: 'Ist-Stand', te: JSON.parse(JSON.stringify(p.tariferhoehungen||[])) }];
}

function szenarioVergleichBerechnen(p, szenarien){
  var serien = [];
  var totals = [];
  for(var si=0; si<szenarien.length; si++){
    var sz = szenarien[si];
    var ms = new Array(12).fill(0);
    var total = 0;
    (p.mitarbeiter||[]).forEach(function(ma){
      var savedIst = ma.ist_daten || {};
      if(si>0) ma.ist_daten = {}; // wie EXE: Szenarien 1..n blenden IST-Daten aus
      var e = berechne(ma,p,sz.te);
      ma.ist_daten = savedIst;
      for(var j=0;j<12;j++) ms[j] += (e[j].g||0);
      total += e.reduce(function(s,r){return s+(r.g||0);},0);
    });
    serien.push({name: sz.name, monate: ms});
    totals.push({name: sz.name, total: total});
  }
  return {serien: serien, totals: totals};
}

function showSzenarioDialog(){
  if(!P) return;
  var dlg = document.getElementById('dlg-szenario');
  if(!dlg) { showToast('Dialog fehlt', 'error'); return; }
  // Laden
  window._sz_tmp = _defaultSzenarien(P);
  renderSzenarioList();
  dlg.showModal();
}

function renderSzenarioList(){
  var list = document.getElementById('sz-list');
  var szen = window._sz_tmp || [];
  list.innerHTML = szen.map(function(sz,i){
    var parts = (sz.te||[]).map(function(x){
      var ab = (x.ab||1);
      if(x.pz) return '+'+x.pz+'% ab '+MK[ab-1];
      if(x.bt) return '+'+fmtEur(x.bt)+' ab '+MK[ab-1];
      return '';
    }).filter(Boolean);
    return '<div class="sz-row">'+
      '<div class="fg-grow"><div style="font-weight:600">'+(sz.name||('Szenario '+(i+1)))+'</div><div class="text-muted" style="font-size:12px">'+(parts.join('; ')||'(Keine)')+'</div></div>'+
      (i===0 ? '' : '<button class="btn btn-sm btn-danger-ghost" onclick="szRemove('+i+')">Entfernen</button>')+
    '</div>';
  }).join('');
}

function szAdd(){
  var name = (document.getElementById('sz-name').value||'').trim();
  if(!name) name = 'Szenario ' + ((window._sz_tmp||[]).length+1);
  (window._sz_tmp||[]).push({name:name, te: JSON.parse(JSON.stringify(P.tariferhoehungen||[]))});
  document.getElementById('sz-name').value='';
  renderSzenarioList();
}
function szRemove(i){ (window._sz_tmp||[]).splice(i,1); renderSzenarioList(); }

function szSaveToProject(){
  if(!P) return;
  P.szenarien = JSON.parse(JSON.stringify(window._sz_tmp||[]));
  return dbProjektSpeichern(P).then(function(){ showToast('Szenarien gespeichert'); });
}

function szenarioVergleichen(){
  if(!P) return;
  var szen = _defaultSzenarien(P);
  var res = szenarioVergleichBerechnen(P, szen);

  // Chart
  var ctx = document.getElementById('chart-szenario');
  if(!ctx) { showToast('Szenario-Chart fehlt', 'error'); return; }
  if(window._chartSz) window._chartSz.destroy();

  window._chartSz = new Chart(ctx, {
    type: 'line',
    data: {
      labels: MK,
      datasets: res.serien.map(function(s,idx){
        return { label: s.name, data: s.monate, tension: 0.2, pointRadius: 2 };
      })
    },
    options: {
      responsive:true,
      plugins:{ legend:{ position:'bottom' } },
      scales:{ y:{ ticks:{ callback:function(v){return fmtEur(v);} } } }
    }
  });

  // Tabelle
  var basis = res.totals.length ? res.totals[0].total : 0;
  var tb = document.querySelector('#tbl-szenario tbody');
  tb.innerHTML = res.totals.map(function(r,idx){
    var diff = r.total - basis;
    return '<tr><td>'+r.name+'</td><td>'+fmtEur(r.total)+'</td><td>'+(idx===0? '–' : ((diff>=0?'+':'')+fmtEur(diff)))+'</td></tr>';
  }).join('');
}

function exportSzenarioPdf(){
  if(!P) return;
  if(!window.jspdf || !window.jspdf.jsPDF) { showToast('PDF-Lib fehlt (jsPDF)', 'error'); return; }

  var szen = _defaultSzenarien(P);
  var res = szenarioVergleichBerechnen(P, szen);
  var doc = new window.jspdf.jsPDF({orientation:'landscape', unit:'mm', format:'a4'});

  doc.setFontSize(14);
  doc.text('Szenariovergleich – ' + (P.name||'') + ' (' + P.jahr + ')', 10, 12);

  var basis = res.totals.length ? res.totals[0].total : 0;
  var head = [["Szenario","Jahreskosten","Differenz"]];
  var body = res.totals.map(function(r,idx){
    var diff = r.total - basis;
    return [r.name, fmtEur(r.total), idx===0 ? '–' : ((diff>=0?'+':'') + fmtEur(diff))];
  });

  doc.autoTable({ head: head, body: body, startY: 18, styles:{fontSize:9, cellPadding:2}, headStyles:{ fillColor:[44,62,80] } });

  // Chart (falls vorhanden)
  var chart = window._chartSz;
  if(chart){
    try {
      var img = chart.toBase64Image();
      var y = doc.lastAutoTable.finalY + 6;
      doc.addImage(img, 'PNG', 10, y, 270, 90);
    } catch(e) {}
  }

  _downloadBlob(doc.output('blob'), 'PKR_Szenario_' + (P.name||'Projekt') + '_' + P.jahr + '.pdf');
}
