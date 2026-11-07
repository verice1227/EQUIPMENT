(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const SOURCE = Array.isArray(window.EQUIPMENT_TILES) ? window.EQUIPMENT_TILES : [];
  const MAP_WIDTH=1902,MAP_HEIGHT=827, STORAGE_KEY='equipment-finder-reviewed-v1';
  const COLORS={green:'#008000',maroon:'#800000',red:'#ff0000',orange:'#ff8000',blue:'#0080ff',yellow:'#ffff00'};
  const records=SOURCE.map((record,i)=>({...record,index:i+1,id:record.id||record.ocr_id||'Tile '+String(i+1).padStart(3,'0'),subtitle:record.subtitle||record.ocr_detail||''}));
  let corrections={},selected=null,matches=[],matchIndex=0,query='',zoom=.75,fullscreen=false,pendingImport=null;
  let addMode=false,geometryMode=false,geometryDraft=null,drag=null,pendingNew=null;
  const buttons=new Map();

  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  const screenshotGeometry=base=>({x:base.image_x??base.x,y:base.image_y??base.y,w:base.image_w??base.w,h:base.image_h??base.h});
  const isRelocated=(record,base)=>!!base&&!record.added&&['x','y','w','h'].some(k=>record[k]!==screenshotGeometry(base)[k]);
  function validGeometry(x,y,w,h){
    return [x,y,w,h].every(Number.isInteger)&&w>=16&&h>=16&&x>=0&&y>=0&&x+w<=MAP_WIDTH&&y+h<=MAP_HEIGHT;
  }
  function coordinatesFromEvent(event){
    const rect=$('mapCanvas').getBoundingClientRect();
    return {x:clamp(Math.round((event.clientX-rect.left)/zoom),0,MAP_WIDTH-1),y:clamp(Math.round((event.clientY-rect.top)/zoom),0,MAP_HEIGHT-1)};
  }
  function positionButton(record){
    const btn=buttons.get(record.index);if(!btn)return;
    btn.style.left=(record.x-2)+'px';btn.style.top=(record.y-2)+'px';
    btn.style.width=(record.w+4)+'px';btn.style.height=(record.h+4)+'px';
    btn.style.backgroundPosition=(-record.x+2)+'px '+(-record.y+2)+'px';
    btn.classList.toggle('virtual-tile',!!record.added||!!record.relocated);
    if(record.added||record.relocated){
      btn.style.setProperty('--tile-color',COLORS[record.color]||COLORS.yellow);
      btn.style.color=record.color==='yellow'?'#111':'#fff';
      btn.textContent=record.id+(record.subtitle?'\n'+record.subtitle:'');
    }else btn.textContent='';
  }
  function updateButtonLabel(record){
    const btn=buttons.get(record.index);if(!btn)return;
    btn.title=record.id+(record.subtitle?' · '+record.subtitle:'');
    btn.setAttribute('aria-label','Equipment '+record.id+'; '+record.subtitle);
    positionButton(record);
  }
  function addHotspot(record){
    const btn=document.createElement('button');btn.type='button';btn.className='hotspot';btn.dataset.index=String(record.index);
    btn.addEventListener('click',()=>{if(!geometryMode&&!addMode)selectRecord(record,true);});
    buttons.set(record.index,btn);$('hotspots').append(btn);updateButtonLabel(record);
  }
  function storeRecord(record){
    corrections[record.index]={id:record.id,subtitle:record.subtitle,x:record.x,y:record.y,w:record.w,h:record.h,...(record.added?{added:true,color:record.color}:{})};
    return saveCorrections();
  }
  function refreshRecordList(record){
    updateButtonLabel(record);
    if(query)applySearch();else{renderSuggestions();selectRecord(record);}
  }

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
    $('hotspots').replaceChildren();buttons.clear();records.forEach(addHotspot);
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
      if(found&&!r.added&&!r.relocated){btn.style.backgroundImage="url('./floor-map.png')";}
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
    if(pendingNew&&record.index!==pendingNew){message('Save or cancel the new equipment first.');return;}
    if(geometryMode&&selected!==record.index)stopGeometry();
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
    $('editPosition').disabled=!!pendingNew;
    $('removeAdded').hidden=!record.added||!!pendingNew||record.index<=SOURCE.length;
    $('positionNotice').textContent=record.added?'Added overlay · not part of the screenshot':record.relocated?'Moved overlay · underlying screenshot is unchanged':'Original screenshot tile';
  }
  function updateLabel(){
    const record=records.find(r=>r.index===selected);if(!record)return;
    const id=$('editId').value.trim().slice(0,48),subtitle=$('editSubtitle').value.trim().slice(0,64);
    if(!id){$('editId').focus();return;}
    record.id=id;record.subtitle=subtitle;
    if(pendingNew===record.index){pendingNew=null;$('saveEdit').textContent='Save label';$('cancelNew').hidden=true;$('editPosition').disabled=false;}
    storeRecord(record);renderSuggestions();
    for(const r of records)updateButtonLabel(r);
    if(query)applySearch();else selectRecord(record);
    message('Equipment saved on this device. Download updated tiles.js to publish the entry.');
  }
  function resetLabel(){
    const record=records.find(r=>r.index===selected);if(!record)return;
    if(record.added){message('Use Remove added equipment to delete a new overlay.');return;}
    delete corrections[record.index];saveCorrections();
    const base=SOURCE[record.index-1];
    record.id=base.id||base.ocr_id||'Tile '+String(record.index).padStart(3,'0');record.subtitle=base.subtitle||base.ocr_detail||'';
    Object.assign(record,{x:base.x,y:base.y,w:base.w,h:base.h});
    record.relocated=isRelocated(record,base);
    updateButtonLabel(record);
    renderSuggestions();if(query)applySearch();else selectRecord(record);
  }
  function endAddMode(){
    addMode=false;$('addEquipment').classList.remove('active');$('mapCanvas').classList.remove('placing');
    $('addEquipment').setAttribute('aria-pressed','false');
  }
  function toggleAddMode(){
    if(geometryMode){message('Save or cancel the position edit first.');return;}
    if(pendingNew){message('Save or cancel your unsaved new equipment first.');return;}
    addMode=!addMode;$('addEquipment').classList.toggle('active',addMode);
    $('addEquipment').setAttribute('aria-pressed',String(addMode));
    $('mapCanvas').classList.toggle('placing',addMode);
    message(addMode?'Tap an empty area of the floor map to place a new searchable equipment box.':'Add equipment cancelled.');
  }
  function startNewEquipment(event){
    if(!addMode||event.button>0)return;
    const p=coordinatesFromEvent(event);
    if(records.some(r=>p.x>=r.x-3&&p.x<=r.x+r.w+3&&p.y>=r.y-3&&p.y<=r.y+r.h+3)){
      message('This point overlaps an equipment box. Choose an empty area.');return;
    }
    const w=78,h=34,x=clamp(p.x-Math.floor(w/2),0,MAP_WIDTH-w),y=clamp(p.y-Math.floor(h/2),0,MAP_HEIGHT-h);
    const record={index:records.length+1,id:'New equipment',subtitle:'',color:'yellow',x,y,w,h,added:true,manual:true};
    records.push(record);pendingNew=record.index;addHotspot(record);endAddMode();
    if(fullscreen)setFullscreen(false);
    selectRecord(record,true);$('editId').value='';$('editSubtitle').value='';
    $('saveEdit').textContent='Save new equipment';$('cancelNew').hidden=false;
    $('editId').focus();message('Enter the equipment ID and tap Save new equipment, or Cancel new equipment.');
  }
  function cancelNew(){
    if(!pendingNew)return;
    records.pop();pendingNew=null;selected=null;makeHotspots();renderDetails(null);updateHighlight();
    $('cancelNew').hidden=true;$('saveEdit').textContent='Save label';
    message('Unsaved equipment discarded.');
  }
  function syncGeometryFields(){
    if(!geometryDraft)return;
    for(const [field,value] of Object.entries({geoX:geometryDraft.x,geoY:geometryDraft.y,geoW:geometryDraft.w,geoH:geometryDraft.h}))$(field).value=value;
    const frame=$('geometryEditor');
    frame.style.left=geometryDraft.x+'px';frame.style.top=geometryDraft.y+'px';
    frame.style.width=geometryDraft.w+'px';frame.style.height=geometryDraft.h+'px';
  }
  function beginGeometry(){
    const record=records.find(r=>r.index===selected);if(!record||pendingNew)return;
    endAddMode();geometryMode=true;geometryDraft={x:record.x,y:record.y,w:record.w,h:record.h};
    $('geometryPanel').hidden=false;$('geometryEditor').hidden=false;
    $('mapCanvas').classList.add('editing-position');
    syncGeometryFields();scrollToTile(record);
    message('Drag the outlined box to move it; drag its bottom-right handle to resize. You can also enter exact coordinates.');
  }
  function geometryFromInputs(){
    if(!geometryMode)return false;
    const [x,y,w,h]=['geoX','geoY','geoW','geoH'].map(field=>Number($(field).value));
    if(validGeometry(x,y,w,h)){geometryDraft={x,y,w,h};syncGeometryFields();$('geometryError').textContent='';return true;}
    $('geometryError').textContent='Invalid dimensions. The box must be at least 16 × 16 pixels and fit inside the map.';
    return false;
  }
  function stopGeometry(){
    geometryMode=false;geometryDraft=null;drag=null;$('geometryPanel').hidden=true;$('geometryEditor').hidden=true;
    $('mapCanvas').classList.remove('editing-position');$('geometryError').textContent='';
  }
  function saveGeometry(){
    const record=records.find(r=>r.index===selected);if(!record||!geometryDraft||!geometryFromInputs())return;
    Object.assign(record,geometryDraft);
    const base=SOURCE[record.index-1];
    record.relocated=isRelocated(record,base);
    const saved=storeRecord(record);stopGeometry();refreshRecordList(record);
    message(saved?'Position saved on this device. Download updated tiles.js to publish.':'Position changed in this session, but device storage failed. Download tiles.js now.');
  }
  function startDrag(event){
    if(!geometryMode||!geometryDraft)return;
    event.preventDefault();event.stopPropagation();
    drag={start:coordinatesFromEvent(event),rect:{...geometryDraft},resize:!!event.target.closest('.resize-grip')};
    $('geometryEditor').setPointerCapture(event.pointerId);
  }
  function moveDrag(event){
    if(!drag||!geometryDraft)return;
    event.preventDefault();
    const current=coordinatesFromEvent(event),dx=current.x-drag.start.x,dy=current.y-drag.start.y;
    const r=drag.rect;
    geometryDraft=drag.resize?{x:r.x,y:r.y,w:clamp(r.w+dx,16,MAP_WIDTH-r.x),h:clamp(r.h+dy,16,MAP_HEIGHT-r.y)}:
      {x:clamp(r.x+dx,0,MAP_WIDTH-r.w),y:clamp(r.y+dy,0,MAP_HEIGHT-r.h),w:r.w,h:r.h};
    syncGeometryFields();
  }
  function removeAdded(){
    const record=records.find(r=>r.index===selected);
    if(!record||!record.added||pendingNew)return;
    if(record.index<=SOURCE.length){message('This entry is already part of the published index. Remove it from the source index or a future export before republishing.');return;}
    if(!window.confirm('Remove this added equipment from the searchable index?'))return;
    records.splice(records.indexOf(record),1);
    records.forEach((r,i)=>{r.index=i+1;});
    corrections={};
    for(const r of records){
      const base=SOURCE[r.index-1];
      if(r.added||!base||r.id!==(base.id||base.ocr_id)||r.subtitle!==(base.subtitle||base.ocr_detail||'')||['x','y','w','h'].some(k=>r[k]!==base[k]))
        corrections[r.index]={id:r.id,subtitle:r.subtitle,x:r.x,y:r.y,w:r.w,h:r.h,...(r.added?{added:true,color:r.color}:{})};
    }
    saveCorrections();selected=null;makeHotspots();renderDetails(null);applySearch();
    message('Added equipment removed. Download updated tiles.js to publish the updated index.');
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
    message('CSV exported. Edit equipment_id, second_line, or x/y/width/height. Add a row with the next tile_number to import new equipment.');
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
    const seen=new Set(),changes=[],newNumbers=[];
    for(let i=1;i<rows.length;i++){
      const row=rows[i];
      if(row.length!==headers.length)throw new Error(`CSV row ${i+1} has ${row.length} columns; expected ${headers.length}.`);
      const numberText=row[column('tile_number')].trim();
      if(!/^\d+$/.test(numberText))throw new Error(`Invalid tile number at row ${i+1}.`);
      const number=Number(numberText),record=records.find(r=>r.index===number);
      if(number<1||number>records.length+200)throw new Error(`Invalid tile number ${number} at row ${i+1}.`);
      if(seen.has(number))throw new Error(`Duplicate tile number ${number}.`);
      seen.add(number);
      const fields=['x','y','width','height'];
      if(!record&&fields.some(key=>column(key)<0))throw new Error(`New tile ${number} requires x, y, width, and height columns.`);
      const geo=fields.map((key,i)=>column(key)<0?record[['x','y','w','h'][i]]:Number(row[column(key)]));
      if(!validGeometry(...geo))throw new Error(`Tile ${number} has invalid coordinates or dimensions.`);
      const id=row[column('equipment_id')].trim(),subtitle=row[column('second_line')].trim();
      if(!id||id.length>48||subtitle.length>64)throw new Error(`Invalid equipment label at row ${i+1}. Maximum lengths: ID 48, second line 64.`);
      if(/[\u0000-\u001F]/.test(id+subtitle))throw new Error(`Control character in label at row ${i+1}.`);
      const color=column('color')>=0?String(row[column('color')]).trim().toLowerCase():(record?.color||'yellow');
      if(!COLORS[color])throw new Error(`Invalid color for tile ${number}.`);
      if(!record)newNumbers.push(number);
      if(!record||id!==record.id||subtitle!==record.subtitle||geo.some((v,i)=>v!==record[['x','y','w','h'][i]]))
        changes.push({number,id,subtitle,x:geo[0],y:geo[1],w:geo[2],h:geo[3],color,added:!record});
    }
    newNumbers.sort((a,b)=>a-b);
    newNumbers.forEach((n,i)=>{if(n!==records.length+i+1)throw new Error('New tile numbers must be consecutive, starting at '+(records.length+1)+'.');});
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
      if(!result.changes.length){message(`Checked ${result.count} rows. No differences were found.`);return;}
      $('importSummary').textContent=`Checked ${result.count} equipment rows. ${result.changes.length} equipment/position changes are ready. Review the source file before applying; unchanged entries will be preserved.`;
      $('importPreview').hidden=false;
      message('Import preview ready. No saved labels have been changed yet.');
    }catch(error){message('Import failed: '+error.message);}
  }
  function applyImport(){
    if(!pendingImport)return;
    const count=pendingImport.length;
    for(const change of pendingImport.slice().sort((a,b)=>a.number-b.number)){
      let record=records.find(r=>r.index===change.number);
      if(!record){record={index:change.number,added:true,manual:true,color:change.color};records.push(record);addHotspot(record);}
      Object.assign(record,{id:change.id,subtitle:change.subtitle,x:change.x,y:change.y,w:change.w,h:change.h});
      const base=SOURCE[change.number-1];
      record.relocated=isRelocated(record,base);
      storeRecord(record);updateButtonLabel(record);
    }
    const saved=saveCorrections();pendingImport=null;$('importPreview').hidden=true;
    if(query)applySearch();else {renderSuggestions();const record=records.find(r=>r.index===selected);if(record)selectRecord(record);}
    message(saved?`Applied and saved ${count} equipment changes on this device. Download updated tiles.js to publish them.`:`Applied ${count} changes, but device storage could not save them. Download tiles.js now.`);
  }
  function downloadTiles(){
    const merged=records.map(record=>{
      if(record.added)return {id:record.id,subtitle:record.subtitle,color:record.color,x:record.x,y:record.y,w:record.w,h:record.h,added:true,manual:true,ocr_id:record.id,ocr_detail:record.subtitle,ocr_alternates:[],ocr_score:20};
      const base=SOURCE[record.index-1];
      const edited=record.id!==(base.id||base.ocr_id||'Tile '+String(record.index).padStart(3,'0'))||record.subtitle!==(base.subtitle||base.ocr_detail||'');
      return {...base,id:record.id,subtitle:record.subtitle,
        x:record.x,y:record.y,w:record.w,h:record.h,
        image_x:base.image_x??base.x,image_y:base.image_y??base.y,image_w:base.image_w??base.w,image_h:base.image_h??base.h,
        ocr_id:edited?record.id:base.ocr_id,
        ocr_detail:edited?record.subtitle:base.ocr_detail,
        ocr_alternates:edited?[]:base.ocr_alternates,
        ocr_score:edited?20:base.ocr_score,
        manual:edited?true:base.manual};
    });
    downloadFile('tiles.js','window.EQUIPMENT_TILES = '+JSON.stringify(merged)+';\n','text/javascript;charset=utf-8');
    message('Downloaded updated tiles.js. Upload it to the existing GitHub repository to publish the added equipment, positions, and corrected labels.');
  }
  function init(){
    loadCorrections();
    records.forEach(r=>{
      const c=corrections[r.index];if(!c)return;
      r.id=c.id||r.id;r.subtitle=c.subtitle??r.subtitle;
      if(validGeometry(c.x,c.y,c.w,c.h))Object.assign(r,{x:c.x,y:c.y,w:c.w,h:c.h});
      const base=SOURCE[r.index-1];
      r.relocated=isRelocated(r,base);
    });
    for(let n=SOURCE.length+1;n<=SOURCE.length+200;n++){
      const c=corrections[n];if(!c?.added||!validGeometry(c.x,c.y,c.w,c.h)||!c.id)break;
      records.push({index:n,id:c.id,subtitle:c.subtitle||'',color:COLORS[c.color]?c.color:'yellow',x:c.x,y:c.y,w:c.w,h:c.h,added:true,manual:true});
    }
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
    $('addEquipment').addEventListener('click',toggleAddMode);
    $('mapCanvas').addEventListener('pointerdown',startNewEquipment);
    $('editPosition').addEventListener('click',beginGeometry);
    $('cancelNew').addEventListener('click',cancelNew);
    $('removeAdded').addEventListener('click',removeAdded);
    $('savePosition').addEventListener('click',saveGeometry);
    $('cancelPosition').addEventListener('click',stopGeometry);
    for(const field of ['geoX','geoY','geoW','geoH'])$(field).addEventListener('change',geometryFromInputs);
    $('geometryEditor').addEventListener('pointerdown',startDrag);
    $('geometryEditor').addEventListener('pointermove',moveDrag);
    $('geometryEditor').addEventListener('pointerup',()=>{drag=null;});
    $('geometryEditor').addEventListener('pointercancel',()=>{drag=null;});
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
