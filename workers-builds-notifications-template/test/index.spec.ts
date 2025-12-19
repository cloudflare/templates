import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock types for Workers Builds events
interface BuildEvent {
  type: string;
  source: {
    type: string;
    workerName: string;
  };
  payload: {
    buildUuid: string;
    status: string;
    buildOutcome: string;
    createdAt: string;
    stoppedAt?: string;
    buildTriggerMetadata?: {
      buildTriggerSource: string;
      branch: string;
      commitHash: string;
      commitMessage: string;
      author: string;
      repoName: string;
      providerType: string;
    };
  };
  metadata: {
    accountId: string;
    eventTimestamp: string;
  };
}

// Helper to create mock build events
function createMockBuildEvent(overrides: Partial<BuildEvent> = {}): BuildEvent {
  return {
    type: "cf.workersBuilds.worker.build.succeeded",
    source: {
      type: "workersBuilds.worker",
      workerName: "test-worker",
    },
    payload: {
      buildUuid: "build-12345678-90ab-cdef-1234-567890abcdef",
      status: "stopped",
      buildOutcome: "success",
      createdAt: "2025-05-01T02:48:57.132Z",
      stoppedAt: "2025-05-01T02:50:15.132Z",
      buildTriggerMetadata: {
        buildTriggerSource: "push_event",
        branch: "main",
        commitHash: "abc123def456",
        commitMessage: "Fix bug in authentication",
        author: "developer@example.com",
        repoName: "test-worker-repo",
        providerType: "github",
      },
    },
    metadata: {
      accountId: "test-account-id",
      eventTimestamp: "2025-05-01T02:48:57.132Z",
    },
    ...overrides,
  };
}

