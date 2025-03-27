const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REPO = "sidprasad/copeanddrag";
const OUTPUT_DIR = "./cnd";
const ASSET_NAME = "cnd.zip";

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: `/repos/${REPO}/releases/latest`,
      headers: { "User-Agent": "Node.js" },
    };

    https
      .get(options, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to fetch latest release: ${res.statusCode}`));
          return;
        }

        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(JSON.parse(data)));
      })
      .on("error", reject);
  });
}

function downloadAsset(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);

    function handleRequest(url) {
      https
        .get(url, (res) => {
          if (res.statusCode === 200) {
            // Pipe the response to the file
            res.pipe(file);
            file.on("finish", () => {
              file.close(resolve);
            });
          } else if (res.statusCode === 302 && res.headers.location) {
            // Follow the redirect
            handleRequest(res.headers.location);
          } else {
            reject(new Error(`Failed to download asset: ${res.statusCode}`));
          }
        })
        .on("error", (err) => {
          fs.unlink(outputPath, () => reject(err));
        });
    }

    handleRequest(url);
  });
}

async function main() {
  try {
    console.log("Fetching latest release...");
    const release = await fetchLatestRelease();
    const asset = release.assets.find((a) => a.name === ASSET_NAME);

    if (!asset) {
      throw new Error(`Asset "${ASSET_NAME}" not found in the latest release.`);
    }

    console.log(`Downloading asset: ${asset.browser_download_url}`);
    const tempFile = path.join(__dirname, ASSET_NAME);
    await downloadAsset(asset.browser_download_url, tempFile);

    console.log("Extracting asset...");
    const tempExtractDir = path.join(__dirname, "temp_dist");
    if (!fs.existsSync(tempExtractDir)) {
      fs.mkdirSync(tempExtractDir, { recursive: true });
    }

    // Extract the zip file into a temporary directory
    execSync(`unzip -o ${tempFile} -d ${tempExtractDir}`);
    fs.unlinkSync(tempFile);

    // Rename the 'dist' directory to 'cnd'
    const distDir = path.join(tempExtractDir, "dist");
    if (!fs.existsSync(distDir)) {
      throw new Error(`The extracted archive does not contain a 'dist' directory.`);
    }

    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
    fs.renameSync(distDir, OUTPUT_DIR);

    // Clean up the temporary directory
    fs.rmSync(tempExtractDir, { recursive: true, force: true });

    console.log("Done! The ./cnd directory is ready.");
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();