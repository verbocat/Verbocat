const { splitTextIntoSentences } = require("../src/utils/sentenceSplitter");

const sampleParagraph = `LM-MR consists of Precision Attack Loiter Munition-120 (PALM 120) or Loiter Munition (LM), Canister Launcher, Operator Control Unit (OCU) and Ground Data Terminal (GDT) with Pedestal 40 km Dish Antenna which is also known as Medium Range Ground Control Station (MRGCS). PALM 120 is an aerial system, beyond visual line of sight and compact electrical unmanned LM, which is readily deployable for immediate use in combat. It is highly effective for locating and eliminating targets. The operator of the PALM 120 system uses a hand-held Operator Control Unit (OCU) with position display & real-time video display to control the LM throughout its mission. LM control is accomplished through an intuitive interface using highly automated modes that relieve the operator from most of the burdens typically associated with piloting an airborne vehicle. LM-MR can be man packed or launched from a variety of platforms like Ground Surface, High Rise Buildings etc. Typical operational deployment of LM-MR is as shown in FIG 1-1`;

const result = splitTextIntoSentences(sampleParagraph, 35);
console.log("Original Word Count:", sampleParagraph.split(/\s+/).length);
console.log("Segment Count Result:", result.length);
result.forEach((seg, i) => {
  console.log(`\n--- Segment ${i + 1} (${seg.split(/\s+/).length} words) ---`);
  console.log(seg);
});
