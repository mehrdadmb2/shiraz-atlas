(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const U = window.AtlasUtils, API = window.AtlasAPI;
  let state = { places:[], visits:[], routes:[], categories:U.categoryDefaults, tags:U.defaultTags, settings:{center:{lat:29.5918,lng:52.5837},explorationBounds:{south:29.47,west:52.42,north:29.73,east:52.78,step:.004}} };
  let admin = false, currentView='overview', categoryFilter='', tagFilter='', searchText='', userLocation=null, discoveryItems=[], drawingActive=false, gpsWatch=null, placePage=1, selectedPlace=null, detailPlaceId='', pendingRouteId='';
  const PAGE_SIZE=8;
  const ACCESS_LABELS={walking:'🚶 پیاده‌روی',car:'🚗 خودرو',motorcycle:'🏍️ موتورسیکلت',public_transport:'🚌 حمل‌ونقل عمومی',bicycle:'🚲 دوچرخه'};
  const toast=(message,type='success')=>{const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;$('#toast-root').appendChild(el);setTimeout(()=>el.remove(),4500);};
  const showModal=id=>$('#'+id)?.classList.remove('hidden');
  const hideModal=id=>$('#'+id)?.classList.add('hidden');
  const setText=(selector,value)=>{const el=$(selector);if(el)el.textContent=value;};
  const showAdmin=()=>{$$('.admin-only').forEach(el=>el.classList.toggle('hidden',!admin));setText('#auth-button-label',admin?'پنل ادمین فعال':'ورود ادمین');const dot=$('.status-dot');if(dot)dot.style.background=admin?'#70e4a0':'#a2b8bf';};
  const currentCenter=()=>{const c=window.AtlasMap.map?.getCenter?.();return c?{lat:c.lat,lng:c.lng}:state.settings?.center||{lat:29.5918,lng:52.5837};};
  const safeUrl=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
  const apiError=(e)=>{console.error(e);toast(e.message||'خطای نامشخص رخ داد.','error');};
  const PUBLIC_SNAPSHOT_KEY='shiraz_atlas_public_state_v1';
  function savePublicSnapshot(data){
    if(data?.isAdmin)return;
    // Only the public API response is persisted; private admin state and notes are never cached.
    try{localStorage.setItem(PUBLIC_SNAPSHOT_KEY,JSON.stringify({savedAt:Date.now(),data}));}catch(error){console.warn('Public offline snapshot could not be saved:',error);}
  }
  function readPublicSnapshot(){
    try{const snapshot=JSON.parse(localStorage.getItem(PUBLIC_SNAPSHOT_KEY)||'null');return snapshot?.data? snapshot:null;}catch{return null;}
  }
  async function loadState(){
    const hadAdminSession=API.isAuthenticated;
    try{
      state=await API.state(hadAdminSession);
      admin=Boolean(state.isAdmin);
      if(!admin)savePublicSnapshot(state);
    }catch(error){
      if(hadAdminSession){
        await API.logout();
        try{state=await API.state(false);admin=false;savePublicSnapshot(state);}
        catch(publicError){const snapshot=readPublicSnapshot();if(!snapshot)throw publicError;state=snapshot.data;admin=false;toast('اتصال قطع است؛ نسخهٔ عمومی ذخیره‌شده نمایش داده می‌شود.','error');}
      }else{
        const snapshot=readPublicSnapshot();
        if(!snapshot)throw error;
        state=snapshot.data;admin=false;
        const age=Math.max(0,Date.now()-Number(snapshot.savedAt||Date.now()));
        toast(`حالت آفلاین فعال شد · داده‌های عمومی ذخیره‌شده (${Math.floor(age/86400000)} روز قبل)`,'error');
      }
    }
    showAdmin();renderAll();
  }
  function allPlaces(){return (state.places||[]).filter(p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng)));}
  function placeVisitedIds(){return new Set((state.visits||[]).map(v=>v.placeId));}
  function visiblePlaces(){let list=allPlaces();if(categoryFilter)list=list.filter(p=>p.categoryId===categoryFilter);if(tagFilter)list=list.filter(p=>(p.tags||[]).some(t=>t.toLowerCase()===tagFilter.toLowerCase()));if(searchText){const q=searchText.toLowerCase();list=list.filter(p=>`${p.name} ${p.address||''} ${p.description||''} ${(p.tags||[]).join(' ')} ${(p.alternateNames||[]).join(' ')}`.toLowerCase().includes(q));}if($('#visited-filter')?.checked){const ids=placeVisitedIds();list=list.filter(p=>ids.has(p.id));}const access=$('#access-filter')?.value;if(access)list=list.filter(p=>(p.accessModes||[]).includes(access));const sort=$('#places-sort')?.value||'newest';if(sort==='name')list.sort((a,b)=>a.name.localeCompare(b.name,'fa'));else if(sort==='fee-low')list.sort((a,b)=>(a.entryFee??Infinity)-(b.entryFee??Infinity));else if(sort==='rating')list.sort((a,b)=>(b.rating??0)-(a.rating??0));else list.sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));return list;}
  function calcCoverage(routes){
    const b=state.settings?.explorationBounds||{south:29.47,west:52.42,north:29.73,east:52.78,step:.004};const step=Math.max(.001,Math.min(.05,Number(b.step)||.004));const rows=Math.ceil((b.north-b.south)/step),cols=Math.ceil((b.east-b.west)/step);const total=Math.max(1,rows*cols);const cells=new Set();
    const add=(lat,lng)=>{if(lat<b.south||lat>b.north||lng<b.west||lng>b.east)return;const r=Math.floor((lat-b.south)/step),c=Math.floor((lng-b.west)/step);cells.add(`${r}:${c}`);};
    for(const route of routes||[]){const pts=(route.coordinates||[]).map(p=>Array.isArray(p)?{lat:Number(p[0]),lng:Number(p[1])}:{lat:Number(p.lat),lng:Number(p.lng)}).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));for(let i=0;i<pts.length;i++){add(pts[i].lat,pts[i].lng);if(i){const a=pts[i-1],z=pts[i],distance=U.haversine(a,z),count=Math.min(600,Math.ceil(distance/130));for(let j=1;j<count;j++){const t=j/count;add(a.lat+(z.lat-a.lat)*t,a.lng+(z.lng-a.lng)*t);}}}}
    return {percent:Math.min(100,cells.size/total*100),cells:cells.size,total};
  }
  function renderAll(){renderFilters();renderPlaces();renderStats();renderJourneys();renderInsights();if(window.AtlasMap.map){AtlasMap.renderPlaces(allPlaces(),state.categories);AtlasMap.renderRoutes(state.routes||[]);}renderView();}
  function renderFilters(){
    const categoryRoot=$('#category-filter-list');if(categoryRoot){categoryRoot.innerHTML='';const all=document.createElement('button');all.className=`filter-chip ${!categoryFilter?'active':''}`;all.textContent='همه مکان‌ها';all.onclick=()=>{categoryFilter='';renderAll();};categoryRoot.appendChild(all);(state.categories||[]).forEach(c=>{const b=document.createElement('button');b.className=`filter-chip ${categoryFilter===c.id?'active':''}`;b.textContent=`${c.icon||'✦'} ${c.name}`;b.onclick=()=>{categoryFilter=categoryFilter===c.id?'':c.id;renderAll();};categoryRoot.appendChild(b);});}
    const tagRoot=$('#tag-filter-list');if(tagRoot){tagRoot.innerHTML='';(state.tags||[]).forEach(tag=>{const b=document.createElement('button');b.className=`tag-chip ${tagFilter===tag?'active':''}`;b.textContent='# '+tag;b.onclick=()=>{tagFilter=tagFilter===tag?'':tag;renderAll();};tagRoot.appendChild(b);});if(!state.tags?.length)tagRoot.innerHTML='<span class="empty-mini">برچسبی تعریف نشده است.</span>';}
    const select=$('#place-category');if(select){const selected=select.value;select.innerHTML=(state.categories||[]).map(c=>`<option value="${U.esc(c.id)}">${U.esc(c.icon||'✦')} ${U.esc(c.name)}</option>`).join('');if(selected)select.value=selected;}
  }
  function placeCard(p){
    const c=U.categoryById(state.categories,p.categoryId),visited=placeVisitedIds().has(p.id),distance=userLocation?U.distanceLabel(U.haversine(userLocation,p)):'';
    const img=safeUrl(p.imageUrl);const visual=img?`<img src="${U.esc(img)}" alt="${U.esc(p.name)}" loading="lazy" onerror="this.remove()">`:`<span class="visual-symbol">${U.esc(c.icon||'⌖')}</span>`;
    const tags=(p.tags||[]).slice(0,3).map(t=>`<span>#${U.esc(t)}</span>`).join('');
    const access=(p.accessModes||[]).map(mode=>`<span class="access-badge">${U.esc(ACCESS_LABELS[mode]||mode)}</span>`).join('');
    const fee=p.entryFee!=null?`<b>🎟 ${U.money(p.entryFee)}</b>`:'<span>ورودی نامشخص</span>';
    const extraMeta=[p.address?`<span>📍 ${U.esc(p.address)}</span>`:'',p.estimatedCost!=null?`<span>💰 هر نفر ${U.money(p.estimatedCost)}</span>`:'',p.bestTime?`<span>◷ ${U.esc(p.bestTime)}</span>`:'',p.accessNotes?`<span>🛣 ${U.esc(p.accessNotes)}</span>`:'',p.alternateNames?.length?`<span>نام‌های دیگر: ${U.esc(p.alternateNames.join('، '))}</span>`:''].filter(Boolean).join('');
    const phone=String(p.phone||'').replace(/[^0-9+]/g,'');
    const website=safeUrl(p.website);
    const contacts=(phone||website)?`<div class="place-contact">${phone?`<a href="tel:${U.esc(phone)}">☎ تماس</a>`:''}${website?`<a href="${U.esc(website)}" target="_blank" rel="noopener noreferrer">↗ وب‌سایت</a>`:''}</div>`:'';
    return `<article class="place-card place-card-clickable" role="group" tabindex="0" data-action="detail" data-id="${U.esc(p.id)}" data-place-id="${U.esc(p.id)}"><div class="place-visual">${visual}<span class="place-category">${U.esc(c.icon||'✦')} ${U.esc(c.name)}</span><span class="place-status">${p.visibility==='private'?'🔒 خصوصی':visited?'✓ بازدید شده':p.status==='closed'?'وضعیت نامشخص':'در اطلس'}</span></div><div class="place-body"><div class="place-title-row"><h3>${U.esc(p.name)}</h3><button class="place-detail-trigger" data-action="detail" data-id="${U.esc(p.id)}" aria-label="مشاهده جزئیات ${U.esc(p.name)}">جزئیات ↗</button>${p.rating!=null?`<span class="place-rating">★ ${U.esc(p.rating)}/5</span>`:''}</div><p class="place-description">${U.esc(p.description||p.address||'برای این مکان هنوز توضیحی ثبت نشده است.')}</p><div class="place-tags">${tags}${access}</div><div class="place-meta"><span>${fee}</span><span>${distance?`⌖ ${distance}`:''}</span></div>${extraMeta?`<div class="place-extra-meta">${extraMeta}</div>`:''}${contacts}<div class="place-actions"><button data-action="focus" data-id="${U.esc(p.id)}">⌖ نقشه</button><button data-action="navigate" data-id="${U.esc(p.id)}">↗ مسیر</button><button data-action="preview-route" data-id="${U.esc(p.id)}">⌁ مسیر روی نقشه</button>${admin?`<button data-action="visit" data-id="${U.esc(p.id)}">✓ بازدید</button><button data-action="edit" data-id="${U.esc(p.id)}">✎ ویرایش</button><button data-action="delete" data-id="${U.esc(p.id)}">🗑 حذف</button>`:''}</div></div></article>`;
  }
  function renderPlaces(){const root=$('#place-grid');if(!root)return;const list=visiblePlaces();$('#places-result-count').textContent=`${U.fmt(list.length)} نتیجه`;$('#map-visible-count').textContent=U.fmt(list.length);root.innerHTML=list.slice(0,placePage*PAGE_SIZE).map(placeCard).join('')||`<div class="empty-state glass"><span>⌖</span><h3>مکانی پیدا نشد</h3><p>${allPlaces().length?'فیلترها را تغییر بده یا عبارت دیگری جست‌وجو کن.':'هنوز مکانی ذخیره نشده؛ از ربات لوکیشن بفرست یا با ورود ادمین اولین مکان را ثبت کن.'}</p></div>`;$('#load-more-wrap').classList.toggle('hidden',list.length<=placePage*PAGE_SIZE);if(window.AtlasMap.map)AtlasMap.renderPlaces(list,state.categories);}
  function renderStats(){const places=allPlaces(),routes=state.routes||[],visits=state.visits||[],coverage=calcCoverage(routes);setText('#stat-places',U.fmt(places.length));setText('#stat-routes',U.fmt(routes.length));setText('#stat-visits',U.fmt(visits.length));setText('#stat-coverage',`${U.fmt(coverage.percent.toFixed(1))}٪`);$('#coverage-mini-bar').style.width=`${coverage.percent}%`;}
  function renderJourneys(){const routes=state.routes||[];const total=routes.reduce((s,r)=>s+Number(r.distanceMeters||0),0);setText('#journey-distance',`${(total/1000).toLocaleString('fa-IR',{maximumFractionDigits:1})} km`);const good=routes.filter(r=>r.quality==='good').length;setText('#journey-quality',routes.length?`${Math.round(good/routes.length*100)}٪ خوب`:'—');setText('#journey-last',routes[0]?U.shortDate(routes[0].visitedAt):'—');const root=$('#journey-list');if(!root)return;root.innerHTML=routes.map(r=>`<article class="journey-item"><div class="journey-mark">⌁</div><div class="journey-copy"><h3>${U.esc(r.name||'مسیر ثبت‌شده')}</h3><p>${U.esc(r.notes||'بدون توضیحات')}</p><div class="journey-meta"><span>${U.shortDate(r.visitedAt)}</span><span>${((r.distanceMeters||0)/1000).toLocaleString('fa-IR',{maximumFractionDigits:2})} km</span><span>${r.visibility==='private'?'🔒 خصوصی':'عمومی'}</span></div></div><span class="quality-pill ${U.qualityClass(r.quality)}">${U.qualityLabel(r.quality)}</span><div class="journey-actions"><button data-action="route-focus" data-id="${U.esc(r.id)}">نمایش</button>${admin?`<button data-action="route-edit" data-id="${U.esc(r.id)}">ویرایش</button><button data-action="route-delete" data-id="${U.esc(r.id)}">حذف</button>`:''}</div></article>`).join('')||`<div class="empty-state glass"><span>⌁</span><h3>هنوز مسیری ثبت نشده</h3><p>ثبت مسیر را فعال کن و روی نقشه نقطه‌های مسیر را انتخاب کن یا با GPS آن را ضبط کن.</p></div>`;}
  function renderInsights(){const routes=state.routes||[],visits=state.visits||[],places=allPlaces(),coverage=calcCoverage(routes),distance=routes.reduce((s,r)=>s+Number(r.distanceMeters||0),0);setText('#insight-visited',U.fmt(new Set(visits.map(v=>v.placeId)).size));setText('#insight-visited-rate',`${U.fmt(places.length?new Set(visits.map(v=>v.placeId)).size/places.length*100:0)}٪`);$('#insight-visited-bar').style.width=`${places.length?new Set(visits.map(v=>v.placeId)).size/places.length*100:0}%`;setText('#insight-coverage',`${U.fmt(coverage.percent.toFixed(1))}٪`);$('#insight-coverage-bar').style.width=`${coverage.percent}%`;setText('#insight-distance',(distance/1000).toLocaleString('fa-IR',{maximumFractionDigits:1}));$('#insight-distance-bar').style.width=`${Math.min(100,distance/100000*100)}%`;
    const quality=['good','normal','bad'].map(q=>({q,count:routes.filter(r=>r.quality===q).length}));$('#quality-bars').innerHTML=routes.length?quality.map(x=>`<div class="quality-row"><span>${U.qualityLabel(x.q)}</span><div class="progress-track"><i style="width:${x.count/routes.length*100}%;background:${x.q==='good'?'var(--green)':x.q==='bad'?'var(--red)':'var(--amber)'}"></i></div><b>${U.fmt(x.count)}</b></div>`).join(''):'<p class="muted">هنوز داده‌ای برای تحلیل وجود ندارد.</p>';
    const counts=(state.categories||[]).map(c=>({c,count:places.filter(p=>p.categoryId===c.id).length})).filter(x=>x.count).sort((a,b)=>b.count-a.count).slice(0,6);$('#category-stats').innerHTML=counts.length?counts.map(x=>`<div class="category-stat-row"><span>${U.esc(x.c.icon||'✦')} ${U.esc(x.c.name)}</span><b>${U.fmt(x.count)}</b></div>`).join(''):'<p class="muted">پس از ثبت مکان، آمار نمایش داده می‌شود.</p>';
    const history=$('#visit-history-list');if(history){history.innerHTML=admin?(visits.length?visits.map(v=>{const place=places.find(p=>p.id===v.placeId);return `<article class="visit-history-item"><div class="visit-history-copy"><strong>${U.esc(place?.name||'مکان حذف‌شده')}</strong><span>${U.shortDate(v.visitedAt)} · ${U.qualityLabel(v.quality)}${v.durationMinutes?` · ${U.fmt(v.durationMinutes)} دقیقه`:''}</span><p>${U.esc(v.note||'بدون یادداشت')}</p></div><div class="visit-history-actions"><button data-action="visit-edit" data-id="${U.esc(v.id)}">ویرایش</button><button data-action="visit-delete" data-id="${U.esc(v.id)}">حذف</button></div></article>`;}).join(''):'<p class="muted">هنوز بازدیدی ثبت نشده است.</p>'):'<p class="muted">برای مشاهده دفترچه خصوصی بازدیدها وارد پنل ادمین شو.</p>';}

  }
  function renderView(){const map=$('#map-section'),places=$('#places-section');map.classList.toggle('hidden',!['overview','map'].includes(currentView));places.classList.toggle('hidden',!['overview','places'].includes(currentView));$('#journeys-section').classList.toggle('hidden',currentView!=='journeys');$('#discover-section').classList.toggle('hidden',currentView!=='discover');$('#insights-section').classList.toggle('hidden',currentView!=='insights');$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===currentView));if(['map','overview'].includes(currentView))setTimeout(()=>window.AtlasMap.map?.invalidateSize(),140);}
  function switchView(view){currentView=view;renderView();$('#mobile-nav').classList.remove('open');if(view==='map')$('#map-section').scrollIntoView({behavior:'smooth',block:'start'});else if(view==='places')$('#places-section').scrollIntoView({behavior:'smooth',block:'start'});else if(view==='journeys')$('#journeys-section').scrollIntoView({behavior:'smooth',block:'start'});else if(view==='discover')$('#discover-section').scrollIntoView({behavior:'smooth',block:'start'});else if(view==='insights')$('#insights-section').scrollIntoView({behavior:'smooth',block:'start'});}
  const weatherCacheKey=(lat,lng)=>`shiraz_atlas_weather_${Number(lat).toFixed(2)}_${Number(lng).toFixed(2)}`;
  const weatherValue=(value,digits=0)=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?'—':Number(value).toLocaleString('fa-IR',{maximumFractionDigits:digits});
  const weatherCondition=(code,isDay)=>{
    if(code===0)return isDay?'sunny':'night';
    if(code===1)return isDay?'sunny':'night';
    if(code===2||code===3)return 'cloudy';
    if(code===45||code===48)return 'fog';
    if(code>=51&&code<=67||code>=80&&code<=82)return 'rain';
    if(code>=71&&code<=77||code===85||code===86)return 'snow';
    if(code>=95)return 'storm';
    return isDay?'cloudy':'night';
  };
  const weatherVisual=(code,isDay)=>{
    if(code===0)return isDay?'☀️':'🌙';
    if(code===1||code===2)return isDay?'🌤️':'☁️';
    if(code===3)return '☁️';
    if(code===45||code===48)return '🌫️';
    if(code>=51&&code<=67)return '🌧️';
    if(code>=71&&code<=77||code===85||code===86)return '❄️';
    if(code>=80&&code<=82)return '🌦️';
    if(code>=95)return '⛈️';
    return '🌤️';
  };
  const weatherSeason=()=>{
    const month=Number(new Intl.DateTimeFormat('en-US',{month:'numeric',timeZone:'Asia/Tehran'}).format(new Date()));
    if([3,4,5].includes(month))return 'بهار شیراز';
    if([6,7,8].includes(month))return 'تابستان شیراز';
    if([9,10,11].includes(month))return 'پاییز شیراز';
    return 'زمستان شیراز';
  };
  const weatherWeekday=()=>new Intl.DateTimeFormat('fa-IR',{weekday:'long',timeZone:'Asia/Tehran'}).format(new Date());
  function renderWeather(data,meta={}){
    const current=data?.current||{};
    if(current.temperature_2m===null||current.temperature_2m===undefined||!Number.isFinite(Number(current.temperature_2m)))throw new Error('پاسخ هواشناسی فاقد دمای معتبر است.');
    const code=Number(current.weather_code??-1),isDay=Number(current.is_day??1)===1,temp=Number(current.temperature_2m);
    const card=$('#weather-card');
    const classes=['weather-card',`weather-${weatherCondition(code,isDay)}`];
    if(!isDay)classes.push('weather-night');
    if(temp>=35)classes.push('weather-hot');
    if(temp<=4)classes.push('weather-cold');
    const weekday=weatherWeekday();
    if(weekday.includes('پنج')||weekday.includes('جمع'))classes.push('weather-weekend');
    card.className=`side-card glass ${classes.join(' ')}`;
    card.dataset.weather=weatherCondition(code,isDay);
    setText('#weather-temp',`${weatherValue(temp)}°`);
    setText('#weather-desc',U.weatherText(code));
    setText('#weather-feels',`دمای حس‌شده ${weatherValue(current.apparent_temperature)}°`);
    setText('#weather-humidity',`${weatherValue(current.relative_humidity_2m)}٪`);
    setText('#weather-wind',`${weatherValue(current.wind_speed_10m)} km/h`);
    setText('#weather-rain',`${weatherValue(current.precipitation,1)} mm`);
    setText('#weather-icon',weatherVisual(code,isDay));
    const special=temp>=35?'☀️ هوای گرم':temp<=4?'❄️ هوای سرد':!isDay?'🌙 آسمان شب':weekday.includes('پنج')||weekday.includes('جمع')?'✨ آخر هفتهٔ شیراز':`${weekday} · ${weatherSeason()}`;
    setText('#weather-special',special);
    setText('#weather-location',meta.location||'شیراز، ایران');
    const daily=data.daily||{},times=daily.time||[],forecast=$('#weather-forecast');
    forecast.innerHTML=times.slice(0,3).map((day,index)=>{
      const label=index===0?'امروز':index===1?'فردا':new Intl.DateTimeFormat('fa-IR',{weekday:'short',timeZone:'Asia/Tehran'}).format(new Date(`${day}T12:00:00`));
      const dayCode=Number(daily.weather_code?.[index]??-1);
      const max=weatherValue(daily.temperature_2m_max?.[index]),min=weatherValue(daily.temperature_2m_min?.[index]);
      const rain=weatherValue(daily.precipitation_probability_max?.[index]);
      return `<div class="weather-day"><small>${label}</small><span>${weatherVisual(dayCode,true)}</span><b>${max}° <i>${min}°</i></b><em>💧 ${rain}٪</em></div>`;
    }).join('')||'<div class="weather-forecast-empty">اطلاعات پیش‌بینی در پاسخ سرویس موجود نبود.</div>';
    if(meta.stale){setText('#weather-updated',`ذخیره‌شده · ${new Date(meta.savedAt||Date.now()).toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tehran'})}`);card.classList.add('weather-stale');}
    else {setText('#weather-updated',`به‌روزرسانی ${new Date().toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tehran'})}`);card.classList.remove('weather-stale');}
    card.classList.remove('weather-loading','weather-error');
  }
  async function fetchWeatherDirect(lat,lng){
    const query=new URLSearchParams({latitude:String(lat),longitude:String(lng),current:'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',timezone:'auto',forecast_days:'3'});
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),11000);
    try{const response=await fetch(`https://api.open-meteo.com/v1/forecast?${query}`,{signal:controller.signal,headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`Open-Meteo HTTP ${response.status}`);return await response.json();}
    finally{clearTimeout(timer);}
  }
  async function loadWeather(lat,lng,location='شیراز، ایران',force=false){
    const key=weatherCacheKey(lat,lng),cacheAge=12*60*60*1000;
    let cached=null;
    try{cached=JSON.parse(localStorage.getItem(key)||'null');}catch{}
    if(cached?.data&&!force){try{renderWeather(cached.data,{stale:Date.now()-cached.savedAt>10*60*1000,savedAt:cached.savedAt,location});}catch{}}
    const card=$('#weather-card');
    if(!cached?.data)card?.classList.add('weather-loading');
    let lastError=null;
    // First use the Worker proxy (edge cache); if it is unreachable, call Open-Meteo directly.
    try{
      let data;
      try{data=await API.weather(lat,lng);}catch(workerError){lastError=workerError;data=await fetchWeatherDirect(lat,lng);}
      renderWeather(data,{location});
      localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),data}));
      return data;
    }catch(error){lastError=error;}
    if(cached?.data&&Date.now()-cached.savedAt<=cacheAge){
      try{renderWeather(cached.data,{stale:true,savedAt:cached.savedAt,location});setText('#weather-special','دادهٔ ذخیره‌شده');return cached.data;}catch{}
    }
    card?.classList.remove('weather-loading');card?.classList.add('weather-error');
    setText('#weather-desc','دریافت دادهٔ هواشناسی ممکن نشد');
    setText('#weather-special','اتصال هواشناسی قطع است');
    setText('#weather-updated','اتصال را بررسی و دوباره تلاش کن');
    if(lastError)console.warn('Shiraz Atlas weather unavailable:',lastError);
    return null;
  }
  function registerOfflineSupport(){
    if(!('serviceWorker' in navigator)||location.protocol!=='https:')return;
    navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(async reg=>{
      reg.update().catch(()=>{});
      await navigator.serviceWorker.ready;
      // Keep Leaflet's runtime and CSS in the same-device offline cache too.
      const vendor=['https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js','https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'];
      await Promise.allSettled(vendor.map(url=>fetch(url,{mode:'cors',cache:'force-cache'})));
      console.info('Shiraz Atlas offline cache enabled',reg.scope);
    }).catch(error=>console.warn('Offline support registration failed:',error));
  }
  function requestPosition(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error('مرورگر از موقعیت‌یابی پشتیبانی نمی‌کند.'));navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy}),e=>reject(new Error(e.code===1?'دسترسی موقعیت مکانی رد شد.':e.code===2?'موقعیت فعلی در دسترس نیست.':'دریافت موقعیت بیش از حد طول کشید.')),{enableHighAccuracy:true,timeout:15000,maximumAge:60000});});}
  async function locateMe(){try{userLocation=await requestPosition();AtlasMap.showUser(userLocation);AtlasMap.focus(userLocation.lat,userLocation.lng,15);renderPlaces();toast(`موقعیت تو دریافت شد · دقت حدود ${Math.round(userLocation.accuracy||0)} متر`);loadWeather(userLocation.lat,userLocation.lng,'موقعیت فعلی شما');}catch(e){toast(e.message,'error');}}
  function randomPlace(){const pool=allPlaces().filter(p=>p.visibility!=='private'&&p.status!=='closed');if(!pool.length){toast('هنوز مکان عمومی برای انتخاب تصادفی ثبت نشده است.','error');return;}const p=pool[Math.floor(Math.random()*pool.length)];selectedPlace=p;AtlasMap.focus(p.lat,p.lng,16);showPlaceToast(p);}
  function showPlaceToast(p){const c=U.categoryById(state.categories,p.categoryId);toast(`✧ مقصد شانسی: ${p.name} · ${c.name}`);}
  const detailField=(label,value,wide=false)=>`<div class="detail-field${wide?' detail-field-wide':''}"><span>${U.esc(label)}</span><strong>${value===null||value===undefined||String(value).trim()===''?'<i class="detail-empty">ثبت نشده</i>':value}</strong></div>`;
  function openPlaceDetails(place){
    if(!place)return;
    detailPlaceId=place.id;selectedPlace=place;
    const category=U.categoryById(state.categories,place.categoryId);
    const status=({active:'فعال / قابل مراجعه',planned:'در برنامه بازدید',closed:'تعطیل یا نامشخص'})[place.status]||'نامشخص';
    const visibility=place.visibility==='private'?'خصوصی':'عمومی';
    const access=(place.accessModes||[]).map(x=>ACCESS_LABELS[x]||x).join('، ');
    const tags=(place.tags||[]).map(x=>`<span class="detail-chip">#${U.esc(x)}</span>`).join('')||'';
    const names=(place.alternateNames||[]).map(x=>`<span class="detail-chip">${U.esc(x)}</span>`).join('')||'';
    const image=safeUrl(place.imageUrl);
    const visits=(state.visits||[]).filter(v=>v.placeId===place.id);
    const fields=[
      detailField('دسته‌بندی',`${U.esc(category.icon||'✦')} ${U.esc(category.name)}`),
      detailField('وضعیت',U.esc(status)),
      detailField('نمایش',U.esc(visibility)),
      detailField('آدرس / محله',U.esc(place.address||''),true),
      detailField('عرض جغرافیایی',Number.isFinite(Number(place.lat))?`<code>${Number(place.lat).toFixed(6)}</code>`:''),
      detailField('طول جغرافیایی',Number.isFinite(Number(place.lng))?`<code>${Number(place.lng).toFixed(6)}</code>`:''),
      detailField('توضیحات',U.esc(place.description||''),true),
      detailField('هزینه ورودی',place.entryFee==null?'':`${U.money(place.entryFee)} تومان`),
      detailField('هزینه تقریبی هر نفر',place.estimatedCost==null?'':`${U.money(place.estimatedCost)} تومان`),
      detailField('امتیاز شخصی',place.rating==null?'':`${U.esc(place.rating)} / 5`),
      detailField('بهترین زمان مراجعه',U.esc(place.bestTime||'')),
      detailField('روش‌های دسترسی',U.esc(access)),
      detailField('توضیح دسترسی / پارکینگ',U.esc(place.accessNotes||''),true),
      detailField('شماره تماس',place.phone?`<a href="tel:${U.esc(String(place.phone).replace(/[^0-9+]/g,''))}">${U.esc(place.phone)}</a>`:''),
      detailField('وب‌سایت',safeUrl(place.website)?`<a href="${U.esc(safeUrl(place.website))}" target="_blank" rel="noopener noreferrer">${U.esc(place.website)}</a>`:'',true),
      detailField('برچسب‌ها',tags?`<span class="detail-chip-row">${tags}</span>`:'',true),
      detailField('نام‌های جایگزین',names?`<span class="detail-chip-row">${names}</span>`:'',true),
      detailField('منبع ثبت',U.esc(place.source||'')),
      detailField('روش تشخیص نام',place.nameSource==='openstreetmap-reverse'?'<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap · Reverse geocoding</a>':U.esc(place.nameSource||'')),
      detailField('اطمینان نام',U.esc(place.nameConfidence||'')),
      detailField('تعداد بازدیدها',admin?U.fmt(visits.length):''),
      detailField('لینک تصویر',image?`<a href="${U.esc(image)}" target="_blank" rel="noopener noreferrer">مشاهده تصویر ↗</a>`:'',true),
      ...(admin?[detailField('یادداشت خصوصی',U.esc(place.notes||''),true)]:[]),
      detailField('شناسه مکان',`<code>${U.esc(place.id)}</code>`,true),
      ...(admin&&place.mergedPlaceIds?.length?[detailField('شناسه‌های ادغام‌شده',`<code>${U.esc(place.mergedPlaceIds.join(', '))}</code>`,true)]:[]),
      detailField('تاریخ ثبت',place.createdAt?U.esc(U.shortDate(place.createdAt)):''),
      detailField('آخرین ویرایش',place.updatedAt?U.esc(U.shortDate(place.updatedAt)):'')
    ];
    $('#place-detail-title').textContent=place.name||'مکان بدون نام';
    $('#place-detail-subtitle').textContent=`${category.icon||'✦'} ${category.name} · ${place.visibility==='private'?'خصوصی':'نمایش عمومی'}`;
    $('#place-detail-emblem').textContent=category.icon||'⌖';
    $('#place-detail-content').innerHTML=`${image?`<div class="detail-image-wrap"><img src="${U.esc(image)}" alt="${U.esc(place.name||'تصویر مکان')}" loading="lazy"></div>`:''}<div class="detail-field-grid">${fields.join('')}</div>`;
    $('#place-detail-edit').classList.toggle('hidden',!admin);
    showModal('place-detail-modal');
  }
  function editDetailPlace(){
    const place=allPlaces().find(p=>p.id===detailPlaceId);
    if(!place)return;
    hideModal('place-detail-modal');openPlaceForm(place);
  }
  function openPlaceForm(place=null){if(!admin)return showModal('login-modal');$('#place-form').reset();$('#place-id').value=place?.id||'';$('#place-modal-title').textContent=place?'ویرایش مکان':'افزودن مکان جدید';$('#place-name').value=place?.name||'';$('#place-category').value=place?.categoryId||state.categories[0]?.id||'';$('#place-status').value=place?.status||'active';$('#place-lat').value=place?.lat??'';$('#place-lng').value=place?.lng??'';$('#place-address').value=place?.address||'';$('#place-description').value=place?.description||'';$('#place-entry-fee').value=place?.entryFee??'';$('#place-estimated-cost').value=place?.estimatedCost??'';$('#place-rating').value=place?.rating??'';$('#place-best-time').value=place?.bestTime||'';$('#place-phone').value=place?.phone||'';$('#place-website').value=place?.website||'';$('#place-tags').value=(place?.tags||[]).join(', ');$('#place-alternate-names').value=(place?.alternateNames||[]).join(', ');$('#place-source').value=place?.source||'website';$('#place-image').value=place?.imageUrl||'';$('#place-notes').value=place?.notes||'';$('#place-access-notes').value=place?.accessNotes||'';$$('input[name="place-access-mode"]').forEach(el=>{el.checked=(place?.accessModes||[]).includes(el.value);});$('#place-public').checked=place?.visibility!=='private';showModal('place-modal');}
  async function suggestPlaceName(){
    const lat=Number($('#place-lat').value),lng=Number($('#place-lng').value);
    if(!Number.isFinite(lat)||!Number.isFinite(lng))return toast('ابتدا مختصات معتبر را وارد کن.','error');
    const button=$('#suggest-place-name');button.disabled=true;button.textContent='در حال بررسی نقشه…';
    try{
      const result=await API.nameSuggestion(lat,lng);
      if(!result.suggestion)return toast('در داده‌های نقشه نام قابل‌اعتماد و نزدیکی پیدا نشد؛ نام را دستی وارد کن.','error');
      $('#place-name').value=result.suggestion.name;
      if(!$('#place-address').value.trim())$('#place-address').value=result.suggestion.address||'';
      toast(`نام پیشنهادی «${result.suggestion.name}» پیدا شد · حدود ${U.fmt(result.suggestion.distanceMeters)} متر از نقطه`);
    }catch(error){apiError(error);}
    finally{button.disabled=false;button.textContent='✦ تشخیص نام از روی مختصات';}
  }
  async function savePlace(event){
    event.preventDefault();
    const id=$('#place-id').value;
    const payload={name:$('#place-name').value,categoryId:$('#place-category').value,status:$('#place-status').value,lat:Number($('#place-lat').value),lng:Number($('#place-lng').value),address:$('#place-address').value,description:$('#place-description').value,entryFee:$('#place-entry-fee').value===''?null:Number($('#place-entry-fee').value),estimatedCost:$('#place-estimated-cost').value===''?null:Number($('#place-estimated-cost').value),rating:$('#place-rating').value===''?null:Number($('#place-rating').value),bestTime:$('#place-best-time').value,phone:$('#place-phone').value,website:$('#place-website').value,tags:$('#place-tags').value.split(/[,،]/).map(x=>x.trim()).filter(Boolean),alternateNames:$('#place-alternate-names').value.split(/[,،]/).map(x=>x.trim()).filter(Boolean),source:$('#place-source').value.trim()||'website',accessModes:$$('input[name="place-access-mode"]:checked').map(el=>el.value),accessNotes:$('#place-access-notes').value,imageUrl:$('#place-image').value,notes:$('#place-notes').value,visibility:$('#place-public').checked?'public':'private'};
    if(!Number.isFinite(payload.lat)||!Number.isFinite(payload.lng)){toast('مختصات معتبر وارد کن.','error');return;}
    const action=id?'place.update':'place.create',body=id?{...payload,id}:payload;
    try{
      try{await API.mutate(action,body);}
      catch(error){
        if(error.status===409&&error.details?.code==='NEARBY_DUPLICATE'){
          const matches=error.details.matches||[];
          const description=matches.slice(0,5).map(x=>`• ${x.name} — ${x.distanceMeters} متر`).join('\n');
          const accepted=confirm(`⚠️ مکان مشابه در شعاع ${error.details.threshold} متری پیدا شد:\n\n${description}\n\nاگر مطمئنی این مکان مستقل است، با وجود هشدار ذخیره شود؟`);
          if(!accepted)return;
          await API.mutate(action,{...body,confirmNearDuplicate:true});
        }else throw error;
      }
      hideModal('place-modal');toast(id?'مکان ویرایش شد.':'مکان جدید ذخیره شد.');await loadState();
    }catch(e){apiError(e);}
  }

  function toLocalDateTime(value){const date=new Date(value||Date.now());return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
  function openVisit(place){if(!admin)return showModal('login-modal');$('#visit-form').reset();$('#visit-id').value='';$('#visit-place-id').value=place.id;setText('#visit-place-name',place.name);$('#visit-title').textContent='ثبت بازدید';$('#visit-date').value=toLocalDateTime();showModal('visit-modal');}
  function openVisitEdit(visit){if(!admin)return showModal('login-modal');const place=allPlaces().find(p=>p.id===visit.placeId);$('#visit-form').reset();$('#visit-id').value=visit.id;$('#visit-place-id').value=visit.placeId;setText('#visit-place-name',place?.name||'مکان حذف‌شده');$('#visit-title').textContent='ویرایش بازدید';$('#visit-quality').value=visit.quality||'normal';$('#visit-date').value=toLocalDateTime(visit.visitedAt);$('#visit-note').value=visit.note||'';$('#visit-duration').value=visit.durationMinutes??'';showModal('visit-modal');}
  // Visit mutation handlers are declared above.
  async function deleteVisit(id){if(!confirm('این بازدید از دفترچه حذف شود؟'))return;try{await API.mutate('visit.delete',{id});toast('بازدید حذف شد.');await loadState();}catch(e){apiError(e);}}
  async function saveVisit(event){event.preventDefault();const id=$('#visit-id').value;const payload={placeId:$('#visit-place-id').value,quality:$('#visit-quality').value,visitedAt:$('#visit-date').value?new Date($('#visit-date').value).toISOString():new Date().toISOString(),note:$('#visit-note').value,durationMinutes:$('#visit-duration').value?Number($('#visit-duration').value):null,visibility:'private'};try{await API.mutate(id?'visit.update':'visit.create',id?{...payload,id}:payload);hideModal('visit-modal');toast(id?'بازدید ویرایش شد.':'بازدید در دفترچه خصوصی ذخیره شد.');await loadState();}catch(e){apiError(e);}}
  function startDrawing(options={}){if(!admin)return showModal('login-modal');if(drawingActive)cancelDrawing();switchView('map');drawingActive=true;AtlasMap.startDrawing();$('#map-drawing-bar').classList.remove('hidden');setText('#drawing-count','۰ نقطه ثبت شده');if(!options.silent)toast('حالت ثبت مسیر فعال شد؛ روی نقشه نقطه‌ها را انتخاب کن یا GPS را فعال کن.');}
  function stopGps(){if(gpsWatch!==null){navigator.geolocation.clearWatch(gpsWatch);gpsWatch=null;}}
  function finishDrawing(){const points=AtlasMap.getDrawing();stopGps();if(points.length<2){toast('برای ذخیره مسیر حداقل دو نقطه اضافه کن.','error');return;}setText('#route-point-summary',`${U.fmt(points.length)} نقطه برای مسیر ثبت شده است.`);if(!pendingRouteId){$('#route-form').reset();$('#route-name').value=`مسیر ${new Date().toLocaleDateString('fa-IR')}`;$('#route-date').value=toLocalDateTime();$('#route-private').checked=true;setText('#route-title','ذخیره مسیر پیموده‌شده');}showModal('route-modal');}
  function cancelDrawing(){stopGps();AtlasMap.stopDrawing();drawingActive=false;pendingRouteId='';$('#map-drawing-bar').classList.add('hidden');}
  function openRouteEdit(route){if(!admin)return showModal('login-modal');if(drawingActive)cancelDrawing();startDrawing({silent:true});pendingRouteId=route.id;(route.coordinates||[]).forEach(p=>{const point=Array.isArray(p)?p:[p.lat,p.lng];AtlasMap.addDrawingPoint(Number(point[0]),Number(point[1]));});setText('#drawing-count',`${U.fmt(AtlasMap.getDrawing().length)} نقطه برای مسیر ثبت شده`);$('#route-name').value=route.name||'';$('#route-date').value=toLocalDateTime(route.visitedAt);$('#route-quality').value=route.quality||'normal';$('#route-mode').value=route.mode||'driving';$('#route-notes').value=route.notes||'';$('#route-private').checked=route.visibility!=='public';setText('#route-title','ویرایش مسیر');setText('#route-point-summary',`${U.fmt(AtlasMap.getDrawing().length)} نقطه در مسیر`);showModal('route-modal');}
  function gpsPoint(){requestPosition().then(p=>{if(!drawingActive)return;AtlasMap.addDrawingPoint(p.lat,p.lng);setText('#drawing-count',`${U.fmt(AtlasMap.getDrawing().length)} نقطه ثبت شده`);toast('موقعیت فعلی به مسیر اضافه شد.');}).catch(e=>toast(e.message,'error'));}
  function startGpsTrack(){if(!navigator.geolocation)return toast('GPS در این مرورگر در دسترس نیست.','error');stopGps();gpsWatch=navigator.geolocation.watchPosition(p=>{const c={lat:p.coords.latitude,lng:p.coords.longitude};const last=AtlasMap.getDrawing().slice(-1)[0];if(!last||U.haversine({lat:last[0],lng:last[1]},c)>18){AtlasMap.addDrawingPoint(c.lat,c.lng);setText('#drawing-count',`${U.fmt(AtlasMap.getDrawing().length)} نقطه · GPS فعال`);}},err=>toast('خطای GPS: '+err.message,'error'),{enableHighAccuracy:true,maximumAge:5000,timeout:15000});toast('ثبت زنده GPS فعال شد؛ صفحه را باز نگه دار.');}
  async function saveRoute(event){event.preventDefault();const coords=AtlasMap.getDrawing();if(coords.length<2)return toast('مسیر حداقل دو نقطه نیاز دارد.','error');const id=pendingRouteId;const payload={name:$('#route-name').value,visitedAt:$('#route-date').value?new Date($('#route-date').value).toISOString():new Date().toISOString(),quality:$('#route-quality').value,mode:$('#route-mode').value,notes:$('#route-notes').value,coordinates:coords,visibility:$('#route-private').checked?'private':'public'};try{await API.mutate(id?'route.update':'route.create',id?{...payload,id}:payload);hideModal('route-modal');cancelDrawing();setText('#route-title','ذخیره مسیر پیموده‌شده');toast(id?'مسیر ویرایش شد.':'مسیر با موفقیت ذخیره شد.');await loadState();}catch(e){apiError(e);}}
  async function discover(){const center=userLocation||currentCenter();const root=$('#discover-grid');root.innerHTML='<div class="empty-state glass"><span>◌</span><h3>در حال جست‌وجوی نقشه‌های عمومی...</h3><p>این درخواست ممکن است چند ثانیه طول بکشد.</p></div>';try{const response=await API.discover(center.lat,center.lng,Number($('#discover-radius').value||3000));discoveryItems=response.items||[];AtlasMap.renderDiscovery(discoveryItems);root.innerHTML=discoveryItems.map((p,i)=>`<article class="place-card"><div class="place-visual"><span class="visual-symbol">✧</span><span class="place-category">${U.esc(p.category)}</span><span class="place-status">OpenStreetMap</span></div><div class="place-body"><div class="place-title-row"><h3>${U.esc(p.name)}</h3></div><p class="place-description">${U.esc(p.address||'اطلاعات آدرس در نقشه عمومی ثبت نشده است.')}</p><div class="place-meta"><span>مختصات ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}</span><span>OSM</span></div><div class="place-actions"><button data-action="discovery-focus" data-index="${i}">⌖ روی نقشه</button><button data-action="discovery-save" data-index="${i}" ${admin?'':'disabled title="برای ذخیره باید وارد ادمین شوی"'}>＋ ذخیره در اطلس</button><a class="text-button" href="https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}" target="_blank" rel="noreferrer">جزئیات ↗</a></div></div></article>`).join('')||'<div class="empty-state glass"><span>⌖</span><h3>موردی پیدا نشد</h3><p>شعاع جست‌وجو را بیشتر کن یا مرکز نقشه را تغییر بده.</p></div>';toast(`${U.fmt(discoveryItems.length)} مکان از داده‌های عمومی پیدا شد.`);}catch(e){root.innerHTML=`<div class="empty-state glass"><span>!</span><h3>جست‌وجو ناموفق بود</h3><p>${U.esc(e.message)}</p></div>`;}}
  async function saveDiscovery(index){if(!admin)return showModal('login-modal');const p=discoveryItems[index];if(!p)return;const mapCategory=p.category.includes('کافه')?'cafe':p.category.includes('رستوران')?'restaurant':p.category.includes('خرید')?'shopping':p.category.includes('تاریخی')?'historical':p.category.includes('طبیعت')?'nature':'hidden';try{await API.mutate('place.create',{name:p.name,lat:p.lat,lng:p.lng,categoryId:mapCategory,address:p.address||'',description:`دریافت‌شده از OpenStreetMap. نوع: ${p.category}`,source:'openstreetmap',visibility:'public'});toast('مکان به اطلس اضافه شد.');await loadState();}catch(e){apiError(e);}}
  async function login(event){event.preventDefault();$('#login-error').textContent='';try{await API.login($('#admin-password').value);$('#admin-password').value='';hideModal('login-modal');toast('ورود ادمین موفق بود.');await loadState();}catch(e){$('#login-error').textContent=e.message;}}
  async function logout(){await API.logout();admin=false;toast('از پنل ادمین خارج شدی.');await loadState();}
  function openCatalog(){if(!admin)return showModal('login-modal');renderCatalog();showModal('catalog-modal');}
  function renderCatalog(){$('#category-manager-list').innerHTML=(state.categories||[]).map(c=>`<div class="manager-row"><span>${U.esc(c.icon||'✦')} ${U.esc(c.name)}</span><div><button data-action="category-edit" data-id="${U.esc(c.id)}" title="ویرایش دسته">✎</button><button data-action="category-delete" data-id="${U.esc(c.id)}" title="حذف دسته">×</button></div></div>`).join('');$('#tag-manager-list').innerHTML=(state.tags||[]).map(t=>`<div class="manager-row"><span># ${U.esc(t)}</span><div><button data-action="tag-edit" data-name="${U.esc(t)}" title="ویرایش برچسب">✎</button><button data-action="tag-delete" data-name="${U.esc(t)}" title="حذف برچسب">×</button></div></div>`).join('');const bounds=state.settings?.explorationBounds||{};for(const [key,id] of Object.entries({south:'#bound-south',west:'#bound-west',north:'#bound-north',east:'#bound-east',step:'#bound-step'})){const input=$(id);if(input)input.value=bounds[key]??'';}}
  async function saveBounds(event){event.preventDefault();const explorationBounds={south:Number($('#bound-south').value),west:Number($('#bound-west').value),north:Number($('#bound-north').value),east:Number($('#bound-east').value),step:Number($('#bound-step').value)};try{await API.mutate('settings.update',{explorationBounds});toast('محدوده محاسبه پوشش ذخیره شد.');await loadState();renderCatalog();}catch(e){apiError(e);}}
  async function addCategory(event){event.preventDefault();try{await API.mutate('category.create',{name:$('#category-name').value,icon:$('#category-icon').value||'✦'});$('#category-form').reset();await loadState();renderCatalog();toast('دسته‌بندی جدید اضافه شد.');}catch(e){apiError(e);}}
  async function addTag(event){event.preventDefault();try{await API.mutate('tag.create',{name:$('#tag-name').value});$('#tag-form').reset();await loadState();renderCatalog();toast('برچسب جدید اضافه شد.');}catch(e){apiError(e);}}
  async function openDuplicateManager(){
    if(!admin)return showModal('login-modal');
    showModal('duplicate-manager-modal');
    await scanDuplicates();
  }
  async function scanDuplicates(){
    const threshold=Number($('#duplicate-threshold').value||35),summary=$('#duplicate-summary'),root=$('#duplicate-groups');
    summary.textContent='در حال بررسی مختصات مکان‌ها…';root.innerHTML='';
    try{
      const result=await API.duplicates(threshold);
      summary.textContent=`${U.fmt(result.scannedPlaces)} رکورد بررسی شد · ${U.fmt(result.validCoordinatePlaces??result.scannedPlaces)} مکان دارای مختصات معتبر · ${U.fmt(result.groups.length)} گروه تکراری · ${U.fmt(result.duplicatePlaces)} مورد قابل ادغام · ${U.fmt(result.skippedPlaces||0)} رکورد بدون مختصات معتبر · آستانه ${result.threshold} متر`;
      $('#duplicate-merge-all').classList.toggle('hidden',!result.groups.length);if(!result.groups.length){root.innerHTML='<div class="empty-state"><span>✓</span><h3>تکراری نزدیکی پیدا نشد</h3><p>در آستانه انتخابی، مکان‌هایی با فاصله کمتر یا مساوی این مقدار شناسایی نشدند.</p></div>';return;}
      root.innerHTML=result.groups.map((group,index)=>`<article class="duplicate-group"><div class="duplicate-group-heading"><b>گروه ${U.fmt(index+1)}</b><span>شعاع بررسی ${U.fmt(group.threshold)} متر</span></div><div class="duplicate-keep"><small>مکان اصلی پیشنهادی · حفظ می‌شود</small><strong>📍 ${U.esc(group.keep.name)}</strong><code>${U.esc(group.keep.id)}</code></div><div class="duplicate-members">${group.duplicates.map(item=>`<div class="duplicate-member"><div><b>${U.esc(item.name)}</b><small>${U.fmt(item.distanceMeters)} متر از مکان اصلی · ${U.esc(item.id)}</small></div><span>تکراری احتمالی</span></div>`).join('')}</div><button class="button button-primary" data-action="merge-duplicates" data-keep="${U.esc(group.keep.id)}" data-ids="${U.esc(group.duplicates.map(x=>x.id).join(','))}" data-threshold="${group.threshold}">✓ ادغام و حذف ${U.fmt(group.duplicates.length)} مورد تکراری</button></article>`).join('');
    }catch(error){summary.textContent=`بررسی انجام نشد: ${error.message}`;}
  }
  async function mergeDuplicates(button){
    const keepId=button.dataset.keep,duplicateIds=(button.dataset.ids||'').split(',').filter(Boolean),threshold=Number(button.dataset.threshold||35);
    if(!duplicateIds.length)return;
    const keep=allPlaces().find(p=>p.id===keepId);
    if(!confirm(`ادغام ${duplicateIds.length} مکان تکراری با «${keep?.name||keepId}» تأیید می‌شود؟\n\nاطلاعات خالی، برچسب‌ها و روش‌های دسترسی به مکان اصلی منتقل می‌شوند و بازدیدهای قبلی نیز به مکان اصلی متصل می‌مانند. موارد تکراری حذف خواهند شد.`))return;
    button.disabled=true;button.textContent='در حال ادغام…';
    try{const result=await API.mutate('place.merge',{keepId,duplicateIds,threshold});toast(`${result.result.mergedCount} مکان ادغام شد؛ بازدیدها حفظ شدند.`);await loadState();await scanDuplicates();}
    catch(error){apiError(error);button.disabled=false;button.textContent='تلاش دوباره برای ادغام';}
  }
  async function mergeAllDuplicates(){
    const threshold=Number($('#duplicate-threshold').value||35);
    const report=await API.duplicates(threshold);
    const groups=report.groups||[];
    const total=groups.reduce((n,g)=>n+g.duplicates.length,0);
    if(!total)return toast('موردی برای ادغام وجود ندارد.');
    if(!confirm(`تأیید نهایی پاک‌سازی کامل؟\n\n${groups.length} گروه و ${total} مکان تکراری ادغام می‌شوند.\nاطلاعات تکمیلی و تمام بازدیدها حفظ می‌شوند؛ رکوردهای تکراری حذف خواهند شد.\n\nاین عملیات از طریق GitHub در دیتای خصوصی ثبت می‌شود.`))return;
    const button=$('#duplicate-merge-all');button.disabled=true;button.textContent='در حال ادغام گروه‌ها…';
    let merged=0;
    try{
      for(const group of groups){
        const duplicateIds=group.duplicates.map(item=>item.id);
        if(!duplicateIds.length)continue;
        await API.mutate('place.merge',{keepId:group.keep.id,duplicateIds,threshold});
        merged+=duplicateIds.length;
      }
      toast(`${U.fmt(merged)} مکان تکراری با موفقیت ادغام شد.`);
      await loadState();await scanDuplicates();
    }catch(error){apiError(error);await loadState().catch(()=>{});await scanDuplicates();}
    finally{button.disabled=false;button.textContent='✓ ادغام همه گروه‌ها';}
  }
  async function deletePlace(id){const p=allPlaces().find(x=>x.id===id);if(!p||!confirm(`مکان «${p.name}» حذف شود؟ این کار قابل بازگشت نیست.`))return;try{await API.mutate('place.delete',{id});toast('مکان حذف شد.');await loadState();}catch(e){apiError(e);}}
  async function deleteRoute(id){if(!confirm('این مسیر از تاریخچه حذف شود؟'))return;try{await API.mutate('route.delete',{id});toast('مسیر حذف شد.');await loadState();}catch(e){apiError(e);}}
  async function actionClick(event){
    if(event.target.closest('a'))return;const b=event.target.closest('[data-action]');if(!b)return;const action=b.dataset.action,id=b.dataset.id;if(action==='merge-duplicates'){await mergeDuplicates(b);return;}
    if(action==='detail'){const p=allPlaces().find(x=>x.id===id);if(p)openPlaceDetails(p);return;}
    if(action==='detail-edit'){editDetailPlace();return;}
    if(action==='preview-route'){const p=allPlaces().find(x=>x.id===id);if(!p)return;try{if(!userLocation)userLocation=await requestPosition();AtlasMap.showUser(userLocation);toast('در حال محاسبه مسیر رانندگی...');const route=await API.route(userLocation,p);AtlasMap.showRoutePreview(route.geometry);switchView('map');const minutes=Math.round(route.durationSeconds/60);const km=(route.distanceMeters/1000).toLocaleString('fa-IR',{maximumFractionDigits:1});toast(`مسیر رانندگی: ${km} کیلومتر · حدود ${U.fmt(minutes)} دقیقه. برای ترافیک زنده، Google Maps را باز کن.`);const info=document.createElement('div');info.className='toast';info.textContent=`${p.name} · ${km} km · ${U.fmt(minutes)} دقیقه (تخمینی)`;$('#toast-root').appendChild(info);setTimeout(()=>info.remove(),5000);}catch(e){toast(e.message,'error');if(userLocation)window.open(`https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${p.lat},${p.lng}&travelmode=driving`,'_blank','noopener');}return;}
    if(action==='focus'){const p=allPlaces().find(x=>x.id===id);if(p){AtlasMap.focus(p.lat,p.lng);switchView('map');}}
    else if(action==='navigate'){const p=allPlaces().find(x=>x.id===id);if(p)window.open(U.routeGoogleUrl(p),'_blank','noopener');}
    else if(action==='visit'){const p=allPlaces().find(x=>x.id===id);if(p)openVisit(p);}
    else if(action==='edit'){const p=allPlaces().find(x=>x.id===id);if(p)openPlaceForm(p);}
    else if(action==='delete')deletePlace(id);
    else if(action==='route-focus'){const r=(state.routes||[]).find(x=>x.id===id);if(r){const pts=(r.coordinates||[]).map(p=>Array.isArray(p)?p:[p.lat,p.lng]);if(pts.length)AtlasMap.map.fitBounds(L.latLngBounds(pts).pad(.2));switchView('map');}}
    else if(action==='route-edit'){const r=(state.routes||[]).find(x=>x.id===id);if(r)openRouteEdit(r);}
    else if(action==='route-delete')deleteRoute(id);
    else if(action==='visit-edit'){const v=(state.visits||[]).find(x=>x.id===id);if(v)openVisitEdit(v);}
    else if(action==='visit-delete')deleteVisit(id);
    else if(action==='discovery-focus'){const p=discoveryItems[Number(b.dataset.index)];if(p){AtlasMap.focus(p.lat,p.lng,17);switchView('map');}}
    else if(action==='discovery-save')saveDiscovery(Number(b.dataset.index));
    else if(action==='category-edit'){const cat=(state.categories||[]).find(c=>c.id===id);if(!cat)return;const name=prompt('نام جدید دسته‌بندی:',cat.name);if(name===null)return;const icon=prompt('ایموجی دسته‌بندی:',cat.icon||'✦');if(icon===null)return;try{await API.mutate('category.update',{id,name:name.trim(),icon:icon.trim()||'✦'});await loadState();renderCatalog();toast('دسته‌بندی ویرایش شد.');}catch(e){apiError(e);}}
    else if(action==='category-delete'){if(confirm('این دسته‌بندی حذف شود؟'))try{await API.mutate('category.delete',{id});await loadState();renderCatalog();}catch(e){apiError(e);}}
    else if(action==='tag-edit'){const oldName=b.dataset.name;const newName=prompt('نام جدید برچسب:',oldName);if(newName===null)return;try{await API.mutate('tag.rename',{oldName,newName:newName.trim()});await loadState();renderCatalog();toast('برچسب و مکان‌های مرتبط به‌روزرسانی شدند.');}catch(e){apiError(e);}}
    else if(action==='tag-delete'){if(confirm(`برچسب «${b.dataset.name}» حذف شود؟`))try{await API.mutate('tag.delete',{name:b.dataset.name});await loadState();renderCatalog();}catch(e){apiError(e);}}
  }
  function bind(){
    $$('[data-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
    $('#auth-button').addEventListener('click',()=>admin?logout():showModal('login-modal'));$('#diagnostics-button').addEventListener('click',async()=>{try{const report=await API.diagnostics();const lines=report.checks.map(x=>`${x.ok?'✅':'❌'} ${x.name}: ${x.detail}`).join('\\n');alert(`Shiraz Atlas · ${report.checks.filter(x=>x.ok).length}/${report.checks.length} checks passed\\n\\n${lines}\\n\\nبرای لاگ زنده: Cloudflare Worker → Logs / Observability یا npx wrangler tail`);}catch(e){apiError(e);}});
    $('#login-form').addEventListener('submit',login);$('#place-form').addEventListener('submit',savePlace);$('#visit-form').addEventListener('submit',saveVisit);$('#route-form').addEventListener('submit',saveRoute);$('#category-form').addEventListener('submit',addCategory);$('#tag-form').addEventListener('submit',addTag);$('#bounds-form').addEventListener('submit',saveBounds);
    $$('.modal-close,[data-close]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.close||b.closest('.modal-backdrop')?.id;if(id==='route-modal'&&drawingActive)cancelDrawing();hideModal(id);}));
    $$('.modal-backdrop').forEach(back=>back.addEventListener('click',e=>{if(e.target===back){if(back.id==='route-modal'&&drawingActive)cancelDrawing();hideModal(back.id);}}));
    $('#add-place-button').addEventListener('click',()=>openPlaceForm());$('#suggest-place-name').addEventListener('click',suggestPlaceName);$('#place-detail-edit').addEventListener('click',editDetailPlace);$('#place-detail-map').addEventListener('click',()=>{const p=allPlaces().find(x=>x.id===detailPlaceId);if(p){hideModal('place-detail-modal');AtlasMap.focus(p.lat,p.lng,16);switchView('map');}});$('#place-detail-route').addEventListener('click',()=>{const p=allPlaces().find(x=>x.id===detailPlaceId);if(p){hideModal('place-detail-modal');window.open(U.routeGoogleUrl(p),'_blank','noopener');}});$('#duplicates-button').addEventListener('click',openDuplicateManager);$('#duplicate-scan-button').addEventListener('click',scanDuplicates);$('#duplicate-merge-all').addEventListener('click',mergeAllDuplicates);$('#duplicate-groups').addEventListener('click',actionClick);$('#draw-route-button').addEventListener('click',startDrawing);$('#quick-route').addEventListener('click',startDrawing);$('#journey-add-button').addEventListener('click',startDrawing);
    $('#hero-explore').addEventListener('click',()=>switchView('map'));$('#hero-random').addEventListener('click',randomPlace);$('#quick-random').addEventListener('click',randomPlace);$('#locate-button').addEventListener('click',locateMe);$('#quick-near').addEventListener('click',async()=>{await locateMe();switchView('discover');await discover();});
    $('#map-layer-toggle').addEventListener('click',()=>{const layer=AtlasMap.toggleLayer();toast(layer==='light'?'نقشه روشن فعال شد.':'نقشه تاریک فعال شد.');});
    $('#weather-refresh').addEventListener('click',()=>{const c=state.settings?.center||{lat:29.5918,lng:52.5837};loadWeather(c.lat,c.lng,'شیراز، ایران',true);});$('#fit-map-button').addEventListener('click',()=>AtlasMap.fit(visiblePlaces()));$('#refresh-button').addEventListener('click',async()=>{try{await loadState();await loadWeather(state.settings?.center?.lat||29.5918,state.settings?.center?.lng||52.5837);toast('اطلاعات به‌روزرسانی شد.');}catch(e){apiError(e);}});
    $('#theme-toggle').addEventListener('click',()=>{document.body.classList.toggle('light-theme');localStorage.setItem('atlas_theme',document.body.classList.contains('light-theme')?'light':'dark');});
    $('#map-search-input').addEventListener('input',e=>{searchText=e.target.value;$('#places-search-input').value=searchText;placePage=1;renderPlaces();});$('#places-search-input').addEventListener('input',e=>{searchText=e.target.value;$('#map-search-input').value=searchText;placePage=1;renderPlaces();});$('#places-sort').addEventListener('change',renderPlaces);$('#visited-filter').addEventListener('change',renderPlaces);$('#access-filter').addEventListener('change',renderPlaces);$('#clear-filters').addEventListener('click',()=>{categoryFilter='';tagFilter='';searchText='';$('#map-search-input').value='';$('#places-search-input').value='';$('#visited-filter').checked=false;$('#access-filter').value='';renderAll();});$('#load-more-button').addEventListener('click',()=>{placePage++;renderPlaces();});
    $('#place-grid').addEventListener('click',actionClick);$('#journey-list').addEventListener('click',actionClick);$('#visit-history-list').addEventListener('click',actionClick);$('#discover-grid').addEventListener('click',actionClick);$('#category-manager-list').addEventListener('click',actionClick);$('#tag-manager-list').addEventListener('click',actionClick);
    $('#discover-button').addEventListener('click',discover);$('#gps-point-button').addEventListener('click',gpsPoint);$('#gps-track-button').addEventListener('click',startGpsTrack);$('#finish-drawing-button').addEventListener('click',finishDrawing);$('#cancel-drawing-button').addEventListener('click',cancelDrawing);
    $('#mobile-menu-button').addEventListener('click',()=>$('#mobile-nav').classList.toggle('open'));
    document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.place-card-clickable')){e.preventDefault();const p=allPlaces().find(x=>x.id===e.target.dataset.id);if(p)openPlaceDetails(p);}if(e.key==='Escape'){$$('.modal-backdrop').forEach(m=>m.classList.add('hidden'));if(drawingActive)cancelDrawing();}if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('#map-search-input').focus();}});
    $('#places-section .section-heading-actions').insertAdjacentHTML('beforeend','<button class="button button-quiet admin-only hidden" id="catalog-button">⚙ دسته‌ها و برچسب‌ها</button>');$('#catalog-button').addEventListener('click',openCatalog);
    // A long press is not required; expose an optional live GPS recorder through the drawing bar.
    window.addEventListener('beforeunload',stopGps);
  }
  async function boot(){
    if(localStorage.getItem('atlas_theme')==='light')document.body.classList.add('light-theme');
    registerOfflineSupport();
    bind();
    try{AtlasMap.init({onMapPoint:({count})=>setText('#drawing-count',`${U.fmt(count)} نقطه ثبت شده`),onPlaceSelect:p=>{selectedPlace=p;loadWeather(p.lat,p.lng,p.name||'مکان انتخاب‌شده');}});}catch(e){toast(e.message,'error');}
    try{await loadState();}catch(e){apiError(e);$('#place-grid').innerHTML=`<div class="empty-state glass"><span>!</span><h3>اتصال به اطلس برقرار نشد</h3><p>${U.esc(e.message)}<br>آدرس Worker و فایل داده را بررسی کن.</p></div>`;}
    const center=state.settings?.center||{lat:29.5918,lng:52.5837};loadWeather(center.lat,center.lng);
    const p=new URLSearchParams(location.search).get('place');if(p){const target=allPlaces().find(x=>x.id===p);if(target){AtlasMap.focus(target.lat,target.lng);switchView('map');}}
    setTimeout(()=>$('#loading-screen').classList.add('done'),350);
  }
  document.addEventListener('DOMContentLoaded',boot);
})();
