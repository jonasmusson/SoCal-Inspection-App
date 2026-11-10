import {createShopmonkeyWriteClient,ShopmonkeyWriteError} from "./shopmonkey.ts";
/* eslint-disable @typescript-eslint/no-explicit-any */
const ORIGIN = Deno.env.get("SUPABASE_URL")!,
  SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  PUBLIC = Deno.env.get("SUPABASE_ANON_KEY")!;
const VERSION = "0.11.4",
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
  "Clipboard",
  "Other",
];
const PART_REQUEST_STATUSES = ["requested", "ordered", "received", "cancelled"];
const PART_REQUEST_URGENCY = ["normal", "urgent"];
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
const sha = async (b: ArrayBuffer) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b)))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const serviceHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
const shopmonkeyToken=()=>String(Deno.env.get("SHOPMONKEY_API_TOKEN")||"").trim();
const shopmonkeyClient=()=>{
  const token=shopmonkeyToken();
  if(!token)throw new Fault(503,"Shopmonkey write integration is not configured.");
  return createShopmonkeyWriteClient(token);
};
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
async function skillFor(m: any, userId: string, skillCode: string) {
  return await one(
    "hub_member_task_skills",
    `org_id=eq.${m.org_id}&user_id=eq.${id(userId)}&skill_code=eq.${encodeURIComponent(skillCode)}`,
  );
}
async function assertTaskSkill(m: any, userId: string, skillCode: string) {
  if (!(await skillFor(m, userId, skillCode)))
    throw new Fault(
      400,
      "Assigned technician is not approved for this task level.",
    );
}
async function assertTechnicalSupervisor(
  m: any,
  userId: string,
  vehicleId: string,
) {
  const member = await activeMemberFor(m, userId);
  if (["owner", "manager"].includes(member.role)) return;
  const technicallyApproved =
    (await skillFor(m, userId, "L3")) ||
    (await skillFor(m, userId, "QA"));
  if (!technicallyApproved)
    throw new Fault(
      400,
      "Supervisor must be management or approved for L3 / QA work.",
    );
  if (!(await assignmentFor(m, vehicleId, userId)))
    throw new Fault(
      400,
      "Technical supervisor must have access to this vehicle.",
    );
}
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
    if (len > 524288) {
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
      member_task_skills,
      parts_requests,
      clipboard_intakes,
      shopmonkey_project_links,
      shopmonkey_work_links,
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
        "hub_member_task_skills",
        `org_id=eq.${m.org_id}${m.role === "tech" ? "&user_id=eq." + m.user_id : ""}&order=user_id.asc,skill_code.asc`,
      ),
      db(
        "hub_parts_requests",
        scope + "&order=created_at.desc&limit=2000",
      ),
      m.role === "tech"
        ? []
        : db(
            "hub_clipboard_intakes",
            scope + "&order=applied_at.desc&limit=500",
          ),
      m.role === "tech"
        ? []
        : db(
            "hub_shopmonkey_project_links",
            scope + "&order=verified_at.desc&limit=500",
          ),
      m.role === "tech"
        ? []
        : db(
            "hub_shopmonkey_work_links",
            `org_id=eq.${m.org_id}&project_id=in.(${projects.length ? projects.map((x:any)=>x.id).join(",") : "00000000-0000-0000-0000-000000000000"})&order=synced_at.desc&limit=2000`,
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
      member_task_skills,
      parts_requests,
      clipboard_intakes,
      shopmonkey_project_links,
      shopmonkey_work_links,
      work_profiles,
      work_systems: WORK_SYSTEMS,
      task_statuses: TASK_STATUSES,
      task_priorities: TASK_PRIORITIES,
      task_skills: TASK_SKILLS,
      part_request_statuses: PART_REQUEST_STATUSES,
      part_request_urgency: PART_REQUEST_URGENCY,
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
      await assertTaskSkill(m, assigned, skill);
      if (!(await assignmentFor(m, p.vehicle_id, assigned)))
        throw new Fault(400, "Assigned technician must have access to this vehicle.");
    }
    if (b.supervisor_user_id) {
      supervisor = id(b.supervisor_user_id);
      await assertTechnicalSupervisor(m, supervisor, p.vehicle_id);
    }
    if (skill === "L2S" && !supervisor)
      throw new Fault(400, "Supervised mechanical tasks require a supervisor.");
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
        if (task.assigned_user_id)
          await assertTaskSkill(m, task.assigned_user_id, skill);
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
          await assertTaskSkill(m, assigned, values.skill_code ?? task.skill_code);
          if (!(await assignmentFor(m, task.vehicle_id, assigned)))
            throw new Fault(400, "Assigned technician must have access to this vehicle.");
          values.assigned_user_id = assigned;
        }
      }
      if ("supervisor_user_id" in b) {
        if (!b.supervisor_user_id) values.supervisor_user_id = null;
        else {
          const supervisor = id(b.supervisor_user_id);
          await assertTechnicalSupervisor(m, supervisor, task.vehicle_id);
          values.supervisor_user_id = supervisor;
        }
      }
      if ((values.skill_code ?? task.skill_code) === "L2S" &&
          !(values.supervisor_user_id ?? task.supervisor_user_id))
        throw new Fault(400, "Supervised mechanical tasks require a supervisor.");
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

  if (action === "capabilities/list") {
    management(m);
    const members = await db(
      "hub_pilot_members",
      `org_id=eq.${m.org_id}&active=eq.true&order=created_at.asc`,
    );
    const skills = await db(
      "hub_member_task_skills",
      `org_id=eq.${m.org_id}&order=user_id.asc,skill_code.asc`,
    );
    const ids = members.map((x: any) => x.user_id);
    const profiles = ids.length
      ? await db(
          "user_profiles",
          `id=in.(${ids.join(",")})&select=id,full_name,email`,
        )
      : [];
    return { members, profiles, skills, skill_codes: TASK_SKILLS };
  }
  if (action === "capabilities/set") {
    management(m, true);
    const target = id(b.user_id),
      member = await activeMemberFor(m, target),
      codes = Array.isArray(b.skill_codes)
        ? [...new Set(b.skill_codes.map((x: unknown) => text(x, 10)))]
        : [];
    if (member.role === "owner" && target === u.id && !codes.length)
      throw new Fault(400, "Keep at least one task capability on your own active profile.");
    if (codes.some((code) => !TASK_SKILLS.includes(code)))
      throw new Fault(400, "One or more task capability codes are invalid.");
    await db(
      "hub_member_task_skills",
      `org_id=eq.${m.org_id}&user_id=eq.${target}`,
      "DELETE",
    );
    if (codes.length)
      await db(
        "hub_member_task_skills",
        "",
        "POST",
        codes.map((skill_code) => ({
          org_id: m.org_id,
          user_id: target,
          skill_code,
          notes: "",
          approved_by: u.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })),
      );
    return { user_id: target, skill_codes: codes };
  }

  if (action === "parts/create") {
    const p = await projectFor(m, id(b.project_id)),
      task = b.task_id ? await taskFor(m, id(b.task_id)) : null,
      partName = text(b.part_name, 300),
      partNumber = text(b.part_number, 160),
      quantity = Number(b.quantity ?? 1),
      urgency = text(b.urgency || "normal", 20);
    if (task && task.project_id !== p.id)
      throw new Fault(400, "Task and project do not match.");
    if (partName.length < 2) throw new Fault(400, "Part or material name required.");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999)
      throw new Fault(400, "Quantity must be between 1 and 999.");
    if (!PART_REQUEST_URGENCY.includes(urgency))
      throw new Fault(400, "Choose a valid parts-request urgency.");
    return await db("hub_parts_requests", "", "POST", {
      org_id: m.org_id,
      vehicle_id: p.vehicle_id,
      project_id: p.id,
      task_id: task?.id || null,
      requested_by: u.id,
      updated_by: u.id,
      part_name: partName,
      part_number: partNumber,
      quantity,
      urgency,
      status: "requested",
      vendor: "",
      order_reference: "",
      notes: text(b.notes, 4000),
      manager_note: "",
    });
  }
  if (action === "parts/update") {
    const request = await one(
      "hub_parts_requests",
      `id=eq.${id(b.id)}&org_id=eq.${m.org_id}`,
    );
    if (!request) throw new Fault(404, "Parts request unavailable.");
    await projectFor(m, request.project_id);
    const isManager = ["owner", "manager"].includes(m.role);
    if (!isManager && (request.requested_by !== u.id || request.status !== "requested"))
      throw new Fault(
        403,
        "Only management can change a parts request after it leaves Requested.",
      );
    const values: any = {
      updated_by: u.id,
      updated_at: new Date().toISOString(),
    };
    if ("part_name" in b) {
      const partName = text(b.part_name, 300);
      if (partName.length < 2) throw new Fault(400, "Part or material name required.");
      values.part_name = partName;
    }
    if ("part_number" in b) values.part_number = text(b.part_number, 160);
    if ("quantity" in b) {
      const quantity = Number(b.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999)
        throw new Fault(400, "Quantity must be between 1 and 999.");
      values.quantity = quantity;
    }
    if ("urgency" in b) {
      const urgency = text(b.urgency, 20);
      if (!PART_REQUEST_URGENCY.includes(urgency))
        throw new Fault(400, "Choose a valid parts-request urgency.");
      values.urgency = urgency;
    }
    if ("notes" in b) values.notes = text(b.notes, 4000);
    if (isManager) {
      if ("vendor" in b) values.vendor = text(b.vendor, 200);
      if ("order_reference" in b)
        values.order_reference = text(b.order_reference, 200);
      if ("manager_note" in b)
        values.manager_note = text(b.manager_note, 2000);
      if ("status" in b) {
        const status = text(b.status, 20),
          now = new Date().toISOString();
        if (!PART_REQUEST_STATUSES.includes(status))
          throw new Fault(400, "Choose a valid parts-request status.");
        values.status = status;
        if (status === "requested") {
          values.ordered_at = null;
          values.received_at = null;
        } else if (status === "ordered") {
          values.ordered_at = request.ordered_at || now;
          values.received_at = null;
        } else if (status === "received") {
          values.ordered_at = request.ordered_at || now;
          values.received_at = request.received_at || now;
        }
      }
    }
    const rows = await db(
      "hub_parts_requests",
      `id=eq.${request.id}&org_id=eq.${m.org_id}${b.expected_updated_at ? "&updated_at=eq." + encodeURIComponent(b.expected_updated_at) : ""}`,
      "PATCH",
      values,
    );
    if (!rows.length)
      throw new Fault(
        409,
        "This parts request changed on another device. Refresh before saving.",
      );
    return rows[0];
  }

  if (action === "clipboard/apply") {
    management(m);
    const requestId = id(b.request_id),
      projectId = id(b.project_id),
      mediaIds = Array.isArray(b.media_ids)
        ? [...new Set(b.media_ids.map(id))]
        : [],
      lines = Array.isArray(b.lines) ? b.lines : [];
    if (mediaIds.length < 1 || mediaIds.length > 6)
      throw new Fault(400, "Add between 1 and 6 clipboard photos.");
    if (lines.length < 1 || lines.length > 100)
      throw new Fault(400, "Clipboard must contain between 1 and 100 reviewed work lines.");
    if (b.invoice_ready && m.role !== "owner")
      throw new Fault(
        403,
        "Owner permission is required to mark clipboard work Ready for Invoice.",
      );
    await projectFor(m, projectId);
    return await rpc("hub_apply_clipboard_intake", {
      p_actor: u.id,
      p_org: m.org_id,
      p_request: requestId,
      p_project: projectId,
      p_media_ids: mediaIds,
      p_summary: text(b.summary, 4000),
      p_lines: lines,
      p_invoice_ready: Boolean(b.invoice_ready),
    });
  }
  if (action === "clipboard/get") {
    management(m);
    const intake = await one(
      "hub_clipboard_intakes",
      `id=eq.${id(url.searchParams.get("id"))}&org_id=eq.${m.org_id}`,
    );
    if (!intake) throw new Fault(404, "Clipboard intake unavailable.");
    await projectFor(m, intake.project_id);
    const [media, lines] = await Promise.all([
      db(
        "hub_clipboard_intake_media",
        `intake_id=eq.${intake.id}&order=media_id.asc`,
      ),
      db(
        "hub_clipboard_lines",
        `intake_id=eq.${intake.id}&order=line_order.asc`,
      ),
    ]);
    return { intake, media, lines };
  }

  if (action === "shopmonkey/status") {
    management(m);
    return {
      configured: Boolean(shopmonkeyToken()),
      write_enabled: Boolean(shopmonkeyToken()),
      boundary:
        "Shopmonkey remains billing authority. HUB writes require a verified project/order link and an explicit owner sync action.",
    };
  }
  if (action === "shopmonkey/link/verify") {
    management(m, true);
    const p = await projectFor(m, id(b.project_id)),
      remoteOrderId = text(b.remote_order_id, 128);
    if (!remoteOrderId)
      throw new Fault(400, "Shopmonkey Order ID is required.");
    let remote:any;
    try {
      remote = await shopmonkeyClient().order(remoteOrderId);
    } catch (error) {
      if (error instanceof ShopmonkeyWriteError)
        throw new Fault(
          error.status === 429 ? 429 : 502,
          error.status === 429
            ? "Shopmonkey rate limit reached. Retry later."
            : "Shopmonkey Order ID could not be verified.",
        );
      throw new Fault(502, "Shopmonkey Order ID could not be verified.");
    }
    if (String(remote.id || "") !== remoteOrderId)
      throw new Fault(409, "Verified Shopmonkey Order ID did not match the requested order.");
    if (remote.readOnly === true)
      throw new Fault(409, "This Shopmonkey order is read-only and cannot receive HUB labor.");
    const remoteNumber = text(remote.number, 128),
      expectedRef = text(p.shopmonkey_order_ref, 128);
    if (
      expectedRef &&
      remoteNumber &&
      expectedRef.replace(/^#/, "") !== remoteNumber.replace(/^#/, "")
    )
      throw new Fault(
        409,
        "The Shopmonkey order number does not match this project reference. Review the project before linking.",
      );
    const existing = await one(
      "hub_shopmonkey_project_links",
      `project_id=eq.${p.id}&org_id=eq.${m.org_id}`,
    );
    const values = {
      org_id: m.org_id,
      vehicle_id: p.vehicle_id,
      remote_order_id: remoteOrderId,
      remote_order_number: remoteNumber,
      verified_by: u.id,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const rows = existing
      ? await db(
          "hub_shopmonkey_project_links",
          `project_id=eq.${p.id}&org_id=eq.${m.org_id}`,
          "PATCH",
          values,
        )
      : await db("hub_shopmonkey_project_links", "", "POST", {
          project_id: p.id,
          ...values,
        });
    return {
      link: rows[0],
      order: {
        id: String(remote.id || ""),
        number: remoteNumber,
        status: text(remote.status, 100),
        invoiced: Boolean(remote.invoiced),
        paid: Boolean(remote.paid),
        read_only: Boolean(remote.readOnly),
      },
    };
  }
  if (action === "shopmonkey/preview") {
    management(m);
    const p = await projectFor(m, id(url.searchParams.get("project_id"))),
      link = await one(
        "hub_shopmonkey_project_links",
        `project_id=eq.${p.id}&org_id=eq.${m.org_id}`,
      );
    if (!link)
      throw new Fault(409, "Verify the Shopmonkey Order ID for this project first.");
    let remote:any;
    try {
      remote = await shopmonkeyClient().order(link.remote_order_id);
    } catch (error) {
      if (error instanceof ShopmonkeyWriteError)
        throw new Fault(
          error.status === 429 ? 429 : 502,
          error.status === 429
            ? "Shopmonkey rate limit reached. Retry later."
            : "Shopmonkey order could not be re-verified.",
        );
      throw new Fault(502, "Shopmonkey order could not be re-verified.");
    }
    if (remote.readOnly === true)
      throw new Fault(409, "This Shopmonkey order is read-only.");
    const entries = await db(
        "hub_work_entries",
        `org_id=eq.${m.org_id}&project_id=eq.${p.id}&status=eq.approved&invoice_state=eq.ready&order=work_date.asc,created_at.asc&limit=1000`,
      ),
      entryIds = entries.map((x:any) => x.id),
      linked = entryIds.length
        ? await db(
            "hub_shopmonkey_work_links",
            `org_id=eq.${m.org_id}&work_entry_id=in.(${entryIds.join(",")})`,
          )
        : [],
      linkedIds = new Set(linked.map((x:any) => x.work_entry_id)),
      ready = entries.filter(
        (entry:any) =>
          !linkedIds.has(entry.id) &&
          entry.billable_hours != null &&
          Number(entry.billable_hours) > 0,
      ),
      groups = new Map<string,any[]>();
    for (const entry of ready) {
      const key = WORK_SYSTEMS.includes(entry.system) ? entry.system : "General",
        rows = groups.get(key) || [];
      rows.push(entry);
      groups.set(key, rows);
    }
    return {
      project_id: p.id,
      vehicle_id: p.vehicle_id,
      shopmonkey_order: {
        id: link.remote_order_id,
        number: text(remote.number, 128),
        status: text(remote.status, 100),
        invoiced: Boolean(remote.invoiced),
        paid: Boolean(remote.paid),
      },
      ready_entry_count: ready.length,
      ready_billable_hours: Math.round(
        ready.reduce((sum:number,row:any)=>sum+Number(row.billable_hours||0),0)*100,
      )/100,
      groups: [...groups.entries()].map(([system,rows])=>({
        system,
        entry_count: rows.length,
        billable_hours: Math.round(
          rows.reduce((sum:number,row:any)=>sum+Number(row.billable_hours||0),0)*100,
        )/100,
        entries: rows.map((row:any)=>({
          id: row.id,
          work_date: row.work_date,
          work_performed: row.work_performed,
          billable_hours: Number(row.billable_hours),
          technician_user_id: row.technician_user_id,
        })),
      })),
      already_synced_count: linked.length,
      boundary:
        "Preview only. No Shopmonkey service or labor has been created by this action.",
    };
  }
  if (action === "shopmonkey/sync") {
    management(m, true);
    const requestId = id(b.request_id),
      p = await projectFor(m, id(b.project_id)),
      link = await one(
        "hub_shopmonkey_project_links",
        `project_id=eq.${p.id}&org_id=eq.${m.org_id}`,
      ),
      rateCents = Number(b.rate_cents),
      requestedIds = Array.isArray(b.work_entry_ids)
        ? [...new Set(b.work_entry_ids.map(id))]
        : [];
    if (!link)
      throw new Fault(409, "Verify the Shopmonkey Order ID for this project first.");
    if (!Number.isInteger(rateCents) || rateCents < 0 || rateCents > 1_000_000)
      throw new Fault(400, "Confirm a valid labor rate before syncing.");
    if (requestedIds.length < 1 || requestedIds.length > 100)
      throw new Fault(400, "Choose between 1 and 100 Ready work entries.");
    const payloadText = JSON.stringify({
        project_id: p.id,
        order_id: link.remote_order_id,
        rate_cents: rateCents,
        work_entry_ids: [...requestedIds].sort(),
      }),
      payloadHash = await sha(new TextEncoder().encode(payloadText).buffer),
      existingRun = await one(
        "hub_shopmonkey_sync_runs",
        `id=eq.${requestId}&org_id=eq.${m.org_id}`,
      );
    if (existingRun) {
      if (
        existingRun.actor_id !== u.id ||
        existingRun.project_id !== p.id ||
        existingRun.payload_hash !== payloadHash
      )
        throw new Fault(409, "Shopmonkey sync request identity conflict.");
      if (existingRun.status === "complete") return existingRun.result;
      throw new Fault(
        409,
        "This Shopmonkey sync did not finish cleanly. Reconcile the remote order before retrying; HUB will not blindly repeat external writes.",
      );
    }
    const entries = await db(
      "hub_work_entries",
      `org_id=eq.${m.org_id}&project_id=eq.${p.id}&id=in.(${requestedIds.join(",")})`,
    );
    if (entries.length !== requestedIds.length)
      throw new Fault(400, "One or more selected work entries are unavailable.");
    const existingLinks = await db(
      "hub_shopmonkey_work_links",
      `org_id=eq.${m.org_id}&work_entry_id=in.(${requestedIds.join(",")})`,
    );
    if (existingLinks.length)
      throw new Fault(409, "One or more selected work entries are already linked to Shopmonkey labor.");
    for (const entry of entries) {
      if (
        entry.status !== "approved" ||
        entry.invoice_state !== "ready" ||
        entry.billable_hours == null ||
        Number(entry.billable_hours) <= 0
      )
        throw new Fault(
          409,
          "Every selected work entry must be manager-approved, Ready for Invoice and have positive billable hours.",
        );
    }
    let remote:any;
    try {
      remote = await shopmonkeyClient().order(link.remote_order_id);
    } catch (error) {
      if (error instanceof ShopmonkeyWriteError)
        throw new Fault(
          error.status === 429 ? 429 : 502,
          error.status === 429
            ? "Shopmonkey rate limit reached. Retry later."
            : "Shopmonkey order could not be re-verified before sync.",
        );
      throw new Fault(502, "Shopmonkey order could not be re-verified before sync.");
    }
    if (remote.readOnly === true)
      throw new Fault(409, "This Shopmonkey order is read-only.");
    await db("hub_shopmonkey_sync_runs", "", "POST", {
      id: requestId,
      org_id: m.org_id,
      project_id: p.id,
      remote_order_id: link.remote_order_id,
      actor_id: u.id,
      payload_hash: payloadHash,
      status: "started",
      requested_work_entry_ids: requestedIds,
      result: {},
      error_summary: "",
    });
    const client = shopmonkeyClient(),
      bySystem = new Map<string,any[]>();
    for (const entry of entries) {
      const system = WORK_SYSTEMS.includes(entry.system) ? entry.system : "General",
        rows = bySystem.get(system) || [];
      rows.push(entry);
      bySystem.set(system, rows);
    }
    const synced:any[] = [];
    try {
      for (const [system, rows] of bySystem.entries()) {
        let serviceLink = await one(
          "hub_shopmonkey_service_links",
          `project_id=eq.${p.id}&org_id=eq.${m.org_id}&system=eq.${encodeURIComponent(system)}`,
        );
        if (serviceLink && serviceLink.remote_order_id !== link.remote_order_id)
          throw new Error("Stored Shopmonkey service mapping belongs to a different order.");
        if (!serviceLink) {
          const service = await client.addService(link.remote_order_id, {
            name: system,
            note: "",
          });
          serviceLink = (
            await db("hub_shopmonkey_service_links", "", "POST", {
              org_id: m.org_id,
              project_id: p.id,
              system,
              remote_order_id: link.remote_order_id,
              remote_service_id: String(service.id),
              remote_service_name: text(service.name || system, 300),
              verified_by: u.id,
              verified_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
          )[0];
        }
        for (const entry of rows) {
          const labor = await client.addLabor(
            link.remote_order_id,
            serviceLink.remote_service_id,
            {
              hours: Number(entry.billable_hours),
              name: text(entry.work_performed, 300),
              note: "",
              rateCents,
            },
          );
          await db("hub_shopmonkey_work_links", "", "POST", {
            work_entry_id: entry.id,
            org_id: m.org_id,
            project_id: p.id,
            sync_run_id: requestId,
            remote_order_id: link.remote_order_id,
            remote_service_id: serviceLink.remote_service_id,
            remote_labor_id: String(labor.id),
            remote_service_name: text(serviceLink.remote_service_name || system, 300),
            remote_labor_name: text(labor.name || entry.work_performed, 300),
            synced_hours: Number(entry.billable_hours),
            synced_rate_cents: rateCents,
            synced_by: u.id,
            synced_at: new Date().toISOString(),
          });
          const updated = await db(
            "hub_work_entries",
            `id=eq.${entry.id}&org_id=eq.${m.org_id}&invoice_state=eq.ready`,
            "PATCH",
            {
              invoice_state: "synced",
              updated_by: u.id,
              updated_at: new Date().toISOString(),
            },
          );
          if (!updated.length)
            throw new Error(
              "Shopmonkey labor was created, but the HUB work entry changed before its sync receipt could be finalized.",
            );
          synced.push({
            work_entry_id: entry.id,
            service_id: serviceLink.remote_service_id,
            labor_id: String(labor.id),
            hours: Number(entry.billable_hours),
            rate_cents: rateCents,
          });
        }
      }
      const result = {
        sync_run_id: requestId,
        project_id: p.id,
        remote_order_id: link.remote_order_id,
        synced_count: synced.length,
        synced,
      };
      await db(
        "hub_shopmonkey_sync_runs",
        `id=eq.${requestId}&org_id=eq.${m.org_id}`,
        "PATCH",
        {
          status: "complete",
          result,
          error_summary: "",
          completed_at: new Date().toISOString(),
        },
      );
      await db("hub_activity", "", "POST", {
        org_id: m.org_id,
        vehicle_id: p.vehicle_id,
        project_id: p.id,
        actor_id: u.id,
        event_type: "shopmonkey_sync",
        description:
          synced.length +
          " approved HUB labor line" +
          (synced.length === 1 ? "" : "s") +
          " synced to Shopmonkey",
      });
      return result;
    } catch (error) {
      const savedLinks = await db(
        "hub_shopmonkey_work_links",
        `org_id=eq.${m.org_id}&sync_run_id=eq.${requestId}`,
      );
      await db(
        "hub_shopmonkey_sync_runs",
        `id=eq.${requestId}&org_id=eq.${m.org_id}`,
        "PATCH",
        {
          status: savedLinks.length ? "partial" : "failed",
          result: { synced: savedLinks },
          error_summary:
            error instanceof ShopmonkeyWriteError
              ? "Shopmonkey API write failed."
              : "Shopmonkey handoff stopped before clean completion.",
          completed_at: new Date().toISOString(),
        },
      );
      if (error instanceof ShopmonkeyWriteError && error.status === 429)
        throw new Fault(429, "Shopmonkey rate limit reached during sync. Reconcile the order before retrying.");
      throw new Fault(
        502,
        "Shopmonkey handoff did not finish cleanly. Reconcile the remote order before any retry.",
      );
    }
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
