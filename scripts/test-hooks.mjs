// 테스트 전용 모듈 해석 규칙. Node 내장 테스트(node --test)로 TypeScript 파일을 바로 돌리려고 쓴다.
// 새 라이브러리 없이 두 가지만 처리한다: "@/" 경로를 레포 루트로, 확장자 없는 상대 경로에 ".ts" 붙이기.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function withTs(filePath) {
  for (const candidate of [filePath, `${filePath}.ts`, path.join(filePath, "index.ts")]) {
    if (existsSync(candidate) && !candidate.endsWith(path.sep)) {
      if (candidate === filePath && !path.extname(candidate)) continue;
      return candidate;
    }
  }
  return null;
}

export async function resolve(specifier, context, next) {
  let target = null;
  if (specifier.startsWith("@/")) {
    target = withTs(path.join(root, specifier.slice(2)));
  } else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    target = withTs(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
  }
  if (target) {
    const url = pathToFileURL(target).href;
    return next(url, target.endsWith(".json") ? { ...context, importAttributes: { type: "json" } } : context);
  }
  return next(specifier, context);
}
