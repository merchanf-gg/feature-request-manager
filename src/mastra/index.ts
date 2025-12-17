import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";

// Agents
import { featureRequestAgent } from "./agents/feature-request-agent";
import { typeformParserAgent } from "./agents/typeform-parser-agent";

// Workflows
import { featureRequestWorkflow } from "./workflows/feature-request-workflow";

// Routes
import { typeformWebhookRoute, typeformWebhookHealthRoute } from "./routes/typeform-webhook";
import { VercelDeployer } from "@mastra/deployer-vercel";

export const mastra = new Mastra({
  agents: { 
    featureRequestAgent,
    typeformParserAgent,
  },
  workflows: { 
    featureRequestWorkflow,
  },
  deployer: new VercelDeployer({
    maxDuration: 600,
    memory: 1536,
    regions: ["iad1"],
  }),
  storage: new LibSQLStore({
    // Stores workflow snapshots, traces, etc.
    // For production, change to: url: process.env.DATABASE_URL
    url: ":memory:",
  }),
  server: {
    port: 4111,
    apiRoutes: [
      typeformWebhookRoute,
      typeformWebhookHealthRoute,
    ],
    cors: {
      origin: ["*"], // Configure for your domain in production
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Typeform-Signature"],
    },
  },
  logger: new PinoLogger({
    name: "FeatureRequestManager",
    level: "info",
  }),
  observability: {
    default: { enabled: true },
  },
});
