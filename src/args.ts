export type ParsedArgs = {
  cwd?: string;
  session?: string;
  transcript?: string;
  window?: number;
  json: boolean;
  help: boolean;
  version: boolean;
};

export class CliError extends Error {
  readonly exitCode: number;
  readonly code: string;

  constructor(code: string, message: string, exitCode = 2) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

type FlagSpec = {
  name: string;
  aliases?: string[];
  takesValue: boolean;
  apply: (result: ParsedArgs, value: string) => void;
};

const FLAG_SPECS: FlagSpec[] = [
  {
    name: "--cwd",
    takesValue: true,
    apply: (result, value) => {
      result.cwd = value;
    },
  },
  {
    name: "--session",
    takesValue: true,
    apply: (result, value) => {
      result.session = value;
    },
  },
  {
    name: "--transcript",
    takesValue: true,
    apply: (result, value) => {
      result.transcript = value;
    },
  },
  {
    name: "--window",
    takesValue: true,
    apply: (result, value) => {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) {
        throw new CliError(
          "invalid_window",
          `--window must be a positive number, got: ${value}`,
        );
      }
      result.window = Math.floor(n);
    },
  },
  {
    name: "--json",
    takesValue: false,
    apply: (result) => {
      result.json = true;
    },
  },
  {
    name: "--help",
    aliases: ["-h"],
    takesValue: false,
    apply: (result) => {
      result.help = true;
    },
  },
  {
    name: "--version",
    aliases: ["-v", "-V"],
    takesValue: false,
    apply: (result) => {
      result.version = true;
    },
  },
];

const FLAG_BY_TOKEN = new Map<string, FlagSpec>();
for (const spec of FLAG_SPECS) {
  FLAG_BY_TOKEN.set(spec.name, spec);
  for (const alias of spec.aliases ?? []) {
    FLAG_BY_TOKEN.set(alias, spec);
  }
}

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = { json: false, help: false, version: false };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    const spec = FLAG_BY_TOKEN.get(token);

    if (!spec) {
      throw new CliError(
        "unknown_flag",
        `Unknown flag: ${token}. Run with --help for usage.`,
      );
    }

    if (spec.takesValue) {
      const value = argv[i + 1];
      if (value === undefined || FLAG_BY_TOKEN.has(value)) {
        throw new CliError("missing_value", `Flag ${token} requires a value.`);
      }
      i++;
      spec.apply(result, value);
    } else {
      spec.apply(result, "");
    }
  }

  return result;
}
