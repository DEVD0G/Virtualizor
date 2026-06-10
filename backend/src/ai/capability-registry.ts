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
  category: 'vm' | 'network' | 'storage' | 'node' | 'backup';
  parameters: CapabilityParam[];
  examples: string[];
  riskLevel: 'low' | 'medium' | 'high';
  requiredPermissions: string[];
}

export const CAPABILITIES: Capability[] = [
  {
    id: 'vm.create',
    name: 'VM erstellen',
    description:
      'Erstellt eine neue virtuelle Maschine auf einem verfügbaren Node. ' +
      'Die VM wird mit Disks, Netzwerkkarten und optional einem Cloud-Image sowie Cloud-Init konfiguriert. ' +
      'Der Scheduler wählt automatisch den Node mit der meisten freien Kapazität, sofern kein nodeId angegeben wird.',
    category: 'vm',
    riskLevel: 'medium',
    requiredPermissions: ['vm.create'],
    examples: [
      'Erstelle eine Ubuntu VM mit 4 vCPUs und 8 GB RAM',
      'Neue VM für Webserver mit 2 Kernen, 4 GB RAM und 50 GB Disk',
      'Erstelle einen Datenbankserver mit ubuntu-24.04 Template',
    ],
    parameters: [
      { name: 'name', type: 'string', description: 'VM-Name (3-63 Zeichen, nur a-z, 0-9, Bindestrich)', required: true, pattern: '^[a-z0-9][a-z0-9-]{2,62}$' },
      { name: 'vcpus', type: 'number', description: 'Anzahl virtueller CPUs (1–128)', required: true, min: 1, max: 128 },
      { name: 'memoryMb', type: 'number', description: 'RAM in Megabyte (z.B. 8192 = 8 GB)', required: true, min: 256, max: 1048576 },
      { name: 'templateId', type: 'string', description: 'Template-ID aus dem Kontext (optional). Ohne Template: leere VM.', required: false },
      { name: 'nodeId', type: 'uuid', description: 'Ziel-Node-ID (optional). Ohne Angabe: automatische Auswahl.', required: false },
      { name: 'disks', type: 'array', description: 'Disks: [{ sizeGb: number, storagePoolId?: string }]. Mindestens eine Disk.', required: true },
      { name: 'nics', type: 'array', description: 'Netzwerkkarten: [{ networkId: string, ipPoolId?: string }]. Mindestens eine NIC.', required: true },
    ],
  },
  {
    id: 'vm.start',
    name: 'VM starten',
    description: 'Startet eine gestoppte virtuelle Maschine.',
    category: 'vm',
    riskLevel: 'low',
    requiredPermissions: ['vm.power'],
    examples: ['Starte die VM web-01', 'Fahre den Server hoch'],
    parameters: [
      { name: 'vmId', type: 'uuid', description: 'ID der zu startenden VM', required: true },
    ],
  },
  {
    id: 'vm.stop',
    name: 'VM stoppen',
    description: 'Stoppt eine laufende virtuelle Maschine per ACPI-Signal (sauberer Shutdown). Mit force=true sofortiger Abbruch (wie Stromstecker ziehen).',
    category: 'vm',
    riskLevel: 'low',
    requiredPermissions: ['vm.power'],
    examples: ['Stoppe die VM web-01', 'Schalte den Datenbankserver aus'],
    parameters: [
      { name: 'vmId', type: 'uuid', description: 'ID der zu stoppenden VM', required: true },
      { name: 'force', type: 'boolean', description: 'Sofortiger Abbruch ohne Shutdown-Signal (Datenverlust möglich)', required: false },
    ],
  },
  {
    id: 'vm.restart',
    name: 'VM neustarten',
    description: 'Startet eine laufende VM sauber neu.',
    category: 'vm',
    riskLevel: 'low',
    requiredPermissions: ['vm.power'],
    examples: ['Starte web-01 neu', 'Reboot den Webserver'],
    parameters: [
      { name: 'vmId', type: 'uuid', description: 'ID der VM', required: true },
    ],
  },
  {
    id: 'vm.delete',
    name: 'VM löschen',
    description: 'Löscht eine virtuelle Maschine und alle ihre Disks permanent. NICHT RÜCKGÄNGIG ZU MACHEN.',
    category: 'vm',
    riskLevel: 'high',
    requiredPermissions: ['vm.delete'],
    examples: ['Lösche die Test-VM', 'Entferne vm-test-01'],
    parameters: [
      { name: 'vmId', type: 'uuid', description: 'ID der zu löschenden VM', required: true },
    ],
  },
  {
    id: 'vm.snapshot.create',
    name: 'VM-Snapshot erstellen',
    description: 'Erstellt einen Snapshot des aktuellen VM-Zustands (auch auf laufenden VMs möglich).',
    category: 'vm',
    riskLevel: 'low',
    requiredPermissions: ['vm.snapshot'],
    examples: ['Erstelle einen Snapshot von web-01 vor dem Update', 'Snapshot vor Konfigurationsänderung'],
    parameters: [
      { name: 'vmId', type: 'uuid', description: 'ID der VM', required: true },
      { name: 'snapshotName', type: 'string', description: 'Snapshot-Name (a-z, 0-9, Bindestrich)', required: true },
      { name: 'description', type: 'string', description: 'Optionale Beschreibung', required: false },
    ],
  },
  {
    id: 'vm.backup.create',
    name: 'VM-Backup erstellen',
    description: 'Erstellt ein Backup als komprimiertes qcow2-Image. Auf laufenden VMs COW-konsistent.',
    category: 'backup',
    riskLevel: 'low',
    requiredPermissions: ['backup.manage'],
    examples: ['Erstelle ein Backup von db-01', 'Sichere den Produktionsserver'],
    parameters: [
      { name: 'vmId', type: 'uuid', description: 'ID der VM', required: true },
      { name: 'targetDir', type: 'string', description: 'Zielverzeichnis (optional)', required: false },
    ],
  },
  {
    id: 'network.create',
    name: 'Netzwerk erstellen',
    description: 'Erstellt ein virtuelles Netzwerk (Bridge oder NAT) für VMs.',
    category: 'network',
    riskLevel: 'medium',
    requiredPermissions: ['network.manage'],
    examples: ['Erstelle ein neues Bridge-Netzwerk vmbr1', 'Privates NAT-Netzwerk für die Entwicklungsumgebung'],
    parameters: [
      { name: 'name', type: 'string', description: 'Netzwerkname (eindeutig in der Plattform)', required: true },
      { name: 'mode', type: 'enum', description: 'Netzwerkmodus: bridged (direkte Bridge) oder nat (privates Netz mit NAT)', required: true, enum: ['bridged', 'nat'] },
      { name: 'bridge', type: 'string', description: 'Host-Bridge-Interface (z.B. vmbr0)', required: true },
      { name: 'vlanTag', type: 'number', description: 'VLAN-ID (1–4094, optional)', required: false, min: 1, max: 4094 },
    ],
  },
];

