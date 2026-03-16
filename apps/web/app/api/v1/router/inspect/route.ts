import { chatCompletionSchema } from "@/src/lib/schemas";
import { createRoutedEndpoint } from "@/src/features/routing/server";

export const POST = createRoutedEndpoint({
  schema: chatCompletionSchema,
  apiPath: "/chat/completions",
  dryRun: true,
});
