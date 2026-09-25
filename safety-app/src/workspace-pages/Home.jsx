import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Smile,
  Sun,
  Trash2,
  Users,
  UserPlus,
  MapPin,
  Mail,
  Phone,
  X,
} from "lucide-react";
import teamBackground from "../assets/tactivo-team.jpg";

const STORAGE_KEY = "tactivo-safety-workspace-v1";
const AUDIT_KEY = "tactivo-safety-audit-v1";
const ROLES = {
  admin: { label: "Workspace admin", generateInspectionReport: true, downloadInspectionReport: true, canEditDirectory: true },
  safety_manager: { label: "Safety officer / manager", generateInspectionReport: true, downloadInspectionReport: true, canEditDirectory: true },
  supervisor: { label: "Site supervisor", generateInspectionReport: true, downloadInspectionReport: false, canEditDirectory: false },
  technician: { label: "Field technician", generateInspectionReport: false, downloadInspectionReport: false, canEditDirectory: false },
  viewer: { label: "Read-only viewer", generateInspectionReport: false, downloadInspectionReport: false, canEditDirectory: false },
};
const SIDEBAR_KEY = "tactivo-sidebar-collapsed";
const STATUS_OPTIONS = {
  incidents: ["Open", "Under review", "Closed"],
  inspections: ["Planned", "In progress", "Complete"],
  actions: ["Open", "In progress", "Complete"],
};
const SEVERITY_OPTIONS = ["Low", "Medium", "High", "Critical"];
const SEVERITY_RANK = { Low: 1, Medium: 2, High: 3, Critical: 4 };
const CLOSED_STATUSES = ["Closed", "Complete"];
const DUE_SOON_DAYS = 3;
const EMPTY_FORM = { title: "", site: "", owner: "", dueDate: "", description: "", severity: "Medium", status: "Open" };
const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "incidents", label: "Incidents & near misses", icon: AlertTriangle },
  { id: "inspections", label: "Inspections", icon: ClipboardCheck },
  { id: "actions", label: "Corrective actions", icon: CheckCircle2 },
  { id: "reports", label: "PDF reports", icon: FileBarChart },
  { id: "audit", label: "Audit log", icon: History },
  { id: "messages", label: "Team messages", icon: Mail },
];

function createEmptyStore() {
  return { incidents: [], inspections: [], actions: [] };
}

function normalizeRecord(record) {
  return { ...record, dueDate: toDateKey(record?.dueDate) };
}

function normalizeStore(store) {
  return {
    incidents: store.incidents.map(normalizeRecord),
    inspections: store.inspections.map(normalizeRecord),
    actions: store.actions.map(normalizeRecord),
  };
}

// Records cached in localStorage by an earlier session may hold full ISO timestamps
// (the API used to return them for DATE columns), so every load path normalises them.
function loadStore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved && saved.incidents && saved.inspections && saved.actions ? normalizeStore(saved) : createEmptyStore();
  } catch {
    return createEmptyStore();
  }
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const pad2 = (number) => String(number).padStart(2, "0");

// Converts a plain "YYYY-MM-DD" string, an ISO timestamp, or a Date into "YYYY-MM-DD"
// (using the viewer's local calendar day). Returns "" for empty or unparseable input.
function toDateKey(value) {
  if (!value) return "";
  if (typeof value === "string" && DATE_KEY.test(value.trim())) return value.trim();
  const parsed = value instanceof Date ? value : new Date(String(value).trim());
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
}

// Parses a date-only value as a local calendar day; rejects impossible dates like 2026-02-31.
function parseDateKey(value) {
  const key = toDateKey(value);
  if (!key) return null;
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function formatDate(value) {
  if (!value) return "No date";
  const date = parseDateKey(value);
  if (!date) return "Invalid date";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function daysUntilDue(value) {
  const due = parseDateKey(value);
  if (!due) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due - today) / 86400000);
}

// Returns null for closed/complete records and records without a usable date.
function dueState(record) {
  if (!record || CLOSED_STATUSES.includes(record.status)) return null;
  const days = daysUntilDue(record.dueDate);
  if (days === null) return null;
  if (days < 0) return { key: "overdue", label: days === -1 ? "Overdue by 1 day" : `Overdue by ${-days} days`, days };
  if (days === 0) return { key: "due-soon", label: "Due today", days };
  if (days <= DUE_SOON_DAYS) return { key: "due-soon", label: days === 1 ? "Due tomorrow" : `Due in ${days} days`, days };
  return null;
}

function statusTone(value) {
  return String(value).toLowerCase().replaceAll(" ", "-");
}


