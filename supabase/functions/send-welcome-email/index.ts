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
    const appUrl = Deno.env.get("APP_URL") || "https://socalautoworks.com";
    const fromEmail = Deno.env.get("FROM_EMAIL") || "onboarding@resend.dev";

    if (!supabaseUrl || !serviceKey) return new Response(JSON.stringify({ error: "Config error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const dbHeaders = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" };

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

    const { userId } = await req.json();
    if (!userId) return new Response(JSON.stringify({ error: "userId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const [profileRes, templateRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}&select=*`, { headers: dbHeaders }),
      fetch(`${supabaseUrl}/rest/v1/email_templates?type=eq.welcome_new_user&select=*`, { headers: dbHeaders }),
    ]);

    const [profile] = await profileRes.json();
    if (!profile) return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const [template] = await templateRes.json();
    if (!template) return new Response(JSON.stringify({ error: "Email template not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const firstName = profile.first_name || profile.full_name?.split(" ")[0] || "there";
    const lastName = profile.last_name || profile.full_name?.split(" ").slice(1).join(" ") || "";

    const replace = (str: string) => str
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{last_name\}\}/g, lastName)
      .replace(/\{\{email\}\}/g, profile.email)
      .replace(/\{\{app_url\}\}/g, appUrl);

    const subject = replace(template.subject);
    const html = replace(template.body);

    if (!resendKey) {
      console.log("RESEND_API_KEY not set — would send to:", profile.email);
      return new Response(JSON.stringify({ success: true, emailSent: false, reason: "No API key" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `SoCal Autoworks <${fromEmail}>`, to: profile.email, subject, html }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.json().catch(() => ({}));
      console.error("Email error:", err);
      return new Response(JSON.stringify({ success: true, emailSent: false, reason: err }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, emailSent: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "Server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
