import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  FileBarChart,
  LayoutDashboard,
  History,
  Menu,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
  UserPlus,
  MapPin,
  Mail,
  Phone,
  X,
} from "lucide-react";
import tactivoLogo from "../assets/tactivo-logo.png";
import teamBackground from "../assets/tactivo-team.jpg";

const STORAGE_KEY = "tactivo-safety-workspace-v1";
const ROLE_KEY = "tactivo-safety-role-v1";
const AUDIT_KEY = "tactivo-safety-audit-v1";
const ROLES = {
  admin: { label: "Workspace admin", generateInspectionReport: true, downloadInspectionReport: true, canEditDirectory: true },
  safety_manager: { label: "Safety manager", generateInspectionReport: true, downloadInspectionReport: true, canEditDirectory: true },
  supervisor: { label: "Site supervisor", generateInspectionReport: true, downloadInspectionReport: false, canEditDirectory: false },
  viewer: { label: "Read-only viewer", generateInspectionReport: false, downloadInspectionReport: false, canEditDirectory: false },
};
const EMPTY_FORM = { title: "", site: "", owner: "", dueDate: "", description: "", severity: "Medium", status: "Open" };
const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "incidents", label: "Incidents & near misses", icon: AlertTriangle },
  { id: "inspections", label: "Inspections", icon: ClipboardCheck },
  { id: "actions", label: "Corrective actions", icon: CheckCircle2 },
  { id: "reports", label: "PDF reports", icon: FileBarChart },
  { id: "audit", label: "Audit log", icon: History },
];

function createEmptyStore() {
  return { incidents: [], inspections: [], actions: [] };
}

function loadStore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved && saved.incidents && saved.inspections && saved.actions ? saved : createEmptyStore();
  } catch {
    return createEmptyStore();
  }
}

function formatDate(value) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function statusTone(value) {
  return String(value).toLowerCase().replaceAll(" ", "-");
}


function downloadCsv(filename, headers, rows) {
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast.success(`${filename} downloaded`);
}

function loadRole() {
  const saved = localStorage.getItem(ROLE_KEY);
  return ROLES[saved] ? saved : "safety_manager";
}

