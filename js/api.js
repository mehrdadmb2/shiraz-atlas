(() => {
  const {API_BASE_URL,REQUEST_TIMEOUT_MS}=window.ATLAS_CONFIG;
  let token=sessionStorage.getItem('atlas_admin_session')||'';
  const request=async(path,{method='GET',body,auth=false,timeout=REQUEST_TIMEOUT_MS}={})=>{
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
    const headers={'Accept':'application/json'};if(body!==undefined)headers['Content-Type']='application/json';if(auth&&token)headers.Authorization=`Bearer ${token}`;
    try{const res=await fetch(`${API_BASE_URL}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,credentials:'omit'});const data=await res.json().catch(()=>({error:`پاسخ نامعتبر از سرور (${res.status})`}));if(!res.ok){if(res.status===401&&auth){clearSession();}throw new Error(data.error||`HTTP ${res.status}`);}return data;}catch(error){if(error.name==='AbortError')throw new Error('زمان پاسخ سرور تمام شد؛ اتصال را بررسی کن.');throw error;}finally{clearTimeout(timer);}
  };
  const setSession=value=>{token=value||'';if(token)sessionStorage.setItem('atlas_admin_session',token);else sessionStorage.removeItem('atlas_admin_session');};
  const clearSession=()=>setSession('');
  window.AtlasAPI={
    get isAuthenticated(){return Boolean(token);},
    health:()=>request('/api/health'),
    diagnostics:()=>request('/api/admin/diagnostics',{auth:true}),
    state:async admin=>request(admin?'/api/admin/state':'/api/state',{auth:Boolean(admin)}),
    login:async password=>{const data=await request('/api/auth/login',{method:'POST',body:{password}});setSession(data.token);return data;},
    logout:async()=>{try{await request('/api/auth/logout',{method:'POST',auth:true});}catch{}clearSession();},
    mutate:(action,payload)=>request('/api/admin/mutate',{method:'POST',body:{action,payload},auth:true}),
    discover:(lat,lng,radius=3000)=>request(`/api/discover?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(radius)}`,{timeout:30000}),
    weather:(lat,lng)=>request(`/api/weather?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,{timeout:15000}),
    route:(from,to)=>request(`/api/route?fromLat=${encodeURIComponent(from.lat)}&fromLng=${encodeURIComponent(from.lng)}&toLat=${encodeURIComponent(to.lat)}&toLng=${encodeURIComponent(to.lng)}&mode=driving`,{timeout:22000})
  };
})();
