export interface CapabilityParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'uuid';
  description: string;
  required: boolean;
  enum?: string[];
  min?: number;
  max?: number;
  pattern?: string;
}

export interface Capability {
  id: string;
  name: string;
  description: string;
  category: 'vm' | 'network' | 'storage' | 'node' | 'backup' | 'security';
  parameters: CapabilityParam[];
  examples: string[];
  riskLevel: 'low' | 'medium' | 'high';
  requiredPermissions: string[];
}

export const CAPABILITIES: Capability[] = [
  // ─── VM Lifecycle ────────────────────────────────────────────────────────────
  {
    id: 'vm.create',
    name: 'VM erstellen',
    description:
      'Erstellt eine neue virtuelle Maschine. Der Scheduler wählt automatisch den besten Node ' +
      'sofern kein nodeId angegeben wird (least-allocated nach freiem RAM).',
    category: 'vm',
    riskLevel: 'medium',
    requiredPermissions: ['vm.create'],
    examples: [
      'Erstelle eine Ubuntu VM mit 4 vCPUs und 8 GB RAM',
      'Neuer Webserver mit 2 Kernen, 4 GB RAM, 50 GB Disk',
      'Datenbankserver mit ubuntu-24.04 Template',
    ],
    parameters: [
      { name: 'name', type: 'string', description: 'VM-Name (3-63 Zeichen, a-z 0-9 Bindestrich)', required: true, pattern: '^[a-z0-9][a-z0-9-]{2,62}$' },
      { name: 'vcpus', type: 'number', description: 'Anzahl vCPUs (1–128)', required: true, min: 1, max: 128 },
      { name: 'memoryMb', type: 'number', description: 'RAM in MB (z.B. 8192 = 8 GB)', required: true, min: 256, max: 1048576 },
      { name: 'templateId', type: 'string', description: 'Template-ID aus dem Kontext (optional)', required: false },
      { name: 'nodeId', type: 'uuid', description: 'Ziel-Node-ID (optional, sonst automatisch)', required: false },
      { name: 'disks', type: 'array', description: 'Disks: [{ sizeGb: number, storagePoolId?: string }]', required: true },
      { name: 'nics', type: 'array', description: 'Netzwerkkarten: [{ networkId: string, ipPoolId?: string }]', required: true },
    ],
  },
  {
    id: 'vm.start',
    name: 'VM starten',
    description: 'Startet eine gestoppte VM.',
    category: 'vm', riskLevel: 'low', requiredPermissions: ['vm.power'],
    examples: ['Starte die VM web-01', 'Fahre den Server hoch'],
    parameters: [{ name: 'vmId', type: 'uuid', description: 'VM-ID', required: true }],
  },
  {
    id: 'vm.stop',
    name: 'VM stoppen',
    description: 'Stoppt eine laufende VM (ACPI-Shutdown). Mit force=true sofortiger Kill.',
    category: 'vm', riskLevel: 'low', requiredPermissions: ['vm.power'],
    examples: ['Stoppe vm-01', 'Schalte den Datenbankserver aus'],
    parameters: [
      { name: 'vmId', type: 'uuid', description: 'VM-ID', required: true },
      { name: 'force', type: 'boolean', description: 'Sofort-Stop ohne ACPI (Datenverlust möglich)', required: false },
    ],
  },
  {
    id: 'vm.restart',
    name: 'VM neustarten',
    description: 'Startet eine laufende VM sauber neu.',
    category: 'vm', riskLevel: 'low', requiredPermissions: ['vm.power'],
    examples: ['Starte web-01 neu', 'Reboot den Webserver'],
    parameters: [{ name: 'vmId', type: 'uuid', description: 'VM-ID', required: true }],
  },
  {
    id: 'vm.delete',
    name: 'VM löschen',
    description: 'Löscht eine VM und alle ihre Disks permanent. NICHT RÜCKGÄNGIG ZU MACHEN.',
    category: 'vm', riskLevel: 'high', requiredPermissions: ['vm.delete'],
    examples: ['Lösche die Test-VM vm-test-01'],
    parameters: [{ name: 'vmId', type: 'uuid', description: 'VM-ID', required: true }],
  },
  {
    id: 'vm.resize',
    name: 'VM vergrößern/verkleinern',
    description: 'Ändert vCPU- und/oder RAM-Zuweisung einer gestoppten VM.',
    category: 'vm', riskLevel: 'low', requiredPermissions: ['vm.create'],
    examples: ['Gib der VM web-01 mehr RAM', 'Ändere web-01 auf 8 vCPUs und 16 GB RAM'],
    parameters: [
      { name: 'vmId', type: 'uuid', description: 'VM-ID', required: true },
      { name: 'vcpus', type: 'number', description: 'Neue Anzahl vCPUs', required: false, min: 1, max: 128 },
      { name: 'memoryMb', type: 'number', description: 'Neuer RAM in MB', required: false, min: 256, max: 1048576 },
    ],
  },
  // ─── Snapshots ────────────────────────────────────────────────────────────────
  {
    id: 'vm.snapshot.create',
    name: 'Snapshot erstellen',
    description: 'Erstellt einen Snapshot des aktuellen VM-Zustands (auch live möglich).',
    category: 'vm', riskLevel: 'low', requiredPermissions: ['vm.snapshot'],
    examples: ['Snapshot von web-01 vor dem Update', 'Sicherungspunkt erstellen'],
    parameters: [
      { name: 'vmId', type: 'uuid', description: 'VM-ID', required: true },
      { name: 'snapshotName', type: 'string', description: 'Snapshot-Name (a-z, 0-9, Bindestrich)', required: true },
      { name: 'description', type: 'string', description: 'Optionale Beschreibung', required: false },
    ],
  },
  {
    id: 'vm.snapshot.revert',
    name: 'Snapshot wiederherstellen',
    description: 'Setzt eine VM auf den Zustand eines früheren Snapshots zurück. Änderungen seit dem Snapshot gehen verloren.',
    category: 'vm', riskLevel: 'high', requiredPermissions: ['vm.snapshot'],
    examples: ['Snapshot pre-update wiederherstellen', 'VM auf gestern zurücksetzen'],
    parameters: [
      { name: 'vmId', type: 'uuid', description: 'VM-ID', required: true },
      { name: 'snapshotId', type: 'uuid', description: 'Snapshot-ID', required: true },
    ],
  },
  {
    id: 'vm.snapshot.delete',
    name: 'Snapshot löschen',
    description: 'Löscht einen Snapshot.',
    category: 'vm', riskLevel: 'medium', requiredPermissions: ['vm.snapshot'],
    examples: ['Alten Snapshot löschen', 'Snapshot pre-update entfernen'],
    parameters: [
      { name: 'vmId', type: 'uuid', description: 'VM-ID', required: true },
      { name: 'snapshotId', type: 'uuid', description: 'Snapshot-ID', required: true },
    ],
  },
  // ─── Backups ──────────────────────────────────────────────────────────────────
  {
    id: 'vm.backup.create',
    name: 'Backup erstellen',
    description: 'Erstellt ein Backup als komprimiertes qcow2-Image (COW-konsistent, auch live).',
    category: 'backup', riskLevel: 'low', requiredPermissions: ['backup.manage'],
    examples: ['Backup von db-01', 'Sichere den Produktionsserver'],
    parameters: [
      { name: 'vmId', type: 'uuid', description: 'VM-ID', required: true },
      { name: 'targetDir', type: 'string', description: 'Zielverzeichnis (optional)', required: false },
    ],
  },
  // ─── Firewall ─────────────────────────────────────────────────────────────────
  {
    id: 'firewall.rule.add',
    name: 'Firewall-Regel hinzufügen',
    description: 'Fügt eine nftables Bridge-Firewall-Regel für eine VM hinzu. Die Regel wird sofort aktiv wenn die VM läuft.',
    category: 'security', riskLevel: 'medium', requiredPermissions: ['vm.firewall'],
    examples: ['Port 80 für web-01 öffnen', 'SSH-Zugang auf bestimmte IPs beschränken'],
    parameters: [
      { name: 'vmId', type: 'uuid', description: 'VM-ID', required: true },
      { name: 'direction', type: 'enum', description: 'Richtung', required: true, enum: ['in', 'out'] },
      { name: 'action', type: 'enum', description: 'Aktion', required: true, enum: ['accept', 'drop'] },
      { name: 'protocol', type: 'enum', description: 'Protokoll', required: true, enum: ['tcp', 'udp', 'icmp', 'any'] },
      { name: 'portFrom', type: 'number', description: 'Startport (optional)', required: false, min: 1, max: 65535 },
      { name: 'portTo', type: 'number', description: 'Endport für Range (optional)', required: false, min: 1, max: 65535 },
      { name: 'cidr', type: 'string', description: 'CIDR (Standard: 0.0.0.0/0)', required: false },
      { name: 'priority', type: 'number', description: 'Priorität (Standard: 100)', required: false, min: 1, max: 1000 },
    ],
  },
  // ─── Network ──────────────────────────────────────────────────────────────────
  {
    id: 'network.create',
    name: 'Netzwerk erstellen',
    description: 'Erstellt ein virtuelles Netzwerk (Bridge oder NAT) für VMs.',
    category: 'network', riskLevel: 'medium', requiredPermissions: ['network.manage'],
    examples: ['Neues Bridge-Netzwerk vmbr1', 'Privates NAT-Netzwerk für Entwicklung'],
    parameters: [
      { name: 'name', type: 'string', description: 'Netzwerkname', required: true },
      { name: 'mode', type: 'enum', description: 'bridged oder nat', required: true, enum: ['bridged', 'nat'] },
      { name: 'bridge', type: 'string', description: 'Host-Bridge-Interface (z.B. vmbr0)', required: true },
      { name: 'vlanTag', type: 'number', description: 'VLAN-ID 1–4094 (optional)', required: false, min: 1, max: 4094 },
    ],
  },
];