function Stat({ label, value, detail, tone }) {
  return <article className={`stat-card ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function EmptyState({ icon: Icon, title, description, action }) {
  return <div className="empty-state"><Icon size={28} /><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function RecordForm({ type, initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const label = type === "incidents" ? "incident" : type === "inspections" ? "inspection" : "corrective action";
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.site.trim()) {
      toast.error("Add a title and site before saving.");
      return;
    }
    onSave({ ...form, title: form.title.trim(), site: form.site.trim(), owner: form.owner.trim() || "Unassigned", id: initial?.id || crypto.randomUUID(), updatedAt: new Date().toISOString() });
  };
  return <div className="modal-backdrop" role="presentation"><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="record-form-title">
    <div className="modal-head"><div><span className="eyebrow">TACTIVO SAFETY RECORD</span><h2 id="record-form-title">{initial ? "Edit" : "Add"} {label}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
    <form onSubmit={submit} className="record-form">
      <label>Title<input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder={type === "incidents" ? "e.g. Fuel spill near dispenser 04" : "e.g. Weekly site walk"} autoFocus /></label>
      <div className="form-columns"><label>Site<input value={form.site} onChange={(e) => update("site", e.target.value)} placeholder="Site or station name" /></label><label>Owner<input value={form.owner} onChange={(e) => update("owner", e.target.value)} placeholder="Responsible person" /></label></div>
      <div className="form-columns"><label>{type === "inspections" ? "Inspection date" : "Due date"}<input type="date" value={form.dueDate} onChange={(e) => update("dueDate", e.target.value)} /></label><label>Status<select value={form.status} onChange={(e) => update("status", e.target.value)}>{(type === "incidents" ? ["Open", "Under review", "Closed"] : type === "inspections" ? ["Planned", "In progress", "Complete"] : ["Open", "In progress", "Complete"]).map((item) => <option key={item}>{item}</option>)}</select></label></div>
      {type !== "inspections" && <label>Severity<select value={form.severity} onChange={(e) => update("severity", e.target.value)}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label>}
      <label>Notes<textarea value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Describe the observation, control, or next step" rows="4" /></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button"><CheckCircle2 size={16} /> Save record</button></div>
    </form>
  </div></div>;
}

function RecordTable({ type, records, onEdit, onDelete, onAdd }) {
  const title = type === "incidents" ? "Incidents & near misses" : type === "inspections" ? "Safety inspections" : "Corrective actions";
  const description = type === "incidents" ? "Capture events, near misses, and operational hazards before they become repeat problems." : type === "inspections" ? "Plan and track site walks across fuel systems, equipment, people, and controls." : "Assign ownership and close the loop on every safety improvement.";
  return <section className="workspace-panel"><div className="panel-heading"><div><span className="eyebrow">SAFETY OPERATIONS</span><h2>{title}</h2><p>{description}</p></div><button className="primary-button" onClick={onAdd}><Plus size={17} /> Add record</button></div>{records.length === 0 ? <EmptyState icon={type === "incidents" ? AlertTriangle : type === "inspections" ? ClipboardCheck : CheckCircle2} title={`No ${title.toLowerCase()} yet`} description="Start with a real record from your operation. New items will stay saved in this browser." action={<button className="secondary-button" onClick={onAdd}><Plus size={15} /> Create first record</button>} /> : <div className="table-wrap"><table><thead><tr><th>Record</th><th>Site</th><th>Owner</th><th>Date</th><th>Status</th><th aria-label="Actions" /></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><strong>{record.title}</strong><span>{record.description || "No notes added"}</span></td><td>{record.site}</td><td>{record.owner}</td><td>{formatDate(record.dueDate)}</td><td><span className={`status-badge ${statusTone(record.status)}`}>{record.status}</span></td><td><div className="row-actions"><button className="icon-button" onClick={() => onEdit(record)} aria-label={`Edit ${record.title}`}><Pencil size={15} /></button><button className="icon-button danger" onClick={() => onDelete(record.id)} aria-label={`Delete ${record.title}`}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>}</section>;
}

function Dashboard({ store, goTo, onAdd, role }) {
  const allRecords = [...store.incidents, ...store.inspections, ...store.actions];
  const managerView = ["admin", "safety_manager"].includes(role);
  const openIncidents = store.incidents.filter((item) => item.status !== "Closed").length;
  const urgent = store.incidents.filter((item) => ["High", "Critical"].includes(item.severity) && item.status !== "Closed").length;
  const openActions = store.actions.filter((item) => item.status !== "Complete").length;
  const completeInspections = store.inspections.filter((item) => item.status === "Complete").length;
  const dueInspections = store.inspections.filter((item) => ["Planned", "In progress"].includes(item.status)).length;
  const assignedActions = store.actions.filter((item) => item.owner && item.owner !== "Unassigned" && item.status !== "Complete").length;
  const overdueActions = store.actions.filter((item) => item.status !== "Complete" && item.dueDate && new Date(`${item.dueDate}T23:59:59`) < new Date()).length;
  const readiness = store.inspections.length ? Math.round((completeInspections / store.inspections.length) * 100) : 0;
  const viewLabel = managerView ? "Manager view" : "Technician view";
  return <div className={`role-dashboard ${managerView ? "manager-dashboard" : "technician-dashboard"}`}><section className="hero-banner" style={{ backgroundImage: `linear-gradient(105deg, rgba(15,37,47,.96), rgba(15,37,47,.77)), url(${teamBackground})` }}><div><span className="hero-kicker"><ShieldCheck size={15} /> TACTIVO TECHNOLOGIES · LUSAKA</span><div className="dashboard-view-badge">{viewLabel}</div><h2>{managerView ? "Lead safer operations." : "Make the next safe move."}<br /><em>{managerView ? "See the whole system." : "Close the control loop."}</em></h2><p>{managerView ? "Monitor operational exposure, inspection readiness, and accountable follow-through across fuel, IT, and security operations." : "Focus on the work in front of you: capture hazards, complete checks, and keep corrective actions moving from the field."}</p><div className="hero-actions"><button className="primary-button" onClick={() => onAdd("incidents")}><Plus size={16} /> {managerView ? "Log an incident" : "Report a hazard"}</button><button className="text-button" onClick={() => goTo(managerView ? "reports" : "inspections")}>{managerView ? "Open safety reports" : "Start an inspection"} <ClipboardCheck size={16} /></button></div></div><div className="hero-visual"><div className="hero-stat"><strong>{managerView ? urgent : dueInspections}</strong><span>{managerView ? "high-risk items" : "checks in progress"}</span></div><div className="hero-orbit" /></div></section><div className="section-heading"><div><span className="eyebrow">{managerView ? "MANAGEMENT SAFETY PICTURE" : "FIELD SAFETY PICTURE"}</span><h2>{managerView ? "What needs leadership attention" : "What needs action now"}</h2></div><span className="data-note"><span className="live-dot" /> {viewLabel}</span></div><section className="stat-grid">{managerView ? <><Stat label="Open incidents" value={openIncidents} detail={`${urgent} high or critical`} tone="coral" /><Stat label="Overdue actions" value={overdueActions} detail={`${openActions} total still open`} tone="amber" /><Stat label="Inspection readiness" value={`${readiness}%`} detail={`${completeInspections} of ${store.inspections.length} complete`} tone="mint" /><Stat label="Records captured" value={allRecords.length} detail="Across this workspace" tone="blue" /></> : <><Stat label="Checks to complete" value={dueInspections} detail={`${completeInspections} inspections complete`} tone="mint" /><Stat label="Open hazards" value={openIncidents} detail={`${urgent} high or critical`} tone="coral" /><Stat label="My open actions" value={assignedActions} detail="Assigned follow-through" tone="amber" /><Stat label="Safety records" value={allRecords.length} detail="Captured by the team" tone="blue" /></>}</section><section className="dashboard-grid"><div className="workspace-panel"><div className="panel-heading compact"><div><span className="eyebrow">{managerView ? "LEADERSHIP ACTIONS" : "FIELD ACTIONS"}</span><h2>{managerView ? "Run the safety rhythm" : "Keep the site moving safely"}</h2></div><BarChart3 size={21} /></div><div className="quick-actions"><button onClick={() => onAdd(managerView ? "incidents" : "inspections")}>{managerView ? <AlertTriangle size={19} /> : <ClipboardCheck size={19} />}<span><strong>{managerView ? "Log an incident" : "Complete an inspection"}</strong><small>{managerView ? "Review a near miss, spill, injury, or hazard" : "Walk the station, tank, equipment, or work area"}</small></span><Plus size={17} /></button><button onClick={() => onAdd("actions")}><CheckCircle2 size={19} /><span><strong>{managerView ? "Assign corrective action" : "Update corrective action"}</strong><small>{managerView ? "Turn risk into an owned control" : "Record progress on the next control"}</small></span><Plus size={17} /></button><button onClick={() => goTo(managerView ? "audit" : "notifications")}>{managerView ? <History size={19} /> : <Bell size={19} />}<span><strong>{managerView ? "Review audit trail" : "Review safety alerts"}</strong><small>{managerView ? "Trace role and member changes" : "Stay current on workspace updates"}</small></span><span className="quick-arrow">→</span></button></div></div><div className="workspace-panel readiness-panel"><span className="eyebrow">{managerView ? "CONTROL READINESS" : "INSPECTION PROGRESS"}</span><h2>{store.inspections.length ? `${readiness}%` : "—"}</h2><p>{managerView ? "inspection completion" : "of planned checks complete"}</p><div className="progress-bar"><span style={{ width: `${readiness}%` }} /></div><button className="panel-link" onClick={() => goTo("inspections")}>View inspection register <span>→</span></button></div></section></div>;
}
function addPdfHeader(doc, title, subtitle) {
  doc.setFillColor(16, 47, 61);
  doc.rect(0, 0, 210, 34, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(19);
  doc.text("TACTIVO", 15, 15);
  doc.setFontSize(8);
  doc.text("SAFETY OPERATIONS", 15, 22);
  doc.setFontSize(15);
  doc.text(title, 195, 15, { align: "right" });
  doc.setFontSize(8);
  doc.text(subtitle, 195, 22, { align: "right" });
  doc.setTextColor(23, 49, 60);
}

function writePdfRows(doc, rows, startY) {
  let y = startY;
  rows.forEach((row, index) => {
    if (y > 272) { doc.addPage(); addPdfHeader(doc, "Safety report", "Tactivo Technologies"); y = 48; }
    if (index % 2 === 0) { doc.setFillColor(245, 249, 247); doc.rect(15, y - 5, 180, 20, "F"); }
    doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.text(String(row.title).slice(0, 43), 18, y + 2);
    doc.setFont(undefined, "normal"); doc.setFontSize(8);
    doc.text(`${row.site}  ·  ${row.owner}`, 18, y + 9);
    doc.text(`${row.status}  ·  ${formatDate(row.dueDate)}`, 195, y + 5, { align: "right" });
    doc.setTextColor(95, 115, 122); doc.text(String(row.description || "No notes added").slice(0, 82), 18, y + 15); doc.setTextColor(23, 49, 60);
    y += 23;
  });
  return y;
}

function downloadSafetyPdf(kind, store) {
  const isIncident = kind === "incidents";
  const records = isIncident ? store.incidents : store.inspections;
  const title = isIncident ? "Incident summary" : "Safety inspection register";
  const filename = isIncident ? "tactivo-incident-summary.pdf" : "tactivo-safety-inspections.pdf";
  const doc = new jsPDF();
  addPdfHeader(doc, title, `Generated ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date())}`);
  doc.setFontSize(11); doc.setFont(undefined, "bold"); doc.text("Workspace overview", 15, 50); doc.setFont(undefined, "normal");
  const complete = records.filter((record) => ["Closed", "Complete"].includes(record.status)).length;
  const high = isIncident ? records.filter((record) => ["High", "Critical"].includes(record.severity)).length : records.filter((record) => record.status === "Planned").length;
  [["Total records", records.length], [isIncident ? "High / critical" : "Planned", high], [isIncident ? "Closed" : "Complete", complete]].forEach(([label, value], index) => { const x = 15 + index * 61; doc.setFillColor(index === 1 ? 255 : 231, index === 1 ? 241 : 247, index === 1 ? 213 : 238); doc.roundedRect(x, 58, 55, 27, 3, 3, "F"); doc.setFontSize(17); doc.setFont(undefined, "bold"); doc.text(String(value), x + 6, 71); doc.setFontSize(7); doc.setFont(undefined, "normal"); doc.text(label, x + 6, 79); });
  doc.setFontSize(11); doc.setFont(undefined, "bold"); doc.text(isIncident ? "Incidents and near misses" : "Inspection records", 15, 103); doc.setFont(undefined, "normal");
  if (!records.length) { doc.setFontSize(10); doc.setTextColor(107, 125, 131); doc.text("No records have been captured in this workspace yet.", 15, 115); doc.setTextColor(23, 49, 60); } else { doc.setFillColor(16, 47, 61); doc.rect(15, 109, 180, 7, "F"); doc.setTextColor(255, 255, 255); doc.setFontSize(7); doc.text("RECORD / NOTES", 18, 114); doc.text("SITE / OWNER", 115, 114); doc.text("STATUS / DATE", 195, 114, { align: "right" }); doc.setTextColor(23, 49, 60); writePdfRows(doc, records, 126); }
  doc.setFontSize(8); doc.setTextColor(107, 125, 131); doc.text("Generated by Tactivo Technologies Safety Operations", 15, 287); doc.save(filename);
  toast.success(`${title} downloaded`);
}

function Reports({ store, role, generatedInspectionReport, onGenerateInspection, onDownloadInspection }) {
  const incidentCount = store.incidents.length;
  const inspectionCount = store.inspections.length;
  const permissions = ROLES[role];
  return <section className="reports-page"><div className="page-intro"><div><span className="eyebrow">REPORTING CENTER</span><h2>Turn safety data into evidence.</h2><p>Generate clean, shareable PDF reports from the live incidents and inspection records in this workspace.</p></div></div><div className="report-card-grid"><article className="report-card incident-report"><div className="report-card-icon"><AlertTriangle size={22} /></div><span className="eyebrow">INCIDENT MANAGEMENT</span><h3>Incident summary</h3><p>Summarises incidents and near misses with severity, ownership, status, due dates, and follow-up notes.</p><strong>{incidentCount} records ready</strong><button className="primary-button" onClick={() => downloadSafetyPdf("incidents", store)}><FileBarChart size={16} /> Download PDF</button></article><article className="report-card inspection-report"><div className="report-card-icon"><ClipboardCheck size={22} /></div><span className="eyebrow">CONTROL READINESS</span><h3>Safety inspection register</h3><p>Creates an inspection register with planned, in-progress, and completed site checks for review.</p><strong>{inspectionCount} records ready</strong><div className="report-actions">{permissions.generateInspectionReport ? <button className="primary-button" onClick={onGenerateInspection}><FileBarChart size={16} /> {generatedInspectionReport ? "Regenerate PDF" : "Generate PDF"}</button> : <button className="primary-button" disabled title="Your role cannot generate inspection reports"><FileBarChart size={16} /> Generate restricted</button>}{generatedInspectionReport && permissions.downloadInspectionReport && <button className="secondary-button" onClick={onDownloadInspection}>Download generated PDF</button>}{generatedInspectionReport && !permissions.downloadInspectionReport && <span className="permission-hint">Generation complete. Download access requires a safety manager or workspace admin.</span>}</div></article></div><div className="report-note"><ShieldCheck size={18} /><span>Your role: <strong>{permissions.label}</strong>. Inspection reports require the generate permission to prepare a report and the download permission to save it as a PDF.</span></div></section>;
}

function Sidebar({ active, setActive, open, onClose }) {
  return <><aside className={`sidebar ${open ? "open" : ""}`}><div className="brand"><img src={tactivoLogo} alt="Tactivo Technologies" /></div><div className="workspace-switcher"><span className="workspace-dot" /><div><small>Workspace</small><strong>Safety operations</strong></div><Settings2 size={15} /></div><nav><span className="nav-label">Control center</span>{NAV_ITEMS.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${active === id ? "active" : ""}`} onClick={() => { setActive(id); onClose(); }}><Icon size={18} /><span>{label}</span></button>)}<span className="nav-label secondary">Workspace</span><button className={`nav-item ${active === "people" ? "active" : ""}`} onClick={() => { setActive("people"); onClose(); }}><Users size={18} /><span>People & teams</span></button><button className={`nav-item ${active === "notifications" ? "active" : ""}`} onClick={() => { setActive("notifications"); onClose(); }}><Bell size={18} /><span>Notifications</span></button></nav><div className="sidebar-foot"><div className="help-card"><ShieldCheck size={17} /><div><strong>Safety first</strong><span>Capture the next control</span></div></div><div className="user-row"><div className="avatar">TM</div><div><strong>Team manager</strong><span>Operations workspace</span></div></div></div></aside>{open && <button className="scrim" onClick={onClose} aria-label="Close navigation" />}</>;
}


