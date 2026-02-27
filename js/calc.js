/* PKR Berechnungsmodul – 1:1 Port aus personalkostenrechner.py */
var MONATE = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
var MK = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

function fmtEur(v) { return new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(v||0); }
function parseNum(s) { if (typeof s==='number') return s; return parseFloat(String(s||'0').replace(/\./g,'').replace(',','.'))||0; }

function parseDatum(s) {
    if (!s) return null; s=String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { var d=new Date(s+'T00:00:00'); return isNaN(d.getTime())?null:d; }
    var m=s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) { var d=new Date(+m[3],+m[2]-1,+m[1]); return (d.getDate()===+m[1]&&d.getMonth()===+m[2]-1)?d:null; }
    return null;
}
function datumIso(s) { if(!s)return null; var d=parseDatum(s); return d?d.toISOString().slice(0,10):null; }
function datumAnzeige(s) { var d=parseDatum(s); return d?d.toLocaleDateString('de-DE'):(s||''); }
function daysInMonth(y,m) { return new Date(y,m,0).getDate(); }

function neuesProjekt() {
    return { name:"Neues Projekt", jahr:new Date().getFullYear(),
        sv:{"KV":7.3,"Zusatzbeitrag KV":0.7,"RV":9.3,"AV":1.3,"PV":1.7,"Insolvenzumlage":0.06,"U1":1.6,"U2":0.44},
        tarife:{}, dienstarten:{}, kostenstellen:{}, entgelttabelle:{}, sonderzahlung:{},
        sz_monat:11, sz_prozent:90.0, tariferhoehungen:[], mitarbeiter:[] };
}
function neuerMa() {
    return { pnr:"",titel:"",vorname:"",nachname:"",eg:"",stufe:"",brutto:0,tarif:"",da:"",kst:"",vk:1.0,
        eintritt:null,austritt:null,stufenaufstiege:[],ind_erhoehungen:[],std_anpassungen:[],abwesenheiten:[],
        sz_override:null,ist_daten:{},bemerkung:"",extra:{} };
}

function agSatz(p) { return Object.values(p.sv||{}).reduce(function(s,v){return s+(parseFloat(v)||0);},0); }
function tarifStunden(p,tarif) { return (p.tarife||{})[String(tarif||'')]&&(p.tarife||{})[String(tarif||'')].stunden||0; }
function entgelt(p,eg,st,tarif) {
    var et=p.entgelttabelle||{};
    if (tarif&&et[tarif]&&typeof et[tarif]==='object') {
        var fv=null; for(var k in et[tarif]){fv=et[tarif][k];break;}
        if (fv&&typeof fv==='object'&&!Array.isArray(fv)) { var v=(et[tarif][String(eg)]||{})[String(st)]; if(v!==undefined)return v; }
    }
    return (et[String(eg)]||{})[String(st)]||null;
}
function entgeltEgForTarif(p,tarif) {
    var et=p.entgelttabelle||{};
    if (tarif&&et[tarif]&&typeof et[tarif]==='object') {
        var fv=null;for(var k in et[tarif]){fv=et[tarif][k];break;}
        if(fv&&typeof fv==='object'&&!Array.isArray(fv)) return Object.keys(et[tarif]).sort();
    }
    return Object.keys(et).filter(function(k){return typeof et[k]==='object';}).sort();
}
function entgeltStufenForEg(p,eg,tarif) {
    var et=p.entgelttabelle||{};
    if (tarif&&et[tarif]&&typeof et[tarif]==='object') {
        var fv=null;for(var k in et[tarif]){fv=et[tarif][k];break;}
        if(fv&&typeof fv==='object'&&!Array.isArray(fv)) return Object.keys((et[tarif]||{})[String(eg)]||{}).sort();
    }
    var sub=et[String(eg)]; return (sub&&typeof sub==='object')?Object.keys(sub).sort():[];
}
function maName(ma) { var t=ma.titel?ma.titel+' ':''; return (ma.nachname||'')+', '+t+(ma.vorname||''); }
function kstBezeichnung(p,kst) { return ((p.kostenstellen||{})[String(kst)]||{}).bezeichnung||''; }
function daBezeichnung(p,da) { return ((p.dienstarten||{})[String(da)]||{}).bezeichnung||''; }

