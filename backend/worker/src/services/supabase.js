let _supabaseUrl = '';
let _serviceKey = '';
let _anonKey = '';

function init(env) {
  _supabaseUrl = env.SUPABASE_URL;
  _serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  _anonKey = env.SUPABASE_ANON_KEY;
}

function headers(isAdmin = false) {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${isAdmin ? _serviceKey : _anonKey}`,
    'apikey': isAdmin ? _serviceKey : _anonKey,
  };
}

export async function query(env, table, options = {}, isAdmin = false) {
  init(env);
  let url = `${_supabaseUrl}/rest/v1/${table}`;
  const params = new URLSearchParams();

  if (options.select) {
    params.set('select', options.select);
  } else {
    params.set('select', '*');
  }

  if (options.order) {
    params.set('order', options.order);
  }

  if (options.limit) {
    params.set('limit', String(options.limit));
  }

  if (options.eq) {
    for (const [col, val] of Object.entries(options.eq)) {
      params.set(`${col}`, `eq.${val}`);
    }
  }

  if (params.toString()) {
    url += '?' + params.toString();
  }

  const res = await fetch(url, {
    method: 'GET',
    headers: headers(isAdmin),
  });

  if (!res.ok) {
    throw new Error(`Supabase error: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

export async function getById(env, table, id, isAdmin = false) {
  init(env);
  const url = `${_supabaseUrl}/rest/v1/${table}?id=eq.${id}&select=*`;
  const res = await fetch(url, {
    method: 'GET',
    headers: headers(isAdmin),
  });

  if (!res.ok) {
    throw new Error(`Supabase error: ${res.status}`);
  }

  const data = await res.json();
  return data[0] || null;
}

export async function insert(env, table, data, isAdmin = false) {
  init(env);
  const url = `${_supabaseUrl}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers(isAdmin),
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(Array.isArray(data) ? data : data),
  });

  if (!res.ok) {
    throw new Error(`Supabase error: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

export async function update(env, table, id, data, isAdmin = false) {
  init(env);
  const url = `${_supabaseUrl}/rest/v1/${table}?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...headers(isAdmin),
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(`Supabase error: ${res.status} ${await res.text()}`);
  }

  const result = await res.json();
  return result[0] || null;
}

export async function remove(env, table, id, isAdmin = false) {
  init(env);
  const url = `${_supabaseUrl}/rest/v1/${table}?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: headers(isAdmin),
  });

  if (!res.ok) {
    throw new Error(`Supabase error: ${res.status}`);
  }

  return { success: true };
}

export async function rpc(env, functionName, params = {}, isAdmin = false) {
  init(env);
  const url = `${_supabaseUrl}/rest/v1/rpc/${functionName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(isAdmin),
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error(`Supabase RPC error: ${res.status} ${await res.text()}`);
  }

  return res.json();
}


