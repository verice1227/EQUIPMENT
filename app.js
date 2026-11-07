(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const SOURCE = Array.isArray(window.EQUIPMENT_TILES) ? window.EQUIPMENT_TILES : [];
  const MAP_WIDTH=1902,MAP_HEIGHT=827, STORAGE_KEY='equipment-finder-reviewed-v1';
  const COLORS={green:'#008000',maroon:'#800000',red:'#ff0000',orange:'#ff8000',blue:'#0080ff',yellow:'#ffff00'};
  const records=SOURCE.map((record,i)=>({...record,index:i+1,id:record.id||record.ocr_id||'Tile '+String(i+1).padStart(3,'0'),subtitle:record.subtitle||record.ocr_detail||''}));
  let corrections={},selected=null,matches=[],matchIndex=0,query='',zoom=.75,fullscreen=false,pendingImport=null;
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
    const base=SOURCE[record.index-1];
    record.id=base.id||base.ocr_id||'Tile '+String(record.index).padStart(3,'0');record.subtitle=base.subtitle||base.ocr_detail||'';
    renderSuggestions();if(query)applySearch();else selectRecord(record);
  }
  function message(text){$('maintenanceMessage').textContent=text;}
  function downloadFile(filename,contents,type){
    const blob=new Blob([contents],{type});
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function exportIndex(){
    const csvValue=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    const headers=['tile_number','equipment_id','second_line','color','x','y','width','height','ocr_reviewed'];
    const lines=[headers.join(',')];
    for(const r of records)lines.push([r.index,r.id,r.subtitle,r.color,r.x,r.y,r.w,r.h,!!corrections[r.index]].map(csvValue).join(','));
    downloadFile('Equipment_Map_Search_Index.csv','\uFEFF'+lines.join('\r\n'),'text/csv;charset=utf-8');
    message('CSV exported. Edit only the equipment_id and second_line columns; keep tile_number and coordinates unchanged.');
  }
  function parseCSV(contents){
    const source=contents.replace(/^\uFEFF/,'');
    const rows=[];let row=[],field='',quoted=false;
    for(let i=0;i<source.length;i++){
      const char=source[i];
      if(quoted){
        if(char==='"'&&source[i+1]==='"'){field+='"';i++;}
        else if(char==='"')quoted=false;
        else field+=char;
      }else if(char==='"'){
        if(field!=='')throw new Error('Invalid quoted CSV field.');
        quoted=true;
      }else if(char===','){row.push(field);field='';}
      else if(char==='\r'||char==='\n'){
        if(char==='\r'&&source[i+1]==='\n')i++;
        row.push(field);field='';
        if(row.some(value=>value!==''))rows.push(row);
        row=[];
      }else field+=char;
    }
    if(quoted)throw new Error('Unclosed quoted field in CSV.');
    if(row.length||field!==''){row.push(field);if(row.some(value=>value!==''))rows.push(row);}
    return rows;
  }
  function validateCSV(text){
    const rows=parseCSV(text);
    if(rows.length<2)throw new Error('CSV has no equipment rows.');
    const headers=rows[0].map(h=>h.trim().toLowerCase());
    for(const needed of ['tile_number','equipment_id','second_line']){
      if(!headers.includes(needed))throw new Error('Missing required column: '+needed);
    }
    const column=key=>headers.indexOf(key);
    const seen=new Set(),changes=[];
    for(let i=1;i<rows.length;i++){
      const row=rows[i];
      if(row.length!==headers.length)throw new Error(`CSV row ${i+1} has ${row.length} columns; expected ${headers.length}.`);
      const numberText=row[column('tile_number')].trim();
      if(!/^\d+$/.test(numberText))throw new Error(`Invalid tile number at row ${i+1}.`);
      const number=Number(numberText),record=records[number-1];
      if(!record)throw new Error(`Unknown tile number ${number} at row ${i+1}.`);
      if(seen.has(number))throw new Error(`Duplicate tile number ${number}.`);
      seen.add(number);
      for(const [key,value] of [['x',record.x],['y',record.y],['width',record.w],['height',record.h]]){
        const idx=column(key);
        if(idx>=0&&Number(row[idx])!==value)throw new Error(`Tile ${number} has a different ${key}. Use a CSV exported from this map version.`);
      }
      const id=row[column('equipment_id')].trim(),subtitle=row[column('second_line')].trim();
      if(!id||id.length>48||subtitle.length>64)throw new Error(`Invalid equipment label at row ${i+1}. Maximum lengths: ID 48, second line 64.`);
      if(/[\u0000-\u001F]/.test(id+subtitle))throw new Error(`Control character in label at row ${i+1}.`);
      if(id!==record.id||subtitle!==record.subtitle)changes.push({number,id,subtitle});
    }
    return {count:seen.size,changes};
  }
  async function chooseCSV(event){
    const file=event.target.files?.[0];event.target.value='';
    pendingImport=null;$('importPreview').hidden=true;
    if(!file)return;
    if(file.size>2*1024*1024){message('Import failed: CSV exceeds the 2 MB size limit.');return;}
    try{
      const result=validateCSV(await file.text());
      pendingImport=result.changes;
      if(!result.changes.length){message(`Checked ${result.count} rows. No different labels were found.`);return;}
      $('importSummary').textContent=`Checked ${result.count} equipment rows. ${result.changes.length} label corrections are ready. Review the source file before applying; unchanged labels will be preserved.`;
      $('importPreview').hidden=false;
      message('Import preview ready. No saved labels have been changed yet.');
    }catch(error){message('Import failed: '+error.message);}
  }
  function applyImport(){
    if(!pendingImport)return;
    const count=pendingImport.length;
    for(const change of pendingImport){
      const record=records[change.number-1];record.id=change.id;record.subtitle=change.subtitle;
      corrections[change.number]={id:change.id,subtitle:change.subtitle};
      const btn=buttons.get(change.number);btn.title=record.id+(record.subtitle?' · '+record.subtitle:'');btn.setAttribute('aria-label','Equipment '+record.id+'; '+record.subtitle);
    }
    const saved=saveCorrections();pendingImport=null;$('importPreview').hidden=true;
    if(query)applySearch();else {renderSuggestions();const record=records.find(r=>r.index===selected);if(record)selectRecord(record);}
    message(saved?`Applied and saved ${count} corrected labels on this device. Download updated tiles.js to publish them for everyone.`:`Applied ${count} labels in this session, but device storage could not save them. Download tiles.js now to preserve them.`);
  }
  function downloadTiles(){
    const merged=SOURCE.map((base,i)=>{
      const record=records[i],edited=!!corrections[i+1];
      return {...base,id:record.id,subtitle:record.subtitle,
        ocr_id:edited?record.id:base.ocr_id,
        ocr_detail:edited?record.subtitle:base.ocr_detail,
        ocr_alternates:edited?[]:base.ocr_alternates,
        ocr_score:edited?20:base.ocr_score,
        manual:edited?true:base.manual};
    });
    downloadFile('tiles.js','window.EQUIPMENT_TILES = '+JSON.stringify(merged)+';\n','text/javascript;charset=utf-8');
    message('Downloaded updated tiles.js. Upload it to the root of your existing GitHub repository to publish the corrected equipment labels.');
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
    $('importCsv').addEventListener('change',chooseCSV);
    $('applyImport').addEventListener('click',applyImport);
    $('cancelImport').addEventListener('click',()=>{pendingImport=null;$('importPreview').hidden=true;message('CSV import cancelled. No changes applied.');});
    $('downloadTiles').addEventListener('click',downloadTiles);
    setZoom(window.innerWidth<700?.88:.8);
    if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
