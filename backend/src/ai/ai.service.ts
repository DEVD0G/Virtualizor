import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.service';
import { CAPABILITIES, DIAGNOSE_TOOL, PROPOSE_PLAN_TOOL } from './capability-registry';
import {
  ActionPlan, ChatMessage, ChatResponse, DiagnosticsResult,
  StoredPlan, StreamEvent,
} from './types';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly redis: Redis;
  private readonly anthropic: Anthropic;

  constructor(private readonly prisma: PrismaService) {
    const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
    this.redis = new Redis({ host: url.hostname, port: parseInt(url.port || '6379', 10), lazyConnect: true });
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) this.logger.warn('ANTHROPIC_API_KEY nicht gesetzt — AI-Assistent deaktiviert');
    this.anthropic = new Anthropic({ apiKey: apiKey ?? 'not-set' });
  }

  private checkKey() {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new ServiceUnavailableException('AI-Assistent nicht verfügbar: ANTHROPIC_API_KEY nicht konfiguriert');
    }
  }

  // ─── Non-streaming chat (backwards compat) ────────────────────────────────

  async chat(user: AuthenticatedUser, messages: ChatMessage[]): Promise<ChatResponse> {
    this.checkKey();
    const ctx = await this.buildClusterContext();
    const system = this.buildSystemPrompt(ctx, user);

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      tools: [PROPOSE_PLAN_TOOL as any],
    });

    let message = '';
    let actionPlan: ActionPlan | undefined;
    let planId: string | undefined;

    for (const block of response.content) {
      if (block.type === 'text') message += block.text;
      else if (block.type === 'tool_use' && block.name === 'propose_action_plan') {
        actionPlan = block.input as ActionPlan;
        planId = randomUUID();
        await this.redis.set(`aiplan:${planId}`, JSON.stringify({ ...actionPlan, userId: user.id }), 'EX', 300);
      }
    }
    if (!message && actionPlan) {
      message = 'Ich habe einen Aktionsplan vorbereitet. Bitte überprüfe die Details unten.';
    }
    return { message, actionPlan, planId };
  }

  // ─── Streaming chat ────────────────────────────────────────────────────────

  async chatStream(
    user: AuthenticatedUser,
    messages: ChatMessage[],
    onEvent: (event: StreamEvent) => void,
  ): Promise<void> {
    this.checkKey();
    const ctx = await this.buildClusterContext();
    const system = this.buildSystemPrompt(ctx, user);

    const stream = this.anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      tools: [PROPOSE_PLAN_TOOL as any],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        onEvent({ type: 'text', text: event.delta.text });
      }
    }

    const final = await stream.finalMessage();
    for (const block of final.content) {
      if (block.type === 'tool_use' && block.name === 'propose_action_plan') {
        const plan = block.input as ActionPlan;
        const planId = randomUUID();
        await this.redis.set(`aiplan:${planId}`, JSON.stringify({ ...plan, userId: user.id }), 'EX', 300);
        onEvent({ type: 'plan', plan, planId });
      }
    }
    onEvent({ type: 'done' });
  }

  // ─── Diagnostics ──────────────────────────────────────────────────────────

  async diagnose(
    resourceType: 'vm' | 'node',
    resourceId: string,
  ): Promise<DiagnosticsResult> {
    this.checkKey();

    let prompt: string;
    if (resourceType === 'vm') {
      const vm = await this.prisma.vm.findUnique({
        where: { id: resourceId },
        include: {
          node: { select: { name: true, state: true, cpuCores: true, memoryMb: true, cpuUsage: true, memUsedMb: true } },
          disks: { include: { storagePool: { select: { name: true, usedGb: true, totalGb: true } } } },
          nics: { include: { ips: true, network: true } },
          backups: { take: 3, orderBy: { createdAt: 'desc' } },
          snapshots: { take: 5, orderBy: { createdAt: 'desc' } },
          firewallRules: true,
        },
      });
      if (!vm) throw new NotFoundException('VM nicht gefunden');
      prompt = this.buildVmDiagPrompt(vm);
    } else {
      const node = await this.prisma.node.findUnique({
        where: { id: resourceId },
        include: {
          vms: { select: { name: true, state: true, vcpus: true, memoryMb: true } },
          storagePools: true,
        },
      });
      if (!node) throw new NotFoundException('Node nicht gefunden');
      prompt = this.buildNodeDiagPrompt(node);
    }

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system:
        'Du bist ein KVM/QEMU-Infrastruktur-Diagnose-Experte. Analysiere die Daten und erstelle einen ' +
        'präzisen Diagnosebericht auf Deutsch. Nutze immer das Tool report_diagnostics.',
      messages: [{ role: 'user', content: prompt }],
      tools: [DIAGNOSE_TOOL as any],
      tool_choice: { type: 'tool', name: 'report_diagnostics' },
    });

    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === 'report_diagnostics') {
        return block.input as DiagnosticsResult;
      }
    }
    return { summary: 'Diagnose nicht verfügbar.', overallStatus: 'warning', issues: [], recommendations: [] };
  }

  // ─── Plan storage ──────────────────────────────────────────────────────────

  async getPlan(planId: string): Promise<StoredPlan | null> {
    const raw = await this.redis.get(`aiplan:${planId}`);
    if (!raw) return null;
    return JSON.parse(raw) as StoredPlan;
  }

  // ─── Context builders ──────────────────────────────────────────────────────

  private async buildClusterContext() {
    const [nodes, vms, networks, pools, templates] = await Promise.all([
      this.prisma.node.findMany({ select: { id: true, name: true, state: true, cpuCores: true, memoryMb: true } }),
      this.prisma.vm.findMany({ select: { id: true, name: true, state: true, vcpus: true, memoryMb: true }, take: 50, orderBy: { createdAt: 'desc' } }),
      this.prisma.network.findMany({ select: { id: true, name: true, mode: true } }),
      this.prisma.storagePool.findMany({ select: { id: true, name: true, type: true, isDefault: true, totalGb: true, usedGb: true, node: { select: { name: true } } } }),
      this.prisma.template.findMany({ select: { id: true, name: true, osType: true, minDiskGb: true } }),
    ]);
    return { nodes, vms, networks, pools, templates };
  }

  private buildSystemPrompt(ctx: Awaited<ReturnType<typeof this.buildClusterContext>>, user: AuthenticatedUser): string {
    const running = ctx.vms.filter((v) => v.state === 'running').length;
    const stopped = ctx.vms.filter((v) => v.state === 'stopped').length;
    const online = ctx.nodes.filter((n) => n.state === 'online').length;

    return `Du bist der VCP Infrastructure Assistant — KI-Assistent für KVM/QEMU-Infrastrukturverwaltung.

AUFGABEN:
• Beantworte Fragen zu Infrastruktur einfach und verständlich auf Deutsch
• Erkläre technische Konzepte (CIDR, VLAN, Snapshots, Storage-Pools, usw.)
• Analysiere Probleme und schlage Lösungen vor
• Plane Infrastrukturänderungen mit propose_action_plan
• Führe NIEMALS Änderungen ohne explizite Bestätigung durch

REGELN:
1. Immer auf Deutsch antworten
2. Aktionen immer über propose_action_plan planen — nicht implizit ausführen
3. Risiken klar benennen (was ist irreversibel?)
4. Bei fehlenden Parametern nachfragen
5. Nur Capabilities aus der Liste verwenden
6. Reale IDs aus dem Cluster-Kontext nutzen

CLUSTER-ZUSTAND:
Nodes: ${ctx.nodes.length} (${online} online)
VMs: ${ctx.vms.length} (${running} laufend, ${stopped} gestoppt)

Nodes:
${ctx.nodes.map((n) => `  ${n.name}: ${n.state}, ${n.cpuCores} CPUs, ${(n.memoryMb / 1024).toFixed(1)} GB (ID: ${n.id})`).join('\n') || '  keine'}

VMs (neueste 20):
${ctx.vms.slice(0, 20).map((v) => `  ${v.name}: ${v.state}, ${v.vcpus} vCPU, ${(v.memoryMb / 1024).toFixed(1)} GB (ID: ${v.id})`).join('\n') || '  keine'}

Netzwerke:
${ctx.networks.map((n) => `  ${n.name} (${n.mode}, ID: ${n.id})`).join('\n') || '  keine'}

Templates:
${ctx.templates.map((t) => `  ${t.name} (${t.osType}, min ${t.minDiskGb} GB, ID: ${t.id})`).join('\n') || '  keine'}

Storage-Pools:
${ctx.pools.map((p) => `  ${p.name} auf ${p.node?.name ?? '?'} (${p.type}, ${p.usedGb}/${p.totalGb} GB, ${p.isDefault ? 'Standard, ' : ''}ID: ${p.id})`).join('\n') || '  keine'}

Benutzer: ${user.email} | Berechtigungen: ${user.permissions.join(', ')}

CAPABILITIES:
${JSON.stringify(CAPABILITIES, null, 2)}`;
  }

  private buildVmDiagPrompt(vm: any): string {
    const diskInfo = vm.disks.map((d: any) =>
      `${d.name}: ${d.sizeGb} GB auf Pool "${d.storagePool.name}" (${d.storagePool.usedGb}/${d.storagePool.totalGb} GB genutzt)`).join(', ');
    const nicInfo = vm.nics.map((n: any) =>
      `${n.network.name} (${n.mac}${n.ips[0] ? `, IP: ${n.ips[0].address}` : ''})`).join(', ');
    const fwCount = vm.firewallRules.length;
    const snapCount = vm.snapshots.length;
    const backupInfo = vm.backups[0]
      ? `letztes Backup: ${new Date(vm.backups[0].createdAt).toLocaleString('de')}, Status: ${vm.backups[0].state}`
      : 'kein Backup vorhanden';

    return `Analysiere diese VM und erstelle einen Diagnosebericht:

VM: ${vm.name}
Status: ${vm.state}${vm.errorMsg ? ` (Fehler: ${vm.errorMsg})` : ''}
vCPUs: ${vm.vcpus}
RAM: ${(vm.memoryMb / 1024).toFixed(1)} GB

Node: ${vm.node.name} (${vm.node.state})
Node-CPU-Auslastung: ${vm.node.cpuUsage?.toFixed(1) ?? '?'}%
Node-RAM: ${(vm.node.memUsedMb / 1024).toFixed(1)}/${(vm.node.memoryMb / 1024).toFixed(1)} GB genutzt

Disks: ${diskInfo || 'keine'}
Netzwerkkarten: ${nicInfo || 'keine'}
Firewall-Regeln: ${fwCount}
Snapshots: ${snapCount}
Backup: ${backupInfo}

Prüfe: Fehlerzustände, Ressourcenengpässe, fehlende Backups, Sicherheitslücken, Node-Gesundheit.`;
  }

  private buildNodeDiagPrompt(node: any): string {
    const vmStates = node.vms.reduce((acc: any, v: any) => {
      acc[v.state] = (acc[v.state] ?? 0) + 1;
      return acc;
    }, {});
    const totalVcpus = node.vms.reduce((s: number, v: any) => s + v.vcpus, 0);
    const totalMemMb = node.vms.reduce((s: number, v: any) => s + v.memoryMb, 0);
    const poolInfo = node.storagePools.map((p: any) =>
      `${p.name} (${p.type}): ${p.usedGb}/${p.totalGb} GB (${p.totalGb > 0 ? ((p.usedGb / p.totalGb) * 100).toFixed(0) : '?'}% genutzt)`).join(', ');

    return `Analysiere diesen Hypervisor-Node und erstelle einen Diagnosebericht:

Node: ${node.name}
Status: ${node.state}
CPU: ${node.cpuCores} Kerne, aktuelle Auslastung: ${node.cpuUsage?.toFixed(1) ?? '?'}%
RAM: ${(node.memUsedMb / 1024).toFixed(1)}/${(node.memoryMb / 1024).toFixed(1)} GB genutzt
Agent-Version: ${node.agentVersion ?? 'unbekannt'}
Letzter Heartbeat: ${node.lastHeartbeatAt ? new Date(node.lastHeartbeatAt).toLocaleString('de') : 'nie'}

VMs: ${node.vms.length} gesamt (${Object.entries(vmStates).map(([k, v]) => `${v} ${k}`).join(', ')})
Zugewiesene vCPUs (alle VMs): ${totalVcpus} von ${node.cpuCores} physisch
Zugewiesener RAM (alle VMs): ${(totalMemMb / 1024).toFixed(1)} GB von ${(node.memoryMb / 1024).toFixed(1)} GB physisch

Storage-Pools: ${poolInfo || 'keine'}

Prüfe: Erreichbarkeit, Ressourcenüberbuchung, Storage-Füllstand, VMs im Fehlerzustand, Agent-Gesundheit.`;
  }
}
