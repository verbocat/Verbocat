const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const {
  processAICommand,
  createProjectAction,
  duplicateProjectAction,
  addTargetLanguagesAction,
  setProjectContextAction
} = require("./src/services/aiProjectOrchestrator");

const { supabase } = require("./src/config/supabase");

async function runTests() {
  console.log("=== STARTING AI PROJECT ORCHESTRATOR TESTS ===");

  const { data: sampleProj } = await supabase.from("projects").select("*").limit(1);
  if (sampleProj && sampleProj[0]) {
    console.log("Existing projects table columns:", Object.keys(sampleProj[0]));
  }

  let testUserId = "00000000-0000-0000-0000-000000000000";
  if (sampleProj && sampleProj[0] && sampleProj[0].owner_id) {
    testUserId = sampleProj[0].owner_id;
    console.log("Using existing user owner_id for tests:", testUserId);
  }

  try {
    // Test 1: Direct Project Creation Action
    console.log("\n--- Test 1: Direct Project Creation Action ---");
    const projRes = await createProjectAction({
      name: `Test AI Project ${Date.now()}`,
      source_lang: "en",
      target_langs: ["hi", "es"],
      notes: "Test project context guidelines",
      userId: testUserId
    });
    console.log("Creation Result:", projRes);
    if (!projRes.success || !projRes.project?.id) {
      throw new Error("Project creation failed!");
    }
    const testProjId = projRes.project.id;

    // Test 2: Add Target Languages Action
    console.log("\n--- Test 2: Add Target Languages Action ---");
    const addLangRes = await addTargetLanguagesAction({
      projectId: testProjId,
      targetLangs: ["fr", "de"],
      userId: testUserId
    });
    console.log("Add Target Languages Result:", addLangRes);
    if (!addLangRes.success || !addLangRes.project.target_languages.includes("fr")) {
      throw new Error("Add target languages failed!");
    }

    // Test 3: Set Project Context Notes
    console.log("\n--- Test 3: Set Project Context Notes ---");
    const contextRes = await setProjectContextAction({
      projectId: testProjId,
      contextNotes: "ISO 13485 Medical guidelines and formal tone.",
      userId: testUserId
    });
    console.log("Context Result:", contextRes);
    if (!contextRes.success || !contextRes.project.description.includes("Medical")) {
      throw new Error("Set project context failed!");
    }

    // Test 4: Duplicate Project Action (Scope: source_only)
    console.log("\n--- Test 4: Duplicate Project (Scope: source_only) ---");
    const dupSourceRes = await duplicateProjectAction({
      projectId: testProjId,
      scope: "source_only",
      newName: `Test AI Project Source Only ${Date.now()}`,
      addTargetLangs: ["ja"],
      userId: testUserId
    });
    console.log("Duplication Source Only Result:", dupSourceRes);
    if (!dupSourceRes.success || dupSourceRes.scope !== "source_only") {
      throw new Error("Source only duplication failed!");
    }

    // Test 5: Duplicate Project Action (Scope: full_with_translations)
    console.log("\n--- Test 5: Duplicate Project (Scope: full_with_translations) ---");
    const dupFullRes = await duplicateProjectAction({
      projectId: testProjId,
      scope: "full_with_translations",
      newName: `Test AI Project Full Clone ${Date.now()}`,
      userId: testUserId
    });
    console.log("Duplication Full Clone Result:", dupFullRes);
    if (!dupFullRes.success || dupFullRes.scope !== "full_with_translations") {
      throw new Error("Full clone duplication failed!");
    }

    // Test 6: AI Command Clarification Signal
    console.log("\n--- Test 6: AI Command Clarification Signal ---");
    const clarifyRes = await processAICommand({
      prompt: `Duplicate project ${testProjId}`,
      projectId: testProjId,
      userId: testUserId
    });
    console.log("Clarification Signal Result:", clarifyRes);
    if (!clarifyRes.requiresClarification || clarifyRes.clarificationType !== "duplication_scope") {
      throw new Error("Clarification signal failed!");
    }

    // Clean up created test projects
    console.log("\n--- Cleaning up test records ---");
    await supabase.from("projects").delete().in("id", [testProjId, dupSourceRes.duplicatedProject.id, dupFullRes.duplicatedProject.id]);
    console.log("Cleaned up test projects successfully.");

    console.log("\n=============================================");
    console.log("ALL AI PROJECT ORCHESTRATOR TESTS PASSED! SUCCESS.");
    console.log("=============================================");
    process.exit(0);
  } catch (err) {
    console.error("TEST FAILED:", err);
    process.exit(1);
  }
}

runTests();