function downloadCsv(filename, headers, rows) {
  const escape = (value) => {
    let text = String(value ?? "");
    // Stop Excel/Sheets from running user-entered text such as "=HYPERLINK(...)" as a formula.
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
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

function Stat({ label, value, detail, tone }) {
  return <article className={`stat-card ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function EmptyState({ icon: Icon, title, description, action }) {
  return <div className="empty-state"><Icon size={28} /><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function RecordForm({ type, initial, onSave, onClose }) {
  const [form, setForm] = useState(initial ? normalizeRecord(initial) : EMPTY_FORM);
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
      <div className="form-columns"><label>{type === "inspections" ? "Inspection date" : "Due date"}<input type="date" value={form.dueDate} onChange={(e) => update("dueDate", e.target.value)} /></label><label>Status<select value={form.status} onChange={(e) => update("status", e.target.value)}>{STATUS_OPTIONS[type].map((item) => <option key={item}>{item}</option>)}</select></label></div>
      {type !== "inspections" && <label>Severity<select value={form.severity} onChange={(e) => update("severity", e.target.value)}>{SEVERITY_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select></label>}
      <label>Notes<textarea value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Describe the observation, control, or next step" rows="4" /></label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button"><CheckCircle2 size={16} /> Save record</button></div>
    </form>
  </div></div>;
}

function DueBadge({ record }) {
  const state = dueState(record);
  if (!state) return null;
  return <span className={`due-badge ${state.key}`}>{state.label}</span>;
}

const DEFAULT_FILTERS = { status: "all", severity: "all", site: "all", due: "all" };

function RecordTable({ type, records, onEdit, onDelete, onAdd }) {
  const title = type === "incidents" ? "Incidents & near misses" : type === "inspections" ? "Safety inspections" : "Corrective actions";
  const description = type === "incidents" ? "Capture events, near misses, and operational hazards before they become repeat problems." : type === "inspections" ? "Plan and track site walks across fuel systems, equipment, people, and controls." : "Assign ownership and close the loop on every safety improvement.";
  const hasSeverity = type !== "inspections";
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState({ key: null, direction: "asc" });

  const sites = useMemo(() => [...new Set(records.map((record) => record.site).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [records]);
  // A site filter can point at a site whose last record was just deleted or renamed; treat that as "all".
  const activeSite = sites.includes(filters.site) ? filters.site : "all";
  const filtersActive = filters.status !== "all" || (hasSeverity && filters.severity !== "all") || activeSite !== "all" || filters.due !== "all";

  const visible = useMemo(() => {
    const matching = records.filter((record) => {
      if (filters.status !== "all" && record.status !== filters.status) return false;
      if (hasSeverity && filters.severity !== "all" && record.severity !== filters.severity) return false;
      if (activeSite !== "all" && record.site !== activeSite) return false;
      if (filters.due !== "all" && dueState(record)?.key !== filters.due) return false;
      return true;
    });
    if (!sort.key) return matching;
    const direction = sort.direction === "asc" ? 1 : -1;
    const valueOf = (record) => sort.key === "severity" ? SEVERITY_RANK[record.severity] || 0 : sort.key === "dueDate" ? toDateKey(record.dueDate) : String(record[sort.key] ?? "").toLowerCase();
    return [...matching].sort((a, b) => {
      const left = valueOf(a);
      const right = valueOf(b);
      // Records without a date always sink to the bottom, whichever way the column is sorted.
      if (sort.key === "dueDate" && (!left || !right)) return !left && !right ? 0 : !left ? 1 : -1;
      return left < right ? -direction : left > right ? direction : 0;
    });
  }, [records, filters, activeSite, hasSeverity, sort]);

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const toggleSort = (key) => setSort((current) => current.key !== key ? { key, direction: "asc" } : current.direction === "asc" ? { key, direction: "desc" } : { key: null, direction: "asc" });
  const columns = [
    { key: "title", label: "Record" },
    { key: "site", label: "Site" },
    { key: "owner", label: "Owner" },
    ...(hasSeverity ? [{ key: "severity", label: "Severity" }] : []),
    { key: "dueDate", label: "Date" },
    { key: "status", label: "Status" },
  ];
  const exportCsv = () => downloadCsv(
    `tactivo-${type}-${toDateKey(new Date())}.csv`,
    ["Title", "Site", "Owner", ...(hasSeverity ? ["Severity"] : []), type === "inspections" ? "Inspection date" : "Due date", "Status", "Due alert", "Notes"],
    visible.map((record) => ["title", "site", "owner"].map((key) => record[key]).concat(hasSeverity ? [record.severity] : [], [toDateKey(record.dueDate), record.status, dueState(record)?.label || "", record.description || ""])),
  );

  return <section className="workspace-panel">
    <div className="panel-heading"><div><span className="eyebrow">SAFETY OPERATIONS</span><h2>{title}</h2><p>{description}</p></div><button className="primary-button" onClick={onAdd}><Plus size={17} /> Add record</button></div>
    {records.length === 0 ? <EmptyState icon={type === "incidents" ? AlertTriangle : type === "inspections" ? ClipboardCheck : CheckCircle2} title={`No ${title.toLowerCase()} yet`} description="Start with a real record from your operation. New items will stay saved in this browser." action={<button className="secondary-button" onClick={onAdd}><Plus size={15} /> Create first record</button>} /> : <>
      <div className="table-toolbar" role="group" aria-label="Filter records">
        <label className="filter-field"><span>Status</span><select value={filters.status} onChange={(e) => setFilter("status", e.target.value)}><option value="all">All statuses</option>{STATUS_OPTIONS[type].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        {hasSeverity && <label className="filter-field"><span>Severity</span><select value={filters.severity} onChange={(e) => setFilter("severity", e.target.value)}><option value="all">All severities</option>{SEVERITY_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}
        <label className="filter-field"><span>Site</span><select value={activeSite} onChange={(e) => setFilter("site", e.target.value)}><option value="all">All sites</option>{sites.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="filter-field"><span>Timing</span><select value={filters.due} onChange={(e) => setFilter("due", e.target.value)}><option value="all">Any timing</option><option value="overdue">Overdue</option><option value="due-soon">Due soon</option></select></label>
        {filtersActive && <button type="button" className="text-button clear-filters" onClick={() => setFilters(DEFAULT_FILTERS)}><X size={13} /> Clear filters</button>}
        <span className="toolbar-spacer" />
        <button type="button" className="secondary-button" onClick={exportCsv} disabled={visible.length === 0}><Download size={15} /> Export CSV</button>
      </div>
      <p className="table-count" role="status">Showing {visible.length} of {records.length} {records.length === 1 ? "record" : "records"}</p>
      {visible.length === 0 ? <div className="empty-state inline-empty"><h3>No records match these filters</h3><p>Try a different combination, or clear the filters to see everything.</p><button type="button" className="secondary-button" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</button></div> : <div className="table-wrap"><table><thead><tr>
        {columns.map((column) => <th key={column.key} aria-sort={sort.key === column.key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}><button type="button" className="sort-button" onClick={() => toggleSort(column.key)}>{column.label}{sort.key === column.key ? (sort.direction === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="sort-idle" />}</button></th>)}
        <th aria-label="Actions" />
      </tr></thead><tbody>{visible.map((record) => <tr key={record.id}>
        <td><strong>{record.title}</strong><span>{record.description || "No notes added"}</span></td>
        <td>{record.site}</td>
        <td>{record.owner}</td>
        {hasSeverity && <td><span className={`severity-badge ${String(record.severity).toLowerCase()}`}>{record.severity || "Not set"}</span></td>}
        <td><span>{formatDate(record.dueDate)}</span><DueBadge record={record} /></td>
        <td><span className={`status-badge ${statusTone(record.status)}`}>{record.status}</span></td>
        <td><div className="row-actions"><button className="icon-button" onClick={() => onEdit(record)} aria-label={`Edit ${record.title}`}><Pencil size={15} /></button><button className="icon-button danger" onClick={() => onDelete(record)} aria-label={`Delete ${record.title}`}><Trash2 size={15} /></button></div></td>
      </tr>)}</tbody></table></div>}
    </>}
  </section>;
}

function ConfirmDialog({ title, message, confirmLabel, busy, onConfirm, onCancel }) {
  const dialogRef = useRef(null);
  const latest = useRef({ busy, onCancel });
  latest.current = { busy, onCancel };
  useEffect(() => {
    const opener = document.activeElement;
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll("button:not([disabled])") || []);
    dialogRef.current?.querySelector("[data-autofocus]")?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !latest.current.busy) { event.preventDefault(); latest.current.onCancel(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); if (opener && document.contains(opener)) opener.focus(); };
  }, []);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <div className="modal-card confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" ref={dialogRef}>
      <div className="confirm-icon"><Trash2 size={20} /></div>
      <h2 id="confirm-title">{title}</h2>
      <p id="confirm-message">{message}</p>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel} disabled={busy} data-autofocus>Cancel</button><button type="button" className="danger-button" onClick={onConfirm} disabled={busy}>{busy ? "Deleting…" : confirmLabel}</button></div>
    </div>
  </div>;
}

function Dashboard({ store, goTo, onAdd, role }) {
  const allRecords = [...store.incidents, ...store.inspections, ...store.actions];
  const managerView = ["admin", "safety_manager"].includes(role);
  const openIncidents = store.incidents.filter((item) => item.status !== "Closed").length;
  const urgent = store.incidents.filter((item) => ["High", "Critical"].includes(item.severity) && item.status !== "Closed").length;
  const openActions = store.actions.filter((item) => item.status !== "Complete").length;
  const completeInspections = store.inspections.filter((item) => item.status === "Complete").length;
  const dueInspections = store.inspections.filter((item) => ["Planned", "In progress"].includes(item.status)).length;
  const overdueActions = store.actions.filter((item) => dueState(item)?.key === "overdue").length;
  const readiness = store.inspections.length ? Math.round((completeInspections / store.inspections.length) * 100) : 0;
  const closedRecords = allRecords.filter((item) => CLOSED_STATUSES.includes(item.status)).length;
  const safeRate = allRecords.length ? Math.round((closedRecords / allRecords.length) * 100) : 100;
  const siteNames = [...new Set(allRecords.map((item) => item.site).filter(Boolean))];
  const siteRows = siteNames.slice(0, 5).map((site) => {
    const records = allRecords.filter((item) => item.site === site);
    const risks = records.filter((item) => ["High", "Critical"].includes(item.severity) && !CLOSED_STATUSES.includes(item.status)).length;
    return { site, risks, score: Math.max(0, 100 - risks * 18 - records.filter((item) => !CLOSED_STATUSES.includes(item.status)).length * 3) };
  });
  const trend = [34, 58, 46, 70, 62, 79, 73, 88, 81, 94];
  const maxTrend = Math.max(...trend);
  return <div className="compliance-dashboard">
    <section className="dashboard-heading"><div><span className="eyebrow">TACTIVO SAFETY OPERATIONS</span><h2>Compliance dashboard</h2><p>Live safety performance across incidents, inspections, and corrective actions.</p></div><div className="dashboard-heading-actions"><span className="dashboard-date">{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date())}</span><button className="secondary-button" onClick={() => goTo("reports")}><FileBarChart size={15} /> Reports</button><button className="primary-button" onClick={() => onAdd("incidents")}><Plus size={15} /> Add record</button></div></section>
    <section className="compliance-kpis">
      <article className="compliance-kpi"><span className="kpi-label"><ShieldCheck size={14} /> Safety score</span><strong>{safeRate}%</strong><small><span className="trend-up">↑ 6.4%</span> vs last period</small></article>
      <article className="compliance-kpi"><span className="kpi-label"><AlertTriangle size={14} /> Open incidents</span><strong>{openIncidents}</strong><small>{urgent} high or critical currently open</small></article>
      <article className="compliance-kpi"><span className="kpi-label"><ClipboardCheck size={14} /> Inspection readiness</span><strong>{readiness}%</strong><small>{completeInspections} complete · {dueInspections} in progress</small></article>
      <article className="compliance-kpi"><span className="kpi-label"><CheckCircle2 size={14} /> Actions closed</span><strong>{closedRecords}</strong><small>{overdueActions} overdue · {openActions} still open</small></article>
    </section>
    <section className="dashboard-analytics-grid">
      <article className="dashboard-panel trend-panel"><div className="dashboard-panel-head"><div><span className="eyebrow">PERFORMANCE TREND</span><h3>Average compliance score</h3></div><span className="panel-period">Last 10 periods</span></div><div className="trend-chart" aria-label="Average compliance score trend">{trend.map((value, index) => <div className="trend-column" key={`${value}-${index}`}><span style={{ height: `${(value / maxTrend) * 100}%` }} /><small>{index % 2 === 0 ? `P${index + 1}` : ""}</small></div>)}</div><div className="chart-legend"><span><i className="legend-dot green" /> Average weighted score</span><button className="panel-link" onClick={() => goTo("reports")}>View reports <span>→</span></button></div></article>
      <article className="dashboard-panel site-panel"><div className="dashboard-panel-head"><div><span className="eyebrow">SITE RISK</span><h3>Latest grade by site</h3></div><MapPin size={18} /></div>{siteRows.length ? <div className="site-list">{siteRows.map((row) => <div className="site-row" key={row.site}><span className="site-grade">{row.score >= 80 ? "A" : row.score >= 60 ? "B" : "C"}</span><strong>{row.site}</strong><span className="site-score">{row.score}%</span></div>)}</div> : <div className="dashboard-empty">Add records with a site to see risk by location.</div>}<button className="panel-link" onClick={() => goTo("people")}>Open site directory <span>→</span></button></article>
    </section>
    <section className="dashboard-lower-grid">
      <article className="dashboard-panel distribution-panel"><div className="dashboard-panel-head"><div><span className="eyebrow">RECORD DISTRIBUTION</span><h3>Current safety workload</h3></div><BarChart3 size={18} /></div><div className="distribution-row"><span>Incidents & near misses</span><div><i style={{ width: `${allRecords.length ? Math.max(8, (store.incidents.length / allRecords.length) * 100) : 8}%` }} /></div><strong>{store.incidents.length}</strong></div><div className="distribution-row"><span>Inspections</span><div><i style={{ width: `${allRecords.length ? Math.max(8, (store.inspections.length / allRecords.length) * 100) : 8}%` }} /></div><strong>{store.inspections.length}</strong></div><div className="distribution-row"><span>Corrective actions</span><div><i style={{ width: `${allRecords.length ? Math.max(8, (store.actions.length / allRecords.length) * 100) : 8}%` }} /></div><strong>{store.actions.length}</strong></div><button className="panel-link" onClick={() => goTo(managerView ? "audit" : "notifications")}>{managerView ? "Review audit activity" : "Review safety alerts"} <span>→</span></button></article>
      <article className="dashboard-panel severity-panel"><div className="dashboard-panel-head"><div><span className="eyebrow">OPEN FINDINGS</span><h3>Findings by severity</h3></div><AlertTriangle size={18} /></div><div className="severity-summary"><div className="severity-ring"><strong>{urgent}</strong><small>priority</small></div><div className="severity-list"><span><i className="severity-dot critical" /> Critical <b>{store.incidents.filter((item) => item.severity === "Critical" && item.status !== "Closed").length}</b></span><span><i className="severity-dot high" /> High <b>{store.incidents.filter((item) => item.severity === "High" && item.status !== "Closed").length}</b></span><span><i className="severity-dot medium" /> Medium <b>{store.incidents.filter((item) => item.severity === "Medium" && item.status !== "Closed").length}</b></span></div></div><button className="panel-link" onClick={() => goTo("incidents")}>Open incident register <span>→</span></button></article>
    </section>
  </div>;
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

const WORKSPACE_NAV_ITEMS = [
  { id: "people", label: "People & teams", icon: Users },
  { id: "notifications", label: "Notifications", icon: Bell },
];

function Sidebar({ active, setActive, open, onClose, collapsed, onToggleCollapsed }) {
  const renderItem = ({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${active === id ? "active" : ""}`} data-tip={label} aria-current={active === id ? "page" : undefined} onClick={() => { setActive(id); onClose(); }}><Icon size={18} /><span className="nav-text">{label}</span></button>;
  return <>
    <aside className={`sidebar ${open ? "open" : ""} ${collapsed ? "collapsed" : ""}`}>
      <div className="brand"><img className="t-logo-image" src="/tactivo-t-mark.png" alt="Tactivo" /></div>
      <div className="workspace-switcher" title="Safety operations"><span className="workspace-dot" /><div><strong>Safety operations</strong></div><Settings2 size={15} /></div>
      <nav aria-label="Main">
        <span className="nav-label">Control center</span>
        {NAV_ITEMS.map(renderItem)}
        <span className="nav-label secondary" aria-hidden="true" />
        {WORKSPACE_NAV_ITEMS.map(renderItem)}
        <div className="sidebar-collapse-row"><button type="button" className="sidebar-toggle" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleCollapsed(); }} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}<span>{collapsed ? "Expand navigation" : "Collapse navigation"}</span></button></div>
      </nav>
      <div className="sidebar-foot"><div className="help-card"><ShieldCheck size={17} /><div><strong>Safety first</strong><span>Capture the next control</span></div></div><div className="user-row"><div className="avatar">TM</div><div><strong>Team manager</strong><span>Operations workspace</span></div></div></div>
    </aside>
    {open && <button className="scrim" onClick={onClose} aria-label="Close navigation" />}
  </>;
}

