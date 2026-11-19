// node --import ./scripts/register-test-hooks.mjs 로 test-hooks.mjs를 켠다
import { register } from "node:module";

register("./test-hooks.mjs", import.meta.url);
