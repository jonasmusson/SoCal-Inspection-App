import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("FROM_EMAIL") || "onboarding@resend.dev";
    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioFrom = Deno.env.get("TWILIO_FROM_NUMBER");

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Config error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dbHeaders = {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    };

    const callerAuthorization = req.headers.get("Authorization");
    if (!callerAuthorization) return new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const callerRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: callerAuthorization, apikey: serviceKey } });
    if (!callerRes.ok) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const caller = await callerRes.json();
    const callerProfileRes = await fetch(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${encodeURIComponent(caller.id)}&select=role,status`, { headers: dbHeaders });
    const [callerProfile] = await callerProfileRes.json();
    if (!callerProfile || callerProfile.status !== "active" || !["owner", "manager"].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: "Manager or owner access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { inspectionId, techId } = await req.json();
    if (!inspectionId || !techId) {
      return new Response(JSON.stringify({ error: "inspectionId and techId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [inspRes, techRes, settingsRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/inspections?id=eq.${inspectionId}&select=*`, { headers: dbHeaders }),
      fetch(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${techId}&select=*`, { headers: dbHeaders }),
      fetch(`${supabaseUrl}/rest/v1/shop_settings?select=*`, { headers: dbHeaders }),
    ]);

    const [inspection] = await inspRes.json();
    const [tech] = await techRes.json();
    const settings: { key: string; value: string }[] = await settingsRes.json();

    if (!inspection || !tech) {
      return new Response(JSON.stringify({ error: "Inspection or tech not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const settingsMap: Record<string, string> = {};
    settings.forEach(s => { settingsMap[s.key] = s.value; });
    const appUrl = settingsMap["app_url"] || "https://your-app.com";
    const shopName = settingsMap["shop_name"] || "The Shop";
    const firstName = tech.first_name || tech.full_name?.split(" ")[0] || "there";
    const vehicleLabel = `${inspection.vehicle_year} ${inspection.vehicle_make} ${inspection.vehicle_model}`;
    const customerName = `${inspection.customer_first_name} ${inspection.customer_last_name}`;

    const results: Record<string, unknown> = { emailSent: false, smsSent: false };

    // ── Email ──────────────────────────────────────────────────────────────────
    if (resendKey) {
      const subject = `New Inspection Assigned — ${vehicleLabel}`;
      const html = `
        <div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:24px">
          <h2 style="color:#1e293b">Hi ${firstName}, you have a new inspection!</h2>
          <p style="color:#475569">A new inspection has been assigned to you at <strong>${shopName}</strong>.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;color:#64748b;font-size:14px">Vehicle</td><td style="padding:8px;font-weight:600;color:#1e293b">${vehicleLabel}</td></tr>
            <tr style="background:#f8fafc"><td style="padding:8px;color:#64748b;font-size:14px">Mileage</td><td style="padding:8px;color:#1e293b">${inspection.vehicle_mileage?.toLocaleString()} mi</td></tr>
            <tr><td style="padding:8px;color:#64748b;font-size:14px">Customer</td><td style="padding:8px;color:#1e293b">${customerName}</td></tr>
          </table>
          <a href="${appUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin-top:8px">Open App</a>
          <p style="color:#94a3b8;font-size:12px;margin-top:24px">${shopName}</p>
        </div>`;

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `${shopName} <${fromEmail}>`, to: tech.email, subject, html }),
      });
      results.emailSent = emailRes.ok;
      if (!emailRes.ok) results.emailError = await emailRes.json().catch(() => ({}));
    }

    // ── SMS ───────────────────────────────────────────────────────────────────
    if (twilioSid && twilioToken && twilioFrom && tech.phone) {
      const body = `Hi ${firstName}, you have a new inspection at ${shopName}: ${vehicleLabel} (${customerName}). Log in: ${appUrl}`;
      const smsRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${twilioSid}:${twilioToken}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ From: twilioFrom, To: tech.phone, Body: body }).toString(),
        }
      );
      results.smsSent = smsRes.ok;
      if (!smsRes.ok) results.smsError = await smsRes.json().catch(() => ({}));
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
