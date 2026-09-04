import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PRIORITY_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  immediate:  { label: "Immediate",  color: "#b91c1c", bg: "#fee2e2" },
  short_term: { label: "Short-Term", color: "#92400e", bg: "#fef3c7" },
  long_term:  { label: "Long-Term",  color: "#1e40af", bg: "#dbeafe" },
  upgrade:    { label: "Upgrade",    color: "#6b21a8", bg: "#f3e8ff" },
};

const GUIDANCE_FULL: Record<string, string> = {
  minor:       "Minor Investment — Routine maintenance, low-priority items only.",
  moderate:    "Moderate Investment — Several items need timely attention.",
  significant: "Significant Investment — Major repairs or safety concerns identified.",
  prioritized: "Prioritized Repairs — Critical items requiring immediate attention.",
};

const CONDITION_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  good:            { label: "All Good",         color: "#14532d", bg: "#dcfce7", border: "#86efac" },
  monitor:         { label: "Monitor",           color: "#78350f", bg: "#fef3c7", border: "#fde68a" },
  needs_attention: { label: "Needs Attention",   color: "#7f1d1d", bg: "#fee2e2", border: "#fca5a5" },
};
function esc(value: unknown) { return String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!)); }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey   = Deno.env.get("RESEND_API_KEY");
    const fromEmail   = Deno.env.get("FROM_EMAIL") || "onboarding@resend.dev";
    const usingTestSender = fromEmail === "onboarding@resend.dev";

    const hdrs = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" };

    const callerAuthorization = req.headers.get("Authorization");
    if (!callerAuthorization) {
      return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: callerAuthorization, apikey: serviceKey },
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const caller = await userRes.json();
    const profileRes = await fetch(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${encodeURIComponent(caller.id)}&select=role,status`, { headers: hdrs });
    const [callerProfile] = await profileRes.json();
    if (!callerProfile || callerProfile.status !== "active" || !["owner", "manager"].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: "Manager or owner access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { inspectionId } = await req.json();
    if (!inspectionId) return new Response(JSON.stringify({ error: "ID required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Fetch inspection
    const inspRes = await fetch(`${supabaseUrl}/rest/v1/inspections?id=eq.${inspectionId}&select=*`, { headers: hdrs });
    const [insp] = await inspRes.json();
    if (!insp) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Fetch sections
    const secRes = await fetch(`${supabaseUrl}/rest/v1/inspection_sections?inspection_id=eq.${inspectionId}&order=section_number`, { headers: hdrs });
    const sections: { id: string; section_name: string; section_number: number }[] = await secRes.json();

    // Fetch items
    const sectionIds = sections.map(s => s.id).join(",");
    let items: { id:string; section_id:string; item_name:string; status:string; notes:string|null; priority:string|null; impact:string|null; recommended_action:string|null; not_inspected_reason:string|null; labor_hours_low:number|null; labor_hours_high:number|null; parts_cost_low:number|null; parts_cost_high:number|null }[] = [];
    if (sectionIds) {
      const itemRes = await fetch(`${supabaseUrl}/rest/v1/inspection_items?section_id=in.(${sectionIds})&order=created_at`, { headers: hdrs });
      items = await itemRes.json();
    }

    const needsAttention = items.filter(i => i.status === "needs_attention");
    const monitor        = items.filter(i => i.status === "monitor");
    const good           = items.filter(i => i.status === "good");
    const notInspected   = items.filter(i => i.status === "not_inspected");
    const rangedItems = [...needsAttention, ...monitor].filter(i => i.labor_hours_low != null || i.labor_hours_high != null || i.parts_cost_low != null || i.parts_cost_high != null);
    const totalLaborLow = rangedItems.reduce((sum, i) => sum + Number(i.labor_hours_low ?? 0), 0);
    const totalLaborHigh = rangedItems.reduce((sum, i) => sum + Number(i.labor_hours_high ?? i.labor_hours_low ?? 0), 0);
    const totalPartsLow = rangedItems.reduce((sum, i) => sum + Number(i.parts_cost_low ?? 0), 0);
    const totalPartsHigh = rangedItems.reduce((sum, i) => sum + Number(i.parts_cost_high ?? i.parts_cost_low ?? 0), 0);
    const usd = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    let photos: {item_id:string;photo_url:string}[] = [];
    if (items.length) { const ids=items.map(i=>i.id).join(","); const res=await fetch(`${supabaseUrl}/rest/v1/inspection_photos?item_id=in.(${ids})&select=item_id,photo_url`,{headers:hdrs}); photos=await res.json(); }
    const checkinPhotoRes = await fetch(`${supabaseUrl}/rest/v1/checkin_photos?inspection_id=eq.${inspectionId}&select=photo_url&order=created_at`, { headers: hdrs });
    const checkinPhotos: { photo_url: string }[] = checkinPhotoRes.ok ? await checkinPhotoRes.json() : [];

    const cond = CONDITION_CONFIG[insp.overall_condition] ?? CONDITION_CONFIG["good"];
    const inspectedCount = good.length + monitor.length + needsAttention.length;
    const conditionIndex = inspectedCount ? Math.round(((good.length + monitor.length * 0.5) / inspectedCount) * 100) : 0;

    function sectionName(sectionId: string) {
      return sections.find(s => s.id === sectionId)?.section_name ?? "";
    }

    function priorityBadge(priority: string | null) {
      if (!priority || !PRIORITY_LABELS[priority]) return "";
      const p = PRIORITY_LABELS[priority];
      return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;color:${p.color};background:${p.bg};margin-left:8px">${p.label}</span>`;
    }
    function detail(item: typeof items[number]) { const labor=item.labor_hours_low==null?"":`${item.labor_hours_low}–${item.labor_hours_high??item.labor_hours_low} labor hours`; const parts=item.parts_cost_low==null?"":`$${Number(item.parts_cost_low).toLocaleString()}–$${Number(item.parts_cost_high??item.parts_cost_low).toLocaleString()} parts allowance`; const pics=photos.filter(p=>p.item_id===item.id).slice(0,4); return `${item.impact?`<div style="margin-top:10px"><b style="font-size:10px;text-transform:uppercase;color:#78716c">Why it matters</b><p style="margin:3px 0;font-size:13px;color:#4b5563">${esc(item.impact)}</p></div>`:""}${item.recommended_action?`<div style="margin-top:10px"><b style="font-size:10px;text-transform:uppercase;color:#78716c">Recommended action</b><p style="margin:3px 0;font-size:13px;color:#4b5563">${esc(item.recommended_action)}</p></div>`:""}${labor||parts?`<div style="margin-top:10px;padding:10px;background:#f5f3ed;border-radius:8px;font-size:12px"><b>Planning allowance:</b> ${[labor,parts].filter(Boolean).join(" · ")}</div>`:""}${pics.length?`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">${pics.map(p=>`<img src="${esc(p.photo_url)}" style="width:100%;height:150px;object-fit:cover;border-radius:8px"/>`).join("")}</div>`:""}`; }

    const needsAttentionHtml = needsAttention.length === 0 ? "" : `
      <div style="margin-bottom:28px">
        <h3 style="margin:0 0 14px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#374151;display:flex;align-items:center;gap:8px">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444"></span>
          Items Requiring Attention
        </h3>
        ${needsAttention.map(item => `
          <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;margin-bottom:10px;background:#fff">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px">
              <div>
                <p style="margin:0;font-weight:600;color:#111827;font-size:14px">${esc(item.item_name)}</p>
                <p style="margin:3px 0 0;font-size:12px;color:#9ca3af">${esc(sectionName(item.section_id))}</p>
              </div>
              ${priorityBadge(item.priority)}
            </div>
            ${item.notes ? `<p style="margin:10px 0 0;font-size:13px;color:#4b5563;background:#f9fafb;border-radius:8px;padding:10px 12px;border:1px solid #f3f4f6">${esc(item.notes)}</p>` : ""}${detail(item)}
          </div>
        `).join("")}
      </div>`;

    const monitorHtml = monitor.length === 0 ? "" : `
      <div style="margin-bottom:28px">
        <h3 style="margin:0 0 14px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#374151;display:flex;align-items:center;gap:8px">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b"></span>
          Items to Monitor
        </h3>
        ${monitor.map(item => `
          <div style="border:1px solid #fde68a;border-radius:12px;padding:12px 16px;margin-bottom:8px;background:#fffbeb">
            <p style="margin:0;font-weight:600;color:#111827;font-size:14px">${esc(item.item_name)}</p>
            <p style="margin:3px 0 0;font-size:12px;color:#9ca3af">${esc(sectionName(item.section_id))}</p>
            ${item.notes ? `<p style="margin:8px 0 0;font-size:13px;color:#4b5563">${esc(item.notes)}</p>` : ""}
          </div>
        `).join("")}
      </div>`;

    const goodHtml = good.length === 0 ? "" : `
      <div style="margin-bottom:28px">
        <h3 style="margin:0 0 14px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#374151;display:flex;align-items:center;gap:8px">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e"></span>
          Passed Inspection (${good.length})
        </h3>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${good.map(item => `<span style="display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:500;color:#14532d;background:#dcfce7;border:1px solid #86efac">${esc(item.item_name)}</span>`).join("")}
        </div>
      </div>`;
    const notInspectedHtml = notInspected.length===0?"":`<div style="margin-bottom:28px"><h3 style="font-size:13px;text-transform:uppercase;color:#374151">● Not Inspected (${notInspected.length})</h3>${notInspected.map(i=>`<div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin-bottom:8px;background:#f9fafb"><b>${esc(i.item_name)}</b><p style="font-size:12px;color:#6b7280">${esc(i.not_inspected_reason||"Reason not provided")}</p></div>`).join("")}</div>`;
    const healthMapHtml = `<div style="margin:0 0 28px"><p style="margin:0 0 5px;color:#9b7a38;font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase">02 · Vehicle Health Map</p><h2 style="margin:0 0 14px;color:#252b24;font-size:22px">Every system, one clear view.</h2><table width="100%" cellspacing="0" cellpadding="0">${sections.map(section=>{const sectionItems=items.filter(item=>item.section_id===section.id);const attention=sectionItems.filter(item=>item.status==="needs_attention").length;const watching=sectionItems.filter(item=>item.status==="monitor").length;const passed=sectionItems.filter(item=>item.status==="good").length;const color=attention?"#ef4444":watching?"#f59e0b":passed?"#22c55e":"#a8a29e";const bg=attention?"#fef2f2":watching?"#fffbeb":passed?"#f0fdf4":"#f5f5f4";return `<tr><td style="padding:4px 0"><div style="border:1px solid #e7e5e4;border-radius:9px;background:${bg};padding:10px 12px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px"></span><b style="font-size:12px;color:#292524">${esc(section.section_name)}</b><span style="float:right;font-size:10px;color:#78716c">${passed} good${watching?` · ${watching} monitor`:""}${attention?` · ${attention} attention`:""}</span></div></td></tr>`}).join("")}</table></div>`;

    const managerNotesHtml = insp.manager_notes ? `
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px;margin-bottom:28px">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#92400e">Notes from Our Team</p>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;white-space:pre-line">${esc(insp.manager_notes)}</p>
      </div>` : "";

    const guidanceHtml = insp.investment_guidance && GUIDANCE_FULL[insp.investment_guidance] ? `
      <p style="margin:0 0 20px;font-size:13px;color:#6b7280">${GUIDANCE_FULL[insp.investment_guidance]}</p>` : "";

    const vehicleSubtitle = [
      insp.vehicle_color,
      insp.vehicle_mileage ? `${Number(insp.vehicle_mileage).toLocaleString()} miles` : null,
    ].filter(Boolean).join(" · ");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Inspection Report — ${insp.vehicle_year} ${insp.vehicle_make} ${insp.vehicle_model}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:620px;margin:32px auto;background:#f3f4f6;padding:0 16px 32px">

    <!-- Header -->
    <div style="background:#20251f;border-radius:16px 16px 0 0;overflow:hidden;text-align:center;border-bottom:none">
      ${checkinPhotos[0]?.photo_url ? `<img src="${esc(checkinPhotos[0].photo_url)}" alt="${esc(`${insp.vehicle_year} ${insp.vehicle_make} ${insp.vehicle_model}`)}" style="display:block;width:100%;height:280px;object-fit:cover;opacity:.82" />` : ""}
      <div style="padding:28px 32px 32px;background:linear-gradient(135deg,#20251f,#3d463a)">
        <img src="https://phefpvsqgjkeivzrrlmz.supabase.co/storage/v1/object/public/brand/logo.png" alt="SoCal Autoworks" style="height:48px;object-fit:contain;margin:0 auto 20px;display:block" />
        <p style="margin:0 0 7px;color:#d3b56d;font-size:10px;font-weight:800;letter-spacing:.2em;text-transform:uppercase">The complete story of your vehicle</p>
        <p style="margin:0 0 4px;color:rgba(255,255,255,.55);font-size:10px;letter-spacing:.16em;text-transform:uppercase">Comprehensive Inspection</p>
        <h1 style="margin:0;color:#fff;font-size:30px;line-height:1.1;font-weight:800">${insp.vehicle_year} ${insp.vehicle_make} ${insp.vehicle_model}</h1>
        ${vehicleSubtitle ? `<p style="margin:10px 0 0;color:rgba(255,255,255,.7);font-size:14px">${vehicleSubtitle}</p>` : ""}
        ${insp.vehicle_vin ? `<p style="margin:5px 0 0;color:rgba(255,255,255,.4);font-size:11px">VIN: ${esc(insp.vehicle_vin)}</p>` : ""}
      </div>
    </div>

    <!-- Body -->
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:32px;box-shadow:0 4px 16px rgba(0,0,0,.08)">

      <!-- Greeting -->
      <p style="margin:0 0 24px;font-size:15px;color:#111827">Dear ${insp.customer_first_name},</p>
      <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6">
        This report turns several hours of hands-on inspection into a clear visual record of what we observed, why it matters and the next steps we recommend.
      </p>
      <table width="100%" cellspacing="6" style="margin-bottom:22px;text-align:center"><tr>${[["Good",good.length,"#dcfce7"],["Monitor",monitor.length,"#fef3c7"],["Attention",needsAttention.length,"#fee2e2"],["Not inspected",notInspected.length,"#f3f4f6"]].map(([l,n,b])=>`<td style="width:25%;background:${b};border-radius:9px;padding:10px 4px"><strong style="display:block;font-size:20px">${n}</strong><span style="font-size:9px;text-transform:uppercase">${l}</span></td>`).join("")}</tr></table>
      ${insp.executive_summary?`<div style="border-left:4px solid #b7954f;background:#fafaf9;padding:16px 18px;margin-bottom:18px"><b style="font-size:10px;text-transform:uppercase;color:#78716c">Executive Summary</b><p style="font-size:14px;line-height:1.65;color:#374151">${esc(insp.executive_summary)}</p></div>`:""}${insp.primary_recommendation?`<div style="background:#2f372d;color:#fff;border-radius:12px;padding:16px 18px;margin-bottom:22px"><b style="color:#d3b56d;font-size:10px;text-transform:uppercase">Recommended next step</b><p style="font-size:14px;line-height:1.6">${esc(insp.primary_recommendation)}</p></div>`:""}
      ${rangedItems.length ? `<div style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px;padding:16px 18px;margin-bottom:22px"><b style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#78716c">Preliminary Repair Planning</b><table width="100%" style="margin-top:10px"><tr><td><span style="font-size:11px;color:#78716c">Labor allowance</span><strong style="display:block;font-size:15px;color:#292524">${totalLaborLow}–${totalLaborHigh} hours</strong></td><td><span style="font-size:11px;color:#78716c">Parts allowance</span><strong style="display:block;font-size:15px;color:#292524">${usd(totalPartsLow)}–${usd(totalPartsHigh)}</strong></td></tr></table><p style="margin:10px 0 0;font-size:10px;color:#78716c">Planning figures only—not a repair authorization or fixed estimate.</p></div>` : ""}

      <!-- Overall Condition -->
      <div style="background:${cond.bg};border:1px solid ${cond.border};border-radius:12px;padding:16px 20px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:${cond.color};opacity:.7">Overall Condition</p>
          <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:${cond.color}">${cond.label}</p>
        </div>
        <div style="text-align:right">
          <p style="margin:0;font-size:11px;color:${cond.color};opacity:.7">Date</p>
          <p style="margin:4px 0 0;font-size:13px;font-weight:600;color:${cond.color}">${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
        </div>
      </div>
      ${guidanceHtml}
      <div style="background:#252b24;color:#fff;border-radius:12px;padding:18px 20px;margin:0 0 26px;text-align:center"><span style="display:block;color:#d3b56d;font-size:9px;font-weight:800;letter-spacing:.18em;text-transform:uppercase">Condition Index</span><strong style="display:block;margin-top:4px;font-size:38px;line-height:1">${conditionIndex}</strong><span style="display:block;margin-top:6px;font-size:11px;color:rgba(255,255,255,.6)">${inspectedCount} items across ${sections.length} systems</span></div>

      ${healthMapHtml}

      <!-- Findings -->
      ${needsAttentionHtml}
      ${monitorHtml}
      ${goodHtml}
      ${notInspectedHtml}

      <!-- Manager Notes -->
      ${managerNotesHtml}

      <!-- CTA -->
      <div style="background:#f8fafc;border-radius:12px;padding:20px;text-align:center">
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6">
          Questions about your report? We're happy to walk you through any findings and help you
          prioritize repairs based on your budget and timeline.
        </p>
      </div>

      <!-- Footer -->
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #f3f4f6;text-align:center">
        <p style="margin:0;font-size:13px;color:#9ca3af">${insp.customer_first_name} ${insp.customer_last_name} · ${insp.customer_email}</p>
      </div>
    </div>

  </div>
</body>
</html>`;

    if (!resendKey) {
      console.log("RESEND_API_KEY not configured — would send to:", insp.customer_email);
      return new Response(JSON.stringify({ success: true, emailSent: false, reason: "RESEND_API_KEY not configured" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `SoCal Autoworks <${fromEmail}>`,
        to: insp.customer_email,
        subject: `Your Inspection Report — ${insp.vehicle_year} ${insp.vehicle_make} ${insp.vehicle_model}`,
        html,
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.json().catch(() => ({}));
      console.error("Email error:", err);
      return new Response(JSON.stringify({ success: false, emailSent: false, usingTestSender, reason: err }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, emailSent: true, usingTestSender }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "Server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