export const PROPOSE_PLAN_TOOL = {
  name: 'propose_action_plan',
  description:
    'Erstellt einen Infrastruktur-Aktionsplan zur Überprüfung und Bestätigung durch den Benutzer. ' +
    'Immer wenn eine Aktion ausgeführt werden soll, dieses Tool verwenden.',
  input_schema: {
    type: 'object' as const,
    properties: {
      intent: { type: 'string', description: 'Kurze Zusammenfassung (max. 100 Zeichen)' },
      explanation: { type: 'string', description: 'Ausführliche Erklärung was und warum' },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            capability: { type: 'string' },
            params: { type: 'object' },
            description: { type: 'string' },
            reversible: { type: 'boolean' },
          },
          required: ['capability', 'params', 'description', 'reversible'],
        },
      },
      riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
      warnings: { type: 'array', items: { type: 'string' } },
    },
    required: ['intent', 'explanation', 'steps', 'riskLevel'],
  },
} as const;

export const DIAGNOSE_TOOL = {
  name: 'report_diagnostics',
  description: 'Meldet Diagnoseergebnis als strukturierten Bericht.',
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: { type: 'string', description: 'Zusammenfassung des Zustands in 2-3 Sätzen' },
      overallStatus: { type: 'string', enum: ['ok', 'warning', 'critical'] },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
            suggestion: { type: 'string' },
          },
          required: ['title', 'description', 'severity'],
        },
      },
      recommendations: { type: 'array', items: { type: 'string' } },
    },
    required: ['summary', 'overallStatus', 'issues', 'recommendations'],
  },
} as const;
