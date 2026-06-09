export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
}

export interface Node {
  id: string;
  name: string;
  hostname: string;
  state: 'joining' | 'online' | 'offline' | 'maintenance';
  cpuCores: number;
  memoryMb: number;
  lastHeartbeatAt: string | null;
  agentVersion: string | null;
  _count?: { vms: number };
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
  state: 'queued' | 'running' | 'succeeded' | 'failed';
  progress: number;
  error: string | null;
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
