const { supabase, supabaseAdmin } = require("../src/config/supabase");

async function testSupportChat() {
  try {
    console.log("=== Running Support Chat Integration Tests ===");

    // 1. Find a document and its project owner
    const { data: docs, error: docsErr } = await supabase
      .from("documents")
      .select("id, name, owner_id, project_id")
      .limit(1);

    if (docsErr || !docs || docs.length === 0) {
      console.error("No documents found to test with.");
      return;
    }

    const testDoc = docs[0];
    console.log(`Using test document: ${testDoc.name} (ID: ${testDoc.id})`);

    // Get the project creator
    let projectCreatorId = testDoc.owner_id;
    if (testDoc.project_id) {
      const { data: project } = await supabase
        .from("projects")
        .select("owner_id")
        .eq("id", testDoc.project_id)
        .single();
      if (project && project.owner_id) {
        projectCreatorId = project.owner_id;
      }
    }
    console.log(`Project Creator ID: ${projectCreatorId}`);

    // 2. Find or create a linguist user
    const { data: linguistProfiles, error: linguistErr } = await supabase
      .from("profiles")
      .select("id, email, role")
      .eq("role", "linguist")
      .limit(1);

    if (linguistErr || !linguistProfiles || linguistProfiles.length === 0) {
      console.error("No linguist users found. Creating a dummy linguist user...");
      return;
    }

    const linguist = linguistProfiles[0];
    console.log(`Using linguist: ${linguist.email} (ID: ${linguist.id})`);

    // 3. Ensure the linguist has access to the document
    const { data: existingAccess } = await supabase
      .from("document_access")
      .select("*")
      .eq("document_id", testDoc.id)
      .eq("user_id", linguist.id)
      .single();

    if (!existingAccess) {
      console.log(`Granting document access to linguist...`);
      const { error: accessErr } = await supabase
        .from("document_access")
        .insert({
          document_id: testDoc.id,
          user_id: linguist.id,
          permission: "write"
        });
      if (accessErr) {
        console.error("Failed to grant access:", accessErr.message);
      } else {
        console.log("Access granted successfully.");
      }
    } else {
      console.log("Linguist already has access to this document.");
    }

    // 4. Raise a support query
    console.log("\nRaising support query...");
    const { data: query, error: queryErr } = await supabase
      .from("support_queries")
      .insert({
        document_id: testDoc.id,
        linguist_id: linguist.id,
        query_type: "segment",
        segment_index: 12,
        topic: "Tag Clarification",
        status: "open"
      })
      .select()
      .single();

    if (queryErr) {
      console.error("FAIL: Failed to create support query:", queryErr.message);
      return;
    }
    console.log(`SUCCESS: Created support query (ID: ${query.id})`);

    // 5. Send initial message
    console.log("\nSending initial query message...");
    const { data: initMsg, error: initMsgErr } = await supabase
      .from("support_messages")
      .insert({
        query_id: query.id,
        sender_id: linguist.id,
        content: "Hello, segment #12 contains a tag __TAG_1__. Is it a bold tag?"
      })
      .select()
      .single();

    if (initMsgErr) {
      console.error("FAIL: Failed to create initial message:", initMsgErr.message);
      return;
    }
    console.log("SUCCESS: Initial message sent:", initMsg.content);

    // 6. Project creator replies
    console.log("\nSending creator reply...");
    const { data: replyMsg, error: replyMsgErr } = await supabase
      .from("support_messages")
      .insert({
        query_id: query.id,
        sender_id: projectCreatorId,
        content: "Yes, __TAG_1__ represents the bold tag in HTML. Please translate it accordingly."
      })
      .select()
      .single();

    if (replyMsgErr) {
      console.error("FAIL: Failed to send creator reply:", replyMsgErr.message);
      return;
    }
    console.log("SUCCESS: Creator reply sent:", replyMsg.content);

    // 7. Verify we can fetch messages for this query
    console.log("\nFetching messages for the query...");
    const { data: msgs, error: fetchErr } = await supabase
      .from("support_messages")
      .select("*")
      .eq("query_id", query.id)
      .order("created_at", { ascending: true });

    if (fetchErr) {
      console.error("FAIL: Failed to fetch messages:", fetchErr.message);
      return;
    }
    console.log(`SUCCESS: Fetched ${msgs.length} messages.`);
    msgs.forEach((m) => {
      console.log(`  [${m.sender_id === linguist.id ? "Linguist" : "Creator"}]: ${m.content}`);
    });

    // 8. Close the query
    console.log("\nResolving query...");
    const { data: closedQuery, error: closeErr } = await supabase
      .from("support_queries")
      .update({ status: "resolved", updated_at: new Date().toISOString() })
      .eq("id", query.id)
      .select()
      .single();

    if (closeErr) {
      console.error("FAIL: Failed to close query:", closeErr.message);
      return;
    }
    console.log(`SUCCESS: Query is now resolved. Status: ${closedQuery.status}`);

    // Clean up test data
    console.log("\nCleaning up test query...");
    await supabase.from("support_queries").delete().eq("id", query.id);
    console.log("Cleanup completed.");

    console.log("\n=== ALL INTEGRATION TESTS PASSED ===");
  } catch (err) {
    console.error("Test execution failed:", err);
  }
}

testSupportChat();
