const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');

function getPythonCommand() {
  const localWindowsPath = 'C:\\Users\\divya\\AppData\\Local\\Programs\\Python\\Python310\\python.exe';
  if (fs.existsSync(localWindowsPath)) {
    return localWindowsPath;
  }
  try {
    execSync('python3 --version', { stdio: 'ignore' });
    return 'python3';
  } catch (_) {}
  try {
    execSync('python --version', { stdio: 'ignore' });
    return 'python';
  } catch (_) {}
  return 'python';
}

const getPythonEnv = () => {
  // Resolve directory containing pdf_pipeline to set as PYTHONPATH
  const srcPath = __dirname;
  return {
    ...process.env,
    PYTHONPATH: srcPath
  };
};

function ensureDependenciesInstalled() {
  const pythonCmd = getPythonCommand();
  const deps = ['fitz', 'uharfbuzz', 'fontTools', 'reportlab', 'PIL', 'requests'];
  const pipNames = ['pymupdf', 'uharfbuzz', 'fonttools', 'reportlab', 'pillow', 'requests'];
  
  for (let i = 0; i < deps.length; i++) {
    try {
      execSync(`"${pythonCmd}" -c "import ${deps[i]}"`, { stdio: 'ignore' });
    } catch (_) {
      console.log(`pdf_pipeline: ${pipNames[i]} is not installed. Attempting auto-installation...`);
      try {
        execSync(`"${pythonCmd}" -m pip install ${pipNames[i]}`, { stdio: 'inherit' });
        console.log(`pdf_pipeline: ${pipNames[i]} installed successfully!`);
      } catch (err) {
        console.error(`pdf_pipeline: Failed to install ${pipNames[i]}:`, err.message);
      }
    }
  }
}

const parseFile = async (filePath) => {
  ensureDependenciesInstalled();
  const pythonCmd = getPythonCommand();
  const tempJsonPath = path.join(os.tmpdir(), `matecat_parse_${uuidv4()}.json`);
  const env = getPythonEnv();

  console.log(`pdfParser: Spawning python parser for ${filePath}...`);
  try {
    execSync(
      `"${pythonCmd}" -m pdf_pipeline.pipeline parse --input "${filePath}" --output "${tempJsonPath}" --compress`,
      { env, stdio: 'inherit' }
    );

    if (!fs.existsSync(tempJsonPath)) {
      throw new Error("Python parser failed to generate output JSON file.");
    }

    const content = fs.readFileSync(tempJsonPath, 'utf-8');
    const result = jsonParseSafe(content);
    
    return {
      segments: result.segments,
      template: result.template
    };
  } finally {
    try {
      if (fs.existsSync(tempJsonPath)) {
        fs.unlinkSync(tempJsonPath);
      }
    } catch (_) {}
  }
};

const exportFile = async (templateBase64, segments, targetLang = 'hi') => {
  ensureDependenciesInstalled();
  const pythonCmd = getPythonCommand();
  const tempTemplatePath = path.join(os.tmpdir(), `matecat_tpl_${uuidv4()}.txt`);
  const tempSegmentsPath = path.join(os.tmpdir(), `matecat_seg_${uuidv4()}.json`);
  const tempOutputPath = path.join(os.tmpdir(), `matecat_out_${uuidv4()}.pdf`);
  const env = getPythonEnv();

  console.log(`pdfParser: Spawning python exporter for target lang ${targetLang}...`);
  try {
    // Write template base64 string and segments list to temp files to prevent shell argument size limit overflows
    fs.writeFileSync(tempTemplatePath, templateBase64, 'utf-8');
    fs.writeFileSync(tempSegmentsPath, JSON.stringify(segments), 'utf-8');

    execSync(
      `"${pythonCmd}" -m pdf_pipeline.pipeline export --template "${tempTemplatePath}" --segments "${tempSegmentsPath}" --lang "${targetLang}" --output "${tempOutputPath}"`,
      { env, stdio: 'inherit' }
    );

    if (!fs.existsSync(tempOutputPath)) {
      throw new Error("Python exporter failed to render output PDF file.");
    }

    const outputBuffer = fs.readFileSync(tempOutputPath);
    return outputBuffer;
  } finally {
    // Clean up all temporary files safely
    for (const p of [tempTemplatePath, tempSegmentsPath, tempOutputPath]) {
      try {
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
        }
      } catch (_) {}
    }
  }
};

function jsonParseSafe(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    throw new Error(`JSON parse error from python pipeline: ${e.message}`);
  }
}

module.exports = {
  parseFile,
  exportFile
};
