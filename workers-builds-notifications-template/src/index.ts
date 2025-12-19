/**
 * Cloudflare Workers Builds → Slack Notifications
 *
 * This worker consumes build events from a Cloudflare Queue and sends
 * notifications to Slack with:
 * - Preview/Live URLs for successful builds
 * - Full build logs for failed/cancelled builds
 *
 * @see https://developers.cloudflare.com/workers/ci-cd/builds
 * @see https://developers.cloudflare.com/queues/
 * @see https://developers.cloudflare.com/queues/event-subscriptions/
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface Env {
  /** Slack incoming webhook URL */
  SLACK_WEBHOOK_URL: string;
  /** Cloudflare API token with Workers Builds Configuration: Read permission */
  CLOUDFLARE_API_TOKEN: string;
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Cloudflare Workers Builds event structure
 * @see https://developers.cloudflare.com/workers/ci-cd/builds/events/
 */
interface CloudflareEvent {
  /** Event type (e.g., "cf.workersBuilds.worker.build.succeeded") */
  type: string;
  /** Event source information */
  source: {
    type: string;
    workerName?: string;
  };
  /** Build details */
  payload: {
    buildUuid: string;
    status: string;
    buildOutcome: 'success' | 'fail' | 'cancelled' | null;
    createdAt: string;
    initializingAt?: string;
    runningAt?: string;
    stoppedAt?: string;
    buildTriggerMetadata?: {
      buildTriggerSource: string;
      branch: string;
      commitHash: string;
      commitMessage: string;
      author: string;
      buildCommand: string;
      deployCommand: string;
      rootDirectory: string;
      repoName: string;
      providerAccountName: string;
      providerType: string;
    };
  };
  /** Event metadata */
  metadata: {
    accountId: string;
    eventSubscriptionId: string;
    eventSchemaVersion: number;
    eventTimestamp: string;
  };
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export default {
  async queue(batch: MessageBatch<CloudflareEvent>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        const event = message.body;

        // Get worker name from source or payload
        const workerName = event.source.workerName || event.payload.buildTriggerMetadata?.repoName;

        // ---------------------------------------------------------------------
        // STATUS DETECTION
        // ---------------------------------------------------------------------

        // Check buildOutcome for accurate status
        // Note: Cancelled builds come as "failed" event type with buildOutcome: "cancelled"
        const buildOutcome = event.payload.buildOutcome;
        const isCancelled = buildOutcome === 'cancelled' || buildOutcome === 'canceled';
        const isFailed = event.type.includes('failed') && !isCancelled;
        const isSucceeded = event.type.includes('succeeded');
        const isStarted = event.type.includes('started') || event.type.includes('queued');

        // ---------------------------------------------------------------------
        // EMOJI & COLOR
        // ---------------------------------------------------------------------

        let emoji = '📢';
        let color = '#808080'; // gray

        if (isSucceeded) {
          emoji = '✅';
          color = '#36a64f'; // green
        } else if (isCancelled) {
          emoji = '⚠️';
          color = '#ffa500'; // orange
        } else if (isFailed) {
          emoji = '❌';
          color = '#ff0000'; // red
        } else if (isStarted) {
          emoji = '🚀';
          color = '#3AA3E3'; // blue
        }

        // ---------------------------------------------------------------------
        // BUILD MESSAGE TEXT
        // ---------------------------------------------------------------------

        let messageText = `${emoji} ${event.type}${isCancelled ? ' (cancelled)' : ''}`;
        let logsText = '';

        // ---------------------------------------------------------------------
        // SUCCESS: Add Preview or Live URL
        // ---------------------------------------------------------------------

        if (isSucceeded && workerName) {
          // Fetch build details to get preview_url
          const buildRes = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${event.metadata.accountId}/builds/builds/${event.payload.buildUuid}`,
            { headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } }
          );
          const buildData: any = await buildRes.json();

          if (buildData.result?.preview_url) {
            // Non-production build → Preview URL
            messageText += `\n🔮 <${buildData.result.preview_url}|Preview URL>`;
          } else {
            // Production build → Live Worker URL
            const subRes = await fetch(
              `https://api.cloudflare.com/client/v4/accounts/${event.metadata.accountId}/workers/subdomain`,
              { headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } }
            );
            const subData: any = await subRes.json();
            const subdomain = subData.result?.subdomain;

            if (subdomain) {
              messageText += `\n🌐 <https://${workerName}.${subdomain}.workers.dev|Live Worker>`;
            }
          }
        }

        // ---------------------------------------------------------------------
        // FAILED/CANCELLED: Add Logs Link and Fetch Logs
        // ---------------------------------------------------------------------

        if (isFailed || isCancelled) {
          const logsWorkerName = event.source.workerName || event.payload.buildTriggerMetadata?.repoName;

          if (logsWorkerName) {
            // Dashboard link to build logs
            const logsUrl = `https://dash.cloudflare.com/${event.metadata.accountId}/workers/services/view/${logsWorkerName}/production/builds/${event.payload.buildUuid}`;
            messageText += `\n📋 <${logsUrl}|View Build Logs>`;

            // Fetch build logs with pagination
            let allLines: string[] = [];
            let cursor: string | null = null;

            do {
              const logsEndpoint = cursor
                ? `https://api.cloudflare.com/client/v4/accounts/${event.metadata.accountId}/builds/builds/${event.payload.buildUuid}/logs?cursor=${cursor}`
                : `https://api.cloudflare.com/client/v4/accounts/${event.metadata.accountId}/builds/builds/${event.payload.buildUuid}/logs`;

              const logsRes = await fetch(logsEndpoint, {
                headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
              });
              const logsData: any = await logsRes.json();

              if (logsData.result?.lines?.length > 0) {
                // Lines are [timestamp, message] tuples
                const lines = logsData.result.lines.map((l: [number, string]) => l[1]);
                allLines = allLines.concat(lines);
              }

              // Continue if there are more logs
              cursor = logsData.result?.truncated ? logsData.result?.cursor : null;
            } while (cursor);

            // Format logs text
            if (allLines.length > 0) {
              logsText = allLines.join('\n');

              // Truncate if too long for Slack (keep the end, which has the error)
              const maxLogsLength = 30000;
              if (logsText.length > maxLogsLength) {
                logsText = logsText.substring(logsText.length - maxLogsLength);
                logsText = '[...truncated]\n' + logsText;
              }
            }
          }
        }

        // ---------------------------------------------------------------------
        // FORMAT EVENT JSON
        // ---------------------------------------------------------------------

        // Reorder event to match documentation structure
        const orderedEvent = {
          type: event.type,
          source: {
            type: event.source.type,
            workerName: event.source.workerName,
          },
          payload: event.payload,
          metadata: event.metadata,
        };

        // ---------------------------------------------------------------------
        // BUILD SLACK ATTACHMENTS
        // ---------------------------------------------------------------------

        const attachments: any[] = [
          {
            color,
            text: JSON.stringify(orderedEvent, null, 2),
          },
        ];

        // Add logs as separate attachment if present
        if (logsText) {
          attachments.push({
            color: isCancelled ? '#ffa500' : '#ff0000',
            title: '📜 Build Logs',
            text: logsText,
          });
        }

        // ---------------------------------------------------------------------
        // SEND TO SLACK
        // ---------------------------------------------------------------------

        await fetch(env.SLACK_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: messageText,
            attachments,
          }),
        });

        // Acknowledge message as processed
        message.ack();
      } catch (error) {
        console.error('Error processing message:', error);
        // Still acknowledge to prevent infinite retries
        message.ack();
      }
    }
  },
};
