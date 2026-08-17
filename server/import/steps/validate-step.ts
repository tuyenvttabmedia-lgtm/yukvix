import { validateImages } from "../../services/image-validator";
import { BasePipelineStep, type StepContext, type StepResult } from "../pipeline-step";

export class ValidateStep extends BasePipelineStep {
  readonly name = "validating" as const;

  async run(ctx: StepContext): Promise<StepResult> {
    await ctx.log("Scanning for valid images...");
    const { validImages, invalidImages } = await validateImages(ctx.tempDir);
    for (const inv of invalidImages) {
      await ctx.logFailed(inv.path, inv.reason);
    }
    if (validImages.length === 0) throw new Error("No valid images found in archive");

    ctx.validImages = validImages;
    await ctx.log(`Found ${validImages.length} valid images (${invalidImages.length} skipped)`);

    return { outcome: "continue" };
  }
}
