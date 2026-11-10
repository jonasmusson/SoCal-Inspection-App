/* eslint-disable @typescript-eslint/no-explicit-any */
const ORIGIN = Deno.env.get("SUPABASE_URL")!,
  SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  PUBLIC = Deno.env.get("SUPABASE_ANON_KEY")!;
const VERSION = "0.12.1",
  BUCKET = "hub-pilot-private",
  ARCHIVE = "hub-media-archive";
const MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
};
const CATEGORIES = [
  "Before",
  "Progress",
  "Completed",
  "Parts",
  "Reference",
  "Mechanical",
  "Fabrication",
  "Inspection",
  "Other",
];
const DEFAULT_WEEKLY_BILLABLE_TARGET = 30;
const DEFAULT_LABOR_RATE = 175;
const DEFAULT_TIMEZONE = "America/Los_Angeles";
const TASK_STATUSES = ["todo", "in_progress", "waiting", "blocked", "done"];
const TASK_PRIORITIES = ["urgent", "high", "normal", "low"];
const TASK_SKILLS = ["L1", "L2", "L2S", "L3", "F", "QA"];
const WORK_SYSTEMS = [
  "Engine",
  "Transmission",
  "Suspension",
  "Brakes",
  "Electrical",
  "Body / Paint",
  "Interior",
  "Wheels / Tires",
  "General",
  "Other",
];
class Fault extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const id = (x: unknown) => {
  if (
    typeof x !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)
  )
    throw new Fault(400, "Invalid record identifier");
  return x;
};
const text = (x: unknown, n = 160) =>
    String(x ?? "")
      .trim()
      .slice(0, n),
  path = (x: string) => x.split("/").map(encodeURIComponent).join("/");
