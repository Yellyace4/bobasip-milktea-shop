// BobaSip secure notification endpoint (Vercel serverless function).
// Credentials stay in environment variables and are never sent to the browser.
// Email: Resend (https://resend.com)  -> RESEND_API_KEY, EMAIL_FROM
// SMS:   Semaphore (https://semaphore.co) -> SEMAPHORE_API_KEY, SEMAPHORE_SENDER_NAME (optional)

function esc(v){
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function money(n){ return 'PHP ' + Number(n || 0).toLocaleString(); }

function receiptText(order){
  const lines = [];
  lines.push('BobaSip - Official Sales Receipt');
  lines.push('Receipt No.: ' + (order.ref || order.order_number || ''));
  lines.push('Date & Time: ' + (order.date || order.order_date_time || ''));
  lines.push('Customer: ' + (order.customerName || order.customer_name || 'Customer'));
  lines.push('Status: ' + (order.status || 'Pending Approval'));
  lines.push('Payment: ' + (order.payment || order.payment_method || ''));
  lines.push('Delivery Address: ' + (order.address || order.delivery_address || ''));
  lines.push('');
  lines.push('Items:');
  (order.items || []).forEach(i => {
    lines.push('- ' + i.name + (i.size ? ' (' + i.size + ')' : '') + ' x' + i.qty + ' - ' + money(i.lineTotal));
  });
  lines.push('');
  lines.push('Subtotal: ' + money(order.subtotal));
  lines.push('Delivery Fee: ' + money(order.delivery != null ? order.delivery : order.delivery_fee));
  lines.push('Total Paid: ' + money(order.total));
  return lines.join('\n');
}

function receiptHtml(order){
  const rows = (order.items || []).map(i =>
    '<tr><td style="padding:6px 0">' + esc(i.name) + (i.size ? ' (' + esc(i.size) + ')' : '') + '</td>' +
    '<td style="text-align:center">' + esc(i.qty) + '</td>' +
    '<td style="text-align:right">' + esc(money(i.lineTotal)) + '</td></tr>'
  ).join('');
  return [
    '<div style="font-family:Arial,sans-serif;color:#2b1a12;max-width:520px;margin:0 auto">',
    '<h2 style="margin:0 0 4px">BobaSip</h2>',
    '<p style="margin:0 0 16px;color:#7a6a58;font-size:12px;text-transform:uppercase;letter-spacing:1px">Official Sales Receipt</p>',
    '<p><b>Receipt No.:</b> ' + esc(order.ref || order.order_number) + '<br>',
    '<b>Date &amp; Time:</b> ' + esc(order.date || order.order_date_time) + '<br>',
    '<b>Customer:</b> ' + esc(order.customerName || order.customer_name || 'Customer') + '<br>',
    '<b>Status:</b> ' + esc(order.status || 'Pending Approval') + '<br>',
    '<b>Payment:</b> ' + esc(order.payment || order.payment_method) + '<br>',
    '<b>Delivery Address:</b> ' + esc(order.address || order.delivery_address) + '</p>',
    '<table style="width:100%;border-collapse:collapse;font-size:13px">',
    '<thead><tr><th style="text-align:left;border-bottom:2px solid #2b2118;padding-bottom:6px">Item</th>',
    '<th style="text-align:center;border-bottom:2px solid #2b2118;padding-bottom:6px">Qty</th>',
    '<th style="text-align:right;border-bottom:2px solid #2b2118;padding-bottom:6px">Amount</th></tr></thead>',
    '<tbody>' + rows + '</tbody></table>',
    '<div style="margin-top:12px;border-top:2px solid #2b2118;padding-top:8px;font-size:13px">',
    '<div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>' + esc(money(order.subtotal)) + '</span></div>',
    '<div style="display:flex;justify-content:space-between"><span>Delivery Fee</span><span>' + esc(money(order.delivery != null ? order.delivery : order.delivery_fee)) + '</span></div>',
    '<div style="display:flex;justify-content:space-between;font-weight:bold;font-size:16px;margin-top:6px"><span>Total Paid</span><span>' + esc(money(order.total)) + '</span></div>',
    '</div>',
    '<p style="margin-top:18px;font-size:11px;color:#6b5a49;text-align:center">Thank you for choosing BobaSip!</p>',
    '</div>'
  ].join('');
}

async function sendEmail(body, res){
  const to = String(body.to || '').trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)){
    return res.status(400).json({error:'A valid recipient email is required'});
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if(!apiKey || !from){
    return res.status(503).json({error:'Email service is not configured'});
  }
  const order = body.order || {};
  const text = body.text || receiptText(order);
  const payload = {
    from,
    to: [to],
    subject: String(body.subject || ('BobaSip receipt ' + (order.ref || order.order_number || ''))).slice(0, 180),
    text,
    html: receiptHtml(order)
  };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  if(!r.ok) return res.status(502).json({error:data.message || 'Email provider rejected the request'});
  return res.status(200).json({ok:true, id:data.id || null});
}

