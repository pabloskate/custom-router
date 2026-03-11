import { describe, expect, it } from "vitest";

import { Homepage } from "./homepage-entry";
import { OssHomepage } from "./oss-homepage";

describe("homepage entry", () => {
  it("exports the OSS homepage by default", () => {
    expect(Homepage).toBe(OssHomepage);
  });
});