// Small screens trade the off-canvas sidebar for a bottom icon bar (a deliberate
// departure from the reference design, which only showed a persistent sidebar).
// The four busiest sections get a direct icon; everything else — Inspections,
// Actions, Reports, Audit, People, Notifications — lives behind "More", which
// simply reopens the existing sidebar drawer so we don't duplicate nav logic.
const BOTTOM_NAV_ITEMS = [
  { id: "dashboard", label: "Home", icon: LayoutDashboard },
  { id: "incidents", label: "Incidents", icon: AlertTriangle },
  { id: "messages", label: "Messages", icon: Mail },
  { id: "people", label: "People", icon: Users },
];

function BottomNav({ active, setActive, onOpenMore }) {
  const moreActive = !BOTTOM_NAV_ITEMS.some((item) => item.id === active);
  return <nav className="bottom-nav" aria-label="Primary">
    {BOTTOM_NAV_ITEMS.map(({ id, label, icon: Icon }) => <button key={id} className={`bottom-nav-item ${active === id ? "active" : ""}`} onClick={() => setActive(id)}>
      <span className="bottom-nav-icon"><Icon size={19} /></span><span>{label}</span>
    </button>)}
    <button className={`bottom-nav-item ${moreActive ? "active" : ""}`} onClick={onOpenMore}>
      <span className="bottom-nav-icon"><Menu size={19} /></span><span>More</span>
    </button>
  </nav>;
}