async function sendSms(body, res){
  const apiKey = process.env.SEMAPHORE_API_KEY;
  if(!apiKey){
    return res.status(503).json({error:'SMS service is not configured'});
  }
  const to = String(body.to || '').replace(/[^\d+]/g, '');
  if(to.replace(/\D/g, '').length < 7){
    return res.status(400).json({error:'A valid phone number is required'});
  }
  const params = new URLSearchParams({
    apikey: apiKey,
    number: to,
    message: String(body.message || '').slice(0, 480)
  });
  if(process.env.SEMAPHORE_SENDER_NAME) params.set('sendername', process.env.SEMAPHORE_SENDER_NAME);
  const r = await fetch('https://api.semaphore.co/api/v4/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const data = await r.json().catch(() => null);
  if(!r.ok) return res.status(502).json({error:'SMS provider rejected the request'});
  return res.status(200).json({ok:true, data});
}

function getSupabaseAdmin(){
  const url = process.env.SUPABASE_URL || process.env.BOBASIP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.BOBASIP_SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !key) return null;
  return {url, key};
}

async function sbFetch(cfg, path, opts){
  const r = await fetch(cfg.url + '/rest/v1/' + path, Object.assign({
    headers: Object.assign({
      'apikey': cfg.key,
      'Authorization': 'Bearer ' + cfg.key,
      'Content-Type': 'application/json'
    }, (opts && opts.headers) || {})
  }, opts || {}));
  const text = await r.text();
  let data = null; try{ data = text ? JSON.parse(text) : null; }catch(e){ data = text; }
  return {ok:r.ok, status:r.status, data};
}

async function notifyAdminsOfOrder(body, res){
  const cfg = getSupabaseAdmin();
  if(!cfg){
    return res.status(503).json({error:'Server Supabase is not configured', missing:['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']});
  }
  const order = body.order || {};
  const ref = String(order.ref || order.order_number || '').trim();
  if(!ref) return res.status(400).json({error:'Order reference is required'});

  const eventKey = 'admin-order-submitted:' + ref;
  const customerName = String(order.userName || order.customer_name || order.userEmail || order.customer_email || 'Customer').slice(0, 120);
  const totalAmount = Number(order.total || 0);
  const orderDateTime = String(order.date || order.order_date_time || new Date().toISOString());
  const title = 'New order received';
  const message = customerName + ' placed order ' + ref + ' (' + money(totalAmount) + ').';

  const adminsRes = await sbFetch(cfg, 'profiles?select=id,email,full_name,role&role=eq.admin', {method:'GET'});
  if(!adminsRes.ok){
    return res.status(502).json({error:'Failed to load admin recipients', details:adminsRes.data});
  }
  const admins = Array.isArray(adminsRes.data) ? adminsRes.data : [];
  if(!admins.length){
    return res.status(200).json({ok:true, created:0, recipients:0, warning:'No admin profiles found'});
  }

  const rows = admins.map(a=>({
    user_id: a.id,
    user_email: a.email || null,
    title,
    message,
    type: 'order_update',
    notification_type: 'admin_new_order',
    ref,
    order_number: ref,
    read: false,
    event_key: eventKey,
    customer_name: customerName,
    total_amount: totalAmount,
    order_date_time: orderDateTime
  }));

  const ins = await sbFetch(cfg, 'notifications?on_conflict=user_id,event_key', {
    method:'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows)
  });
  if(!ins.ok){
    const errText = JSON.stringify(ins.data||'');
    if(errText.includes('event_key') || errText.includes('on_conflict') || errText.includes('order_number') || errText.includes('notification_type')){
      const fallbackRows = rows.map(r=>({user_id:r.user_id,user_email:r.user_email,title:r.title,message:r.message,ref:r.ref,read:false}));
      const ins2 = await sbFetch(cfg, 'notifications', {method:'POST', headers:{'Prefer':'return=representation'}, body: JSON.stringify(fallbackRows)});
      if(!ins2.ok) return res.status(502).json({error:'Failed to create admin notifications', details:ins2.data, migrationRequired:true});
      return res.status(200).json({ok:true, created:Array.isArray(ins2.data)?ins2.data.length:fallbackRows.length, recipients:admins.length, dedupe:'none', migrationRequired:true});
    }
    return res.status(502).json({error:'Failed to create admin notifications', details:ins.data});
  }
  return res.status(200).json({ok:true, created:Array.isArray(ins.data)?ins.data.length:rows.length, recipients:admins.length, dedupe:'event_key'});
}

module.exports = async (req, res) => {
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});

  const origin = req.headers.origin;
  const host = req.headers.host;
  if(origin && host){
    try{
      if(new URL(origin).host !== host) return res.status(403).json({error:'Origin not allowed'});
    }catch(e){ return res.status(403).json({error:'Origin not allowed'}); }
  }

  let body = req.body;
  if(typeof body === 'string'){
    try{ body = JSON.parse(body); }catch(e){ return res.status(400).json({error:'Invalid JSON'}); }
  }
  body = body || {};

  try{
    if(body.type === 'email_receipt') return await sendEmail(body, res);
    if(body.type === 'sms_alert') return await sendSms(body, res);
    if(body.type === 'admin_new_order') return await notifyAdminsOfOrder(body, res);
    return res.status(400).json({error:'Unknown notification type'});
  }catch(e){
    console.error('BobaSip notification error:', e);
    return res.status(502).json({error:'Notification provider request failed'});
  }
};