// Helper to create a mock message
function createMockMessage(event: BuildEvent) {
  return {
    id: "msg-" + Math.random().toString(36).substr(2, 9),
    timestamp: new Date(),
    body: event,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

describe("Workers Builds Notifications", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("Event Parsing", () => {
    it("should correctly identify a successful build event", () => {
      const event = createMockBuildEvent({
        type: "cf.workersBuilds.worker.build.succeeded",
        payload: {
          buildUuid: "build-123",
          status: "stopped",
          buildOutcome: "success",
          createdAt: "2025-05-01T02:48:57.132Z",
          stoppedAt: "2025-05-01T02:50:15.132Z",
        },
      });

      expect(event.type).toBe("cf.workersBuilds.worker.build.succeeded");
      expect(event.payload.buildOutcome).toBe("success");
    });

    it("should correctly identify a failed build event", () => {
      const event = createMockBuildEvent({
        type: "cf.workersBuilds.worker.build.failed",
        payload: {
          buildUuid: "build-456",
          status: "stopped",
          buildOutcome: "failure",
          createdAt: "2025-05-01T02:48:57.132Z",
          stoppedAt: "2025-05-01T02:50:15.132Z",
        },
      });

      expect(event.type).toBe("cf.workersBuilds.worker.build.failed");
      expect(event.payload.buildOutcome).toBe("failure");
    });

    it("should correctly identify a cancelled build event", () => {
      const event = createMockBuildEvent({
        type: "cf.workersBuilds.worker.build.failed",
        payload: {
          buildUuid: "build-789",
          status: "stopped",
          buildOutcome: "cancelled",
          createdAt: "2025-05-01T02:48:57.132Z",
          stoppedAt: "2025-05-01T02:50:15.132Z",
        },
      });

      expect(event.type).toBe("cf.workersBuilds.worker.build.failed");
      expect(event.payload.buildOutcome).toBe("cancelled");
    });

    it("should correctly identify a build started event", () => {
      const event = createMockBuildEvent({
        type: "cf.workersBuilds.worker.build.started",
        payload: {
          buildUuid: "build-000",
          status: "running",
          buildOutcome: "",
          createdAt: "2025-05-01T02:48:57.132Z",
        },
      });

      expect(event.type).toBe("cf.workersBuilds.worker.build.started");
      expect(event.payload.status).toBe("running");
    });

    it("should extract worker name from source", () => {
      const event = createMockBuildEvent({
        source: {
          type: "workersBuilds.worker",
          workerName: "my-awesome-worker",
        },
      });

      expect(event.source.workerName).toBe("my-awesome-worker");
    });
  });

  describe("Build Metadata", () => {
    it("should extract git metadata from build trigger", () => {
      const event = createMockBuildEvent();

      expect(event.payload.buildTriggerMetadata?.branch).toBe("main");
      expect(event.payload.buildTriggerMetadata?.commitHash).toBe("abc123def456");
      expect(event.payload.buildTriggerMetadata?.commitMessage).toBe("Fix bug in authentication");
      expect(event.payload.buildTriggerMetadata?.author).toBe("developer@example.com");
      expect(event.payload.buildTriggerMetadata?.providerType).toBe("github");
    });

    it("should handle events without build trigger metadata", () => {
      const event = createMockBuildEvent({
        payload: {
          buildUuid: "build-123",
          status: "stopped",
          buildOutcome: "success",
          createdAt: "2025-05-01T02:48:57.132Z",
          stoppedAt: "2025-05-01T02:50:15.132Z",
          buildTriggerMetadata: undefined,
        },
      });

      expect(event.payload.buildTriggerMetadata).toBeUndefined();
    });

    it("should calculate build duration from timestamps", () => {
      const event = createMockBuildEvent({
        payload: {
          buildUuid: "build-123",
          status: "stopped",
          buildOutcome: "success",
          createdAt: "2025-05-01T02:48:57.132Z",
          stoppedAt: "2025-05-01T02:50:15.132Z",
        },
      });

      const start = new Date(event.payload.createdAt).getTime();
      const end = new Date(event.payload.stoppedAt!).getTime();
      const durationSeconds = (end - start) / 1000;

      expect(durationSeconds).toBeCloseTo(78, 0); // ~78 seconds
    });
  });

  describe("Message Handling", () => {
    it("should create valid message objects", () => {
      const event = createMockBuildEvent();
      const message = createMockMessage(event);

      expect(message.body).toEqual(event);
      expect(typeof message.ack).toBe("function");
      expect(typeof message.retry).toBe("function");
    });

    it("should handle batch of multiple messages", () => {
      const events = [
        createMockBuildEvent({ type: "cf.workersBuilds.worker.build.started" }),
        createMockBuildEvent({ type: "cf.workersBuilds.worker.build.succeeded" }),
        createMockBuildEvent({ type: "cf.workersBuilds.worker.build.failed" }),
      ];

      const messages = events.map(createMockMessage);

      expect(messages.length).toBe(3);
      expect(messages[0].body.type).toBe("cf.workersBuilds.worker.build.started");
      expect(messages[1].body.type).toBe("cf.workersBuilds.worker.build.succeeded");
      expect(messages[2].body.type).toBe("cf.workersBuilds.worker.build.failed");
    });
  });

  describe("Notification Formatting", () => {
    it("should determine correct emoji for success", () => {
      const event = createMockBuildEvent({ type: "cf.workersBuilds.worker.build.succeeded" });
      const emoji = event.type.includes("succeeded") ? "✅" : "❌";
      expect(emoji).toBe("✅");
    });

    it("should determine correct emoji for failure", () => {
      const event = createMockBuildEvent({ type: "cf.workersBuilds.worker.build.failed" });
      const emoji = event.type.includes("succeeded") ? "✅" : "❌";
      expect(emoji).toBe("❌");
    });

    it("should identify preview vs production branch", () => {
      const mainBranchEvent = createMockBuildEvent({
        payload: {
          buildUuid: "build-123",
          status: "stopped",
          buildOutcome: "success",
          createdAt: "2025-05-01T02:48:57.132Z",
          buildTriggerMetadata: {
            buildTriggerSource: "push_event",
            branch: "main",
            commitHash: "abc123",
            commitMessage: "test",
            author: "test@example.com",
            repoName: "test-repo",
            providerType: "github",
          },
        },
      });

      const featureBranchEvent = createMockBuildEvent({
        payload: {
          buildUuid: "build-456",
          status: "stopped",
          buildOutcome: "success",
          createdAt: "2025-05-01T02:48:57.132Z",
          buildTriggerMetadata: {
            buildTriggerSource: "push_event",
            branch: "feature/new-feature",
            commitHash: "def456",
            commitMessage: "test",
            author: "test@example.com",
            repoName: "test-repo",
            providerType: "github",
          },
        },
      });

      const isMainBranch = (branch: string) => ["main", "master"].includes(branch);

      expect(isMainBranch(mainBranchEvent.payload.buildTriggerMetadata!.branch)).toBe(true);
      expect(isMainBranch(featureBranchEvent.payload.buildTriggerMetadata!.branch)).toBe(false);
    });
  });
});