const TEAM_MEMBERS = [
  { id: "tm-01", initials: "TM", name: "Team manager", role: "Operations workspace", accessLevel: "admin", site: "Lusaka HQ", status: "Available", email: "manager@tactivo.co.zm", phone: "+260 211 000 000" },
  { id: "eh-02", initials: "EH", name: "Engineering lead", role: "Fuel infrastructure", accessLevel: "supervisor", site: "Lusaka · Field team", status: "On site", email: "engineering@tactivo.co.zm", phone: "+260 211 000 001" },
  { id: "sm-03", initials: "SM", name: "Safety manager", role: "Safety & compliance", accessLevel: "safety_manager", site: "Lusaka HQ", status: "Available", email: "safety@tactivo.co.zm", phone: "+260 211 000 002" },
  { id: "it-04", initials: "IT", name: "IT & security lead", role: "Systems and security", accessLevel: "viewer", site: "Lusaka · Support", status: "Available", email: "support@tactivo.co.zm", phone: "+260 211 000 003" },
];

function TeamDirectory({ role, onAudit, onNotify }) {
  const canEdit = ROLES[role].canEditDirectory;
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState(TEAM_MEMBERS);
  const [messages, setMessages] = useState([]);
  const [editing, setEditing] = useState(null);
  const [composing, setComposing] = useState(null);
  const [messageForm, setMessageForm] = useState({ subject: "", body: "" });
  const [loading, setLoading] = useState(true);
  const apiHeaders = { "Content-Type": "application/json", "x-user-role": role, "x-user-name": ROLES[role].label };
  useEffect(() => {
    Promise.all([fetch("/api/team-members").then((response) => response.ok ? response.json() : Promise.reject()), fetch("/api/messages").then((response) => response.ok ? response.json() : Promise.reject())])
      .then(([loadedMembers, loadedMessages]) => { setMembers(loadedMembers); setMessages(loadedMessages); })
      .catch(() => toast.info("Local PostgreSQL API is not running; showing the demo directory."))
      .finally(() => setLoading(false));
  }, []);
  const visibleMembers = members.filter((member) => `${member.name} ${member.role} ${member.site}`.toLowerCase().includes(query.toLowerCase()));
  const saveMember = async (event) => {
    event.preventDefault();
    const previous = members.find((member) => member.id === editing.id);
    const changes = ["name", "role", "accessLevel", "site", "email", "phone", "status"].filter((field) => previous[field] !== editing[field]).map((field) => ({ field, from: previous[field] || "Not set", to: editing[field] || "Not set" }));
    try {
      const response = await fetch(`/api/team-members/${editing.id}`, { method: "PATCH", headers: apiHeaders, body: JSON.stringify({ name: editing.name, memberRole: editing.role, accessLevel: editing.accessLevel, site: editing.site, status: editing.status, email: editing.email, phone: editing.phone }) });
      if (!response.ok) throw new Error("Unable to save member");
      const saved = await response.json();
      setMembers((current) => current.map((member) => member.id === saved.id ? saved : member));
      onAudit({ memberId: saved.id, memberName: saved.name, changes });
      if (changes.some((change) => ["role", "accessLevel"].includes(change.field))) onNotify({ title: "Critical access change", body: `${saved.name}: role or workspace access changed. Review the updated access immediately.`, tone: "coral" });
      setEditing(null);
      toast.success(`${saved.name} details updated in PostgreSQL`);
    } catch { toast.error("Could not save member. Start the local PostgreSQL API first."); }
  };
  const sendMessage = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch("/api/messages", { method: "POST", headers: apiHeaders, body: JSON.stringify({ recipientId: composing.id, subject: messageForm.subject, body: messageForm.body }) });
      if (!response.ok) throw new Error("Unable to send");
      const saved = await response.json();
      setMessages((current) => [{ ...saved, recipientName: composing.name }, ...current]);
      setComposing(null); setMessageForm({ subject: "", body: "" });
      toast.success(`Message sent to ${composing.name}`);
    } catch { toast.error("Could not send message. Start the local PostgreSQL API first."); }
  };
  return <section className="directory-page"><div className="page-intro"><div><span className="eyebrow">WORKSPACE DIRECTORY</span><h2>People & teams</h2><p>Keep the engineers, safety leads, IT specialists, and field teams connected to the work they own.</p></div><div className="directory-access"><span className={`access-badge ${canEdit ? "can-edit" : "read-only"}`}><ShieldCheck size={14} /> {canEdit ? "Manager edit access" : "Read-only access"}</span>{canEdit && <button className="primary-button" onClick={() => toast.info("Invite workflow is ready for your connected workspace.")}><UserPlus size={16} /> Invite team member</button>}</div></div><div className="directory-toolbar"><div className="directory-summary"><strong>{members.length}</strong><span>active workspace members {loading ? "· connecting" : "· PostgreSQL"}</span></div><label className="directory-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people or teams" /></label></div><div className="team-grid">{visibleMembers.map((member) => <article className="team-card" key={member.id}><div className="team-card-head"><div className="avatar team-avatar">{member.initials}</div><span className={`team-status ${member.status === "On site" ? "onsite" : "available"}`}><span />{member.status}</span></div><h3>{member.name}</h3><p className="team-role">{member.role}</p><p className="team-detail"><MapPin size={14} /> {member.site}</p><p className="team-detail"><Mail size={14} /> {member.email}</p><p className="team-detail"><Phone size={14} /> {member.phone}</p><div className="team-card-actions"><button className="secondary-button" onClick={() => { setComposing(member); setMessageForm({ subject: "", body: "" }); }}><Mail size={14} /> Message</button>{canEdit ? <button className="icon-button" onClick={() => setEditing({ ...member })} aria-label={`Edit ${member.name}`}><Pencil size={16} /></button> : <span className="permission-lock"><ShieldCheck size={14} /> View only</span>}</div></article>)}</div>{visibleMembers.length === 0 && <EmptyState icon={Users} title="No team members found" description="Try a different name, team, or site." />}<section className="message-history"><div className="panel-heading"><div><span className="eyebrow">POSTGRESQL MESSAGE HISTORY</span><h2>Recent messages</h2><p>Messages sent from this workspace are stored locally in PostgreSQL.</p></div><Mail size={21} /></div>{messages.length ? <div className="message-list">{messages.map((message) => <article className="message-row" key={message.id}><div><strong>{message.subject}</strong><span>To {message.recipientName || message.recipientId} · {message.senderName || "Workspace user"}</span></div><small>{message.createdAt ? formatDate(message.createdAt.slice(0, 10)) : "Just now"}</small></article>)}</div> : <p className="message-empty">No messages sent yet.</p>}</section>{editing && <div className="modal-backdrop" role="presentation"><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="edit-member-title"><div className="modal-head"><div><span className="eyebrow">MANAGER CONTROL</span><h2 id="edit-member-title">Edit member details</h2></div><button className="icon-button" onClick={() => setEditing(null)} aria-label="Close"><X size={18} /></button></div><form className="record-form" onSubmit={saveMember}><label>Name<input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} required /></label><div className="form-columns"><label>Role<input value={editing.role} onChange={(event) => setEditing({ ...editing, role: event.target.value })} required /></label><label>Workspace access<select value={editing.accessLevel} onChange={(event) => setEditing({ ...editing, accessLevel: event.target.value })}><option value="admin">Workspace admin</option><option value="safety_manager">Safety manager</option><option value="supervisor">Site supervisor</option><option value="viewer">Read-only viewer</option></select></label></div><div className="form-columns"><label>Site<input value={editing.site} onChange={(event) => setEditing({ ...editing, site: event.target.value })} required /></label><label>Status<select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value })}><option>Available</option><option>On site</option><option>Unavailable</option></select></label></div><div className="form-columns"><label>Email<input type="email" value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} required /></label><label>Phone<input value={editing.phone} onChange={(event) => setEditing({ ...editing, phone: event.target.value })} required /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="primary-button"><CheckCircle2 size={16} /> Save member</button></div></form></div></div>}{composing && <div className="modal-backdrop" role="presentation"><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="compose-message-title"><div className="modal-head"><div><span className="eyebrow">LOCAL MESSAGE</span><h2 id="compose-message-title">Message {composing.name}</h2></div><button className="icon-button" onClick={() => setComposing(null)} aria-label="Close"><X size={18} /></button></div><form className="record-form" onSubmit={sendMessage}><label>Subject<input value={messageForm.subject} onChange={(event) => setMessageForm({ ...messageForm, subject: event.target.value })} placeholder="Safety follow-up" required /></label><label>Message<textarea rows="5" value={messageForm.body} onChange={(event) => setMessageForm({ ...messageForm, body: event.target.value })} placeholder="Write a message for this team member" required /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setComposing(null)}>Cancel</button><button type="submit" className="primary-button"><Mail size={16} /> Send message</button></div></form></div></div>}</section>;
}
function AuditLog({ entries }) {
  const exportAudit = () => downloadCsv("tactivo-audit-log.csv", ["Timestamp", "Actor", "Member", "Changed field", "Previous value", "New value"], entries.flatMap((entry) => entry.changes.length ? entry.changes.map((change) => [entry.timestamp, entry.actor, entry.memberName, change.field, change.from, change.to]) : [[entry.timestamp, entry.actor, entry.memberName, "", "", "No field values changed"]]));
  return <section className="audit-page"><div className="page-intro"><div><span className="eyebrow">CONTROL HISTORY</span><h2>Audit log</h2><p>Trace manager changes to team member details for accountability and operational review.</p></div><div className="audit-actions"><div className="audit-count"><strong>{entries.length}</strong><span>logged changes</span></div><button className="secondary-button" onClick={exportAudit} disabled={!entries.length}><FileBarChart size={15} /> Export CSV</button></div></div>{entries.length === 0 ? <EmptyState icon={History} title="No changes recorded yet" description="Manager edits to People & teams will appear here with the actor, timestamp, and changed fields." /> : <div className="audit-list">{entries.map((entry) => <article className="audit-entry" key={entry.id}><div className="audit-entry-icon"><History size={17} /></div><div className="audit-entry-main"><div className="audit-entry-top"><strong>{entry.memberName}</strong><span>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.timestamp))}</span></div><p><b>{entry.actor}</b> updated member details</p><div className="audit-changes">{entry.changes.length ? entry.changes.map((change) => <span key={change.field}><b>{change.field}</b>: {change.from} → {change.to}</span>) : <span>No field values changed</span>}</div></div></article>)}</div>}</section>;
}
function Notifications({ items, onRead, onMarkAllRead }) {
  const unread = items.filter((item) => item.unread).length;
  const exportNotifications = () => downloadCsv("tactivo-notification-history.csv", ["Time", "Title", "Message", "Type", "Read status"], items.map((item) => [item.time, item.title, item.body, item.tone, item.unread ? "Unread" : "Read"]));
  return <section className="notifications-page"><div className="page-intro"><div><span className="eyebrow">WORKSPACE UPDATES</span><h2>Notifications</h2><p>Stay close to the decisions, controls, and follow-through that keep operations safe.</p></div><div className="notification-actions"><button className="secondary-button" onClick={onMarkAllRead} disabled={!unread}><CheckCircle2 size={15} /> Mark all as read</button><button className="secondary-button" onClick={exportNotifications} disabled={!items.length}><FileBarChart size={15} /> Export CSV</button></div></div><div className="notification-summary"><strong>{unread}</strong><span>unread updates</span></div><div className="notification-list">{items.map((item) => <button className={`notification-item ${item.unread ? "unread" : ""}`} key={item.id} onClick={() => onRead(item.id)}><span className={`notification-icon ${item.tone}`}><Bell size={17} /></span><span className="notification-copy"><strong>{item.title}</strong><span>{item.body}</span><small>{item.time}</small></span>{item.unread && <span className="notification-dot" />}</button>)}</div></section>;
}

