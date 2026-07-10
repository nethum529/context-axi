#!/usr/bin/env node
import { main } from "../src/cli.js";

main().then((code) => {
  process.exitCode = code;
});
