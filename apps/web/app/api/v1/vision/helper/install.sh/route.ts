import { handleGetVisionHelperInstallScript } from "@/src/features/vision/server/vision-helper-install-route";

export async function GET(request: Request): Promise<Response> {
  return handleGetVisionHelperInstallScript(request);
}
