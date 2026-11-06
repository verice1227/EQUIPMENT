(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const SOURCE = Array.isArray(window.EQUIPMENT_TILES) ? window.EQUIPMENT_TILES : [];
  const MAP_WIDTH=1899,MAP_HEIGHT=821, STORAGE_KEY='equipment-finder-reviewed-v1';
  const COLORS={green:'#008000',maroon:'#800000',red:'#ff0000',orange:'#ff8000',blue:'#0080ff',yellow:'#ffff00'};
  const records=SOURCE.map((record,i)=>({...record,index:i+1,id:record.id||record.ocr_id||'Tile '+String(i+1).padStart(3,'0'),subtitle:record.subtitle||record.ocr_detail||''}));
  let corrections={},selected=null,matches=[],matchIndex=0,query='',zoom=.75,fullscreen=false;
  const buttons=new Map();

  function loadCorrections(){try{const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))corrections=value;}catch{corrections={};}}
  function saveCorrections(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(corrections));return true;}catch{return false;}}
  function normalized(text){return String(text||'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
  function digitFriendly(text){return normalized(text).replace(/O/g,'0').replace(/I/g,'1').replace(/S/g,'5').replace(/B/g,'8');}
  function searchFields(record){return [record.id,record.subtitle,record.ocr_id,record.ocr_detail,...(record.ocr_alternates||[])];}
  function isMatch(record,text){
    const simple=normalized(text),digits=digitFriendly(text);
    if(!simple)return false;
    return searchFields(record).some(field=>normalized(field).includes(simple)||digitFriendly(field).includes(digits));
  }
  function searchTerms(text){return text.split(/[,;\n]+/).map(s=>s.trim()).filter(s=>normalized(s));}
  function matchesQuery(record,text){return searchTerms(text).some(term=>isMatch(record,term));}
  function colorName(name){return ({green:'Green',maroon:'Dark red',red:'Red',orange:'Orange',blue:'Blue',yellow:'Yellow'})[name]||'Unknown';}
  function renderSuggestions(){
    const input=$('search'),box=$('searchSuggestions');
    const terms=searchTerms(input.value),last=terms.at(-1)||'';
    const active=document.activeElement===input&&last.length>=2;
    const suggestions=active?records.filter(r=>isMatch(r,last)).slice(0,7):[];
    const fragment=document.createDocumentFragment();
    for(const record of suggestions){
      const button=document.createElement('button');button.type='button';button.className='suggestion-item';button.setAttribute('role','option');
      const name=document.createElement('strong');name.textContent=record.id;
      const description=document.createElement('span');description.textContent=record.subtitle||'Equipment location';
      button.append(name,description);
      button.addEventListener('mousedown',event=>event.preventDefault());
      button.addEventListener('click',()=>{
        const parts=input.value.split(/[,;\n]+/).slice(0,-1).map(x=>x.trim()).filter(Boolean);
        parts.push(record.id);input.value=parts.join(', ');applySearch();hideSuggestions();
        selectRecord(record,true);
      });fragment.append(button);
    }
    box.replaceChildren(fragment);box.hidden=!suggestions.length;input.setAttribute('aria-expanded',String(!!suggestions.length));
  }
  function hideSuggestions(){$('searchSuggestions').hidden=true;$('search').setAttribute('aria-expanded','false');}
  function renderQuickResults(){
    const holder=$('quickResults'),fragment=document.createDocumentFragment();
    if(!query||!matches.length){holder.hidden=true;holder.replaceChildren();return;}
    for(const record of matches.slice(0,24)){
      const button=document.createElement('button');button.type='button';button.className='quick-result';
      button.classList.toggle('active',selected===record.index);
      const dot=document.createElement('i');dot.style.background=COLORS[record.color]||'#888';
      const label=document.createElement('span');label.textContent=record.id;
      button.append(dot,label);button.title=record.subtitle||record.id;
      button.addEventListener('click',()=>{selectRecord(record,true);hideSuggestions();});fragment.append(button);
    }
    if(matches.length>24){const more=document.createElement('span');more.className='quick-more';more.textContent=`+${matches.length-24} more · use arrows`;fragment.append(more);}
    holder.replaceChildren(fragment);holder.hidden=false;
  }
  function makeHotspots(){
    const holder=$('hotspots');const fragment=document.createDocumentFragment();
    records.forEach(record=>{
      const btn=document.createElement('button');btn.type='button';btn.className='hotspot';btn.dataset.index=String(record.index);
      btn.style.left=(record.x-2)+'px';btn.style.top=(record.y-2)+'px';btn.style.width=(record.w+4)+'px';btn.style.height=(record.h+4)+'px';
      btn.style.backgroundPosition=(-record.x+2)+'px '+(-record.y+2)+'px';
      btn.setAttribute('aria-label','Equipment '+record.id+'; '+record.subtitle);
      btn.title=record.id+(record.subtitle?' · '+record.subtitle:'');
      btn.addEventListener('click',()=>selectRecord(record,true));
      buttons.set(record.index,btn);fragment.append(btn);
    });
    holder.replaceChildren(fragment);
  }
  function setZoom(value){
    zoom=Math.round(Math.max(.38,Math.min(1.6,value))*100)/100;
    $('mapCanvas').style.transform=`scale(${zoom})`;
    $('scaledSpace').style.width=Math.ceil(MAP_WIDTH*zoom)+'px';
    $('scaledSpace').style.height=Math.ceil(MAP_HEIGHT*zoom)+'px';
    $('zoomText').textContent=Math.round(zoom*100)+'%';
  }
  function scrollToTile(record){
    const viewport=$('mapViewport');
    const x=(record.x+record.w/2)*zoom-viewport.clientWidth/2;
    const y=(record.y+record.h/2)*zoom-viewport.clientHeight/2;
    viewport.scrollTo({left:Math.max(0,x),top:Math.max(0,y),behavior:'smooth'});
  }
  function updateHighlight(){
    const active=!!query;
    $('mapCanvas').classList.toggle('searching',active);
    const set=new Set(matches.map(r=>r.index));
    records.forEach(r=>{
      const btn=buttons.get(r.index),found=active&&set.has(r.index);
      btn.classList.toggle('match',found);
      btn.classList.toggle('selected',selected===r.index);
      if(found){btn.style.backgroundImage="url('./floor-map.png')";}
      else btn.style.backgroundImage='none';
    });
    $('resultCount').textContent=active?`${matches.length} matching ${matches.length===1?'tile':'tiles'} out of ${records.length}`:`${records.length} equipment tiles indexed · type to search`;
    $('resultPosition').textContent=matches.length?`${matchIndex+1} / ${matches.length}`:'—';
    $('fullPosition').textContent=matches.length?`${matchIndex+1} / ${matches.length}`:'—';
    $('previous').disabled=matches.length<=1;
    $('next').disabled=matches.length<=1;
    $('fullPrevious').disabled=matches.length<=1;
    $('fullNext').disabled=matches.length<=1;
    $('clear').hidden=!active;
    renderQuickResults();
  }
  function applySearch(){
    query=$('search').value.trim();
    $('fullscreenSearch').value=query;
    matches=searchTerms(query).length?records.filter(r=>matchesQuery(r,query)):[];
    matchIndex=0;
    if(matches.length)selectRecord(matches[0],true);
    else if(query){selected=null;renderDetails(null);}
    updateHighlight();
    renderSuggestions();
  }
  function selectRecord(record,scroll=false){
    selected=record.index;
    const i=matches.findIndex(r=>r.index===record.index);
    if(i>=0)matchIndex=i;
    renderDetails(record);updateHighlight();
    if(scroll)scrollToTile(record);
  }
  function navigate(delta){
    if(!matches.length)return;
    matchIndex=(matchIndex+delta+matches.length)%matches.length;
    selectRecord(matches[matchIndex],true);
  }
  function setFullscreen(value){
    fullscreen=!!value;
    document.body.classList.toggle('map-fullscreen',fullscreen);
    $('toggleFullscreen').setAttribute('aria-pressed',String(fullscreen));
    $('fullscreenLabel').textContent=fullscreen?'Exit':'Fullscreen';
    $('toggleFullscreen').title=fullscreen?'Exit fullscreen map':'Expand map';
    if(fullscreen){$('fullscreenSearch').value=$('search').value;}
    requestAnimationFrame(()=>{
      setZoom(Math.min(1.6,Math.max(.38,($('mapViewport').clientWidth-16)/MAP_WIDTH)));
      const record=records.find(r=>r.index===selected);if(record)scrollToTile(record);
    });
  }
  function renderDetails(record){
    $('emptyDetail').hidden=!!record;$('detailContent').hidden=!record;
    if(!record)return;
    $('detailId').textContent=record.id;
    $('detailSubtitle').textContent=record.subtitle||'Not legible';
    $('detailSwatch').style.background=COLORS[record.color]||'#777';
    $('detailColor').textContent=colorName(record.color)+' tile';
    $('reviewBadge').textContent=corrections[record.index]?'Edited':record.manual?'Visually checked':record.ocr_score>=10?'OCR · review':'Uncertain OCR';
    $('detailNumber').textContent=String(record.index).padStart(3,'0');
    $('detailCoords').textContent=`${record.x}, ${record.y}`;
    $('detailSize').textContent=`${record.w} × ${record.h}`;
    $('editId').value=record.id.startsWith('Tile ')?'':record.id;
    $('editSubtitle').value=record.subtitle;
  }
  function updateLabel(){
    const record=records.find(r=>r.index===selected);if(!record)return;
    const id=$('editId').value.trim().slice(0,48),subtitle=$('editSubtitle').value.trim().slice(0,64);
    if(!id){$('editId').focus();return;}
    record.id=id;record.subtitle=subtitle;
    corrections[record.index]={id,subtitle};
    saveCorrections();renderSuggestions();
    for(const r of records){const b=buttons.get(r.index);b.title=r.id+(r.subtitle?' · '+r.subtitle:'');b.setAttribute('aria-label','Equipment '+r.id+'; '+r.subtitle);}
    if(query)applySearch();else selectRecord(record);
  }
  function resetLabel(){
    const record=records.find(r=>r.index===selected);if(!record)return;
    delete corrections[record.index];saveCorrections();
    record.id=record.ocr_id||'Tile '+String(record.index).padStart(3,'0');record.subtitle=record.ocr_detail||'';
    renderSuggestions();if(query)applySearch();else selectRecord(record);
  }
  function exportIndex(){
    const csvValue=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    const headers=['tile_number','equipment_id','second_line','color','x','y','width','height','ocr_reviewed'];
    const lines=[headers.join(',')];
    for(const r of records)lines.push([r.index,r.id,r.subtitle,r.color,r.x,r.y,r.w,r.h,!!corrections[r.index]].map(csvValue).join(','));
    const blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download='Equipment_Map_Search_Index.csv';anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function init(){
    loadCorrections();
    records.forEach(r=>{if(corrections[r.index]){r.id=corrections[r.index].id||r.id;r.subtitle=corrections[r.index].subtitle??r.subtitle;}});
    makeHotspots();updateHighlight();renderDetails(null);
    $('search').addEventListener('input',applySearch);
    $('search').addEventListener('focus',renderSuggestions);
    $('search').addEventListener('blur',()=>setTimeout(hideSuggestions,170));
    $('fullscreenSearch').addEventListener('input',()=>{$('search').value=$('fullscreenSearch').value;applySearch();});
    $('fullscreenSearch').addEventListener('keydown',event=>{if(event.key==='Enter'&&matches.length){event.preventDefault();selectRecord(matches[matchIndex],true);event.target.blur();}});
    $('search').addEventListener('keydown',event=>{
      if(event.key==='Enter'&&matches.length){event.preventDefault();selectRecord(matches[matchIndex],true);}
      if(event.key==='ArrowDown'&&matches.length){event.preventDefault();navigate(1);}
      if(event.key==='ArrowUp'&&matches.length){event.preventDefault();navigate(-1);}
      if(event.key==='Escape'){$('search').value='';applySearch();hideSuggestions();}
    });
    $('clear').addEventListener('click',()=>{$('search').value='';applySearch();$('search').focus();});
    $('previous').addEventListener('click',()=>navigate(-1));
    $('next').addEventListener('click',()=>navigate(1));
    $('fullPrevious').addEventListener('click',()=>navigate(-1));
    $('fullNext').addEventListener('click',()=>navigate(1));
    $('toggleFullscreen').addEventListener('click',()=>setFullscreen(!fullscreen));
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&fullscreen){setFullscreen(false);return;}
      if(event.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){
        event.preventDefault();(fullscreen?$('fullscreenSearch'):$('search')).focus();
      }
    });
    $('zoomIn').addEventListener('click',()=>setZoom(zoom+.15));
    $('zoomOut').addEventListener('click',()=>setZoom(zoom-.15));
    $('zoomFit').addEventListener('click',()=>setZoom(($('mapViewport').clientWidth-8)/MAP_WIDTH));
    $('saveEdit').addEventListener('click',updateLabel);
    $('resetEdit').addEventListener('click',resetLabel);
    $('exportIndex').addEventListener('click',exportIndex);
    setZoom(window.innerWidth<700?.88:.8);
    if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