export const PROPOSE_PLAN_TOOL = {
  name: 'propose_action_plan',
  description:
    'Erstellt einen Infrastruktur-Aktionsplan, den der Benutzer überprüfen und bestätigen muss. ' +
    'Verwende dieses Tool immer dann, wenn eine Aktion auf der Plattform ausgeführt werden soll.',
  input_schema: {
    type: 'object' as const,
    properties: {
      intent: {
        type: 'string',
        description: 'Kurze Zusammenfassung der Absicht (max. 100 Zeichen)',
      },
      explanation: {
        type: 'string',
        description: 'Ausführliche, verständliche Erklärung was getan wird, warum, und was dabei passiert',
      },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            capability: { type: 'string', description: 'ID der Capability aus der Capability-Liste' },
            params: { type: 'object', description: 'Parameter für die Aktion (passend zur Capability-Definition)' },
            description: { type: 'string', description: 'Menschenlesbare Beschreibung dieses Schritts' },
            reversible: { type: 'boolean', description: 'Kann dieser Schritt rückgängig gemacht werden?' },
          },
          required: ['capability', 'params', 'description', 'reversible'],
        },
        description: 'Geordnete Liste der auszuführenden Schritte',
      },
      riskLevel: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'Gesamtrisikoniveau: low=sicher, medium=Vorsicht, high=destruktiv/irreversibel',
      },
      warnings: {
        type: 'array',
        items: { type: 'string' },
        description: 'Wichtige Hinweise und Warnungen für den Benutzer',
      },
    },
    required: ['intent', 'explanation', 'steps', 'riskLevel'],
  },
} as const;