const shopDate = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => parts.find((x) => x.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const sha = async (b: ArrayBuffer) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b)))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const serviceHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
async function fetchSafe(url: string, init: RequestInit = {}) {
  return await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(45000),
    redirect: "error",
  });
}
async function db(table: string, q = "", method = "GET", body?: unknown) {
  const r = await fetchSafe(`${ORIGIN}/rest/v1/${table}${q ? "?" + q : ""}`, {
    method,
    headers: {
      ...serviceHeaders,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 409)
      throw new Fault(
        409,
        "Record changed or already exists. Refresh and retry.",
      );
    console.error("Database operation failed", table, r.status, d?.code);
    throw new Fault(400, text(d?.message || "Database operation failed", 200));
  }
  return d;
}
const one = async (t: string, q: string) =>
    ((await db(t, q + "&limit=1")) || [])[0] || null,
  rpc = (n: string, a: unknown) => db("rpc/" + n, "", "POST", a);
async function userFor(req: Request) {
  const a = req.headers.get("Authorization");
  if (!a?.startsWith("Bearer ")) throw new Fault(401, "Sign in to continue.");
  const r = await fetchSafe(ORIGIN + "/auth/v1/user", {
    headers: { apikey: PUBLIC, Authorization: a },
  });
  if (!r.ok)
    throw new Fault(401, "Your session expired. Please sign in again.");
  const u = await r.json();
  if (!u.id || !u.email_confirmed_at)
    throw new Fault(403, "Verify your email before requesting access.");
  return u;
}
async function memberFor(u: any, org?: string) {
  const m = await one(
    "hub_pilot_members",
    `user_id=eq.${id(u.id)}&active=eq.true${org ? "&org_id=eq." + id(org) : ""}&order=created_at.asc`,
  );
  if (!m) throw new Fault(403, "Your account is awaiting Hub access approval.");
  return m;
}
function management(m: any, owner = false) {
  if (owner ? m.role !== "owner" : !["owner", "manager"].includes(m.role))
    throw new Fault(403, "This action requires management permission.");
}
async function vehicleFor(m: any, vid: string) {
  const v = await one(
    "hub_pilot_vehicles",
    `id=eq.${id(vid)}&org_id=eq.${m.org_id}`,
  );
  if (!v) throw new Fault(404, "Vehicle not available.");
  if (
    m.role === "tech" &&
    !(await one(
      "hub_vehicle_assignments",
      `org_id=eq.${m.org_id}&vehicle_id=eq.${v.id}&user_id=eq.${m.user_id}`,
    ))
  )
    throw new Fault(403, "This vehicle is not assigned to you.");
  return v;
}
async function projectFor(m: any, pid: string) {
  const p = await one(
    "hub_pilot_projects",
    `id=eq.${id(pid)}&org_id=eq.${m.org_id}`,
  );
  if (!p) throw new Fault(404, "Project not available.");
  await vehicleFor(m, p.vehicle_id);
  return p;
}
async function taskFor(m: any, tid: string) {
  const task = await one(
    "hub_project_tasks",
    `id=eq.${id(tid)}&org_id=eq.${m.org_id}`,
  );
  if (!task) throw new Fault(404, "Project task unavailable.");
  const project = await projectFor(m, task.project_id);
  if (project.vehicle_id !== task.vehicle_id)
    throw new Fault(409, "Project task vehicle scope is invalid.");
  return task;
}
async function activeMemberFor(m: any, userId: string) {
  const member = await one(
    "hub_pilot_members",
    `org_id=eq.${m.org_id}&user_id=eq.${id(userId)}&active=eq.true`,
  );
  if (!member) throw new Fault(400, "Choose an active team member.");
  return member;
}
async function assignmentFor(m: any, vehicleId: string, userId: string) {
  return await one(
    "hub_vehicle_assignments",
    `org_id=eq.${m.org_id}&vehicle_id=eq.${id(vehicleId)}&user_id=eq.${id(userId)}`,
  );
}
async function hubSettingsFor(m: any) {
  const row = await one("hub_org_settings", `org_id=eq.${m.org_id}`);
  if (!row)
    return {
      org_id: m.org_id,
      weekly_billable_target: DEFAULT_WEEKLY_BILLABLE_TARGET,
      labor_rate: DEFAULT_LABOR_RATE,
      timezone: DEFAULT_TIMEZONE,
      persisted: false,
    };
  return { ...row, persisted: true };
}
function validWeekStart(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getUTCDay() === 1;
}
function nextWeekStart(value: string) {
  const date = new Date(value + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}
const round2 = (value: number) => Math.round(value * 100) / 100;
const pct = (value: number, base: number) =>
  base > 0 ? Math.round((value / base) * 1000) / 10 : 0;
async function inspectionFor(m: any, pid: string) {
  const p = await projectFor(m, pid),
    l = await one(
      "hub_inspection_links",
      `project_id=eq.${p.id}&org_id=eq.${m.org_id}`,
    );
  if (!l) throw new Fault(404, "Start an inspection for this project first.");
  return l;
}
async function itemFor(m: any, iid: string) {
  const item = await one("inspection_items", `id=eq.${id(iid)}`);
  if (!item) throw new Fault(404, "Finding not available.");
  const sec = await one("inspection_sections", `id=eq.${item.section_id}`),
    l = await one(
      "hub_inspection_links",
      `inspection_id=eq.${sec.inspection_id}&org_id=eq.${m.org_id}`,
    );
  if (!l)
    throw new Fault(
      403,
      "Finding is not part of an authorized Hub inspection.",
    );
  await vehicleFor(m, l.vehicle_id);
  return { item, sec, link: l };
}
async function bodyFor(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) return {};
  let len = 0;
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    len += value.length;
    if (len > 65536) {
      await reader.cancel();
      throw new Fault(413, "Request is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) {
    bytes.set(c, off);
    off += c.length;
  }
  let b;
  try {
    b = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Fault(400, "Invalid request");
  }
  if (!b || Array.isArray(b) || typeof b !== "object")
    throw new Fault(400, "Invalid request");
  return b;
}
async function download(bucket: string, key: string) {
  const r = await fetchSafe(
    `${ORIGIN}/storage/v1/object/authenticated/${bucket}/${path(key)}`,
    { headers: serviceHeaders },
  );
  if (!r.ok)
    throw new Fault(
      409,
      "Photo has not reached cloud storage. Keep the pending original and retry.",
    );
  return await r.arrayBuffer();
}
let archiveReady = false;
async function ensureArchive() {
  if (archiveReady) return;
  let r = await fetchSafe(`${ORIGIN}/storage/v1/bucket/${ARCHIVE}`, {
    headers: serviceHeaders,
  });
  if (!r.ok) {
    r = await fetchSafe(ORIGIN + "/storage/v1/bucket", {
      method: "POST",
      headers: { ...serviceHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: ARCHIVE,
        name: ARCHIVE,
        public: false,
        file_size_limit: 25165824,
        allowed_mime_types: Object.keys(MIME),
      }),
    });
    if (!r.ok && r.status !== 409 && r.status !== 400)
      throw new Fault(503, "Archive storage is not ready; original retained.");
  }
  const check = await fetchSafe(`${ORIGIN}/storage/v1/bucket/${ARCHIVE}`, {
      headers: serviceHeaders,
    }),
    b = await check.json();
  if (!check.ok || b.public !== false)
    throw new Fault(503, "Private archive check failed.");
  archiveReady = true;
}
function sniff(bytes: Uint8Array, mime: string) {
  const ascii = (a: number, b: number) =>
    new TextDecoder().decode(bytes.slice(a, b));
  if (mime === "image/jpeg")
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/png") return bytes[0] === 137 && ascii(1, 4) === "PNG";
  if (mime === "image/webp")
    return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  return (
    ["image/heic", "image/heif", "image/avif"].includes(mime) &&
    ascii(4, 8) === "ftyp"
  );
}
async function inspectionData(m: any, pid: string) {
  const l = await inspectionFor(m, pid);
  const inspection = await one(
      "inspections",
      `id=eq.${l.inspection_id}&select=id,status,progress_percent,created_at,updated_at,assigned_tech_id,template_id,report_approved,report_sent,executive_summary,primary_recommendation`,
    ),
    sections = await db(
      "inspection_sections",
      `inspection_id=eq.${l.inspection_id}&order=section_number.asc`,
    ),
    ids = sections.map((x: any) => x.id);
  const items = ids.length
      ? await db(
          "inspection_items",
          `section_id=in.(${ids.join(",")})&select=id,section_id,item_name,item_key,status,notes,photo_mode,notes_mode,video_mode,not_inspected_reason,priority,impact,recommended_action,updated_at&order=created_at.asc`,
        )
      : [],
    itemIds = items.map((x: any) => x.id),
    evidence = itemIds.length
      ? await db(
          "hub_media_evidence",
          `org_id=eq.${m.org_id}&item_id=in.(${itemIds.join(",")})`,
        )
      : [];
  return { link: l, inspection, sections, items, evidence };
}
async function endpoint(
  req: Request,
  u: any,
  m: any,
  b: any,
  action: string,
  url: URL,
) {
  if (action === "snapshot") {
    const assignments =
        m.role === "tech"
          ? await db(
              "hub_vehicle_assignments",
              `org_id=eq.${m.org_id}&user_id=eq.${m.user_id}`,
            )
          : [],
      ids = assignments.map((x: any) => x.vehicle_id),
      filter =
        m.role === "tech"
          ? `&id=in.(${ids.length ? ids.join(",") : "00000000-0000-0000-0000-000000000000"})`
          : "";
    const vehicles = await db(
        "hub_pilot_vehicles",
        `org_id=eq.${m.org_id}${filter}&order=created_at.desc&limit=250`,
      ),
      vs = vehicles.map((x: any) => x.id),
      scope = `org_id=eq.${m.org_id}&vehicle_id=in.(${vs.length ? vs.join(",") : "00000000-0000-0000-0000-000000000000"})`;
    const [
      projects,
      media,
      activity,
      links,
      templates,
      contacts,
      org,
      profile,
      work_entries,
      project_tasks,
      timecards,
    ] = await Promise.all([
      db("hub_pilot_projects", scope + "&order=created_at.asc&limit=500"),
      db("hub_pilot_media", scope + "&order=created_at.desc&limit=500"),
      db("hub_activity", scope + "&order=created_at.desc&limit=200"),
      db("hub_inspection_links", scope),
      db(
        "inspection_templates",
        "is_active=eq.true&select=id,name,description&order=sort_order.asc",
      ),
      m.role === "tech"
        ? []
        : db(
            "hub_pilot_contacts",
            `org_id=eq.${m.org_id}&order=name.asc&limit=250`,
          ),
      one("hub_pilot_orgs", `id=eq.${m.org_id}`),
      one("user_profiles", `id=eq.${u.id}&select=id,full_name,email`),
      db(
        "hub_work_entries",
        scope + "&order=work_date.desc,created_at.desc&limit=1000",
      ),
      db(
        "hub_project_tasks",
        scope + "&order=project_id.asc,sort_order.asc,created_at.asc&limit=2000",
      ),
      db(
        "hub_timecard_shifts",
        `org_id=eq.${m.org_id}${m.role === "tech" ? "&user_id=eq." + m.user_id : ""}&order=work_date.desc,clock_in.desc&limit=2000`,
      ),
    ]);
    const techIds = [
        ...new Set(work_entries.map((x: any) => x.technician_user_id)),
      ],
      work_profiles = techIds.length
        ? await db(
            "user_profiles",
            `id=in.(${techIds.join(",")})&select=id,full_name,email`,
          )
        : [];
    return {
      version: VERSION,
      member: m,
      org,
      profile,
      vehicles,
      projects,
      media,
      activity,
      links,
      templates,
      contacts,
      work_entries,
      project_tasks,
      timecards,
      work_profiles,
      work_systems: WORK_SYSTEMS,
      task_statuses: TASK_STATUSES,
      task_priorities: TASK_PRIORITIES,
      task_skills: TASK_SKILLS,
    };
  }
  if (action === "project/create") {
    management(m);
    return await rpc("hub_create_job", {
      p_actor: u.id,
      p_org: m.org_id,
      p_request: id(b.request_id),
      p_data: b.data,
    });
  }
  if (action === "project/update") {
    management(m);
    const p = await projectFor(m, id(b.id)),
      values: any = { updated_at: new Date().toISOString() };
    if ("title" in b) {
      values.title = text(b.title);
      if (values.title.length < 2)
        throw new Fault(400, "Project name required.");
    }
    if ("notes" in b) values.notes = text(b.notes, 4000);
    if ("status" in b) {
      if (!["active", "on_hold", "complete"].includes(b.status))
        throw new Fault(400, "Invalid project status");
      values.status = b.status;
    }
    if ("shopmonkey_order_ref" in b)
      values.shopmonkey_order_ref = text(b.shopmonkey_order_ref, 100) || null;
    return await db(
      "hub_pilot_projects",
      `id=eq.${p.id}&org_id=eq.${m.org_id}`,
      "PATCH",
      values,
    );
  }

  if (action === "task/create") {
    management(m);
    const p = await projectFor(m, id(b.project_id)),
      title = text(b.title, 300),
      status = text(b.status || "todo", 30),
      priority = text(b.priority || "normal", 30),
      skill = text(b.skill_code || "L1", 10),
      estimated = Number(b.estimated_hours ?? 0);
    if (title.length < 2) throw new Fault(400, "Task name required.");
    if (!TASK_STATUSES.includes(status))
      throw new Fault(400, "Choose a valid task status.");
    if (!TASK_PRIORITIES.includes(priority))
      throw new Fault(400, "Choose a valid task priority.");
    if (!TASK_SKILLS.includes(skill))
      throw new Fault(400, "Choose a valid technician level.");
    if (!Number.isFinite(estimated) || estimated < 0 || estimated > 250)
      throw new Fault(400, "Estimated hours must be between 0 and 250.");
    let assigned: string | null = null,
      supervisor: string | null = null;
    if (b.assigned_user_id) {
      assigned = id(b.assigned_user_id);
      await activeMemberFor(m, assigned);
      if (!(await assignmentFor(m, p.vehicle_id, assigned)))
        throw new Fault(400, "Assigned technician must have access to this vehicle.");
    }
    if (b.supervisor_user_id) {
      supervisor = id(b.supervisor_user_id);
      const supervisorMember = await activeMemberFor(m, supervisor);
      if (!["owner", "manager"].includes(supervisorMember.role))
        throw new Fault(400, "Supervisor must be an active owner or manager.");
    }
    const sortOrder = Number.isInteger(b.sort_order) && b.sort_order >= 0
      ? Math.min(b.sort_order, 100000)
      : 0;
    return await db("hub_project_tasks", "", "POST", {
      org_id: m.org_id,
      vehicle_id: p.vehicle_id,
      project_id: p.id,
      title,
      status,
      priority,
      skill_code: skill,
      estimated_hours: Math.round(estimated * 100) / 100,
      assigned_user_id: assigned,
      supervisor_user_id: supervisor,
      status_note: text(b.status_note, 2000),
      notes: text(b.notes, 4000),
      sort_order: sortOrder,
      created_by: u.id,
      updated_by: u.id,
    });
  }
  if (action === "task/update") {
    const task = await taskFor(m, id(b.id)),
      isManager = ["owner", "manager"].includes(m.role);
    if (!isManager && task.assigned_user_id !== u.id)
      throw new Fault(403, "This task is assigned to another technician.");
    const values: any = {
      updated_by: u.id,
      updated_at: new Date().toISOString(),
    };
    if ("status" in b) {
      const status = text(b.status, 30);
      if (!TASK_STATUSES.includes(status))
        throw new Fault(400, "Choose a valid task status.");
      values.status = status;
    }
    if ("status_note" in b) values.status_note = text(b.status_note, 2000);
    if (isManager) {
      if ("title" in b) {
        const title = text(b.title, 300);
        if (title.length < 2) throw new Fault(400, "Task name required.");
        values.title = title;
      }
      if ("priority" in b) {
        const priority = text(b.priority, 30);
        if (!TASK_PRIORITIES.includes(priority))
          throw new Fault(400, "Choose a valid task priority.");
        values.priority = priority;
      }
      if ("skill_code" in b) {
        const skill = text(b.skill_code, 10);
        if (!TASK_SKILLS.includes(skill))
          throw new Fault(400, "Choose a valid technician level.");
        values.skill_code = skill;
      }
      if ("estimated_hours" in b) {
        const estimated = Number(b.estimated_hours);
        if (!Number.isFinite(estimated) || estimated < 0 || estimated > 250)
          throw new Fault(400, "Estimated hours must be between 0 and 250.");
        values.estimated_hours = Math.round(estimated * 100) / 100;
      }
      if ("assigned_user_id" in b) {
        if (!b.assigned_user_id) values.assigned_user_id = null;
        else {
          const assigned = id(b.assigned_user_id);
          await activeMemberFor(m, assigned);
          if (!(await assignmentFor(m, task.vehicle_id, assigned)))
            throw new Fault(400, "Assigned technician must have access to this vehicle.");
          values.assigned_user_id = assigned;
        }
      }
      if ("supervisor_user_id" in b) {
        if (!b.supervisor_user_id) values.supervisor_user_id = null;
        else {
          const supervisor = id(b.supervisor_user_id);
          const supervisorMember = await activeMemberFor(m, supervisor);
          if (!["owner", "manager"].includes(supervisorMember.role))
            throw new Fault(400, "Supervisor must be an active owner or manager.");
          values.supervisor_user_id = supervisor;
        }
      }
      if ("notes" in b) values.notes = text(b.notes, 4000);
      if ("sort_order" in b) {
        const sortOrder = Number(b.sort_order);
        if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000)
          throw new Fault(400, "Task order is invalid.");
        values.sort_order = sortOrder;
      }
    }
    const q = `id=eq.${task.id}&org_id=eq.${m.org_id}${b.expected_updated_at ? "&updated_at=eq." + encodeURIComponent(b.expected_updated_at) : ""}`,
      rows = await db("hub_project_tasks", q, "PATCH", values);
    if (!rows.length)
      throw new Fault(
        409,
        "This task changed on another device. Refresh before saving.",
      );
    return rows[0];
  }
  if (action === "vehicle/update") {
    management(m);
    const v = await vehicleFor(m, id(b.id)),
      values: any = {
        display_name: text(b.display_name) || v.display_name,
        vin: text(b.vin, 64) || null,
        notes: text(b.notes, 4000),
      };
    if (b.year !== undefined) {
      const y = Number(b.year);
      if (!Number.isInteger(y) || y < 1880 || y > 2100)
        throw new Fault(400, "Invalid year");
      values.year = y;
    }
    if ("make" in b) values.make = text(b.make, 80);
    if ("model" in b) values.model = text(b.model, 100);
    return await db(
      "hub_pilot_vehicles",
      `id=eq.${v.id}&org_id=eq.${m.org_id}`,
      "PATCH",
      values,
    );
  }
  if (action === "uploads/reserve") {
    const vehicle = await vehicleFor(m, id(b.vehicle_id)),
      project = b.project_id ? await projectFor(m, id(b.project_id)) : null;
    if (project && project.vehicle_id !== vehicle.id)
      throw new Fault(400, "Project and vehicle do not match.");
    if (b.inspection_item_id) {
      const i = await itemFor(m, id(b.inspection_item_id));
      if (i.link.vehicle_id !== vehicle.id || i.link.project_id !== project?.id)
        throw new Fault(400, "Inspection and photo destination do not match.");
    }
    const mime = text(b.content_type, 80);
    if (
      !MIME[mime] ||
      !Number.isInteger(b.byte_count) ||
      b.byte_count < 1 ||
      b.byte_count > 25165824 ||
      !/^[0-9a-f]{64}$/.test(b.sha256)
    )
      throw new Fault(400, "Invalid image type, size or checksum.");
    const uploadId = id(b.id),
      key = `${m.org_id}/${vehicle.id}/${uploadId}.${MIME[mime]}`,
      old = await one("hub_upload_jobs", `id=eq.${uploadId}`);
    if (old) {
      if (
        old.user_id !== u.id ||
        old.org_id !== m.org_id ||
        old.vehicle_id !== vehicle.id ||
        old.project_id !== (project?.id || null) ||
        old.sha256 !== b.sha256 ||
        old.byte_count !== b.byte_count ||
        old.inspection_item_id !== (b.inspection_item_id || null)
      )
        throw new Fault(409, "Upload identity conflict.");
      return { id: uploadId, storage_key: old.storage_key, state: old.state };
    }
    let captured: string | null = null;
    if (b.captured_at) {
      const d = new Date(b.captured_at);
      if (!Number.isFinite(d.getTime()))
        throw new Fault(400, "Invalid capture date");
      captured = d.toISOString();
    }
    await db("hub_upload_jobs", "", "POST", {
      id: uploadId,
      org_id: m.org_id,
      vehicle_id: vehicle.id,
      project_id: project?.id || null,
      user_id: u.id,
      inspection_item_id: b.inspection_item_id || null,
      storage_key: key,
      original_name: text(b.original_name, 255) || "photo." + MIME[mime],
      content_type: mime,
      byte_count: b.byte_count,
      sha256: b.sha256,
      category: CATEGORIES.includes(b.category) ? b.category : "Progress",
      captured_at: captured,
    });
    return { id: uploadId, storage_key: key, state: "reserved" };
  }
  if (action === "uploads/finalize") {
    const j = await one(
      "hub_upload_jobs",
      `id=eq.${id(b.id)}&user_id=eq.${u.id}&org_id=eq.${m.org_id}`,
    );
    if (!j) throw new Fault(404, "Upload not found");
    await vehicleFor(m, j.vehicle_id);
    const original = await download(BUCKET, j.storage_key);
    if (
      original.byteLength !== j.byte_count ||
      (await sha(original)) !== j.sha256 ||
      !sniff(new Uint8Array(original), j.content_type)
    )
      throw new Fault(
        409,
        "Original image verification failed. Keep the pending file.",
      );
    await ensureArchive();
    const ar = await fetchSafe(
      `${ORIGIN}/storage/v1/object/${ARCHIVE}/${path(j.storage_key)}`,
      {
        method: "POST",
        headers: {
          ...serviceHeaders,
          "Content-Type": j.content_type,
          "x-upsert": "false",
        },
        body: original,
      },
    );
    if (!ar.ok && ar.status !== 400 && ar.status !== 409)
      throw new Fault(
        503,
        "Original saved; archive confirmation pending. Retry without recapturing.",
      );
    const archived = await download(ARCHIVE, j.storage_key);
    if (
      archived.byteLength !== j.byte_count ||
      (await sha(archived)) !== j.sha256
    )
      throw new Fault(
        503,
        "Archive verification pending. Keep the pending file.",
      );
    const media = await rpc("hub_commit_photo", {
      p_actor: u.id,
      p_upload: j.id,
    });
    return {
      media,
      verification: { sha256: j.sha256, original: true, archive: true },
    };
  }
  if (action === "media/url") {
    const media = await one(
      "hub_pilot_media",
      `id=eq.${id(url.searchParams.get("id"))}&org_id=eq.${m.org_id}`,
    );
    if (!media) throw new Fault(404, "Photo unavailable");
    await vehicleFor(m, media.vehicle_id);
    const r = await fetchSafe(
        `${ORIGIN}/storage/v1/object/sign/${BUCKET}/${path(media.storage_key)}`,
        {
          method: "POST",
          headers: { ...serviceHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ expiresIn: 300 }),
        },
      ),
      d = await r.json();
    if (!r.ok || !d.signedURL)
      throw new Fault(503, "Photo link unavailable. Retry.");
    return {
      url: ORIGIN + "/storage/v1" + d.signedURL,
      sha256: media.sha256,
      byte_count: media.byte_count,
      name: media.original_name,
    };
  }
  if (action === "media/update") {
    const a = await one(
      "hub_pilot_media",
      `id=eq.${id(b.id)}&org_id=eq.${m.org_id}`,
    );
    if (!a) throw new Fault(404, "Photo unavailable");
    await vehicleFor(m, a.vehicle_id);
    if (m.role === "tech" && a.uploaded_by !== u.id)
      throw new Fault(
        403,
        "Only management can edit another technician’s photo notes.",
      );
    const values: any = { caption: text(b.caption, 2000) };
    if (CATEGORIES.includes(b.category)) values.category = b.category;
    return await db(
      "hub_pilot_media",
      `id=eq.${a.id}&org_id=eq.${m.org_id}`,
      "PATCH",
      values,
    );
  }
  if (action === "work/create") {
    const p = await projectFor(m, id(b.project_id)),
      task = b.task_id ? await taskFor(m, id(b.task_id)) : null,
      workDate = text(b.work_date, 10),
      system = text(b.system, 40),
      performed = text(b.work_performed, 2000),
      hours = Number(b.actual_hours);
    if (task && task.project_id !== p.id)
      throw new Fault(400, "Task and project do not match.");
    if (
      m.role === "tech" &&
      task &&
      task.assigned_user_id &&
      task.assigned_user_id !== u.id
    )
      throw new Fault(403, "This task is assigned to another technician.");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(workDate) ||
      !Number.isFinite(new Date(workDate + "T12:00:00Z").getTime())
    )
      throw new Fault(400, "Choose a valid work date.");
    if (!WORK_SYSTEMS.includes(system))
      throw new Fault(400, "Choose a valid system.");
    if (performed.length < 2)
      throw new Fault(400, "Describe the work performed.");
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24)
      throw new Fault(400, "Enter actual hours between 0 and 24.");
    const time = (v: unknown) => {
        const x = text(v, 5);
        if (!x) return null;
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(x))
          throw new Fault(400, "Use a valid start and stop time.");
        return x;
      },
      start = time(b.start_time),
      stop = time(b.stop_time);
    if (Boolean(start) !== Boolean(stop))
      throw new Fault(400, "Enter both start and stop, or leave both blank.");
    let technician = u.id;
    if (m.role !== "tech" && b.technician_user_id)
      technician = id(b.technician_user_id);
    if (
      m.role === "tech" &&
      b.technician_user_id &&
      b.technician_user_id !== u.id
    )
      throw new Fault(403, "Technicians can only record their own hours.");
    const member = await one(
      "hub_pilot_members",
      `org_id=eq.${m.org_id}&user_id=eq.${technician}&active=eq.true`,
    );
    if (!member) throw new Fault(400, "Choose an active team member.");
    return await db("hub_work_entries", "", "POST", {
      org_id: m.org_id,
      vehicle_id: p.vehicle_id,
      project_id: p.id,
      task_id: task?.id || null,
      technician_user_id: technician,
      created_by: u.id,
      updated_by: u.id,
      work_date: workDate,
      start_time: start,
      stop_time: stop,
      actual_hours: Math.round(hours * 100) / 100,
      system,
      work_performed: performed,
      internal_notes: text(b.internal_notes, 4000),
      status: "pending_review",
    });
  }
  if (action === "work/update") {
    const entry = await one(
      "hub_work_entries",
      `id=eq.${id(b.id)}&org_id=eq.${m.org_id}`,
    );
    if (!entry) throw new Fault(404, "Work entry unavailable.");
    await projectFor(m, entry.project_id);
    const isManager = ["owner", "manager"].includes(m.role);
    if (
      !isManager &&
      (entry.technician_user_id !== u.id || entry.status !== "pending_review")
    )
      throw new Fault(403, "This work entry requires manager review.");
    const values: any = {
      updated_by: u.id,
      updated_at: new Date().toISOString(),
    };
    if (entry.status === "pending_review" || isManager) {
      if ("work_date" in b) {
        const d = text(b.work_date, 10);
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
          !Number.isFinite(new Date(d + "T12:00:00Z").getTime())
        )
          throw new Fault(400, "Choose a valid work date.");
        values.work_date = d;
      }
      if ("system" in b) {
        const system = text(b.system, 40);
        if (!WORK_SYSTEMS.includes(system))
          throw new Fault(400, "Choose a valid system.");
        values.system = system;
      }
      if ("work_performed" in b) {
        const performed = text(b.work_performed, 2000);
        if (performed.length < 2)
          throw new Fault(400, "Describe the work performed.");
        values.work_performed = performed;
      }
      if ("actual_hours" in b) {
        const hours = Number(b.actual_hours);
        if (!Number.isFinite(hours) || hours <= 0 || hours > 24)
          throw new Fault(400, "Enter actual hours between 0 and 24.");
        values.actual_hours = Math.round(hours * 100) / 100;
      }
      if ("internal_notes" in b)
        values.internal_notes = text(b.internal_notes, 4000);
    }
    if (isManager) {
      if ("billable_hours" in b) {
        const hours =
          b.billable_hours === "" || b.billable_hours === null
            ? null
            : Number(b.billable_hours);
        if (
          hours !== null &&
          (!Number.isFinite(hours) || hours < 0 || hours > 24)
        )
          throw new Fault(400, "Billable hours must be between 0 and 24.");
        values.billable_hours =
          hours === null ? null : Math.round(hours * 100) / 100;
      }
      if ("status" in b) {
        if (!["pending_review", "approved", "void"].includes(b.status))
          throw new Fault(400, "Invalid review status.");
        values.status = b.status;
      }
      if ("invoice_state" in b) {
        if (
          !["not_ready", "ready", "exported", "synced"].includes(
            b.invoice_state,
          )
        )
          throw new Fault(400, "Invalid invoice state.");
        values.invoice_state = b.invoice_state;
      }
      if ("review_note" in b) values.review_note = text(b.review_note, 2000);
    }
    const q = `id=eq.${entry.id}&org_id=eq.${m.org_id}${b.expected_updated_at ? "&updated_at=eq." + encodeURIComponent(b.expected_updated_at) : ""}`,
      rows = await db("hub_work_entries", q, "PATCH", values);
    if (!rows.length)
      throw new Fault(
        409,
        "This work entry changed on another device. Refresh before saving.",
      );
    return rows[0];
  }

  if (action === "timeclock/punch") {
    const operation = text(b.operation, 20);
    if (!["clock_in", "clock_out"].includes(operation))
      throw new Fault(400, "Choose Clock In or Clock Out.");
    let target = u.id;
    if (b.user_id && b.user_id !== u.id) {
      management(m);
      target = id(b.user_id);
    }
    await activeMemberFor(m, target);
    const open = await one(
      "hub_timecard_shifts",
      `org_id=eq.${m.org_id}&user_id=eq.${target}&clock_out=is.null&order=clock_in.desc`,
    );
    if (operation === "clock_in") {
      if (open) throw new Fault(409, "This team member is already clocked in.");
      const now = new Date();
      return await db("hub_timecard_shifts", "", "POST", {
        org_id: m.org_id,
        user_id: target,
        work_date: shopDate(now),
        clock_in: now.toISOString(),
        break_minutes: 0,
        notes: text(b.notes, 2000),
        manager_note: "",
        source: target === u.id ? "self" : "manager",
        created_by: u.id,
        updated_by: u.id,
      });
    }
    if (!open) throw new Fault(409, "This team member is not clocked in.");
    const now = new Date(),
      elapsedMinutes = Math.floor(
        (now.getTime() - new Date(open.clock_in).getTime()) / 60000,
      ),
      breakMinutes =
        b.break_minutes === undefined
          ? Number(open.break_minutes || 0)
          : Number(b.break_minutes);
    if (elapsedMinutes < 0 || elapsedMinutes > 18 * 60)
      throw new Fault(
        409,
        "This open shift needs manager correction before it can be clocked out.",
      );
    if (
      !Number.isInteger(breakMinutes) ||
      breakMinutes < 0 ||
      breakMinutes > Math.min(720, elapsedMinutes)
    )
      throw new Fault(400, "Break minutes are invalid for this shift.");
    const rows = await db(
      "hub_timecard_shifts",
      `id=eq.${open.id}&org_id=eq.${m.org_id}&clock_out=is.null&updated_at=eq.${encodeURIComponent(open.updated_at)}`,
      "PATCH",
      {
        clock_out: now.toISOString(),
        break_minutes: breakMinutes,
        notes: "notes" in b ? text(b.notes, 2000) : open.notes,
        updated_by: u.id,
        updated_at: now.toISOString(),
      },
    );
    if (!rows.length)
      throw new Fault(
        409,
        "This timecard changed on another device. Refresh before clocking out.",
      );
    return rows[0];
  }
  if (action === "timecard/update") {
    management(m);
    const shift = await one(
      "hub_timecard_shifts",
      `id=eq.${id(b.id)}&org_id=eq.${m.org_id}`,
    );
    if (!shift) throw new Fault(404, "Timecard shift unavailable.");
    await activeMemberFor(m, shift.user_id);
    const values: any = {
      updated_by: u.id,
      updated_at: new Date().toISOString(),
      source: "manager",
    };
    if ("work_date" in b) {
      const workDate = text(b.work_date, 10);
      if (
        !/^\\d{4}-\\d{2}-\\d{2}$/.test(workDate) ||
        !Number.isFinite(new Date(workDate + "T12:00:00Z").getTime())
      )
        throw new Fault(400, "Choose a valid work date.");
      values.work_date = workDate;
    }
    const parseTimestamp = (value: unknown, label: string) => {
      if (value === null || value === "") return null;
      const parsed = new Date(String(value));
      if (!Number.isFinite(parsed.getTime()))
        throw new Fault(400, "Choose a valid " + label + ".");
      return parsed.toISOString();
    };
    const nextIn =
        "clock_in" in b ? parseTimestamp(b.clock_in, "clock-in time") : shift.clock_in,
      nextOut =
        "clock_out" in b
          ? parseTimestamp(b.clock_out, "clock-out time")
          : shift.clock_out;
    if (!nextIn) throw new Fault(400, "Clock-in time is required.");
    if (nextOut) {
      const elapsed = new Date(nextOut).getTime() - new Date(nextIn).getTime();
      if (elapsed < 0 || elapsed > 18 * 60 * 60 * 1000)
        throw new Fault(400, "Completed shifts must be between 0 and 18 hours.");
    }
    if ("clock_in" in b) values.clock_in = nextIn;
    if ("clock_out" in b) values.clock_out = nextOut;
    if ("break_minutes" in b) {
      const minutes = Number(b.break_minutes);
      const elapsedMinutes = nextOut
        ? Math.floor(
            (new Date(nextOut).getTime() - new Date(nextIn).getTime()) / 60000,
          )
        : 18 * 60;
      if (
        !Number.isInteger(minutes) ||
        minutes < 0 ||
        minutes > Math.min(720, Math.max(0, elapsedMinutes))
      )
        throw new Fault(400, "Break minutes are invalid for this shift.");
      values.break_minutes = minutes;
    }
    if ("notes" in b) values.notes = text(b.notes, 2000);
    if ("manager_note" in b) values.manager_note = text(b.manager_note, 2000);
    const rows = await db(
      "hub_timecard_shifts",
      `id=eq.${shift.id}&org_id=eq.${m.org_id}${b.expected_updated_at ? "&updated_at=eq." + encodeURIComponent(b.expected_updated_at) : ""}`,
      "PATCH",
      values,
    );
    if (!rows.length)
      throw new Fault(
        409,
        "This timecard changed on another device. Refresh before saving.",
      );
    return rows[0];
  }

  if (action === "settings/get") {
    management(m);
    return await hubSettingsFor(m);
  }
  if (action === "settings/update") {
    management(m, true);
    const target = Number(b.weekly_billable_target),
      rate = Number(b.labor_rate),
      timezone = text(b.timezone || DEFAULT_TIMEZONE, 80);
    if (!Number.isFinite(target) || target < 0 || target > 100)
      throw new Fault(400, "Weekly billable target must be between 0 and 100 hours.");
    if (!Number.isFinite(rate) || rate <= 0 || rate > 2000)
      throw new Fault(400, "Labor rate must be between 0 and 2000.");
    if (timezone.length < 3)
      throw new Fault(400, "Timezone is invalid.");
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    } catch {
      throw new Fault(400, "Timezone is invalid.");
    }
    const current = await one("hub_org_settings", `org_id=eq.${m.org_id}`),
      values = {
        weekly_billable_target: round2(target),
        labor_rate: round2(rate),
        timezone,
        updated_by: u.id,
        updated_at: new Date().toISOString(),
      };
    if (current) {
      const rows = await db(
        "hub_org_settings",
        `org_id=eq.${m.org_id}`,
        "PATCH",
        values,
      );
      return rows[0];
    }
    const rows = await db("hub_org_settings", "", "POST", {
      org_id: m.org_id,
      ...values,
    });
    return rows[0];
  }
  if (action === "productivity/summary") {
    management(m);
    const requested = text(url.searchParams.get("week_start") || "", 10),
      weekStart = requested || (() => {
        const today = shopDate(new Date());
        const date = new Date(today + "T00:00:00Z");
        const delta = (date.getUTCDay() + 6) % 7;
        date.setUTCDate(date.getUTCDate() - delta);
        return date.toISOString().slice(0, 10);
      })();
    if (!validWeekStart(weekStart))
      throw new Fault(400, "Week start must be a Monday in YYYY-MM-DD format.");
    const weekEnd = nextWeekStart(weekStart),
      settings = await hubSettingsFor(m);
    const [members, shifts, entries, tasks] = await Promise.all([
      db(
        "hub_pilot_members",
        `org_id=eq.${m.org_id}&active=eq.true&order=created_at.asc`,
      ),
      db(
        "hub_timecard_shifts",
        `org_id=eq.${m.org_id}&work_date=gte.${weekStart}&work_date=lt.${weekEnd}&order=work_date.asc,clock_in.asc&limit=5000`,
      ),
      db(
        "hub_work_entries",
        `org_id=eq.${m.org_id}&work_date=gte.${weekStart}&work_date=lt.${weekEnd}&order=work_date.asc,created_at.asc&limit=5000`,
      ),
      db(
        "hub_project_tasks",
        `org_id=eq.${m.org_id}&status=neq.done&order=project_id.asc,sort_order.asc,created_at.asc&limit=5000`,
      ),
    ]);
    const productionMembers = members.filter((x: any) => x.role !== "owner"),
      memberIds = productionMembers.map((x: any) => x.user_id),
      profiles = memberIds.length
        ? await db(
            "user_profiles",
            `id=in.(${memberIds.join(",")})&select=id,full_name,email`,
          )
        : [],
      profileById = new Map(profiles.map((x: any) => [x.id, x])),
      target = Number(settings.weekly_billable_target),
      rate = Number(settings.labor_rate),
      rows = productionMembers.map((member: any) => {
        const personShifts = shifts.filter((x: any) => x.user_id === member.user_id),
          personEntries = entries.filter(
            (x: any) =>
              x.technician_user_id === member.user_id && x.status !== "void",
          ),
          personTasks = tasks.filter(
            (x: any) => x.assigned_user_id === member.user_id,
          );
        let attendanceHours = 0,
          openShiftCount = 0;
        for (const shift of personShifts) {
          if (!shift.clock_out) {
            openShiftCount += 1;
            continue;
          }
          const minutes =
            (new Date(shift.clock_out).getTime() -
              new Date(shift.clock_in).getTime()) /
              60000 -
            Number(shift.break_minutes || 0);
          if (Number.isFinite(minutes) && minutes > 0)
            attendanceHours += minutes / 60;
        }
        const projectHours = personEntries.reduce(
            (sum: number, row: any) => sum + Number(row.actual_hours || 0),
            0,
          ),
          recordedBillableHours = personEntries.reduce(
            (sum: number, row: any) =>
              sum + (row.billable_hours == null ? 0 : Number(row.billable_hours)),
            0,
          ),
          approvedBillableHours = personEntries.reduce(
            (sum: number, row: any) =>
              sum +
              (row.status === "approved" && row.billable_hours != null
                ? Number(row.billable_hours)
                : 0),
            0,
          ),
          pendingProjectHours = personEntries.reduce(
            (sum: number, row: any) =>
              sum + (row.status === "pending_review" ? Number(row.actual_hours || 0) : 0),
            0,
          ),
          pendingCount = personEntries.filter(
            (row: any) => row.status === "pending_review",
          ).length,
          assignedReadyHours = personTasks.reduce(
            (sum: number, task: any) =>
              sum + (task.status === "todo" ? Number(task.estimated_hours || 0) : 0),
            0,
          ),
          assignedBlockedHours = personTasks.reduce(
            (sum: number, task: any) =>
              sum + (task.status === "blocked" ? Number(task.estimated_hours || 0) : 0),
            0,
          ),
          profile = profileById.get(member.user_id) as any;
        return {
          user_id: member.user_id,
          role: member.role,
          name: profile?.full_name || profile?.email || "Team member",
          attendance_hours: round2(attendanceHours),
          open_shift_count: openShiftCount,
          project_hours: round2(projectHours),
          recorded_billable_hours: round2(recordedBillableHours),
          approved_billable_hours: round2(approvedBillableHours),
          pending_project_hours: round2(pendingProjectHours),
          pending_review_count: pendingCount,
          utilization_percent: pct(approvedBillableHours, attendanceHours),
          project_coverage_percent: pct(projectHours, attendanceHours),
          efficiency_percent: pct(approvedBillableHours, projectHours),
          weekly_billable_target: target,
          target_attainment_percent: pct(approvedBillableHours, target),
          approved_labor_value: round2(approvedBillableHours * rate),
          assigned_ready_hours: round2(assignedReadyHours),
          assigned_blocked_hours: round2(assignedBlockedHours),
        };
      }),
      sum = (field: string) =>
        round2(rows.reduce((total: number, row: any) => total + Number(row[field] || 0), 0)),
      unassignedReady = tasks.filter(
        (task: any) => task.status === "todo" && !task.assigned_user_id,
      ),
      blocked = tasks.filter((task: any) => task.status === "blocked"),
      waiting = tasks.filter((task: any) => task.status === "waiting"),
      inProgress = tasks.filter((task: any) => task.status === "in_progress"),
      taskHours = (list: any[]) =>
        round2(list.reduce((total, task) => total + Number(task.estimated_hours || 0), 0)),
      shopAttendance = sum("attendance_hours"),
      shopProject = sum("project_hours"),
      shopApproved = sum("approved_billable_hours");
    return {
      week_start: weekStart,
      week_end_exclusive: weekEnd,
      settings: {
        weekly_billable_target: target,
        labor_rate: rate,
        timezone: settings.timezone,
      },
      shop: {
        tech_count: rows.length,
        attendance_hours: shopAttendance,
        project_hours: shopProject,
        approved_billable_hours: shopApproved,
        recorded_billable_hours: sum("recorded_billable_hours"),
        pending_project_hours: sum("pending_project_hours"),
        pending_review_count: rows.reduce(
          (total: number, row: any) => total + row.pending_review_count,
          0,
        ),
        open_shift_count: rows.reduce(
          (total: number, row: any) => total + row.open_shift_count,
          0,
        ),
        target_billable_hours: round2(rows.length * target),
        target_attainment_percent: pct(shopApproved, rows.length * target),
        utilization_percent: pct(shopApproved, shopAttendance),
        project_coverage_percent: pct(shopProject, shopAttendance),
        efficiency_percent: pct(shopApproved, shopProject),
        approved_labor_value: round2(shopApproved * rate),
      },
      work_queue: {
        unassigned_ready_count: unassignedReady.length,
        unassigned_ready_hours: taskHours(unassignedReady),
        blocked_count: blocked.length,
        blocked_hours: taskHours(blocked),
        waiting_count: waiting.length,
        waiting_hours: taskHours(waiting),
        in_progress_count: inProgress.length,
        in_progress_hours: taskHours(inProgress),
      },
      technicians: rows,
      boundary:
        "Attendance, project work and approved billable hours remain separate sources. Open shifts are not counted as completed attendance. Labor value is approved billable hours multiplied by the configured shop rate; it is not an invoice, payment or accounting total.",
    };
  }
  if (action === "timeline/add") {
    const v = await vehicleFor(m, id(b.vehicle_id)),
      p = b.project_id ? await projectFor(m, id(b.project_id)) : null;
    if (p && p.vehicle_id !== v.id) throw new Fault(400, "Project mismatch");
    const note = text(b.description, 2000);
    if (!note) throw new Fault(400, "Write a work update first.");
    return await db("hub_activity", "", "POST", {
      org_id: m.org_id,
      vehicle_id: v.id,
      project_id: p?.id || null,
      actor_id: u.id,
      event_type: "note",
      description: note,
    });
  }
  if (action === "inspection/start") {
    management(m);
    await projectFor(m, id(b.project_id));
    return await rpc("hub_start_inspection", {
      p_actor: u.id,
      p_org: m.org_id,
      p_project: id(b.project_id),
      p_template: id(b.template_id),
    });
  }
  if (action === "inspection/get")
    return await inspectionData(m, id(url.searchParams.get("project_id")));
  if (action === "inspection/item") {
    const { item, sec, link } = await itemFor(m, id(b.item_id)),
      ins = await one(
        "inspections",
        `id=eq.${link.inspection_id}&select=id,status`,
      );
    if (["approved", "sent"].includes(ins.status))
      throw new Fault(
        409,
        "This report is approved. Reopen it in the Inspection App before editing.",
      );
    if (
      !["good", "monitor", "needs_attention", "not_inspected"].includes(
        b.status,
      )
    )
      throw new Fault(400, "Choose a condition.");
    if (b.status === "not_inspected" && !text(b.not_inspected_reason))
      throw new Fault(400, "Explain why this item was not inspected.");
    const values: any = {
      status: b.status,
      notes: text(b.notes, 4000),
      not_inspected_reason:
        b.status === "not_inspected"
          ? text(b.not_inspected_reason, 1000)
          : null,
      impact: text(b.impact, 2000) || null,
      recommended_action: text(b.recommended_action, 2000) || null,
      updated_at: new Date().toISOString(),
    };
    if (
      ["immediate", "short_term", "long_term", "upgrade"].includes(b.priority)
    )
      values.priority = b.priority;
    const rows = await db(
      "inspection_items",
      `id=eq.${item.id}${b.expected_updated_at ? "&updated_at=eq." + encodeURIComponent(b.expected_updated_at) : ""}`,
      "PATCH",
      values,
    );
    if (!rows.length)
      throw new Fault(
        409,
        "This finding changed on another device. Refresh before saving.",
      );
    await db("inspection_sections", `id=eq.${sec.id}`, "PATCH", {
      completed_at: null,
    });
    const all = await inspectionData(m, link.project_id),
      done = all.items.filter((x: any) => x.status).length;
    await db("inspections", `id=eq.${link.inspection_id}`, "PATCH", {
      status: "in_progress",
      progress_percent: Math.round(
        (done / Math.max(1, all.items.length)) * 100,
      ),
      updated_at: new Date().toISOString(),
    });
    return { item: rows[0] };
  }
  if (action === "inspection/submit") {
    const data = await inspectionData(m, id(b.project_id));
    if (["approved", "sent"].includes(data.inspection.status))
      throw new Fault(409, "Inspection already approved.");
    const missing = [];
    for (const it of data.items) {
      if (!it.status) {
        missing.push(it.item_name + ": condition");
        continue;
      }
      if (it.status === "not_inspected") {
        if (!it.not_inspected_reason) missing.push(it.item_name + ": reason");
        continue;
      }
      if (it.notes_mode === "required" && !it.notes)
        missing.push(it.item_name + ": notes");
      if (
        it.photo_mode === "required" &&
        !data.evidence.some((e: any) => e.item_id === it.id)
      ) {
        const old = await one("inspection_photos", `item_id=eq.${it.id}`);
        if (!old) missing.push(it.item_name + ": photo");
      }
      if (it.video_mode === "required") {
        const vid = await one("inspection_videos", `item_id=eq.${it.id}`);
        if (!vid)
          missing.push(it.item_name + ": required video (use Inspection App)");
      }
    }
    if (missing.length)
      throw new Fault(
        422,
        `${missing.length} required item(s) remain. ${missing.slice(0, 3).join("; ")}`,
      );
    await db("inspections", `id=eq.${data.inspection.id}`, "PATCH", {
      status: "pending_review",
      progress_percent: 100,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await db("hub_activity", "", "POST", {
      org_id: m.org_id,
      vehicle_id: data.link.vehicle_id,
      project_id: data.link.project_id,
      actor_id: u.id,
      event_type: "inspection",
      description: "Inspection submitted for manager review",
    });
    return { status: "pending_review" };
  }
  if (action === "team/list") {
    management(m);
    const members = await db("hub_pilot_members", `org_id=eq.${m.org_id}`),
      requests = await db(
        "hub_access_requests",
        `org_id=eq.${m.org_id}&status=eq.pending&order=requested_at.asc`,
      ),
      ids = [
        ...new Set([
          ...members.map((x: any) => x.user_id),
          ...requests.map((x: any) => x.user_id),
        ]),
      ],
      profiles = ids.length
        ? await db(
            "user_profiles",
            `id=in.(${ids.join(",")})&select=id,full_name,email`,
          )
        : [],
      assignments = await db(
        "hub_vehicle_assignments",
        `org_id=eq.${m.org_id}`,
      );
    return { members, requests, profiles, assignments };
  }
  if (action === "team/approve") {
    management(m, true);
    const r = await one(
      "hub_access_requests",
      `id=eq.${id(b.request_id)}&org_id=eq.${m.org_id}`,
    );
    if (!r) throw new Fault(404, "Access request unavailable");
    if (r.user_id === u.id)
      throw new Fault(400, "Cannot approve your own access");
    if (!["tech", "manager"].includes(b.role))
      throw new Fault(400, "Choose Technician or Manager");
    const vids = Array.isArray(b.vehicle_ids)
      ? [...new Set(b.vehicle_ids.map(id))]
      : [];
    for (const v of vids) await vehicleFor(m, String(v));
    return await rpc("hub_approve_member", {
      p_actor: u.id,
      p_org: m.org_id,
      p_request: r.id,
      p_role: b.role,
      p_vehicle_ids: vids,
    });
  }
  if (action === "team/assign") {
    management(m, true);
    const member = await one(
      "hub_pilot_members",
      `org_id=eq.${m.org_id}&user_id=eq.${id(b.user_id)}&active=eq.true`,
    );
    if (!member || member.role !== "tech")
      throw new Fault(400, "Choose an active technician");
    const vids = Array.isArray(b.vehicle_ids)
      ? [...new Set(b.vehicle_ids.map(id))]
      : [];
    for (const v of vids) await vehicleFor(m, String(v));
    return await rpc("hub_set_assignments", {
      p_actor: u.id,
      p_org: m.org_id,
      p_user: member.user_id,
      p_vehicle_ids: vids,
    });
  }
  throw new Fault(404, "Unknown Hub operation");
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "",
    allowed =
      !origin ||
      /^https:\/\/([a-z0-9-]+\.)?socal-hub-review\.pages\.dev$/.test(origin) ||
      origin === "https://socal-hub-work-log-pilot.jonasmusson.chatgpt.site" ||
      origin === "https://jonasmusson-socal-in-8zvz.bolt.host" ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": allowed
        ? origin || "*"
        : "https://socal-hub-review.pages.dev",
      "Access-Control-Allow-Headers":
        "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      Vary: "Origin",
    },
    respond = (x: unknown, status = 200) =>
      new Response(JSON.stringify(x), { status, headers });
  if (!allowed) return respond({ error: "Origin not permitted" }, 403);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  try {
    const url = new URL(req.url),
      action = url.searchParams.get("action") || "snapshot";
    if (action === "health")
      return respond({
        service: "socal-hub",
        version: VERSION,
        authentication: "required",
        camera_storage: "private",
      });
    const user = await userFor(req),
      body = req.method === "POST" ? await bodyFor(req) : {};
    if (action === "access/request") {
      const org = await one("hub_pilot_orgs", "slug=eq.socal-autoworks");
      if (!org) throw new Fault(503, "Shop not configured");
      const old = await one(
        "hub_access_requests",
        `org_id=eq.${org.id}&user_id=eq.${user.id}`,
      );
      if (old) return respond({ status: old.status });
      const full_name = text(
        body.full_name ||
          user.user_metadata?.full_name ||
          user.email.split("@")[0],
      );
      await db("hub_access_requests", "", "POST", {
        org_id: org.id,
        user_id: user.id,
        full_name,
        email: user.email,
      });
      return respond({ status: "pending" });
    }
    const member = await memberFor(
      user,
      body.org_id || url.searchParams.get("org_id") || undefined,
    );
    return respond(await endpoint(req, user, member, body, action, url));
  } catch (e) {
    if (e instanceof Fault) return respond({ error: e.message }, e.status);
    console.error(
      "Hub operation error",
      e instanceof Error ? e.name : "unknown",
    );
    return respond(
      {
        error:
          "Service unavailable. Your pending photo has not been discarded; retry when connected.",
      },
      503,
    );
  }
});
