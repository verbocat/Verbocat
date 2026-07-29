const { supabase, fetchAllSegments } = require("../src/config/supabase");
const { exportHtml } = require("../src/services/fileService");

async function debugPreviewError() {
  const id = "03817eea-68ac-4c96-acec-7ad7f285c263";
  try {
    let doc = null;
    const { data: docById } = await supabase
      .from("documents")
      .select("*, file_id, name")
      .eq("id", id)
      .single();

    if (docById) {
      doc = docById;
    } else {
      const { data: docByFile } = await supabase
        .from("documents")
        .select("*, file_id, name")
        .eq("file_id", id)
        .single();
      if (docByFile) doc = docByFile;
    }

    console.log("Found doc:", doc);
    if (!doc) {
      console.log("Document not found");
      return;
    }

    const docName = doc ? doc.name : "document.docx";
    const fileIdToUse = doc ? doc.file_id : id;
    const docIdToQuery = doc ? doc.id : id;

    const activeLang = doc.target_lang || "hi";
    console.log("Fetching source segments...");
    const sourceSegments = await fetchAllSegments(docIdToQuery, "segment_index, source_text, target_text", "source");
    console.log("Source segments count:", sourceSegments.length);

    const segmentsList = sourceSegments.map((s, arrayIdx) => ({
      id: arrayIdx,
      segment_index: s.segment_index !== undefined && s.segment_index !== null ? Number(s.segment_index) : arrayIdx,
      source: s.source_text || "",
      target: (s.target_text !== undefined && s.target_text !== null && s.target_text !== "") ? s.target_text : (s.source_text || "")
    }));

    const extIndex = docName.lastIndexOf(".");
    const ext = extIndex !== -1 ? docName.substring(extIndex).toLowerCase() : ".docx";

    console.log("Exporting HTML/file with ext:", ext);
    const buffer = await exportHtml(fileIdToUse, segmentsList, ext, activeLang);
    console.log("Export successful, buffer byte length:", buffer.length);
  } catch (err) {
    console.error("EXACT ERROR STACK TRACE:", err);
  }
}

debugPreviewError();
