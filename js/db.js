/* PKR Supabase Datenbank-Layer */
var _sb = null;

function initDB(url, key) {
    _sb = window.supabase.createClient(url, key);
}

function dbProjektListe() {
    return _sb.from('projekte').select('id, name, jahr, updated_at').order('updated_at', { ascending: false }).then(function(r) { return r.data || []; });
}

function dbProjektErstellen(name, jahr) {
    var p = neuesProjekt(); p.name = name; p.jahr = jahr || p.jahr;
    var einst = { sv:p.sv, tarife:p.tarife, dienstarten:p.dienstarten, kostenstellen:p.kostenstellen, entgelttabelle:p.entgelttabelle, sonderzahlung:p.sonderzahlung||{}, sz_monat:p.sz_monat, sz_prozent:p.sz_prozent, tariferhoehungen:p.tariferhoehungen };
    return _sb.from('projekte').insert({ name:p.name, jahr:p.jahr, einstellungen:einst }).select().single().then(function(r) { return r.error ? null : r.data; });
}

function dbProjektLaden(id) {
    return _sb.from('projekte').select('*').eq('id', id).single().then(function(pr) {
        if (pr.error || !pr.data) return null;
        var pd = pr.data, einst = pd.einstellungen || {};
        var p = neuesProjekt();
        p.name = pd.name; p.jahr = pd.jahr; p._id = pd.id;
        ['sv','tarife','dienstarten','kostenstellen','entgelttabelle','sonderzahlung','sz_monat','sz_prozent','tariferhoehungen'].forEach(function(k) { if (einst[k] !== undefined) p[k] = einst[k]; });
        return _sb.from('mitarbeiter').select('*').eq('projekt_id', id).order('nachname').then(function(mr) {
            (mr.data || []).forEach(function(r) {
                var anp = r.anpassungen || [];
                p.mitarbeiter.push({
                    _id:r.id, pnr:r.pnr||'', titel:r.titel||'', vorname:r.vorname||'', nachname:r.nachname||'',
                    tarif:r.tarif||'', eg:r.eg||'', stufe:r.stufe||'',
                    brutto:parseFloat(r.brutto)||0, vk:parseFloat(r.vk)||1.0,
                    da:r.da||'', kst:r.kst||'', eintritt:r.eintritt||null, austritt:r.austritt||null,
                    bemerkung:r.bemerkung||'',
                    stufenaufstiege:anp.filter(function(x){return x.stufe!==undefined||x.eg!==undefined;}),
                    ind_erhoehungen:anp.filter(function(x){return (x.pz!==undefined||x.bt!==undefined)&&x.stufe===undefined&&x.eg===undefined;}),
                    std_anpassungen:anp.filter(function(x){return x.vk!==undefined&&x.stufe===undefined&&x.grund===undefined;}),
                    abwesenheiten:anp.filter(function(x){return x.grund!==undefined;}),
                    ist_daten:r.ist_daten||{}, sz_override:r.sz_override||null, extra:r.extra||{}
                });
            });
            return p;
        });
    });
}

function dbProjektSpeichern(p) {
    var einst = {};
    ['sv','tarife','dienstarten','kostenstellen','entgelttabelle','sonderzahlung','sz_monat','sz_prozent','tariferhoehungen'].forEach(function(k) { einst[k] = p[k]; });
    return _sb.from('projekte').update({ name:p.name, jahr:p.jahr, einstellungen:einst }).eq('id', p._id);
}

function dbProjektLoeschen(id) {
    return _sb.from('mitarbeiter').delete().eq('projekt_id', id).then(function() {
        return _sb.from('projekte').delete().eq('id', id);
    });
}

