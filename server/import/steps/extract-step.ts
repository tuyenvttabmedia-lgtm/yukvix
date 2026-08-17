import { validateArchive, extractArchive } from "../../services/archive-validator";
import { BasePipelineStep, type StepContext, type StepResult } from "../pipeline-step";

export class ExtractStep extends BasePipelineStep {
  readonly name = "extracting" as const;

  async run(ctx: StepContext): Promise<StepResult> {
    if (!ctx.localArchivePath) throw new Error("Archive not downloaded");

    await ctx.log("Validating archive...");
    const validation = await validateArchive(ctx.localArchivePath, {
      maxUploadSize: parseInt(
        process.env.IMPORT_MAX_UPLOAD_SIZE_BYTES || String(4 * 1024 * 1024 * 1024)
      ),
      maxExtractedSize: parseInt(
        process.env.IMPORT_MAX_EXTRACTED_SIZE_BYTES || String(20 * 1024 * 1024 * 1024)
      ),
      maxFileCount: parseInt(process.env.IMPORT_MAX_FILE_COUNT || "2000"),
      allowedTypes: ["jpg", "jpeg", "png", "webp"],
    });
    await ctx.log(
      `Archive validated: ${validation.validImages} images, ${validation.totalFiles} total files`
    );

    await ctx.log("Extracting archive...");
    await extractArchive(ctx.localArchivePath, ctx.tempDir, null);
    await ctx.log("Archive extracted");

    return { outcome: "continue" };
  }
}
