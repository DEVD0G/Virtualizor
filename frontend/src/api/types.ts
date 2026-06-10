export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  totpEnabled: boolean;
}

export interface Node {
  id: string;
  name: string;
  hostname: string;
  state: 'joining' | 'online' | 'offline' | 'maintenance';
  cpuCores: number;
  memoryMb: number;
  cpuUsage: number;
  memUsedMb: number;
  lastHeartbeatAt: string | null;
  agentVersion: string | null;
  _count?: { vms: number };
}

export interface MetricSample {
  sampledAt: string;
  cpuPercent: number;
  memUsedMb: number;
  vmsRunning: number;
}

export interface Vm {
  id: string;
  name: string;
  state: 'provisioning' | 'stopped' | 'running' | 'paused' | 'error' | 'deleting';
  vcpus: number;
  memoryMb: number;
  errorMsg: string | null;
  createdAt: string;
  node: { id: string; name: string };
  owner: { id: string; email: string; name: string };
  disks: { id: string; name: string; sizeGb: number; storagePool: { name: string; type: string } }[];
  nics: { id: string; mac: string; network: { name: string }; ips: { address: string }[] }[];
}

export interface Snapshot {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface LicenseState {
  status: 'active' | 'grace' | 'unlicensed' | 'unconfigured';
  tier: string | null;
  limits: { maxNodes: number; maxVms: number } | null;
  features: string[];
  graceRemainingDays: number | null;
  expiresAt: string | null;
  lastValidatedAt: string | null;
}

export interface Task {
  id: string;
  kind: string;
  resourceType: string;
  resourceId: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed';
  progress: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface AuditLog {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  sourceIp: string | null;
  outcome: string;
  createdAt: string;
  user: { email: string; name: string } | null;
}

export interface Role {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: { permissionId: string }[];
  _count: { users: number };
}

export interface PanelUser {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  role: { id: string; name: string };
}

export interface Template {
  id: string;
  name: string;
  sourceUrl: string;
  sha256: string;
  osType: string;
  minDiskGb: number;
}

export interface Iso {
  id: string;
  name: string;
  sourceUrl: string;
  sha256: string;
  sizeBytes: number | null;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

export interface Backup {
  id: string;
  vmId: string;
  target: string;
  sizeBytes: number | null;
  state: 'running' | 'completed' | 'failed';
  createdAt: string;
}

export interface Network {
  id: string;
  name: string;
  mode: 'bridged' | 'nat';
  bridge: string;
  vlanTag: number | null;
  cidr: string | null;
  ipPools: IpPool[];
}

export interface IpPool {
  id: string;
  networkId: string;
  cidr: string;
  gateway: string;
  dns: string[];
  _count?: { addresses: number };
}

export interface StoragePool {
  id: string;
  name: string;
  type: 'dir' | 'zfs' | 'nfs' | 'iscsi';
  path: string;
  totalGb: number;
  usedGb: number;
  isDefault: boolean;
}

export interface NodeDetail {
  id: string;
  name: string;
  hostname: string;
  agentAddress: string;
  state: 'joining' | 'online' | 'offline' | 'maintenance';
  cpuCores: number;
  memoryMb: number;
  cpuUsage: number;
  memUsedMb: number;
  agentVersion: string | null;
  lastHeartbeatAt: string | null;
  storagePools: StoragePool[];
  vms: { id: string; name: string; state: string; vcpus: number; memoryMb: number }[];
}

export interface FirewallRule {
  id: string;
  vmId: string;
  direction: 'in' | 'out';
  action: 'accept' | 'drop';
  protocol: string;
  portFrom: number | null;
  portTo: number | null;
  cidr: string;
  priority: number;
}

// ─── AI Assistant ────────────────────────────────────────────────────────────

export interface AiActionStep {
  capability: string;
  params: Record<string, any>;
  description: string;
  reversible: boolean;
}

export interface AiActionPlan {
  intent: string;
  explanation: string;
  steps: AiActionStep[];
  riskLevel: 'low' | 'medium' | 'high';
  warnings?: string[];
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actionPlan?: AiActionPlan;
  planId?: string;
  planStatus?: 'pending' | 'executing' | 'done' | 'rejected';
  streaming?: boolean;
}

export interface AiExecuteResult {
  stepIndex: number;
  capability: string;
  success: boolean;
  taskId?: string;
  resourceId?: string;
  error?: string;
}

export interface DiagnosticIssue {
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  suggestion?: string;
}

export interface DiagnosticsResult {
  summary: string;
  overallStatus: 'ok' | 'warning' | 'critical';
  issues: DiagnosticIssue[];
  recommendations: string[];
}

export interface BackupSchedule {
  id: string;
  vmId: string;
  intervalHours: number;
  targetDir: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}
