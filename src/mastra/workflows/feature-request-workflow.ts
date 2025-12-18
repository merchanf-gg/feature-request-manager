import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

const formInputSchema = z.object({
    text: z.string().describe("The whole Typeform response as a text string"),
  });

const jiraStoryOutputSchema = z.object({
  summary: z.string().describe("Short Jira ticket title / summary"),
  description: z.string().describe("The description of the Jira story"),
  acceptanceCriteria: z.string().describe("The acceptance criteria of the Jira story"),
  noteForQA: z.string().describe("A note for the QA team to test the story"),
  storyPoints: z.number().describe("The story points of the Jira story"),
  // Highest priority is 1, lowest priority is 5
  priority: z.enum(["1", "2", "3", "4", "5"]).describe("The priority of the Jira story"),
});


const analyzeFeatureRequest = createStep({
  id: "analyze-feature-request",
  description: "Analyzes the feature request and prepares it for Jira using AI",
  inputSchema: formInputSchema,
  outputSchema: jiraStoryOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const { text } = inputData;

    const agent = mastra?.getAgent("jiraFeatureRequestAgent");
    if (!agent) {
      throw new Error("Jira Feature Request agent not found");
    }

    console.log("🎫 Analyzing feature request and generating Jira ticket...");

    // Build a structured prompt for the agent with the raw Typeform response
    const prompt = `Please analyze the following Typeform feature request submission and generate a complete Jira ticket specification.

## Raw Typeform Response

${text}

---

Extract the relevant information from this submission (feature description, usage frequency, service types, user interests) and generate a comprehensive Jira ticket with all required fields. Remember to:
1. Create an actionable, specific ticket title
2. Include detailed problem statement and proposed solution
3. Write 8-12 testable acceptance criteria
4. Provide thorough QA testing notes
5. Estimate story points with justification
6. Assign appropriate priority based on the scoring rubric
7. Do NOT include any user email or PII in the output

Return ONLY valid JSON with no markdown formatting.`;

    const response = await agent.generate(prompt);
    const responseText = response.text.trim();

    // Parse the JSON response from the agent
    let parsedResponse;
    try {
      // Try to extract JSON from the response if it's wrapped in markdown
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        parsedResponse = JSON.parse(responseText);
      }
    } catch (error) {
      console.error("Failed to parse agent response:", responseText);
      throw new Error(`Failed to parse Jira ticket response: ${error}`);
    }

    // Validate and extract required fields
    const summary = parsedResponse.summary || `[Feature] - ${text.substring(0, 80)}`;
    const description = parsedResponse.description || "";
    const acceptanceCriteria = parsedResponse.acceptanceCriteria || "";
    const noteForQA = parsedResponse.noteForQA || "";
    const storyPoints = typeof parsedResponse.storyPoints === "number" 
      ? parsedResponse.storyPoints 
      : 5; // Default to 5 if not provided
    const priority = ["1", "2", "3", "4", "5"].includes(parsedResponse.priority) 
      ? parsedResponse.priority 
      : "3"; // Default to medium priority

    console.log("✅ Jira ticket generated successfully");
    console.log(`   Title: ${summary}`);
    console.log(`   Priority: P${priority} | Story Points: ${storyPoints}`);

    return {
      summary,
      description,
      acceptanceCriteria,
      noteForQA,
      storyPoints,
      priority: priority as "1" | "2" | "3" | "4" | "5",
    };
  },
});

const featureRequestWorkflow = createWorkflow({
  id: "feature-request-workflow",
  description: "Processes feature requests: sanitizes PII, analyzes with LLM, and prepares a Jira-ready story",
  inputSchema: formInputSchema,
  outputSchema: jiraStoryOutputSchema,
})
  // Webhook route already provides structured fields; analyze directly.
  .then(analyzeFeatureRequest)

featureRequestWorkflow.commit();

export { featureRequestWorkflow };