function anteil(p,ma,m) {
    var j=p.jahr, tg=daysInMonth(j,m);
    var e1=new Date(j,m-1,1), eL=new Date(j,m-1,tg);
    var s=new Date(e1.getTime()), e=new Date(eL.getTime());
    if (ma.eintritt) { var d=parseDatum(ma.eintritt); if(d){if(d>eL)return 0;if(d>s)s=d;} }
    if (ma.austritt) { var d=parseDatum(ma.austritt); if(d){if(d<e1)return 0;if(d<e)e=d;} }
    if (s>e) return 0;
    var arbeitstage=Math.round((e-s)/86400000)+1;
    var abws=ma.abwesenheiten||[];
    for (var i=0;i<abws.length;i++) {
        var av=parseDatum(abws[i].von), ab=parseDatum(abws[i].bis);
        if (av&&ab) { var os=av>s?av:s, oe=ab<e?ab:e; if(os<=oe) arbeitstage-=Math.round((oe-os)/86400000)+1; }
    }
    return Math.max(0, arbeitstage/tg);
}

function berechne(ma,p,teOverride) {
    var res=[], b0=parseFloat(ma.brutto)||0, b=b0, ag=agSatz(p), vk=parseFloat(ma.vk)||1.0;
    var teList=(teOverride!==undefined)?teOverride:(p.tariferhoehungen||[]);
    var istDaten=ma.ist_daten||{};
    for (var m=1;m<=12;m++) {
        if (istDaten[String(m)]) {
            var d=istDaten[String(m)];
            res.push({m:m,mn:MONATE[m-1],b:d.brutto||0,sz:d.sz||0,ag:d.ag||0,g:d.gesamt||((d.brutto||0)+(d.ag||0)+(d.sz||0)),vk:d.vk||vk,std:d.std||0,a:1.0,ist:true});
            continue;
        }
        var prevM=m-1;
        if (prevM>=1&&istDaten[String(prevM)]) {
            var bs=prevM; while(bs>1&&istDaten[String(bs-1)])bs--;
            if (bs===1) { b=istDaten[String(prevM)].brutto||b0; }
            else {
                var bc=b0,vc=parseFloat(ma.vk)||1.0;
                for(var cm=1;cm<m;cm++){
                    if(istDaten[String(cm)])continue;
                    var sa=ma.std_anpassungen||[];for(var xi=0;xi<sa.length;xi++){if(sa[xi].ab===cm){var ov=vc;vc=sa[xi].vk;bc=ov>0?bc*(vc/ov):bc;}}
                    var su=ma.stufenaufstiege||[];for(var xi=0;xi<su.length;xi++){if(su[xi].ab===cm)bc=su[xi].brutto;}
                    var ie=ma.ind_erhoehungen||[];for(var xi=0;xi<ie.length;xi++){if(ie[xi].ab===cm){if(ie[xi].pz)bc*=(1+ie[xi].pz/100);else if(ie[xi].bt)bc+=ie[xi].bt;}}
                    for(var xi=0;xi<teList.length;xi++){var x=teList[xi];if(x.ab===cm){if(x.fda&&String(x.fda)!==String(ma.da||''))continue;if(x.fkst&&String(x.fkst)!==String(ma.kst||''))continue;if(x.pz)bc*=(1+x.pz/100);else if(x.bt)bc+=x.bt;}}
                }
                b=bc;vk=vc;
            }
        }
        var a=anteil(p,ma,m);
        if(a===0){res.push({m:m,mn:MONATE[m-1],b:0,sz:0,ag:0,g:0,vk:vk,std:0,a:0});continue;}
        var sa=ma.std_anpassungen||[];for(var xi=0;xi<sa.length;xi++){if(sa[xi].ab===m){var ov=vk;vk=sa[xi].vk;b=ov>0?b*(vk/ov):b;}}
        var su=ma.stufenaufstiege||[];for(var xi=0;xi<su.length;xi++){if(su[xi].ab===m)b=su[xi].brutto;}
        var ie=ma.ind_erhoehungen||[];for(var xi=0;xi<ie.length;xi++){if(ie[xi].ab===m){if(ie[xi].pz)b*=(1+ie[xi].pz/100);else if(ie[xi].bt)b+=ie[xi].bt;}}
        for(var xi=0;xi<teList.length;xi++){var x=teList[xi];if(x.ab===m){if(x.fda&&String(x.fda)!==String(ma.da||''))continue;if(x.fkst&&String(x.fkst)!==String(ma.kst||''))continue;if(x.pz)b*=(1+x.pz/100);else if(x.bt)b+=x.bt;}}
        var ba=b*a;
        var agp=ba*ag/100;
        var ts=tarifStunden(p,ma.tarif);
        res.push({m:m,mn:MONATE[m-1],b:Math.round(ba*100)/100,sz:0,ag:Math.round(agp*100)/100,g:Math.round((ba+agp)*100)/100,vk:Math.round(vk*10000)/10000,std:ts>0?Math.round(ts*vk*100)/100:0,a:Math.round(a*10000)/10000});
    }
    // 2. Pass: Jahressonderzahlung
    var szOv=ma.sz_override;
    if (szOv&&szOv.deaktiviert) { /* keine SZ */ }
    else if (szOv&&szOv.manuell) {
        var sm=(szOv.monat||11)-1;
        if(sm>=0&&sm<12&&res[sm].a>0){
            var szVal=(szOv.betrag||0)*res[sm].a;
            res[sm].sz=Math.round(szVal*100)/100;
            var agSz=szVal*ag/100;
            res[sm].ag=Math.round((res[sm].ag+agSz)*100)/100;
            res[sm].g=Math.round((res[sm].b+res[sm].sz+res[sm].ag)*100)/100;
        }
    } else {
        // Standard-SZ über Sonderzahlungs-Tabelle oder sz_prozent
        var szData=(p.sonderzahlung||{})[ma.tarif||'']||{};
        var szSatz=typeof szData==='object'?parseFloat(szData[ma.eg||'']||0):0;
        if (szSatz>0) {
            var bJul=res[6].b,bAug=res[7].b,bSep=res[8].b;
            var basis=0,cnt=0;
            if(bJul>0){basis+=bJul;cnt++;}if(bAug>0){basis+=bAug;cnt++;}if(bSep>0){basis+=bSep;cnt++;}
            if(cnt>0){var ds=basis/cnt;var szVal=ds*szSatz/100;
                res[10].sz=Math.round(szVal*100)/100;
                var agSz=szVal*ag/100;
                res[10].ag=Math.round((res[10].ag+agSz)*100)/100;
                res[10].g=Math.round((res[10].b+res[10].sz+res[10].ag)*100)/100;}
        } else {
            // Fallback: sz_prozent
            var szMon=(p.sz_monat||11)-1;
            var szPz=p.sz_prozent||0;
            if(szPz>0&&szMon>=0&&szMon<12&&res[szMon].a>0){
                var szVal=res[szMon].b*szPz/100;
                res[szMon].sz=Math.round(szVal*100)/100;
                var agSz=szVal*ag/100;
                res[szMon].ag=Math.round((res[szMon].ag+agSz)*100)/100;
                res[szMon].g=Math.round((res[szMon].b+res[szMon].sz+res[szMon].ag)*100)/100;
            }
        }
    }
    return res;
}

function berechneGesamt(p) { var t=0;(p.mitarbeiter||[]).forEach(function(ma){berechne(ma,p).forEach(function(r){t+=r.g;});});return t; }
function berechneMonatssummen(p) { var m=[0,0,0,0,0,0,0,0,0,0,0,0];(p.mitarbeiter||[]).forEach(function(ma){berechne(ma,p).forEach(function(r,j){m[j]+=r.g;});});return m; }
function berechneNachGruppe(p,grp) {
    var g={};(p.mitarbeiter||[]).forEach(function(ma){
        var key=String(ma[grp]||'')||'(Keine)';var e=berechne(ma,p);var tot=e.reduce(function(s,r){return s+r.g;},0);
        if(!g[key]){var bez=grp==='da'?daBezeichnung(p,key):kstBezeichnung(p,key);g[key]={code:key,bezeichnung:bez,total:0,monate:[0,0,0,0,0,0,0,0,0,0,0,0],count:0};}
        g[key].total+=tot;g[key].count++;e.forEach(function(r,j){g[key].monate[j]+=r.g;});
    });return g;
}
