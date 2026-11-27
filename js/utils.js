(() => {
  const fa = new Intl.NumberFormat('fa-IR');
  const compact = new Intl.NumberFormat('fa-IR', { notation: 'compact', maximumFractionDigits: 1 });
  const qualityMap = { good: 'خوب', normal: 'نرمال', bad: 'بد' };
  const categoryDefaults = [
    {id:'cafe',name:'کافه',icon:'☕',color:'#69d9c2'},
    {id:'restaurant',name:'رستوران و غذا',icon:'🍽️',color:'#f3b96c'},
    {id:'nature',name:'طبیعت و باغ',icon:'🌿',color:'#71df9d'},
    {id:'historical',name:'تاریخی و فرهنگی',icon:'🏛️',color:'#b5a5ff'},
    {id:'entertainment',name:'تفریح و سرگرمی',icon:'🎡',color:'#72c9f2'},
    {id:'viewpoint',name:'منظره و بام',icon:'🌇',color:'#f2a5b7'},
    {id:'family',name:'خانوادگی',icon:'👨‍👩‍👧',color:'#7fdbd1'},
    {id:'shopping',name:'خرید',icon:'🛍️',color:'#d8a8f4'},
    {id:'sports',name:'ورزشی و فعالیت',icon:'🚴',color:'#8ed1f1'},
    {id:'hidden',name:'کشف ناشناخته',icon:'✧',color:'#b8c8d5'}
  ];
  const defaultTags = ['دوستانه','پشتو','تاریک','Skybit'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = value => fa.format(Number(value || 0));
  const money = value => value == null || value === '' ? 'نامشخص' : `${compact.format(Number(value))} تومان`;
  const date = value => { if(!value) return '—'; const d=new Date(value); if(Number.isNaN(d.getTime()))return '—'; return new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'short'}).format(d); };
  const shortDate = value => { if(!value)return '—'; const d=new Date(value); if(Number.isNaN(d.getTime()))return '—'; return new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium'}).format(d); };
  const qualityLabel = q => qualityMap[q] || 'ثبت‌نشده';
  const haversine = (a,b) => { const R=6371000,rad=x=>x*Math.PI/180,dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng),x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(x)); };
  const distanceLabel = meters => meters < 1000 ? `${fmt(Math.round(meters))} متر` : `${(meters/1000).toLocaleString('fa-IR',{maximumFractionDigits:1})} کیلومتر`;
  const slug = text => String(text||'').toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'') || `item-${Math.random().toString(36).slice(2,8)}`;
  const randomId = prefix => `${prefix||'id'}_${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2,9)}`;
  const normalizeDigits = value => String(value||'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const parseCoordinates = input => {
    const s=normalizeDigits(input).replace(/\u00a0/g,' ');
    const dms = [...s.matchAll(/(\d{1,3})\s*[°º]\s*(\d{1,2})\s*['′’]\s*(\d+(?:\.\d+)?)?\s*["″”]?\s*([NS])/gi)];
    const lonDms = [...s.matchAll(/(\d{1,3})\s*[°º]\s*(\d{1,2})\s*['′’]\s*(\d+(?:\.\d+)?)?\s*["″”]?\s*([EW])/gi)];
    if(dms.length && lonDms.length){ const cv=m=>(Number(m[1])+Number(m[2])/60+Number(m[3]||0)/3600)*(/[SW]/i.test(m[4])?-1:1); const lat=cv(dms[0]),lng=cv(lonDms[0]); if(Math.abs(lat)<=90&&Math.abs(lng)<=180)return {lat,lng}; }
    const patterns=[/@\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/,/[?&](?:q|query|ll)=(-?\d{1,2}(?:\.\d+)?)[,%2C ]+(-?\d{1,3}(?:\.\d+)?)/i,/(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)/];
    for(const re of patterns){const m=s.match(re);if(m){const lat=Number(m[1]),lng=Number(m[2]);if(Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180)return {lat,lng};}}
    const osm=s.match(/[?&]mlat=(-?\d+(?:\.\d+)?).*?[?&]mlon=(-?\d+(?:\.\d+)?)/i); if(osm)return {lat:Number(osm[1]),lng:Number(osm[2])};
    const hash=s.match(/#map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/i); if(hash)return {lat:Number(hash[1]),lng:Number(hash[2])};
    return null;
  };
  const qualityClass = q => q==='good'?'quality-good':q==='bad'?'quality-bad':'quality-normal';
  const routeGoogleUrl = p => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.lat},${p.lng}`)}`;
  const routeOSMUrl = p => `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${encodeURIComponent(`${p.lat},${p.lng}`)}`;
  const categoryById = (categories,id) => (categories||[]).find(c=>c.id===id) || (categoryDefaults.find(c=>c.id===id)) || {id:'other',name:'سایر',icon:'✦',color:'#7ddac4'};
  const weatherText = code => ({0:'آسمان صاف',1:'عمدتاً صاف',2:'نیمه‌ابری',3:'ابری',45:'مه‌آلود',48:'مه یخ‌زده',51:'نم‌نم باران',53:'باران سبک',55:'باران ریز شدید',61:'باران خفیف',63:'باران متوسط',65:'باران شدید',71:'برف خفیف',73:'برف متوسط',75:'برف شدید',80:'رگبار پراکنده',81:'رگبار متوسط',82:'رگبار شدید',95:'رعدوبرق',96:'رعدوبرق و تگرگ',99:'رعدوبرق شدید'})[code]||'وضعیت نامشخص';
  const weatherIcon = code => code===0?'☀':code<=3?'⛅':code===45||code===48?'🌫':code>=51&&code<=67?'🌧':(code>=71&&code<=77)||code===85||code===86?'❄':code>=80&&code<=82?'🌦':'⛈';
  window.AtlasUtils={fa,compact,categoryDefaults,defaultTags,esc,fmt,money,date,shortDate,qualityLabel,qualityClass,haversine,distanceLabel,slug,randomId,normalizeDigits,parseCoordinates,routeGoogleUrl,routeOSMUrl,categoryById,weatherText,weatherIcon};
})();
