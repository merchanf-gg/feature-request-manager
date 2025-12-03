import { registerApiRoute } from "@mastra/core/server";
import { z } from "zod";

/**
 * Typeform Webhook Response Schema
 * 
 * This schema represents the structure of incoming Typeform webhook payloads.
 * Typeform sends form responses as JSON with this structure.
 */
const typeformAnswerSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
  email: z.string().optional(),
  choice: z.object({
    label: z.string(),
  }).optional(),
  choices: z.object({
    labels: z.array(z.string()),
  }).optional(),
  field: z.object({
    id: z.string(),
    ref: z.string().optional(),
    type: z.string(),
  }),
});

const typeformWebhookSchema = z.object({
  event_id: z.string(),
  event_type: z.string(),
  form_response: z.object({
    form_id: z.string(),
    token: z.string(),
    landed_at: z.string(),
    submitted_at: z.string(),
    definition: z.object({
      id: z.string(),
      title: z.string(),
      fields: z.array(z.object({
        id: z.string(),
        ref: z.string().optional(),
        type: z.string(),
        title: z.string(),
      })),
    }),
    answers: z.array(typeformAnswerSchema),
  }),
});

type TypeformWebhook = z.infer<typeof typeformWebhookSchema>;

/**
 * Maps Typeform field references to our expected field names
 * Update these refs to match your actual Typeform field references
 */
const FIELD_MAPPING = {
  // Feature description field (long_text or short_text)
  feature_description: ["feature_description", "feature_request", "description", "what_feature"],
  // Usage frequency (multiple_choice or short_text)
  usage_frequency: ["usage_frequency", "frequency", "how_often"],
  // Service types (multiple_choice or short_text)
  service_types: ["service_types", "services", "what_services"],
  // User interests (multiple_choice or short_text)
  user_interests: ["interests", "areas", "user_interests"],
  // Contact email (email field)
  contact_email: ["email", "contact_email", "contact"],
};

/**
 * Extracts answer text from a Typeform answer object
 */
function getAnswerValue(answer: z.infer<typeof typeformAnswerSchema>): string {
  if (answer.text) return answer.text;
  if (answer.email) return answer.email;
  if (answer.choice?.label) return answer.choice.label;
  if (answer.choices?.labels) return answer.choices.labels.join(", ");
  return "";
}

/**
 * Finds an answer by field reference or id
 */
function findAnswer(
  answers: z.infer<typeof typeformAnswerSchema>[],
  fieldRefs: string[]
): string | undefined {
  for (const ref of fieldRefs) {
    const answer = answers.find(
      (a) => a.field.ref === ref || a.field.id === ref
    );
    if (answer) {
      return getAnswerValue(answer);
    }
  }
  return undefined;
}

/**
 * Parses Typeform webhook payload into our expected format
 */
function parseTypeformPayload(payload: TypeformWebhook): {
  featureDescription: string;
  usageFrequency?: string;
  serviceTypes?: string;
  userInterests?: string;
  contactEmail?: string;
} {
  const answers = payload.form_response.answers;

  return {
    featureDescription: findAnswer(answers, FIELD_MAPPING.feature_description) || "",
    usageFrequency: findAnswer(answers, FIELD_MAPPING.usage_frequency),
    serviceTypes: findAnswer(answers, FIELD_MAPPING.service_types),
    userInterests: findAnswer(answers, FIELD_MAPPING.user_interests),
    contactEmail: findAnswer(answers, FIELD_MAPPING.contact_email),
  };
}

/**
 * Typeform Webhook Route
 * 
 * Receives Typeform webhook events and processes feature requests through the workflow.
 * 
 * Endpoint: POST /typeform-webhook
 * 
 * Setup Instructions:
 * 1. Go to your Typeform form settings
 * 2. Navigate to Connect > Webhooks
 * 3. Add a new webhook with URL: https://your-domain.com/typeform-webhook
 * 4. Select "form_response" event type
 * 5. Save the webhook
 * 
 * Security Note: In production, you should verify the Typeform signature.
 * Set TYPEFORM_WEBHOOK_SECRET in your environment and verify the x-typeform-signature header.
 */
export const typeformWebhookRoute = registerApiRoute("/typeform-webhook", {
  method: "POST",
  handler: async (c) => {
    try {
      const mastra = c.get("mastra");
      
      // Parse and validate the webhook payload
      const body = await c.req.json();
      
      // Log raw webhook for debugging (remove in production)
      console.log("\n📥 Typeform Webhook Received");
      console.log("Event ID:", body.event_id);
      console.log("Event Type:", body.event_type);

      // Only process form_response events
      if (body.event_type !== "form_response") {
        console.log("Ignoring non-form_response event");
        return c.json({ success: true, message: "Event type ignored" });
      }

      // Validate the payload structure
      const parseResult = typeformWebhookSchema.safeParse(body);
      if (!parseResult.success) {
        console.error("Invalid webhook payload:", parseResult.error);
        return c.json(
          { success: false, error: "Invalid webhook payload" },
          400
        );
      }

      // Parse the Typeform payload into our format
      const featureRequestData = parseTypeformPayload(parseResult.data);

      // Validate we have the required feature description
      if (!featureRequestData.featureDescription) {
        console.error("Missing feature description in webhook payload");
        return c.json(
          { success: false, error: "Missing feature description" },
          400
        );
      }

      console.log("\n📋 Parsed Feature Request:");
      console.log("Description:", featureRequestData.featureDescription.substring(0, 100) + "...");
      console.log("Frequency:", featureRequestData.usageFrequency);
      console.log("Services:", featureRequestData.serviceTypes);

      // Get the workflow and execute it
      const workflow = mastra.getWorkflow("featureRequestWorkflow");
      if (!workflow) {
        console.error("Feature request workflow not found");
        return c.json(
          { success: false, error: "Workflow not found" },
          500
        );
      }

      // Create and run the workflow
      const run = await workflow.createRunAsync();
      const result = await run.start({
        inputData: featureRequestData,
      });

      if (result.status === "success") {
        console.log("\n✅ Feature request processed successfully");
        return c.json({
          success: true,
          message: "Feature request processed",
          data: result.result,
        });
      } else if (result.status === "failed") {
        console.error("Workflow failed:", result.error);
        return c.json(
          { 
            success: false, 
            error: "Workflow execution failed",
            details: result.error,
          },
          500
        );
      } else {
        // Workflow was suspended (shouldn't happen in this workflow)
        console.log("Workflow suspended:", result.suspended);
        return c.json({
          success: true,
          message: "Workflow suspended",
          suspended: result.suspended,
        });
      }
    } catch (error) {
      console.error("Error processing Typeform webhook:", error);
      return c.json(
        { 
          success: false, 
          error: "Internal server error",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  },
});

/**
 * Health check endpoint for the webhook
 */
export const typeformWebhookHealthRoute = registerApiRoute("/typeform-webhook/health", {
  method: "GET",
  handler: async (c) => {
    return c.json({
      status: "healthy",
      service: "feature-request-manager",
      timestamp: new Date().toISOString(),
    });
  },
});

