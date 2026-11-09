(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const SOURCE = Array.isArray(window.EQUIPMENT_TILES) ? window.EQUIPMENT_TILES : [];
  const MAP_WIDTH=1902,MAP_HEIGHT=827, STORAGE_KEY='equipment-finder-reviewed-v1';
  const COLORS={
    green:'#008000',maroon:'#800000',red:'#ff0000',orange:'#ff8000',blue:'#0080ff',yellow:'#ffff00',
    purple:'#8000cc',cyan:'#00cfd8',pink:'#ff69b4',gray:'#808080',white:'#ffffff',black:'#000000'
  };
  const defaultInk=color=>color==='yellow'?'black':'white';
  const records=SOURCE.map((record,i)=>({...record,index:i+1,image_color:record.image_color||record.color,image_text_color:record.image_text_color||defaultInk(record.image_color||record.color),image_x:record.image_x??record.x,image_y:record.image_y??record.y,image_w:record.image_w??record.w,image_h:record.image_h??record.h,text_color:record.text_color||defaultInk(record.color),id:record.id||record.ocr_id||'Tile '+String(i+1).padStart(3,'0'),subtitle:record.subtitle||record.ocr_detail||''}));
  let corrections={},selected=null,matches=[],matchIndex=0,query='',zoom=.75,fullscreen=false,pendingImport=null;
  let touchState=null,suppressMapClickUntil=0;
  const buttons=new Map();
  let originalMap=null;
  let editorMode='',draft=null,dragStart=null;
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const relocated=r=>!r.added&&(r.x!==r.image_x||r.y!==r.image_y||r.w!==r.image_w||r.h!==r.image_h);
  const virtual=r=>r.added||relocated(r);
  function geometryOK(r){return [r.x,r.y,r.w,r.h].every(Number.isFinite)&&r.w>=12&&r.h>=12&&r.x>=0&&r.y>=0&&r.x+r.w<=MAP_WIDTH&&r.y+r.h<=MAP_HEIGHT;}
  function persistRecord(r){corrections[r.index]={id:r.id,subtitle:r.subtitle,color:r.color,text_color:r.text_color,x:r.x,y:r.y,w:r.w,h:r.h,...(r.added?{added:true}:{})};return saveCorrections();}

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
  function colorName(name){return ({green:'Green',maroon:'Dark red',red:'Red',orange:'Orange',blue:'Blue',yellow:'Yellow',purple:'Purple',cyan:'Cyan',pink:'Pink',gray:'Gray',white:'White',black:'Black'})[name]||'Unknown';}
  function normalizeColor(value){const text=String(value||'').trim().toLowerCase();return ['dark red','darkred','dark_red'].includes(text)?'maroon':text;}
  function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
  function fallbackTints(enabled){
    for(const record of records){
      const btn=buttons.get(record.index);if(!btn)continue;
      let span=btn.querySelector('.recolor-tint');
      const changed=enabled&&!virtual(record)&&record.color!==record.image_color;
      if(changed){
        if(!span){span=document.createElement('span');span.className='recolor-tint';span.setAttribute('aria-hidden','true');btn.append(span);}
        span.style.backgroundColor=COLORS[record.color];
      }else if(span)span.remove();
    }
  }
  function refreshMapColors(){
    const changed=records.filter(r=>!r.added&&(r.color!==r.image_color||r.text_color!==r.image_text_color));
    if(!changed.length){
      $('floorImage').src='./floor-map.png';
      $('mapCanvas').style.removeProperty('--floor-snapshot');
      fallbackTints(false);return;
    }
    if(!originalMap||!originalMap.naturalWidth){fallbackTints(true);return;}
    try{
      const canvas=document.createElement('canvas');canvas.width=MAP_WIDTH;canvas.height=MAP_HEIGHT;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(originalMap,0,0,MAP_WIDTH,MAP_HEIGHT);
      const frame=ctx.getImageData(0,0,MAP_WIDTH,MAP_HEIGHT),pixels=frame.data;
      for(const record of changed){
        const before=rgb(COLORS[record.image_color]||COLORS.maroon);
        const after=rgb(COLORS[record.color]);
        const sourceInk=record.image_text_color==='black'?[0,0,0]:[255,255,255];
        const targetInk=record.text_color==='black'?[0,0,0]:[255,255,255];
        const direction=sourceInk.map((v,i)=>v-before[i]);
        const denominator=direction.reduce((sum,v)=>sum+v*v,0);
        for(let y=record.image_y;y<record.image_y+record.image_h;y++){
          for(let x=record.image_x;x<record.image_x+record.image_w;x++){
            const k=(y*MAP_WIDTH+x)*4;
            const current=[pixels[k],pixels[k+1],pixels[k+2]];
            const alpha=Math.max(0,Math.min(1,current.reduce((sum,v,i)=>sum+(v-before[i])*direction[i],0)/denominator));
            const residual=Math.hypot(...current.map((v,i)=>v-(before[i]+alpha*direction[i])));
            if(residual>110)continue; // Preserve unrelated image detail and unusual borders.
            for(let i=0;i<3;i++)pixels[k+i]=Math.round(after[i]*(1-alpha)+targetInk[i]*alpha);
          }
        }
      }
      ctx.putImageData(frame,0,0);
      const imageURL=canvas.toDataURL('image/png');
      $('floorImage').src=imageURL;
      $('mapCanvas').style.setProperty('--floor-snapshot',`url("${imageURL}")`);
      fallbackTints(false);
    }catch{
      // file:// can restrict canvas pixel access; retain a visible tint fallback.
      $('floorImage').src='./floor-map.png';
      $('mapCanvas').style.removeProperty('--floor-snapshot');
      fallbackTints(true);
    }
  }
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
    records.forEach(record=>fragment.append(createHotspot(record)));
    holder.replaceChildren(fragment);
  }
  function createHotspot(record){
    const btn=document.createElement('button');btn.type='button';btn.className='hotspot';btn.dataset.index=String(record.index);
    btn.addEventListener('click',()=>selectRecord(record,true));buttons.set(record.index,btn);
    paintHotspot(record);return btn;
  }
  function paintHotspot(record){
    const btn=buttons.get(record.index);if(!btn)return;
    btn.style.left=(record.x-2)+'px';btn.style.top=(record.y-2)+'px';btn.style.width=(record.w+4)+'px';btn.style.height=(record.h+4)+'px';
    btn.style.backgroundPosition=(-record.x+2)+'px '+(-record.y+2)+'px';
    btn.setAttribute('aria-label','Equipment '+record.id+'; '+record.subtitle);btn.title=record.id+(record.subtitle?' · '+record.subtitle:'');
    btn.classList.toggle('virtual-tile',virtual(record));
    if(virtual(record)){
      btn.style.backgroundColor=COLORS[record.color];btn.style.color=record.text_color;
      btn.replaceChildren();const label=document.createElement('span');label.className='virtual-label';label.textContent=record.id+'\n'+record.subtitle;btn.append(label);
    }else{btn.style.backgroundColor='';btn.style.color='';btn.replaceChildren();}
  }
  function setZoom(value){
    zoom=Math.round(Math.max(.38,Math.min(1.6,value))*100)/100;
    $('mapCanvas').style.transform=`scale(${zoom})`;
    $('scaledSpace').style.width=Math.ceil(MAP_WIDTH*zoom)+'px';
    $('scaledSpace').style.height=Math.ceil(MAP_HEIGHT*zoom)+'px';
    $('zoomText').textContent=Math.round(zoom*100)+'%';
  }
  function touchCenter(touches){
    const viewport=$('mapViewport'),rect=viewport.getBoundingClientRect();
    const x=(touches[0].clientX+touches[1].clientX)/2-rect.left;
    const y=(touches[0].clientY+touches[1].clientY)/2-rect.top;
    const distance=Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY);
    return {x,y,distance};
  }
  function startMapTouch(event){
    if(editorMode&&event.target.closest?.('#geometryEditor')){touchState=null;return;}
    const viewport=$('mapViewport');
    if(event.touches.length>=2){
      const c=touchCenter(event.touches);
      touchState={kind:'pinch',initialZoom:zoom,initialDistance:Math.max(8,c.distance),
        anchorX:(viewport.scrollLeft+c.x)/zoom,anchorY:(viewport.scrollTop+c.y)/zoom};
      suppressMapClickUntil=Date.now()+450;
    }else if(event.touches.length===1){
      const t=event.touches[0];
      touchState={kind:'pan',x:t.clientX,y:t.clientY,left:viewport.scrollLeft,top:viewport.scrollTop,moved:false};
    }
  }
  function moveMapTouch(event){
    if(editorMode&&event.target.closest?.('#geometryEditor'))return;
    if(!touchState)return;
    const viewport=$('mapViewport');
    if(event.touches.length>=2){
      if(touchState.kind!=='pinch'){startMapTouch(event);}
      const c=touchCenter(event.touches);
      const newZoom=touchState.initialZoom*c.distance/touchState.initialDistance;
      setZoom(newZoom);
      viewport.scrollLeft=touchState.anchorX*zoom-c.x;
      viewport.scrollTop=touchState.anchorY*zoom-c.y;
      suppressMapClickUntil=Date.now()+450;
      if(event.cancelable)event.preventDefault();
    }else if(event.touches.length===1&&touchState.kind==='pan'){
      const t=event.touches[0],dx=t.clientX-touchState.x,dy=t.clientY-touchState.y;
      if(Math.hypot(dx,dy)>7)touchState.moved=true;
      if(touchState.moved){
        viewport.scrollLeft=touchState.left-dx;viewport.scrollTop=touchState.top-dy;
        suppressMapClickUntil=Date.now()+450;
        if(event.cancelable)event.preventDefault();
      }
    }
  }
  function endMapTouch(event){
    if(event.touches.length===1){
      const t=event.touches[0],viewport=$('mapViewport');
      touchState={kind:'pan',x:t.clientX,y:t.clientY,left:viewport.scrollLeft,top:viewport.scrollTop,moved:false};
    }else touchState=null;
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
    $('editPosition').disabled=!record;
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
    $('editColor').value=record.color;
    $('editTextColor').value=record.text_color;
  }
  function mapPoint(event){const rect=$('mapCanvas').getBoundingClientRect();return {x:Math.round((event.clientX-rect.left)/zoom),y:Math.round((event.clientY-rect.top)/zoom)};}
  function updateGeometryBox(){
    const box=$('geometryEditor');box.hidden=!draft;if(!draft)return;
    Object.assign(box.style,{left:draft.x+'px',top:draft.y+'px',width:draft.w+'px',height:draft.h+'px'});
    for(const [key,id] of [['x','mapX'],['y','mapY'],['w','mapW'],['h','mapH']])$(id).value=draft[key];
  }
  function startEditor(mode){
    editorMode=mode;dragStart=null;$('mapEditorPanel').hidden=false;$('newEquipmentFields').hidden=mode!=='add';
    $('mapEditorTitle').textContent=mode==='add'?'Add missing equipment':'Move or resize equipment';
    $('mapEditorHelp').textContent=mode==='add'?'Tap an empty place on the map, or adjust the coordinates below.':'Drag the blue outline or its corner handle to adjust the position.';
    if(mode==='add'){
      draft={index:records.length+1,id:'',subtitle:'',color:'green',text_color:'white',added:true,x:Math.round(MAP_WIDTH/2),y:Math.round(MAP_HEIGHT/2),w:85,h:40};
      $('newEquipmentId').value='';$('newEquipmentSubtitle').value='';$('newEquipmentColor').value='green';$('newEquipmentInk').value='white';
      $('mapEditorMessage').textContent='Tap a free map location, then enter the equipment ID.';
    }else{
      const record=records.find(r=>r.index===selected);if(!record)return cancelEditor();
      draft={...record};$('mapEditorMessage').textContent='Drag the box to move, or drag its lower-right handle to resize.';
    }
    updateGeometryBox();$('geometryEditor').scrollIntoView({block:'nearest',inline:'nearest'});
  }
  function cancelEditor(){editorMode='';draft=null;dragStart=null;$('geometryEditor').hidden=true;$('mapEditorPanel').hidden=true;}
  function updateDraftFromFields(){
    if(!draft)return;for(const [key,id] of [['x','mapX'],['y','mapY'],['w','mapW'],['h','mapH']])draft[key]=Number($(id).value);
    if(!geometryOK(draft)){$('mapEditorMessage').textContent='Out of bounds. Keep the whole tile within the floor map (1902 × 827).';return;}
    updateGeometryBox();$('mapEditorMessage').textContent='Position ready. Save to keep your change.';
  }
  function saveEditor(){
    if(!draft||!geometryOK(draft)){$('mapEditorMessage').textContent='Please enter a valid position and size inside the floor map.';return;}
    if(editorMode==='add'){
      draft.id=$('newEquipmentId').value.trim().slice(0,48);draft.subtitle=$('newEquipmentSubtitle').value.trim().slice(0,64);
      draft.color=$('newEquipmentColor').value;draft.text_color=$('newEquipmentInk').value;
      if(!draft.id){$('mapEditorMessage').textContent='Equipment ID is required.';$('newEquipmentId').focus();return;}
      if(records.some(r=>normalized(r.id)===normalized(draft.id))){$('mapEditorMessage').textContent='That equipment ID already exists. Use a unique ID.';return;}
      const record={...draft,ocr_id:draft.id,ocr_detail:draft.subtitle,ocr_alternates:[],ocr_score:20,manual:true,image_color:draft.color,image_text_color:draft.text_color};
      records.push(record);$('hotspots').append(createHotspot(record));persistRecord(record);cancelEditor();selectRecord(record,true);
    }else{
      const record=records.find(r=>r.index===selected);if(!record)return;
      Object.assign(record,{x:draft.x,y:draft.y,w:draft.w,h:draft.h});paintHotspot(record);persistRecord(record);cancelEditor();selectRecord(record,true);
    }
    updateHighlight();message('Saved locally. Use Map tools → Download updated tiles.js to publish the new equipment locations.');
  }
  function onMapPlacement(event){
    if(editorMode!=='add'||Date.now()<suppressMapClickUntil||event.target.closest?.('#geometryEditor'))return;
    const p=mapPoint(event);draft.x=clamp(p.x-Math.round(draft.w/2),0,MAP_WIDTH-draft.w);draft.y=clamp(p.y-Math.round(draft.h/2),0,MAP_HEIGHT-draft.h);updateGeometryBox();
  }
  function startGeometryDrag(event){
    if(!editorMode||!draft||event.touches?.length>1)return;
    const t=event.touches?.[0]||event,p=mapPoint(t);
    dragStart={x:p.x,y:p.y,initial:{...draft},resize:!!event.target.closest?.('.resize-grip')};
    if(event.cancelable)event.preventDefault();event.stopPropagation();
  }
  function moveGeometryDrag(event){
    if(!dragStart||!draft)return;
    const t=event.touches?.[0]||event,p=mapPoint(t),dx=p.x-dragStart.x,dy=p.y-dragStart.y,initial=dragStart.initial;
    if(dragStart.resize){draft.w=clamp(initial.w+dx,12,MAP_WIDTH-draft.x);draft.h=clamp(initial.h+dy,12,MAP_HEIGHT-draft.y);}
    else{draft.x=clamp(initial.x+dx,0,MAP_WIDTH-draft.w);draft.y=clamp(initial.y+dy,0,MAP_HEIGHT-draft.h);}
    updateGeometryBox();if(event.cancelable)event.preventDefault();event.stopPropagation();
  }
  function updateLabel(){
    const record=records.find(r=>r.index===selected);if(!record)return;
    const id=$('editId').value.trim().slice(0,48),subtitle=$('editSubtitle').value.trim().slice(0,64),color=$('editColor').value,textColor=$('editTextColor').value;
    if(!id){$('editId').focus();return;}
    if(!COLORS[color]||!['white','black'].includes(textColor))return;
    const oldColor=record.color,oldTextColor=record.text_color;
    record.id=id;record.subtitle=subtitle;record.color=color;record.text_color=textColor;
    persistRecord(record);paintHotspot(record);
    saveCorrections();renderSuggestions();
    for(const r of records){const b=buttons.get(r.index);b.title=r.id+(r.subtitle?' · '+r.subtitle:'');b.setAttribute('aria-label','Equipment '+r.id+'; '+r.subtitle);}
    if(color!==oldColor||textColor!==oldTextColor)refreshMapColors();
    if(query)applySearch();else selectRecord(record);
  }
  function resetLabel(){
    const record=records.find(r=>r.index===selected);if(!record)return;
    delete corrections[record.index];saveCorrections();
    const base=SOURCE[record.index-1];
    const oldColor=record.color,oldTextColor=record.text_color;
    record.id=base.id||base.ocr_id||'Tile '+String(record.index).padStart(3,'0');record.subtitle=base.subtitle||base.ocr_detail||'';record.color=base.color;record.text_color=base.text_color||defaultInk(base.color);
    const btn=buttons.get(record.index);btn.title=record.id+(record.subtitle?' · '+record.subtitle:'');btn.setAttribute('aria-label','Equipment '+record.id+'; '+record.subtitle);
    if(oldColor!==record.color||oldTextColor!==record.text_color)refreshMapColors();
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
    const headers=['tile_number','equipment_id','second_line','color','text_color','x','y','width','height','ocr_reviewed'];
    const lines=[headers.join(',')];
    for(const r of records)lines.push([r.index,r.id,r.subtitle,r.color,r.text_color,r.x,r.y,r.w,r.h,!!corrections[r.index]].map(csvValue).join(','));
    downloadFile('Equipment_Map_Search_Index.csv','\uFEFF'+lines.join('\r\n'),'text/csv;charset=utf-8');
    message('CSV exported. You can edit equipment_id, second_line, color, and text_color. Keep tile_number and coordinates unchanged.');
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
      if(number>records.length+rows.length-1)throw new Error(`Tile ${number} is too far beyond the last existing tile (${records.length}).`);
      if(seen.has(number))throw new Error(`Duplicate tile number ${number}.`);
      seen.add(number);
      const coords={};for(const [key,col] of [['x','x'],['y','y'],['w','width'],['h','height']]){const idx=column(col);coords[key]=idx>=0?Number(row[idx]):record?.[key];}
      if(!geometryOK(coords))throw new Error(`Tile ${number} has invalid coordinates or dimensions.`);
      const id=row[column('equipment_id')].trim(),subtitle=row[column('second_line')].trim();
      const colorColumn=column('color'),color=colorColumn>=0?normalizeColor(row[colorColumn]):record?.color||'green';
      const textColorColumn=column('text_color'),textColor=textColorColumn>=0?row[textColorColumn].trim().toLowerCase():record?.text_color||'white';
      if(!id||id.length>48||subtitle.length>64)throw new Error(`Invalid equipment label at row ${i+1}. Maximum lengths: ID 48, second line 64.`);
      if(/[\u0000-\u001F]/.test(id+subtitle))throw new Error(`Control character in label at row ${i+1}.`);
      if(!COLORS[color])throw new Error(`Invalid color at row ${i+1}: ${color}. Choose green, maroon, red, orange, blue, yellow, purple, cyan, pink, gray, white, or black.`);
      if(!['white','black'].includes(textColor))throw new Error(`Invalid text_color at row ${i+1}: ${textColor}. Choose white or black.`);
      if(!record||id!==record.id||subtitle!==record.subtitle||color!==record.color||textColor!==record.text_color||['x','y','w','h'].some(k=>coords[k]!==record[k]))changes.push({number,id,subtitle,color,text_color:textColor,...coords,added:!record});
    }
    const additions=changes.filter(c=>c.added).map(c=>c.number).sort((a,b)=>a-b);
    additions.forEach((number,i)=>{if(number!==records.length+i+1)throw new Error(`New equipment must use consecutive tile numbers beginning with ${records.length+1}.`);});
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
      $('importSummary').textContent=`Checked ${result.count} equipment rows. ${result.changes.length} equipment detail/position corrections are ready. Review the source file before applying; unchanged entries will be preserved.`;
      $('importPreview').hidden=false;
      message('Import preview ready. No saved labels have been changed yet.');
    }catch(error){message('Import failed: '+error.message);}
  }
  function applyImport(){
    if(!pendingImport)return;
    const count=pendingImport.length;
    for(const change of [...pendingImport].sort((a,b)=>a.number-b.number)){
      let record=records[change.number-1];
      if(!record){record={...change,index:change.number,added:true,image_color:change.color,image_text_color:change.text_color,ocr_id:change.id,ocr_detail:change.subtitle,ocr_alternates:[],ocr_score:20,manual:true};records.push(record);$('hotspots').append(createHotspot(record));}
      Object.assign(record,change);paintHotspot(record);persistRecord(record);
    }
    const saved=saveCorrections();pendingImport=null;$('importPreview').hidden=true;
    refreshMapColors();
    if(query)applySearch();else {renderSuggestions();const record=records.find(r=>r.index===selected);if(record)selectRecord(record);}
    message(saved?`Applied and saved ${count} corrected labels on this device. Download updated tiles.js to publish them for everyone.`:`Applied ${count} labels in this session, but device storage could not save them. Download tiles.js now to preserve them.`);
  }
  function downloadTiles(){
    const merged=records.map((record,i)=>{
      const base=SOURCE[i]||{},edited=!!corrections[i+1];
      return {...base,id:record.id,subtitle:record.subtitle,color:record.color,image_color:record.image_color,text_color:record.text_color,image_text_color:record.image_text_color,
        x:record.x,y:record.y,w:record.w,h:record.h,...(record.added?{added:true}:{image_x:record.image_x,image_y:record.image_y,image_w:record.image_w,image_h:record.image_h}),
        ocr_id:edited?record.id:base.ocr_id,ocr_detail:edited?record.subtitle:base.ocr_detail,
        ocr_alternates:edited?[]:base.ocr_alternates,ocr_score:edited?20:base.ocr_score,
        manual:edited?true:base.manual};
    });
    downloadFile('tiles.js','window.EQUIPMENT_TILES = '+JSON.stringify(merged)+';\n','text/javascript;charset=utf-8');
    message('Downloaded updated tiles.js. Upload it to your GitHub repository to publish the corrected labels, background colors, and text colors.');
  }
  function init(){
    loadCorrections();
    records.forEach(r=>{if(corrections[r.index]){const c=corrections[r.index];r.id=c.id||r.id;r.subtitle=c.subtitle??r.subtitle;if(COLORS[c.color])r.color=c.color;r.text_color=['white','black'].includes(c.text_color)?c.text_color:defaultInk(r.color);if(['x','y','w','h'].every(k=>Number.isFinite(c[k]))&&geometryOK({...r,...c}))for(const k of ['x','y','w','h'])r[k]=c[k];}});
    for(let i=records.length+1;corrections[i]?.added;i++){
      const c=corrections[i],r={...c,index:i,ocr_id:c.id,ocr_detail:c.subtitle,ocr_alternates:[],ocr_score:20,manual:true,image_color:c.color,image_text_color:c.text_color};
      if(geometryOK(r)&&COLORS[r.color]&&r.id)records.push(r);else break;
    }
    makeHotspots();updateHighlight();renderDetails(null);
    originalMap=new Image();
    originalMap.onload=refreshMapColors;
    originalMap.onerror=()=>message('The floor-map image could not be loaded for color editing.');
    originalMap.src='./floor-map.png';
    refreshMapColors();
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
    $('zoomFit').addEventListener('click',()=>setZoom(($('mapViewport').clientWidth-8)/MAP_WIDTH));
    const mapViewport=$('mapViewport');
    mapViewport.addEventListener('touchstart',startMapTouch,{passive:true});
    mapViewport.addEventListener('touchmove',moveMapTouch,{passive:false});
    mapViewport.addEventListener('touchend',endMapTouch,{passive:true});
    mapViewport.addEventListener('touchcancel',()=>{touchState=null;},{passive:true});
    mapViewport.addEventListener('click',event=>{
      if(Date.now()<suppressMapClickUntil){event.preventDefault();event.stopPropagation();}
    },true);
    $('saveEdit').addEventListener('click',updateLabel);
    $('resetEdit').addEventListener('click',resetLabel);
    $('exportIndex').addEventListener('click',exportIndex);
    $('importCsv').addEventListener('change',chooseCSV);
    $('applyImport').addEventListener('click',applyImport);
    $('cancelImport').addEventListener('click',()=>{pendingImport=null;$('importPreview').hidden=true;message('CSV import cancelled. No changes applied.');});
    $('downloadTiles').addEventListener('click',downloadTiles);
    $('toggleMapTools').addEventListener('click',()=>{const actions=$('mapToolActions');actions.hidden=!actions.hidden;$('toggleMapTools').setAttribute('aria-expanded',String(!actions.hidden));});
    $('addEquipment').addEventListener('click',()=>startEditor('add'));
    $('editPosition').addEventListener('click',()=>startEditor('move'));
    $('downloadMapTiles').addEventListener('click',downloadTiles);
    $('saveMapEdit').addEventListener('click',saveEditor);
    $('cancelMapEdit').addEventListener('click',cancelEditor);
    for(const id of ['mapX','mapY','mapW','mapH'])$(id).addEventListener('change',updateDraftFromFields);
    $('mapCanvas').addEventListener('click',onMapPlacement);
    const editor=$('geometryEditor');
    editor.addEventListener('pointerdown',event=>{startGeometryDrag(event);try{editor.setPointerCapture(event.pointerId);}catch{}});
    editor.addEventListener('pointermove',event=>{if(event.buttons)moveGeometryDrag(event);});
    editor.addEventListener('pointerup',()=>{dragStart=null;});
    editor.addEventListener('pointercancel',()=>{dragStart=null;});
    setZoom(window.innerWidth<700?.88:.8);
    if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
