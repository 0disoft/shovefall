import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cacheDirectory = join(repositoryRoot, ".cache", "imagegen");
const outputDirectory = join(repositoryRoot, "src", "assets", "generated");
const codexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex");
const chromaHelper = join(
  codexHome,
  "skills",
  ".system",
  "imagegen",
  "scripts",
  "remove_chroma_key.py",
);

const resizeAndValidate = String.raw`
from PIL import Image
import json
import sys

source_path, output_path = sys.argv[1], sys.argv[2]
image = Image.open(source_path).convert("RGBA")
image = image.resize((768, 768), Image.Resampling.LANCZOS)
alpha = image.getchannel("A")
corners = [alpha.getpixel((0, 0)), alpha.getpixel((767, 0)), alpha.getpixel((0, 767)), alpha.getpixel((767, 767))]
bounds = alpha.getbbox()
if bounds is None:
    raise RuntimeError("character motion sheet has no opaque pixels")
if any(value != 0 for value in corners):
    raise RuntimeError(f"character motion sheet corners are not transparent: {corners}")
image.save(output_path, optimize=True)
print(json.dumps({"output": output_path, "size": image.size, "bounds": bounds, "corners": corners}))
`;

function runPython(arguments_: readonly string[], label: string): void {
  const result = spawnSync("python", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(
      `${label} failed with exit ${result.status ?? "unknown"}: ${result.stderr || result.stdout}`,
    );
  }

  if (result.stdout.trim().length > 0) {
    process.stdout.write(result.stdout);
  }
}

if (!existsSync(chromaHelper)) {
  throw new Error(`Missing installed image-generation helper: ${chromaHelper}`);
}

mkdirSync(cacheDirectory, { recursive: true });
mkdirSync(outputDirectory, { recursive: true });

for (let batch = 1; batch <= 4; batch += 1) {
  const source = join(cacheDirectory, `character-motion-source-${batch}.png`);
  const alphaIntermediate = join(cacheDirectory, `character-motion-alpha-${batch}.png`);
  const output = join(outputDirectory, `character-motion-${batch}.png`);

  if (!existsSync(source)) {
    throw new Error(`Missing generated image source: ${source}`);
  }

  runPython(
    [
      chromaHelper,
      "--input",
      source,
      "--out",
      alphaIntermediate,
      "--auto-key",
      "border",
      "--soft-matte",
      "--transparent-threshold",
      "12",
      "--opaque-threshold",
      "220",
      "--despill",
    ],
    `chroma removal for batch ${batch}`,
  );
  runPython(["-c", resizeAndValidate, alphaIntermediate, output], `resize for batch ${batch}`);
}
