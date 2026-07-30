import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_IDS = [
  "blink-step",
  "arc-bolt",
  "chain-bind",
  "meteor-mark",
  "frost-field",
  "aegis",
] as const;

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

source_path, output_path, skill_id = sys.argv[1], sys.argv[2], sys.argv[3]
image = Image.open(source_path).convert("RGBA")
pixels = image.load()
for y in range(image.height):
    for x in range(image.width):
        red, green, blue, alpha_value = pixels[x, y]
        magenta_dominance = min(red, blue) - green
        if alpha_value == 0 or red < 90 or blue < 80 or magenta_dominance <= 18:
            continue
        if magenta_dominance >= 48:
            alpha_value = 0
        else:
            alpha_value = round(alpha_value * (48 - magenta_dominance) / 30)
        pixels[x, y] = (red, green, blue, max(0, alpha_value))

alpha = image.getchannel("A")
bounds = alpha.getbbox()
if bounds is None:
    raise RuntimeError(f"{skill_id} has no opaque pixels")

cropped = image.crop(bounds)
max_subject_extent = 232
scale = min(max_subject_extent / cropped.width, max_subject_extent / cropped.height)
size = (
    max(1, round(cropped.width * scale)),
    max(1, round(cropped.height * scale)),
)
cropped = cropped.resize(size, Image.Resampling.LANCZOS)

output = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
offset = ((256 - size[0]) // 2, (256 - size[1]) // 2)
output.alpha_composite(cropped, offset)
output_alpha = output.getchannel("A")
output_bounds = output_alpha.getbbox()
corners = [
    output_alpha.getpixel((0, 0)),
    output_alpha.getpixel((255, 0)),
    output_alpha.getpixel((0, 255)),
    output_alpha.getpixel((255, 255)),
]
if output_bounds is None:
    raise RuntimeError(f"{skill_id} output has no opaque pixels")
if any(value != 0 for value in corners):
    raise RuntimeError(f"{skill_id} corners are not transparent: {corners}")

output.save(output_path, optimize=True)
print(json.dumps({
    "skill": skill_id,
    "output": output_path,
    "size": output.size,
    "bounds": output_bounds,
    "corners": corners,
}))
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

const sources = process.argv.slice(2).map((source) => resolve(source));
if (sources.length !== SKILL_IDS.length) {
  throw new RangeError(
    `Expected ${SKILL_IDS.length} skill icon sources, received ${sources.length}`,
  );
}

mkdirSync(cacheDirectory, { recursive: true });
mkdirSync(outputDirectory, { recursive: true });

for (const [index, skillId] of SKILL_IDS.entries()) {
  const source = sources[index];
  if (source === undefined || !existsSync(source)) {
    throw new Error(`Missing reviewed source for ${skillId}: ${source ?? "undefined"}`);
  }

  const alphaIntermediate = join(cacheDirectory, `skill-icon-alpha-${skillId}.png`);
  const output = join(outputDirectory, `skill-icon-${skillId}.png`);
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
      "--edge-contract",
      "1",
      "--force",
    ],
    `chroma removal for ${skillId}`,
  );
  runPython(
    ["-c", resizeAndValidate, alphaIntermediate, output, skillId],
    `resize and validation for ${skillId}`,
  );
}