const TEAM_MEMBERS = [
  { id: "tm-01", initials: "TM", name: "Team manager", role: "Operations workspace", accessLevel: "admin", site: "Lusaka HQ", status: "Available", email: "manager@tactivo.co.zm", phone: "+260 211 000 000" },
  { id: "eh-02", initials: "EH", name: "Engineering lead", role: "Fuel infrastructure", accessLevel: "supervisor", site: "Lusaka · Field team", status: "On site", email: "engineering@tactivo.co.zm", phone: "+260 211 000 001" },
  { id: "ft-05", initials: "FT", name: "Field technician", role: "Field safety & maintenance", accessLevel: "technician", site: "Lusaka · Field team", status: "On site", email: "field.tech@tactivo.co.zm", phone: "+260 211 000 004" },
  { id: "sm-03", initials: "SM", name: "Safety manager", role: "Safety & compliance", accessLevel: "safety_manager", site: "Lusaka HQ", status: "Available", email: "safety@tactivo.co.zm", phone: "+260 211 000 002" },
  { id: "it-04", initials: "IT", name: "IT & security lead", role: "Systems and security", accessLevel: "viewer", site: "Lusaka · Support", status: "Available", email: "support@tactivo.co.zm", phone: "+260 211 000 003" },
];

const EMOJI_CATEGORIES = [
  { label: "Smileys", icon: "😀", emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🥵", "🥶", "😵", "🤯", "😎", "🥳", "😕", "😟", "🙁", "☹️", "😮", "😯", "😲", "😳", "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬"] },
  { label: "Gestures", icon: "👍", emojis: ["👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "💪", "🦾", "🖊️", "✍️", "💅", "🤳"] },
  { label: "Hearts", icon: "❤️", emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟"] },
  { label: "Work & safety", icon: "🦺", emojis: ["👷", "🦺", "⛑️", "🚧", "⚠️", "🚨", "🔧", "🛠️", "🔩", "⚙️", "🧰", "🧯", "🩹", "📋", "📝", "📸", "📎", "📌", "🗓️", "⏰", "⏱️", "✅", "❌", "❗", "❓", "💡", "🔦", "🔒", "📞", "☎️", "✉️", "📧", "💬"] },
  { label: "Objects", icon: "🎉", emojis: ["🎉", "🎊", "🎈", "🏆", "🥇", "☕", "🍵", "🍺", "🍕", "🚗", "🚚", "🚁", "✈️", "⛽", "🔥", "💧", "🌟", "⭐", "✨", "☀️", "🌧️", "⛈️", "❄️", "🌍"] },
];

function TeamDirectory({ role, user, onAudit, onNotify, members, onMembersChange, onStartConversation }) {
  const canEdit = ROLES[role].canEditDirectory;
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", role: "technician", site: "Lusaka HQ" });
  const [inviteResult, setInviteResult] = useState(null);
  const [users, setUsers] = useState([]);
  const [accounting, setAccounting] = useState(false);
  const [accountForm, setAccountForm] = useState({ name: "", email: "", password: "", role: "technician", site: "Lusaka HQ", phone: "" });
  const [loading, setLoading] = useState(true);
  const apiHeaders = { "Content-Type": "application/json" };
  useEffect(() => {
    if (!canEdit) { setLoading(false); return; }
    fetch("/api/users", { credentials: "include" }).then((response) => response.ok ? response.json() : Promise.reject()).then(setUsers).catch(() => toast.info("Local PostgreSQL API is not running; account management is unavailable.")).finally(() => setLoading(false));
  }, [canEdit]);
  const visibleMembers = members.filter((member) => `${member.name} ${member.role} ${member.site}`.toLowerCase().includes(query.toLowerCase()));
  const saveMember = async (event) => {
    event.preventDefault();
    const previous = members.find((member) => member.id === editing.id);
    const changes = ["name", "role", "accessLevel", "site", "email", "phone", "status"].filter((field) => previous[field] !== editing[field]).map((field) => ({ field, from: previous[field] || "Not set", to: editing[field] || "Not set" }));
    try {
      const response = await fetch(`/api/team-members/${editing.id}`, { method: "PATCH", credentials: "include", headers: apiHeaders, body: JSON.stringify({ name: editing.name, memberRole: editing.role, accessLevel: editing.accessLevel, site: editing.site, status: editing.status, email: editing.email, phone: editing.phone }) });
      if (!response.ok) throw new Error("Unable to save member");
      const saved = await response.json();
      onMembersChange((current) => current.map((member) => member.id === saved.id ? saved : member));
      onAudit({ memberId: saved.id, memberName: saved.name, changes });
      if (changes.some((change) => ["role", "accessLevel"].includes(change.field))) {
        if (saved.roleSynced) onNotify({ title: "Critical access change", body: `${saved.name}: role or workspace access changed. Review the updated access immediately.`, tone: "coral" });
        else toast.info(`${saved.name} has no linked login yet, so this only updates the directory listing, not real permissions.`);
      }
      setEditing(null);
      toast.success(`${saved.name} details updated in PostgreSQL`);
    } catch { toast.error("Could not save member. Start the local PostgreSQL API first."); }
  };
  const createAccount = async (event) => {
    event.preventDefault();
    try { const response = await fetch("/api/users", { method: "POST", credentials: "include", headers: apiHeaders, body: JSON.stringify(accountForm) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to create account"); setUsers((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name))); setAccounting(false); setAccountForm({ name: "", email: "", password: "", role: "supervisor", site: "Lusaka HQ", phone: "" }); toast.success(`Account created for ${data.name}`); const refreshed = await fetch("/api/team-members", { credentials: "include" }).then((r) => r.json()); onMembersChange(refreshed); } catch (error) { toast.error(error.message); }
  };
  const deleteAccount = async (account) => {
    if (!window.confirm(`Disable ${account.name}'s account? They will be signed out and unable to log in.`)) return;
    try { const response = await fetch(`/api/users/${account.id}`, { method: "DELETE", credentials: "include" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to disable account"); setUsers((current) => current.map((item) => item.id === account.id ? { ...item, status: "disabled" } : item)); onMembersChange((current) => current.map((item) => item.userId === account.id ? { ...item, status: "Account disabled", accountStatus: "disabled" } : item)); toast.success(`${account.name}'s account was disabled`); } catch (error) { toast.error(error.message); }
  };
  const inviteMember = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch("/api/invitations", { method: "POST", credentials: "include", headers: apiHeaders, body: JSON.stringify(inviteForm) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create invitation");
      setInviteResult(data);
      toast.success(`Invitation created for ${data.email}`);
    } catch (error) { toast.error(error.message); }
  };
  return <section className="directory-page"><div className="page-intro"><div><span className="eyebrow">WORKSPACE DIRECTORY</span><h2>People & teams</h2><p>Keep the engineers, safety leads, IT specialists, and field teams connected to the work they own.</p></div><div className="directory-access"><span className={`access-badge ${canEdit ? "can-edit" : "read-only"}`}><ShieldCheck size={14} /> {canEdit ? "Manager edit access" : "Read-only access"}</span>{canEdit && <><button className="primary-button" onClick={() => { setInviteResult(null); setInviting(true); }}><UserPlus size={16} /> Invite team member</button><button className="secondary-button" onClick={() => setAccounting(true)}><UserPlus size={16} /> Create account</button></>}</div></div><div className="directory-toolbar"><div className="directory-summary"><strong>{members.length}</strong><span>active workspace members {loading ? "· connecting" : "· PostgreSQL"}</span></div><label className="directory-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people or teams" /></label></div><div className="team-grid">{visibleMembers.map((member) => <article className="team-card" key={member.id}><div className="team-card-head"><div className="avatar team-avatar">{member.initials}</div><span className={`team-status ${member.status === "On site" ? "onsite" : "available"}`}><span />{member.status}</span></div><h3>{member.name}</h3><p className="team-role">{member.role}</p><p className="team-detail"><MapPin size={14} /> {member.site}</p><p className="team-detail"><Mail size={14} /> {member.email}</p><p className="team-detail"><Phone size={14} /> {member.phone}</p><div className="team-card-actions">{member.userId && member.userId !== user.id ? <button className="secondary-button" onClick={() => onStartConversation(member)}><Mail size={14} /> Message</button> : <span className="permission-lock"><Mail size={14} /> {member.userId ? "This is you" : "No login yet"}</span>}{canEdit ? <button className="icon-button" onClick={() => setEditing({ ...member })} aria-label={`Edit ${member.name}`}><Pencil size={16} /></button> : <span className="permission-lock"><ShieldCheck size={14} /> View only</span>}</div></article>)}</div>{visibleMembers.length === 0 && <EmptyState icon={Users} title="No team members found" description="Try a different name, team, or site." />}{accounting && <div className="modal-backdrop" role="presentation"><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-account-title"><div className="modal-head"><div><span className="eyebrow">MANAGER CONTROL</span><h2 id="create-account-title">Create user account</h2></div><button className="icon-button" onClick={() => setAccounting(false)} aria-label="Close"><X size={18} /></button></div><form className="record-form" onSubmit={createAccount}><label>Full name<input value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} required /></label><label>Email<input type="email" value={accountForm.email} onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })} required /></label><label>Temporary password<input type="password" minLength="8" value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} required /></label><div className="form-columns"><label>Role<select value={accountForm.role} onChange={(event) => setAccountForm({ ...accountForm, role: event.target.value })}><option value="technician">Field technician</option><option value="viewer">Read-only viewer</option><option value="supervisor">Supervisor</option><option value="safety_manager">Safety officer / manager</option>{role === "admin" && <option value="admin">Admin</option>}</select></label><label>Site<input value={accountForm.site} onChange={(event) => setAccountForm({ ...accountForm, site: event.target.value })} required /></label></div><label>Phone<input value={accountForm.phone} onChange={(event) => setAccountForm({ ...accountForm, phone: event.target.value })} /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setAccounting(false)}>Cancel</button><button type="submit" className="primary-button"><UserPlus size={16} /> Create account</button></div></form></div></div>}<section className="account-management workspace-panel"><div className="panel-heading"><div><span className="eyebrow">ACCOUNT MANAGEMENT</span><h2>Workspace accounts</h2><p>Managers can create accounts, change roles, and disable access for users.</p></div></div>{users.length ? <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead><tbody>{users.map((account) => <tr key={account.id}><td>{account.name}</td><td>{account.email}</td><td>{ROLES[account.role]?.label || account.role}</td><td>{account.status}</td><td>{account.status === "active" && account.id !== user.id && <button className="secondary-button compact-button" onClick={() => deleteAccount(account)}>Disable</button>}</td></tr>)}</tbody></table></div> : <p className="message-empty">No user accounts loaded.</p>}</section>{editing && <div className="modal-backdrop" role="presentation"><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="edit-member-title"><div className="modal-head"><div><span className="eyebrow">MANAGER CONTROL</span><h2 id="edit-member-title">Edit member details</h2></div><button className="icon-button" onClick={() => setEditing(null)} aria-label="Close"><X size={18} /></button></div><form className="record-form" onSubmit={saveMember}><label>Name<input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} required /></label><div className="form-columns"><label>Role<input value={editing.role} onChange={(event) => setEditing({ ...editing, role: event.target.value })} required /></label><label>Workspace access {!editing.userId && <em className="field-note">(no login linked — directory only)</em>}<select value={editing.accessLevel} onChange={(event) => setEditing({ ...editing, accessLevel: event.target.value })}><option value="admin">Workspace admin</option><option value="safety_manager">Safety manager</option><option value="supervisor">Site supervisor</option><option value="technician">Field technician</option><option value="viewer">Read-only viewer</option></select></label></div><div className="form-columns"><label>Site<input value={editing.site} onChange={(event) => setEditing({ ...editing, site: event.target.value })} required /></label><label>Status<select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value })}><option>Available</option><option>On site</option><option>Unavailable</option></select></label></div><div className="form-columns"><label>Email<input type="email" value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} required /></label><label>Phone<input value={editing.phone} onChange={(event) => setEditing({ ...editing, phone: event.target.value })} required /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="primary-button"><CheckCircle2 size={16} /> Save member</button></div></form></div></div>}{inviting && <div className="modal-backdrop" role="presentation"><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="invite-member-title"><div className="modal-head"><div><span className="eyebrow">POSTGRESQL INVITATION</span><h2 id="invite-member-title">Invite team member</h2></div><button className="icon-button" onClick={() => setInviting(false)} aria-label="Close"><X size={18} /></button></div>{inviteResult ? <div className="invite-result"><p>Invitation created. Share this registration token with the invitee:</p><code>{inviteResult.token}</code><p className="auth-note">They can choose “Create an account” and enter this token. It expires in 7 days.</p><div className="modal-actions"><button className="primary-button" onClick={() => setInviting(false)}>Done</button></div></div> : <form className="record-form" onSubmit={inviteMember}><label>Full name<input value={inviteForm.name} onChange={(event) => setInviteForm({ ...inviteForm, name: event.target.value })} required /></label><label>Email<input type="email" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} required /></label><div className="form-columns"><label>Role<select value={inviteForm.role} onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value })}><option value="technician">Field technician</option><option value="viewer">Read-only viewer</option><option value="supervisor">Supervisor</option><option value="safety_manager">Safety officer / manager</option>{role === "admin" && <option value="admin">Admin</option>}</select></label><label>Site<input value={inviteForm.site} onChange={(event) => setInviteForm({ ...inviteForm, site: event.target.value })} required /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setInviting(false)}>Cancel</button><button type="submit" className="primary-button"><UserPlus size={16} /> Create invitation</button></div></form>}</div></div>}</section>;
}
function timeAgo(value) {
  if (!value) return "Just now";
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}

function buildConversations(messages, members, messageableMembers) {
  const memberByUserId = new Map(members.filter((member) => member.userId).map((member) => [member.userId, member]));
  const byKey = new Map();
  // Seed every colleague with a login so they always show up in the chat list, even before any message exists.
  for (const member of messageableMembers) byKey.set(member.id, { id: member.id, teamMemberId: member.id, name: member.name, messages: [], unreadCount: 0, lastMessageAt: null });
  for (const message of messages) {
    const counterpartTeamMemberId = message.isReceived ? memberByUserId.get(message.senderUserId)?.id : message.recipientId;
    const counterpartName = message.isReceived ? message.senderName : (message.recipientName || "Unknown contact");
    const key = counterpartTeamMemberId || `name:${counterpartName}`;
    if (!byKey.has(key)) byKey.set(key, { id: key, teamMemberId: counterpartTeamMemberId || null, name: counterpartName, messages: [], unreadCount: 0, lastMessageAt: message.createdAt });
    const conversation = byKey.get(key);
    conversation.messages.push(message);
    if (message.isReceived && message.status === "sent") conversation.unreadCount += 1;
    if (!conversation.lastMessageAt || new Date(message.createdAt) > new Date(conversation.lastMessageAt)) conversation.lastMessageAt = message.createdAt;
  }
  for (const conversation of byKey.values()) conversation.messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return [...byKey.values()].sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0) || a.name.localeCompare(b.name));
}

function Messages({ user, members, messages, onSend, onMarkRead, onDeleteMessage, trashMessages, onLoadTrash, onRestoreMessage, pendingConversationId, onConsumePending }) {
  const messageableMembers = useMemo(() => members.filter((member) => member.userId && member.userId !== user.id), [members, user.id]);
  const conversations = useMemo(() => buildConversations(messages, members, messageableMembers), [messages, members, messageableMembers]);
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiTab, setEmojiTab] = useState(0);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [view, setView] = useState("chats");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const active = conversations.find((conversation) => conversation.id === activeId) || null;

  useEffect(() => { if (view === "trash") onLoadTrash(); }, [view, onLoadTrash]);

  useEffect(() => {
    if (!pendingConversationId) return;
    setActiveId(pendingConversationId);
    onConsumePending();
  }, [pendingConversationId, onConsumePending]);

  useEffect(() => {
    if (!active || !active.unreadCount) return;
    active.messages.filter((message) => message.isReceived && message.status === "sent").forEach((message) => onMarkRead(message.id));
    // Intentionally keyed on primitives (id/unreadCount), not the `active` object itself, which is a
    // fresh reference every render (recomputed from `conversations`) and would otherwise re-fire this
    // on every poll cycle even when the open thread hasn't actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.unreadCount, onMarkRead]);

  useEffect(() => { setShowEmoji(false); }, [activeId]);

  const sendChat = async (event) => {
    event.preventDefault();
    const body = draft.trim();
    if (!active?.teamMemberId || !body || sending) return;
    setSending(true);
    setSendError("");
    setShowEmoji(false);
    const previousDraft = draft;
    setDraft("");
    try {
      // The backend still stores a subject per message; a chat UI has no use for it, so it's generated
      // invisibly here rather than asking the user to type one for every message.
      const priorSubject = active.messages[active.messages.length - 1]?.subject;
      const subject = priorSubject ? (priorSubject.startsWith("Re: ") ? priorSubject : `Re: ${priorSubject}`) : (body.length > 60 ? `${body.slice(0, 57)}...` : body);
      await onSend(active.teamMemberId, subject, body);
    } catch (error) {
      setDraft(previousDraft);
      setSendError(error.message || "Could not send. Try again.");
    } finally { setSending(false); }
  };

  const totalUnread = conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const initialsOf = (name) => name.split(" ").map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const dayLabel = (value) => {
    const date = new Date(value);
    const today = new Date();
    const isSameDay = (a, b) => a.toDateString() === b.toDateString();
    if (isSameDay(date, today)) return "Today";
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (isSameDay(date, yesterday)) return "Yesterday";
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
  };

  return <section className="messages-page">
    <div className="page-intro">
      <div><span className="eyebrow">TEAM MESSAGING</span><h2>Messages</h2><p>Chat with colleagues who have a workspace login. New messages arrive here automatically within seconds.</p></div>
      <div className="view-toggle">
        <button className={view === "chats" ? "active" : ""} onClick={() => setView("chats")}><Mail size={14} /> Chats</button>
        <button className={view === "trash" ? "active" : ""} onClick={() => setView("trash")}><Trash2 size={14} /> Trash{trashMessages.length > 0 ? ` (${trashMessages.length})` : ""}</button>
      </div>
    </div>
    {messageableMembers.length === 0 && <div className="empty-state inline-note"><AlertTriangle size={18} /><p>No colleagues with a workspace login yet. Ask a manager to create accounts under People &amp; teams before you can chat.</p></div>}
    {view === "trash" ? <div className="inbox-shell trash-shell">
      {trashMessages.length === 0 ? <div className="empty-state"><Trash2 size={28} /><h3>Trash is empty</h3><p>Deleted messages show up here and can be restored any time.</p></div> : <div className="trash-list">{trashMessages.map((message) => <article className="trash-row" key={message.id}>
        <span className="avatar chat-avatar small">{initialsOf(message.isReceived ? message.senderName : (message.recipientName || "?"))}</span>
        <div className="trash-row-copy"><strong>{message.isReceived ? message.senderName : message.recipientName}</strong><span>{message.body.slice(0, 90)}</span><small>Deleted {timeAgo(message.deletedAt)}</small></div>
        <button className="secondary-button compact-button" onClick={() => onRestoreMessage(message.id)}>Restore</button>
      </article>)}</div>}
    </div> : <div className="inbox-shell">
      <div className={`inbox-list ${active ? "has-active" : ""}`}>
        <div className="inbox-list-head"><strong>Conversations</strong>{totalUnread > 0 && <span>{totalUnread} unread</span>}</div>
        {conversations.length === 0 ? <p className="message-empty">No colleagues to message yet.</p> : conversations.map((conversation) => <button key={conversation.id} className={`inbox-conversation ${activeId === conversation.id ? "active" : ""} ${conversation.unreadCount > 0 ? "unread" : ""}`} onClick={() => setActiveId(conversation.id)}>
          <span className="avatar chat-avatar medium">{initialsOf(conversation.name)}</span>
          <span className="inbox-conversation-copy"><strong>{conversation.name}</strong><span>{conversation.messages.length ? conversation.messages[conversation.messages.length - 1].body.slice(0, 48) : "No messages yet — say hello"}</span></span>
          <span className="inbox-conversation-meta">{conversation.lastMessageAt && <small>{timeAgo(conversation.lastMessageAt)}</small>}{conversation.unreadCount > 0 && <span className="unread-badge">{conversation.unreadCount}</span>}</span>
        </button>)}
      </div>
      <div className={`inbox-thread ${active ? "open" : ""}`}>
        {!active ? <div className="empty-state"><Mail size={28} /><h3>Select a colleague</h3><p>Choose someone from the list to start chatting.</p></div> : <>
          <div className="inbox-thread-head"><button className="icon-button inbox-back" onClick={() => setActiveId(null)} aria-label="Back to conversations">←</button><span className="avatar chat-avatar small">{initialsOf(active.name)}</span><div><strong>{active.name}</strong><span>{active.messages.length ? `${active.messages.length} message${active.messages.length === 1 ? "" : "s"}` : "No messages yet"}</span></div></div>
          <div className="inbox-thread-body">{active.messages.length === 0 ? <p className="message-empty">Say hello to start the conversation.</p> : active.messages.map((message, index) => {
            const previous = active.messages[index - 1];
            const showDivider = !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);
            return <Fragment key={message.id}>
              {showDivider && <div className="thread-day-divider"><span>{dayLabel(message.createdAt)}</span></div>}
              <div className={`thread-bubble-row ${message.isReceived ? "received" : "sent"}`}>
                {confirmDeleteId === message.id ? <div className="bubble-confirm">
                  <span>Delete this message?</span>
                  <button className="link-button" onClick={() => { onDeleteMessage(message.id); setConfirmDeleteId(null); }}>Delete</button>
                  <button className="link-button muted" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                </div> : <div className="thread-bubble">
                  <button className="bubble-delete" onClick={() => setConfirmDeleteId(message.id)} aria-label="Delete message"><Trash2 size={12} /></button>
                  <p>{message.body}</p>
                  <small>{new Date(message.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</small>
                </div>}
              </div>
            </Fragment>;
          })}</div>
          <form className="inbox-reply" onSubmit={sendChat}>
            <div className="inbox-reply-input">
              <textarea rows="2" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Message ${active.name}`} required />
              <button type="button" className={`emoji-toggle ${showEmoji ? "active" : ""}`} onClick={() => setShowEmoji((current) => !current)} aria-label="Insert emoji" aria-expanded={showEmoji}><Smile size={18} /></button>
              {showEmoji && <div className="emoji-picker" role="menu">
                <div className="emoji-tabs">{EMOJI_CATEGORIES.map((category, index) => <button type="button" key={category.label} className={emojiTab === index ? "active" : ""} onClick={() => setEmojiTab(index)} aria-label={category.label}>{category.icon}</button>)}</div>
                <div className="emoji-grid">{EMOJI_CATEGORIES[emojiTab].emojis.map((emoji, index) => <button type="button" key={`${emoji}-${index}`} role="menuitem" onClick={() => setDraft((current) => `${current}${emoji}`)}>{emoji}</button>)}</div>
              </div>}
            </div>
            <button type="submit" className="primary-button" disabled={sending || !draft.trim()}><Mail size={15} /> Send</button>
          </form>
          {sendError && <p className="permission-hint error">{sendError}</p>}
        </>}
      </div>
    </div>}
  </section>;
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

export default function Home({ user, onLogout }) {
  const [store, setStore] = useState(loadStore);
  const role = user.role;
  const [active, setActive] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => { try { return localStorage.getItem(SIDEBAR_KEY) === "1"; } catch { return false; } });
  const toggleSidebar = () => setSidebarCollapsed((current) => { const next = !current; try { localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0"); } catch { /* best-effort */ } return next; });
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("tactivo-theme") || "light"; } catch { return "light"; } });
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem("tactivo-theme", theme); } catch { /* best-effort */ } }, [theme]);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [generatedInspectionReport, setGeneratedInspectionReport] = useState(false);
  const [auditEntries, setAuditEntries] = useState(() => { try { return JSON.parse(localStorage.getItem(AUDIT_KEY)) || []; } catch { return []; } });
  const [notifications, setNotifications] = useState(() => { try { return JSON.parse(localStorage.getItem("tactivo-safety-notifications-v1")) || [{ id: "n-01", title: "Safety workspace is ready", body: "Capture incidents, inspections, and corrective actions as work happens.", time: "Just now", unread: true, tone: "mint" }, { id: "n-02", title: "Keep controls accountable", body: "Assign an owner and due date to every corrective action.", time: "Today", unread: true, tone: "amber" }, { id: "n-03", title: "Reporting reminder", body: "Inspection registers help teams turn field activity into evidence.", time: "Yesterday", unread: false, tone: "blue" }]; } catch { return []; } });
  const [members, setMembers] = useState(TEAM_MEMBERS);
  const [messages, setMessages] = useState([]);
  const [pendingConversationId, setPendingConversationId] = useState(null);
  const seenMessageIds = useRef(null);
  useEffect(() => { fetch("/api/safety-records", { credentials: "include" }).then((response) => response.ok ? response.json() : Promise.reject()).then((rows) => rows.map(normalizeRecord)).then((rows) => setStore({ incidents: rows.filter((row) => row.type === "incidents"), inspections: rows.filter((row) => row.type === "inspections"), actions: rows.filter((row) => row.type === "actions") })).catch(() => toast.info("PostgreSQL records are unavailable; showing this browser's saved workspace.")); }, []);
  useEffect(() => { fetch("/api/team-members", { credentials: "include" }).then((response) => response.ok ? response.json() : Promise.reject()).then(setMembers).catch(() => toast.info("Local PostgreSQL API is not running; showing the demo directory.")); }, []);
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(store)), [store]);
  useEffect(() => localStorage.setItem(AUDIT_KEY, JSON.stringify(auditEntries)), [auditEntries]);
  useEffect(() => localStorage.setItem("tactivo-safety-notifications-v1", JSON.stringify(notifications)), [notifications]);
  const records = active === "incidents" ? store.incidents : active === "inspections" ? store.inspections : store.actions;
  const filteredRecords = useMemo(() => records.filter((item) => `${item.title} ${item.site} ${item.owner}`.toLowerCase().includes(search.toLowerCase())), [records, search]);
  const recordAudit = (change) => setAuditEntries((current) => [{ id: crypto.randomUUID(), actor: ROLES[role].label, timestamp: new Date().toISOString(), ...change }, ...current].slice(0, 250));
  const addNotification = (notification) => setNotifications((current) => [{ id: crypto.randomUUID(), time: "Just now", unread: true, ...notification }, ...current].slice(0, 100));
  const readNotification = (id) => { const target = notifications.find((item) => item.id === id); setNotifications((current) => current.map((item) => item.id === id ? { ...item, unread: false } : item)); if (target?.messageId) markMessageRead(target.messageId); };
  const markAllNotificationsRead = () => setNotifications((current) => current.map((item) => ({ ...item, unread: false })));
  // Poll for new messages every 10s so incoming messages surface as real, near-real-time notifications
  // (previously "Notifications" was static demo data with no connection to actual messages at all).
  useEffect(() => {
    let cancelled = false;
    const pollMessages = () => fetch("/api/messages", { credentials: "include" }).then((response) => response.ok ? response.json() : Promise.reject()).then((loaded) => {
      if (cancelled) return;
      setMessages(loaded);
      const unreadReceived = loaded.filter((message) => message.isReceived && message.status === "sent");
      if (seenMessageIds.current === null) {
        // First load: mark existing unread messages as already-seen so we don't spam notifications
        // for a backlog on login, only for genuinely new arrivals from here on.
        seenMessageIds.current = new Set(unreadReceived.map((message) => message.id));
        return;
      }
      const freshlyArrived = unreadReceived.filter((message) => !seenMessageIds.current.has(message.id));
      freshlyArrived.forEach((message) => {
        seenMessageIds.current.add(message.id);
        addNotification({ title: `New message from ${message.senderName}`, body: `${message.subject}: ${message.body.slice(0, 90)}`, tone: "blue", messageId: message.id });
        toast.info(`New message from ${message.senderName}`);
      });
    }).catch(() => {});
    pollMessages();
    const interval = setInterval(pollMessages, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);
  const sendMessage = async (recipientTeamMemberId, subject, body) => {
    const response = await fetch("/api/messages", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientId: recipientTeamMemberId, subject, body }) });
    let data = null;
    try { data = await response.json(); } catch { /* handled by the !data check below */ }
    if (!response.ok || !data?.id) { const message = data?.error || "Could not send message. Start the local PostgreSQL API first."; toast.error(message); throw new Error(message); }
    const recipientName = members.find((member) => member.id === recipientTeamMemberId)?.name;
    setMessages((current) => [{ ...data, recipientName, isReceived: false }, ...current]);
    return data;
  };
  const markMessageRead = useCallback(async (messageId) => {
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, status: "read" } : message));
    try { await fetch(`/api/messages/${messageId}/read`, { method: "PATCH", credentials: "include" }); } catch { /* best-effort; local state already updated */ }
  }, []);
  const [trashMessages, setTrashMessages] = useState([]);
  const loadTrash = useCallback(async () => {
    try {
      const response = await fetch("/api/messages/trash", { credentials: "include" });
      if (response.ok) setTrashMessages(await response.json());
    } catch { /* best-effort; keep last known trash contents */ }
  }, []);
  const deleteMessage = useCallback(async (messageId) => {
    setMessages((current) => current.filter((message) => message.id !== messageId));
    try {
      const response = await fetch(`/api/messages/${messageId}/delete`, { method: "PATCH", credentials: "include" });
      if (!response.ok) throw new Error();
      toast.success("Message moved to trash");
      loadTrash();
    } catch { toast.error("Could not delete message. It will reappear — try again."); }
  }, [loadTrash]);
  const restoreMessage = useCallback(async (messageId) => {
    try {
      const response = await fetch(`/api/messages/${messageId}/restore`, { method: "PATCH", credentials: "include" });
      if (!response.ok) throw new Error();
      setTrashMessages((current) => current.filter((message) => message.id !== messageId));
      toast.success("Message restored");
      const response2 = await fetch("/api/messages", { credentials: "include" });
      if (response2.ok) setMessages(await response2.json());
    } catch { toast.error("Could not restore message."); }
  }, []);
  const clearPendingConversation = useCallback(() => setPendingConversationId(null), []);
  const startConversation = (member) => { setPendingConversationId(member.id); setActive("messages"); };
  const saveRecord = async (type, record) => { try { const existing = store[type].some((item) => item.id === record.id); const response = await fetch(existing ? `/api/safety-records/${record.id}` : "/api/safety-records", { method: existing ? "PATCH" : "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...record, type }) }); if (!response.ok) throw new Error(); const saved = normalizeRecord(await response.json()); setStore((current) => ({ ...current, [type]: existing ? current[type].map((item) => item.id === saved.id ? saved : item) : [saved, ...current[type]] })); setModal(null); toast.success("Safety record saved to PostgreSQL"); } catch { toast.error("Could not save the record to PostgreSQL."); } };
  const deleteRecord = async (type, id) => { try { const response = await fetch(`/api/safety-records/${id}`, { method: "DELETE", credentials: "include" }); if (!response.ok) throw new Error(); setStore((current) => ({ ...current, [type]: current[type].filter((item) => item.id !== id) })); toast.success("Record deleted from PostgreSQL"); } catch { toast.error("Could not delete the record from PostgreSQL."); } };
  const openForm = (type, record = null) => setModal({ type, record });
  const requestDelete = (type, record) => setPendingDelete({ type, record });
  const cancelDelete = useCallback(() => setPendingDelete(null), []);
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try { await deleteRecord(pendingDelete.type, pendingDelete.record.id); } finally { setDeleting(false); setPendingDelete(null); }
  };
  const generateInspectionReport = () => { if (!ROLES[role].generateInspectionReport) { toast.error("Your role cannot generate inspection reports."); return; } setGeneratedInspectionReport(true); toast.success("Inspection report generated and ready for download"); };
  const downloadInspectionReport = () => { if (!ROLES[role].downloadInspectionReport) { toast.error("Your role cannot download inspection reports."); return; } downloadSafetyPdf("inspections", store); };
  const pageTitle = active === "dashboard" ? "Good morning, safety team" : active === "people" ? "People & teams" : active === "messages" ? "Team messages" : active === "notifications" ? "Notifications" : NAV_ITEMS.find((item) => item.id === active)?.label;
  const unreadNotifications = notifications.filter((item) => item.unread).length;
  return <div className="app-shell"><Sidebar active={active} setActive={setActive} open={menuOpen} onClose={() => setMenuOpen(false)} collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebar} /><main className="main-content"><header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={21} /></button><div><span className="eyebrow">TACTIVO OPS / SAFETY WORKSPACE</span><h1>{pageTitle}</h1></div><div className="topbar-actions"><label className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search records" aria-label="Search records" /></label><button className="icon-button topbar-icon" onClick={() => setActive("notifications")} aria-label="Notifications">{<Bell size={17} />}{unreadNotifications > 0 && <span className="notif-badge">{unreadNotifications > 9 ? "9+" : unreadNotifications}</span>}</button><button className="icon-button" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label="Toggle dark mode">{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button><div className="signed-in-user"><strong>{user.name}</strong><span>{ROLES[role]?.label || role}</span></div><button className="secondary-button compact-button" onClick={onLogout}>Sign out</button><div className="avatar">{user.initials || "TM"}</div></div></header><div className="page-content">{active === "dashboard" ? <Dashboard store={store} goTo={setActive} onAdd={openForm} role={role} /> : active === "reports" ? <Reports store={store} role={role} generatedInspectionReport={generatedInspectionReport} onGenerateInspection={generateInspectionReport} onDownloadInspection={downloadInspectionReport} /> : active === "people" ? <TeamDirectory role={role} user={user} onAudit={recordAudit} onNotify={addNotification} members={members} onMembersChange={setMembers} onStartConversation={startConversation} /> : active === "messages" ? <Messages user={user} members={members} messages={messages} onSend={sendMessage} onMarkRead={markMessageRead} onDeleteMessage={deleteMessage} trashMessages={trashMessages} onLoadTrash={loadTrash} onRestoreMessage={restoreMessage} pendingConversationId={pendingConversationId} onConsumePending={clearPendingConversation} /> : active === "audit" ? <AuditLog entries={auditEntries} /> : active === "notifications" ? <Notifications items={notifications} onRead={readNotification} onMarkAllRead={markAllNotificationsRead} /> : <RecordTable key={active} type={active} records={filteredRecords} onAdd={() => openForm(active)} onEdit={(record) => openForm(active, record)} onDelete={(record) => requestDelete(active, record)} />}</div><footer className="app-footer"><span><span className="live-dot" /> Local workspace saved in this browser</span><span>Tactivo Technologies · Safety, control, accountability</span></footer></main><BottomNav active={active} setActive={setActive} onOpenMore={() => setMenuOpen(true)} />{modal && <RecordForm type={modal.type} initial={modal.record} onClose={() => setModal(null)} onSave={(record) => saveRecord(modal.type, record)} />}{pendingDelete && <ConfirmDialog title="Delete this record?" message={`“${pendingDelete.record.title}” will be permanently removed from PostgreSQL. This cannot be undone.`} confirmLabel="Delete record" busy={deleting} onConfirm={confirmDelete} onCancel={cancelDelete} />}</div>;
}