export default function Home() {
  const [store, setStore] = useState(loadStore);
  const [role, setRole] = useState(loadRole);
  const [active, setActive] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [generatedInspectionReport, setGeneratedInspectionReport] = useState(false);
  const [auditEntries, setAuditEntries] = useState(() => { try { return JSON.parse(localStorage.getItem(AUDIT_KEY)) || []; } catch { return []; } });
  const [notifications, setNotifications] = useState(() => { try { return JSON.parse(localStorage.getItem("tactivo-safety-notifications-v1")) || [{ id: "n-01", title: "Safety workspace is ready", body: "Capture incidents, inspections, and corrective actions as work happens.", time: "Just now", unread: true, tone: "mint" }, { id: "n-02", title: "Keep controls accountable", body: "Assign an owner and due date to every corrective action.", time: "Today", unread: true, tone: "amber" }, { id: "n-03", title: "Reporting reminder", body: "Inspection registers help teams turn field activity into evidence.", time: "Yesterday", unread: false, tone: "blue" }]; } catch { return []; } });
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(store)), [store]);
  useEffect(() => localStorage.setItem(ROLE_KEY, role), [role]);
  useEffect(() => localStorage.setItem(AUDIT_KEY, JSON.stringify(auditEntries)), [auditEntries]);
  useEffect(() => localStorage.setItem("tactivo-safety-notifications-v1", JSON.stringify(notifications)), [notifications]);
  const records = active === "incidents" ? store.incidents : active === "inspections" ? store.inspections : store.actions;
  const filteredRecords = useMemo(() => records.filter((item) => `${item.title} ${item.site} ${item.owner}`.toLowerCase().includes(search.toLowerCase())), [records, search]);
  const recordAudit = (change) => setAuditEntries((current) => [{ id: crypto.randomUUID(), actor: ROLES[role].label, timestamp: new Date().toISOString(), ...change }, ...current].slice(0, 250));
  const addNotification = (notification) => setNotifications((current) => [{ id: crypto.randomUUID(), time: "Just now", unread: true, ...notification }, ...current].slice(0, 100));
  const readNotification = (id) => setNotifications((current) => current.map((item) => item.id === id ? { ...item, unread: false } : item));
  const markAllNotificationsRead = () => setNotifications((current) => current.map((item) => ({ ...item, unread: false })));
  const saveRecord = (type, record) => { setStore((current) => ({ ...current, [type]: current[type].some((item) => item.id === record.id) ? current[type].map((item) => item.id === record.id ? record : item) : [record, ...current[type]] })); setModal(null); toast.success("Safety record saved"); };
  const deleteRecord = (type, id) => { if (!window.confirm("Delete this safety record? This cannot be undone.")) return; setStore((current) => ({ ...current, [type]: current[type].filter((item) => item.id !== id) })); toast.success("Record deleted"); };
  const openForm = (type, record = null) => setModal({ type, record });
  const generateInspectionReport = () => { if (!ROLES[role].generateInspectionReport) { toast.error("Your role cannot generate inspection reports."); return; } setGeneratedInspectionReport(true); toast.success("Inspection report generated and ready for download"); };
  const downloadInspectionReport = () => { if (!ROLES[role].downloadInspectionReport) { toast.error("Your role cannot download inspection reports."); return; } downloadSafetyPdf("inspections", store); };
  const pageTitle = active === "dashboard" ? "Good morning, safety team" : active === "people" ? "People & teams" : active === "notifications" ? "Notifications" : NAV_ITEMS.find((item) => item.id === active)?.label;
  return <div className="app-shell"><Sidebar active={active} setActive={setActive} open={menuOpen} onClose={() => setMenuOpen(false)} /><main className="main-content"><header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={21} /></button><div><span className="eyebrow">TACTIVO OPS / SAFETY WORKSPACE</span><h1>{pageTitle}</h1></div><div className="topbar-actions"><label className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search records" aria-label="Search records" /></label><label className="role-picker"><span>Role</span><select value={role} onChange={(e) => { setRole(e.target.value); setGeneratedInspectionReport(false); }} aria-label="Active user role">{Object.entries(ROLES).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></label><div className="avatar">TM</div></div></header><div className="page-content">{active === "dashboard" ? <Dashboard store={store} goTo={setActive} onAdd={openForm} role={role} /> : active === "reports" ? <Reports store={store} role={role} generatedInspectionReport={generatedInspectionReport} onGenerateInspection={generateInspectionReport} onDownloadInspection={downloadInspectionReport} /> : active === "people" ? <TeamDirectory role={role} onAudit={recordAudit} onNotify={addNotification} /> : active === "audit" ? <AuditLog entries={auditEntries} /> : active === "notifications" ? <Notifications items={notifications} onRead={readNotification} onMarkAllRead={markAllNotificationsRead} /> : <RecordTable type={active} records={filteredRecords} onAdd={() => openForm(active)} onEdit={(record) => openForm(active, record)} onDelete={(id) => deleteRecord(active, id)} />}</div><footer className="app-footer"><span><span className="live-dot" /> Local workspace saved in this browser</span><span>Tactivo Technologies · Safety, control, accountability</span></footer></main>{modal && <RecordForm type={modal.type} initial={modal.record} onClose={() => setModal(null)} onSave={(record) => saveRecord(modal.type, record)} />}</div>;
}
