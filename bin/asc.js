var fs = require("fs");
var path = require("path");
var minimist = require("minimist");

var assemblyscript;
var isDev = true;
try {
  assemblyscript = require("../dist/assemblyscript.js");
  require("source-map-support").install();
  isDev = false;
} catch (e) {
  require("ts-node").register({ project: require("path").join(__dirname, "..", "src") });
  require("../src/glue/js");
  assemblyscript = require("../src");
}

var conf = require("./asc.json");
var opts = {};

Object.keys(conf).forEach(key => {
  var opt = conf[key];
  if (opt.aliases)
    (opts.alias || (opts.alias = {}))[key] = opt.aliases;
  if (opt.default !== undefined)
    (opts.default || (opts.default = {}))[key] = opt.default;
  if (opt.type === "string")
    (opts.string || (opts.string = [])).push(key);
  else if (opt.type === "boolean")
    (opts.boolean || (opts.boolean = [])).push(key);
});

var args = minimist(process.argv.slice(2), opts);
var version = require("../package.json").version;
var indent = 20;
if (isDev) version += "-dev";

if (args.version) {
  console.log([
    "Version " + version
  ].join("\n"));
  process.exit(0);
}

if (args.help || args._.length < 1) {
  var options = [];
  Object.keys(conf).forEach(name => {
    var option = conf[name];
    var text = " ";
    if (option.aliases && option.aliases[0].length === 1)
      text += "-" + option.aliases[0] + ", ";
    text += "--" + name;
    while (text.length < indent)
      text += " ";
    if (Array.isArray(option.desc)) {
      options.push(text + option.desc[0] + option.desc.slice(1).map(line => {
        for (var i = 0; i < indent; ++i)
          line = " " + line;
        return "\n" + line;
      }).join(""));
    } else
      options.push(text + option.desc);
  });
  console.log([
    "Version " + version,
    "Syntax:   asc [options] [file ...]",
    "",
    "Examples: asc hello.ts",
    "",
    "Options:"
  ].concat(options).join("\n"));
  process.exit(args.help ? 0 : 1);
}

var entryPath = args._[0].replace(/\\/g, "/").replace(/(\.ts|\/)$/, "");
var entryDir  = path.dirname(entryPath);
var entryText;
try {
  entryText = fs.readFileSync(entryPath + ".ts", { encoding: "utf8" });
} catch (e) {
  try {
    entryText = fs.readFileSync(entryPath + "/index.ts", { encoding: "utf8" });
    entryPath = entryPath + "/index";
  } catch (e) {
    console.error("File '" + entryPath + ".ts' not found.");
    process.exit(1);
  }
}

var parser = assemblyscript.parseFile(entryText, entryPath);

var nextPath;
var nextText;

while ((nextPath = parser.nextFile()) != null) {
  try {
    nextText = fs.readFileSync(nextPath + ".ts", { encoding: "utf8" });
  } catch (e) {
    try {
      nextText = fs.readFileSync(nextPath + "/index.ts", { encoding: "utf8" });
      nextPath = nextPath + "/index";
    } catch (e) {
      console.error("Imported file '" + nextPath + ".ts' not found.");
      process.exit(1);
    }
  }
  assemblyscript.parseFile(nextText, nextPath, parser);
}

var diagnostic;
var hasErrors = false;

while ((diagnostic = assemblyscript.nextDiagnostic(parser)) != null) {
  console.error(assemblyscript.formatDiagnostic(diagnostic, process.stderr.isTTY, true));
  if (assemblyscript.isError(diagnostic))
    hasErrors = true;
}

if (hasErrors)
  process.exit(1);

var options = assemblyscript.createOptions();
assemblyscript.setTarget(options, 0);
assemblyscript.setNoTreeShaking(options, args.noTreeShaking);
assemblyscript.setNoDebug(options, args.noDebug);

var module = assemblyscript.compile(parser, options);

hasErrors = false;
while ((diagnostic = assemblyscript.nextDiagnostic(parser)) != null) {
  console.error(assemblyscript.formatDiagnostic(diagnostic, process.stderr.isTTY, true));
  if (assemblyscript.isError(diagnostic))
    hasErrors = true;
}

if (hasErrors) {
  module.dispose();
  process.exit(1);
}

if (args.validate)
  if (!module.validate()) {
    module.dispose();
    process.exit(1);
  }

if (args.trapMode === "clamp")
  module.runPasses([ "trap-mode-clamp" ]);
else if (args.trapMode === "js")
  module.runPasses([ "trap-mode-js" ]);

if (args.optimize)
  module.optimize();

var hasOutput = false;

if (args.outFile != null) {
  if (/\.wast$/.test(args.outFile) && args.textFile == null)
    args.textFile = args.outFile;
  else if (/\.js$/.test(args.outFile) && args.asmjsFile == null)
    args.asmjsFile = args.outFile;
  else if (args.binaryFile == null)
    args.binaryFile = args.outFile;
}
if (args.binaryFile != null && args.binaryFile.length) {
  fs.writeFileSync(args.binaryFile, module.toBinary());
  hasOutput = true;
}
if (args.textFile != null && args.textFile.length) {
  fs.writeFileSync(args.textFile, module.toText(), { encoding: "utf8" });
  hasOutput = true;
}
if (args.asmjsFile != null && args.asmjsFile.length) {
  fs.writeFileSync(args.asmjsFile, module.toAsmjs(), { encoding: "utf8" });
  hasOutput = true;
}
if (!hasOutput) {
  if (args.binaryFile === "")
    process.stdout.write(Buffer.from(module.toBinary()));
  else if (args.asmjsFile === "")
    module.printAsmjs();
  else
    module.print();
}

module.dispose();
