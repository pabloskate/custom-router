import { responsesSchema } from "@/src/lib/schemas";
import { createRoutedEndpoint } from "@/src/features/routing/server";

export const POST = createRoutedEndpoint({
  schema: responsesSchema,
  apiPath: "/responses",
});
