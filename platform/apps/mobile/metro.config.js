/* Metro در مونوریپو باید بسته مشترک `@farm/domain` را هم ببیند، وگرنه
   ایمپورت‌های آفلاین (صف، مجوز نقش، برنامه نوتیفیکیشن) پیدا نمی‌شوند. */
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;
module.exports = config;
