import {config} from "dotenv";
import sass from "sass";
import fs from "fs-extra";
import path from "path";
import webpack from "webpack";
import {js as beautify} from "js-beautify";
import optimization from "./optimization.js";
import Utils, {getAddonConfig, getBuilderConfig, nullish} from "./utils.js";
import externals from "./externals.js";
import {hideBin} from "yargs/helpers";
import yargs from "yargs/yargs";
import CONSTANTS from "./constants.js";
import plugins from "./plugins.js";
import rules from "./rules.js";
import resolve from "./resolve.js";
import {Meta, Readme} from "./classes";
import ExternalModules from "./modules";
import ZLibraryTemplate from "./templates/plugin.template";
import Logger from "./logger.js";

console.log("Starting Compilation.");

const {argv} = yargs(hideBin(process.argv));
Utils.init(argv.plugin || argv.theme, argv);
config();

/* Ensure Directories */
// fs.ensureDirSync(path.join(__dirname, "..", "releases"));
// fs.ensureDirSync(path.join(__dirname, "..", "plugins"));
// fs.ensureDirSync(path.join(__dirname, "..", "builds"));
// fs.ensureDirSync(path.join(__dirname, "..", "temp"));


const pluginConfig = Utils.getAddonConfig();

if (~Object.keys(argv).indexOf("plugin")) {
    const buildConfig = {
        mode: "production",
        target: "node",
        entry: Utils.getPath(),
        output: {
            clean: true,
            library: "LibraryPluginHack",
            libraryTarget: "commonjs2",
            filename: Utils.getAddonConfig("main") || "index.js",
            path: CONSTANTS.TEMP_PATH
        },
        watch: Utils.shouldWatch,
        watchOptions: {
            followSymlinks: true,
        },
        plugins: plugins,
        externals: externals(),
        module: {
            rules: rules(),
        },
        resolve: resolve(),
        optimization: optimization
    };
    Utils.setBuiltConfig(buildConfig);
    webpack(buildConfig, (err, stats) => {
        // console.clear();
        const {build, ...config} = Utils.getAddonConfig();
        const builderConfig = Utils.getBuilderConfig();

        if (err) {
            Logger.error((err.stack || err) + "\n");
            if (err.details) Logger.error(err.details + "\n");
            return;
        }
        if (stats.hasErrors()) {
            const info = stats.toJson();
            for (const error of info.errors) Logger.error(error.message + "\n");
        }
        if (stats.hasWarnings()) {
            const info = stats.toJson();
            for (const warning of info.warnings) Logger.warn(warning.message + "\n");
        }

        if (err || stats.hasErrors()) throw new Error(`Failed to build after ${Math.round((Utils.nanoseconds() - Utils.startTime) / 1000).toLocaleString()}s.`);

        fs.ensureDirSync(CONSTANTS.TEMP_PATH);
        const meta = new Meta(config);
        const escapedName = config.info.name.replace(/ /g, "");
        const bdFilename = Utils.format(builderConfig.build.filename, {
            name: escapedName
        }, "[", "]");
        const tempFile = path.join(CONSTANTS.TEMP_PATH, config.main || "index.js");

        const builderOutput = path.resolve(process.cwd(), Utils.format(builderConfig.build.output, {
            name: escapedName
        }, "[", "]"));
        if (!fs.existsSync(builderOutput)) fs.ensureDir(builderOutput);
        const outputFolder = builderOutput;
        const outputPath = path.resolve(outputFolder, bdFilename);

        if (argv.build) {
            if (argv.readme || builderConfig.build.readme) fs.writeFileSync(path.join(outputFolder, "README.md"), new Readme(pluginConfig).toString(), "utf8");
        } else {
            try {
                fs.unlinkSync(outputPath);
            } catch (error) {
                Logger.error("Failed to remove old file:\n", error);
            }
        }

        fs.ensureFileSync(tempFile);
        let builtCode = fs.readFileSync(tempFile, "utf-8");
        const split = builtCode.split("\n");
        split.splice(2, 0, ExternalModules.join("\n"));
        builtCode = split.join("\n");

        if (pluginConfig.build.zlibrary) {
            builtCode = `${meta}\n${Utils.format(ZLibraryTemplate, {pluginConfig: JSON.stringify(pluginConfig, null, "\t"), builtCode})}`;
        } else {
            builtCode = builtCode.replace(
                "module.exports.LibraryPluginHack = __webpack_exports__",
                "module.exports = __webpack_exports__.default ?? __webpack_exports__"
            );

            builtCode = `${meta}\n${builtCode}`;
        }

        builtCode = beautify(builtCode, {indent_with_tabs: true}).replace(/\n{2,}/g, "\n");

        fs.writeFileSync(outputPath, builtCode);

        Logger.log(`Built in ${Math.round((Utils.nanoseconds() - Utils.startTime) / 1000).toLocaleString()}s.`);
        if (argv.release) {
            try {
                const config = getAddonConfig("build.release");
                const info = getAddonConfig("info");
                if (typeof config !== "object") throw new Error("Invalid release configuration");

                const releaseDir = nullish(config.public ? path.join(process.env.RELEASE_FOLDER, info.name) : void 0, path.join(CONSTANTS.RELEASE_DIR, info.name));
                if (fs.existsSync(releaseDir)) fs.emptyDirSync(releaseDir);
                else fs.mkdirSync(releaseDir);

                if (config.readme ?? true) {
                    fs.writeFileSync(path.join(releaseDir, "README.md"), new Readme(pluginConfig).toString(), "utf8");
                }

                if (config.source ?? true) {
                    fs.copy(Utils.getPath(), path.join(releaseDir, "src"), {recursive: true, filter: src => src.indexOf("node_modules") < 0});
                }

                fs.writeFileSync(path.join(releaseDir, bdFilename), builtCode);
            } catch (error) {
                Logger.error(`Release build failed!\n`, error);
            }
        } else if (builderConfig.build.install) {
            fs.ensureDirSync(path.join(builderConfig.paths.bdfolder, "plugins"));
            fs.writeFileSync(
                path.resolve(path.join(builderConfig.paths.bdfolder, "plugins", bdFilename)),
                builtCode
            );
        }
        if (!pluginConfig.build.production) return;
        try {
            fs.emptyDirSync(CONSTANTS.TEMP_PATH);
            fs.rmdirSync(CONSTANTS.TEMP_PATH, {recursive: true});
        } catch (error) {
            Logger.error("Failed to clear tmp path:", error);
        }
    });
} else {
    throw new Error("Themes loader is not implemented yet.");
    // try {
    //     sass.render({
    //         data
    //     })
    // } catch (error) {

    // }
}
