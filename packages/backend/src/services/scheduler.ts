// Scheduler Service
// Manages cron jobs for schedule-trigger nodes

import { CronJob } from 'cron';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { getExecutionService } from './execution-service.js';

interface ScheduledJob {
  workflowId: string;
  nodeId: string;
  cronExpression: string;
  job: CronJob;
}

class Scheduler {
  private jobs: Map<string, ScheduledJob> = new Map();

  // Initialize scheduler - load all active workflows with schedule triggers
  async initialize(): Promise<void> {
    console.log('Initializing scheduler...');

    const activeWorkflows = await db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.active, true));

    for (const workflow of activeWorkflows) {
      await this.registerWorkflowSchedules(workflow.id, workflow.definition);
    }

    console.log(`Scheduler initialized with ${this.jobs.size} jobs`);
  }

  // Register all schedule-trigger nodes for a workflow
  async registerWorkflowSchedules(workflowId: string, definition: any): Promise<void> {
    const scheduleNodes = definition.nodes.filter(
      (node: any) => node.type === 'schedule-trigger'
    );

    for (const node of scheduleNodes) {
      const config = node.data?.config || {};
      const cronExpression = config.cronExpression || config.cron;

      if (!cronExpression) {
        console.warn(`Schedule node ${node.id} in workflow ${workflowId} has no cron expression`);
        continue;
      }

      const jobKey = `${workflowId}:${node.id}`;

      // Stop existing job if any
      if (this.jobs.has(jobKey)) {
        this.jobs.get(jobKey)!.job.stop();
      }

      try {
        const job = new CronJob(
          cronExpression,
          async () => {
            console.log(`Cron triggered for workflow ${workflowId}, node ${node.id}`);
            try {
              const service = getExecutionService();
              await service.executeWorkflow(workflowId, 'schedule', {
                scheduledAt: new Date().toISOString(),
                cronExpression,
                nodeId: node.id,
              });
            } catch (error) {
              console.error(`Failed to execute scheduled workflow ${workflowId}:`, error);
            }
          },
          null, // onComplete
          true, // start immediately
          config.timezone || undefined
        );

        this.jobs.set(jobKey, {
          workflowId,
          nodeId: node.id,
          cronExpression,
          job,
        });

        console.log(`Registered cron job for ${jobKey}: ${cronExpression}`);
      } catch (error) {
        console.error(`Invalid cron expression for ${jobKey}: ${cronExpression}`, error);
      }
    }
  }

  // Unregister all schedule jobs for a workflow
  unregisterWorkflow(workflowId: string): void {
    const keysToRemove: string[] = [];

    for (const [key, scheduled] of this.jobs) {
      if (scheduled.workflowId === workflowId) {
        scheduled.job.stop();
        keysToRemove.push(key);
        console.log(`Unregistered cron job: ${key}`);
      }
    }

    for (const key of keysToRemove) {
      this.jobs.delete(key);
    }
  }

  // Get status of all jobs
  getStatus(): Array<{ workflowId: string; nodeId: string; cronExpression: string; nextRun: Date | null }> {
    return Array.from(this.jobs.values()).map((scheduled) => ({
      workflowId: scheduled.workflowId,
      nodeId: scheduled.nodeId,
      cronExpression: scheduled.cronExpression,
      nextRun: scheduled.job.nextDate()?.toJSDate() || null,
    }));
  }

  // Stop all jobs
  shutdown(): void {
    for (const [key, scheduled] of this.jobs) {
      scheduled.job.stop();
      console.log(`Stopped cron job: ${key}`);
    }
    this.jobs.clear();
  }
}

// Singleton instance
let scheduler: Scheduler | null = null;

export function initScheduler(): Scheduler {
  if (!scheduler) {
    scheduler = new Scheduler();
  }
  return scheduler;
}

export function getScheduler(): Scheduler {
  if (!scheduler) {
    throw new Error('Scheduler not initialized. Call initScheduler() first.');
  }
  return scheduler;
}
