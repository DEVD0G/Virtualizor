import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.service';
import { CAPABILITIES, PROPOSE_PLAN_TOOL } from './capability-registry';
import { ActionPlan, ChatMessage, ChatResponse, StoredPlan } from './types';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly redis: Redis;
  private readonly anthropic: Anthropic;

  constructor(private readonly prisma: PrismaService) {
    const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
    this.redis = new Redis({
      host: url.hostname,
      port: parseInt(url.port || '6379', 10),
      lazyConnect: true,
    });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY nicht gesetzt — AI-Assistent deaktiviert');
    }
    this.anthropic = new Anthropic({ apiKey: apiKey ?? 'not-set' });
  }

  async chat(user: AuthenticatedUser, messages: ChatMessage[]): Promise<ChatResponse> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new ServiceUnavailableException(
        'AI-Assistent nicht verfügbar: ANTHROPIC_API_KEY nicht konfiguriert',
      );
    }

    const context = await this.buildClusterContext();
    const systemPrompt = this.buildSystemPrompt(context, user);

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      tools: [PROPOSE_PLAN_TOOL as any],
    });

    let message = '';
    let actionPlan: ActionPlan | undefined;
    let planId: string | undefined;

    for (const block of response.content) {
      if (block.type === 'text') {
        message += block.text;
      } else if (block.type === 'tool_use' && block.name === 'propose_action_plan') {
        actionPlan = block.input as ActionPlan;
        planId = randomUUID();
        const stored: StoredPlan = { ...actionPlan, userId: user.id };
        await this.redis.set(`aiplan:${planId}`, JSON.stringify(stored), 'EX', 300);
      }
    }

    // If the model stopped because it called the tool but produced no text, add a fallback
    if (!message && actionPlan) {
      message = `Ich habe einen Aktionsplan für dich vorbereitet. Bitte überprüfe die Details und bestätige die Ausführung.`;
    }

    return { message, actionPlan, planId };
  }

  async getPlan(planId: string): Promise<StoredPlan | null> {
    const raw = await this.redis.get(`aiplan:${planId}`);
    if (!raw) return null;
    return JSON.parse(raw) as StoredPlan;
  }

  private async buildClusterContext() {
    const [nodes, vms, networks, pools, templates] = await Promise.all([
      this.prisma.node.findMany({
        select: { id: true, name: true, state: true, cpuCores: true, memoryMb: true },
      }),
      this.prisma.vm.findMany({
        select: { id: true, name: true, state: true, vcpus: true, memoryMb: true },
        take: 50,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.network.findMany({
        select: { id: true, name: true, mode: true },
      }),
      this.prisma.storagePool.findMany({
        select: { id: true, name: true, type: true, isDefault: true, totalGb: true, usedGb: true, node: { select: { name: true } } },
      }),
      this.prisma.template.findMany({
        select: { id: true, name: true, osType: true, minDiskGb: true },
      }),
    ]);

    return { nodes, vms, networks, pools, templates };
  }

  private buildSystemPrompt(ctx: Awaited<ReturnType<typeof this.buildClusterContext>>, user: AuthenticatedUser): string {
    const running = ctx.vms.filter((v) => v.state === 'running').length;
    const stopped = ctx.vms.filter((v) => v.state === 'stopped').length;
    const online = ctx.nodes.filter((n) => n.state === 'online').length;

    const networkList = ctx.networks.length
      ? ctx.networks.map((n) => `  - ${n.name} (${n.mode}, ID: ${n.id})`).join('\n')
      : '  - keine Netzwerke konfiguriert';

    const templateList = ctx.templates.length
      ? ctx.templates.map((t) => `  - ${t.name} (${t.osType}, min. ${t.minDiskGb} GB, ID: ${t.id})`).join('\n')
      : '  - keine Templates verfügbar';

    const poolList = ctx.pools.length
      ? ctx.pools.map((p) => `  - ${p.name} auf ${p.node?.name ?? 'N/A'} (${p.type}, ${p.usedGb}/${p.totalGb} GB genutzt, ${p.isDefault ? 'Standard, ' : ''}ID: ${p.id})`).join('\n')
      : '  - keine Storage-Pools konfiguriert';

    const nodeList = ctx.nodes.length
      ? ctx.nodes.map((n) => `  - ${n.name}: ${n.state}, ${n.cpuCores} CPUs, ${(n.memoryMb / 1024).toFixed(1)} GB RAM (ID: ${n.id})`).join('\n')
      : '  - keine Nodes registriert';

    const vmList = ctx.vms.length
      ? ctx.vms.slice(0, 20).map((v) => `  - ${v.name}: ${v.state}, ${v.vcpus} vCPU, ${(v.memoryMb / 1024).toFixed(1)} GB (ID: ${v.id})`).join('\n')
      : '  - keine VMs vorhanden';

    return `Du bist der VCP Infrastructure Assistant — ein KI-Assistent für die Verwaltung von KVM/QEMU-Virtualisierungsinfrastruktur.

DEINE AUFGABEN:
• Beantworte Fragen zu Infrastruktur einfach und verständlich
• Erkläre technische Konzepte (CIDR, VLAN, Storage-Pools, Snapshots, usw.) auf Deutsch
• Analysiere Probleme und schlage Lösungen vor
• Plane Infrastrukturänderungen über das Tool propose_action_plan
• Führe NIEMALS Änderungen aus ohne ausdrückliche Bestätigung des Nutzers

WICHTIGE REGELN:
1. Antworte immer auf Deutsch
2. Plane Aktionen immer mit propose_action_plan — nie implizit durchführen
3. Erkläre Risiken klar: Was ist nicht rückgängig zu machen?
4. Wenn Parameter fehlen oder unklar sind, frage nach bevor du einen Plan erstellst
5. Verwende ausschließlich die Capabilities aus der Liste unten
6. Nutze reale IDs aus dem Cluster-Kontext (nicht erfundene Werte)

AKTUELLER CLUSTER-ZUSTAND:
Nodes: ${ctx.nodes.length} gesamt, ${online} online
VMs: ${ctx.vms.length} gesamt, ${running} laufend, ${stopped} gestoppt

Nodes:
${nodeList}

Verfügbare VMs (neueste 20):
${vmList}

Verfügbare Netzwerke:
${networkList}

Verfügbare Templates:
${templateList}

Storage-Pools:
${poolList}

AKTUELLER BENUTZER:
E-Mail: ${user.email}
Berechtigungen: ${user.permissions.join(', ')}

VERFÜGBARE CAPABILITIES (nur diese dürfen im Aktionsplan verwendet werden):
${JSON.stringify(CAPABILITIES, null, 2)}`;
  }
}