function dbMaSpeichern(projektId, ma) {
    var anp = (ma.stufenaufstiege||[]).concat(ma.ind_erhoehungen||[]).concat(ma.std_anpassungen||[]).concat(ma.abwesenheiten||[]);
    var data = {
        projekt_id:projektId, pnr:ma.pnr, titel:ma.titel, vorname:ma.vorname, nachname:ma.nachname,
        tarif:ma.tarif, eg:ma.eg, stufe:ma.stufe, brutto:ma.brutto, vk:ma.vk,
        da:ma.da, kst:ma.kst, eintritt:ma.eintritt||null, austritt:ma.austritt||null,
        bemerkung:ma.bemerkung, anpassungen:anp, ist_daten:ma.ist_daten||{},
        sz_override:ma.sz_override||null, extra:ma.extra||{}
    };
    if (ma._id) {
        return _sb.from('mitarbeiter').update(data).eq('id', ma._id).then(function() { return ma._id; });
    } else {
        return _sb.from('mitarbeiter').insert(data).select().single().then(function(r) {
            if (r.data) ma._id = r.data.id;
            return ma._id;
        });
    }
}

function dbMaLoeschen(id) { return _sb.from('mitarbeiter').delete().eq('id', id); }

// --- Import/Export Helpers ---
function _maToRow(projektId, ma) {
    var anp = (ma.stufenaufstiege||[]).concat(ma.ind_erhoehungen||[]).concat(ma.std_anpassungen||[]).concat(ma.abwesenheiten||[]);
    return {
        projekt_id: projektId,
        pnr: ma.pnr||'', titel: ma.titel||'', vorname: ma.vorname||'', nachname: ma.nachname||'',
        tarif: ma.tarif||'', eg: ma.eg||'', stufe: ma.stufe||'',
        brutto: parseFloat(ma.brutto)||0, vk: parseFloat(ma.vk)||1.0,
        da: ma.da||'', kst: ma.kst||'',
        eintritt: ma.eintritt||null, austritt: ma.austritt||null,
        bemerkung: ma.bemerkung||'',
        ist_daten: ma.ist_daten||{}, sz_override: ma.sz_override||null,
        extra: ma.extra||{}, anpassungen: anp
    };
}

// Importiert ein Projekt als NEUES Projekt (inkl. Mitarbeitende)
function dbProjektImportNeu(p) {
    var einst = {};
    ['sv','tarife','dienstarten','kostenstellen','entgelttabelle','sonderzahlung','sz_monat','sz_prozent','tariferhoehungen',
     'ist_ab_monat','szenarien','log','aenderungen','logo_dataurl','extra_spalten','sichtbare_spalten','gruppierung'
    ].forEach(function(k){ if (p[k] !== undefined) einst[k]=p[k]; });

    return _sb.from('projekte').insert({ name:p.name||'Import', jahr:p.jahr||new Date().getFullYear(), einstellungen:einst })
      .select().single().then(function(r){
        if (r.error || !r.data) return null;
        var pid = r.data.id;
        var rows = (p.mitarbeiter||[]).map(function(ma){ return _maToRow(pid, ma); });
        if (!rows.length) return r.data;
        return _sb.from('mitarbeiter').insert(rows).then(function(rr){
            return rr.error ? null : r.data;
        });
      });
}

// Überschreibt ein bestehendes Projekt (Einstellungen + Mitarbeitende komplett ersetzen)
function dbProjektOverwrite(p) {
    var einst = {};
    ['sv','tarife','dienstarten','kostenstellen','entgelttabelle','sonderzahlung','sz_monat','sz_prozent','tariferhoehungen',
     'ist_ab_monat','szenarien','log','aenderungen','logo_dataurl','extra_spalten','sichtbare_spalten','gruppierung'
    ].forEach(function(k){ if (p[k] !== undefined) einst[k]=p[k]; });

    return _sb.from('projekte').update({ name:p.name, jahr:p.jahr, einstellungen:einst }).eq('id', p._id)
      .then(function(up){
        if (up.error) return null;
        return _sb.from('mitarbeiter').delete().eq('projekt_id', p._id).then(function(){
            var rows = (p.mitarbeiter||[]).map(function(ma){ return _maToRow(p._id, ma); });
            if (!rows.length) return p;
            return _sb.from('mitarbeiter').insert(rows).then(function(ins){
                return ins.error ? null : p;
            });
        });
      });
}

